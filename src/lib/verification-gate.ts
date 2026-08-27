import type { Payload } from 'payload'
import { relId } from '@/lib/visibility'
import { completenessGaps, gapsMessage, type Gap } from '@/lib/completeness'

/**
 * Заслон подтверждения: можно ли поставить знак Ассоциации.
 *
 * ## Зачем это отдельным модулем
 *
 * Правило «нельзя подтвердить запись поверх неразобранной существенной
 * находки» — главное обещание книги. Знак «Проверено ассоциацией» стоит
 * ровно столько, сколько стоит это правило, и всё остальное — каталог
 * проверок, пороги, разбор стада — обслуживает его.
 *
 * Жило оно при этом внутри серверного действия, вместе с разбором формы,
 * проверкой прав и составлением текста ошибки. Добраться до него можно
 * было единственным способом: открыть браузер, войти сотрудником
 * Ассоциации, дойти до заявки и нажать кнопку. Ни скриптом, ни ревизией,
 * ни на настоящей базе — никак. Самое важное правило системы проверялось
 * только руками и только целиком.
 *
 * Здесь оно живёт само по себе: на входе — записи заявки и то, что эксперт
 * с ними уже сделал, на выходе — список записей, которые подтверждать
 * нельзя, и почему. Действие вызывает его перед решением; скрипт
 * `npm run audit:gate` — по настоящей базе, ничего не записывая.
 *
 * ## Что считается разобранным
 *
 * Существенная находка (`fix`) перестаёт быть препятствием двумя путями,
 * и оба — решение человека:
 *
 *  - **перенесена в замечания**: запись не подтверждается, хозяйство
 *    получает объяснение;
 *  - **снята с объяснением**: эксперт счёл её несущественной и написал
 *    почему.
 *
 * Третьего пути нет. Запретить подтверждение при любой находке было бы
 * неверно: право эксперта счесть находку несущественной записано
 * в каталоге проверок как обещание хозяйству. Запрещено не возражение,
 * а молчание.
 *
 * ## Вторая половина обещания
 *
 * «Расхождений нет» — половина того, что означает знак Ассоциации.
 * Вторая половина — «передано всё необходимое», и она не проверялась
 * ничем: запись без единого отёла и без единой дойки не противоречит
 * ничему, потому что противоречить нечему. Полнота считается отдельным
 * правилом (`completeness.ts`) и возвращается отдельным списком.
 *
 * ## Почему проверки гоняются заново
 *
 * Не берутся с экрана разбора. Между открытием страницы и нажатием
 * кнопки хозяйство могло что-то поправить, а могло и испортить: решение
 * обязано опираться на то, что в базе сейчас, а не на то, что эксперт
 * видел утром.
 */

/** Заявка в том виде, в каком заслону она нужна. */
export type GateRequest = {
  animals?: unknown[] | null
  review?: {
    findings?: { animal?: unknown; severity?: string | null }[] | null
    dismissed?: { animal?: unknown; code?: unknown }[] | null
  } | null
}

export type Blocker = {
  animalId: number
  ident: string
  /** Названия правил — человеческие, а не коды. */
  labels: string[]
}

export type GateResult = {
  blockers: Blocker[]
  /**
   * Записи, где данных не хватает.
   *
   * Отдельным списком, а не вперемешку с находками: это разные вопросы
   * и разные способы закрыть их. Находку можно снять с объяснением —
   * эксперт вправе счесть её несущественной. Нехватку снять нельзя:
   * объяснением дойки не появятся. Свалив их в один список, мы бы
   * предложили эксперту кнопку «снять», которая тут ничего не значит.
   */
  gaps: Gap[]
  /** Сколько записей заявки разобрано проверками. */
  checked: number
  /** Оговорки проверок: где сработал потолок и что осталось несверенным. */
  limits: string[]
}

/**
 * Ключ снятия: находка снимается для пары «животное + правило», а не вообще.
 *
 * Снять `parent-younger` у одной коровы не значит снять его у всех:
 * объяснение, годное для одной записи, для другой может не годиться.
 */
export const dismissKey = (animal: unknown, code: unknown) => `${Number(animal)}|${String(code)}`

/** Связи в сохранённой заявке приходят объектами, в свежей — числами. */
const plainId = (v: unknown): number => {
  const id = relId(v)
  return typeof id === 'number' ? id : Number(v)
}

/**
 * Записи, которые эксперт уже вывел из заявки замечанием «требует
 * исправления».
 *
 * `> 0` здесь не украшение. У замечания ко всему пакету животного нет,
 * `Number(null)` даёт ноль, а ноль — конечное число: такое замечание
 * попадало бы в набор исключённых записей под идентификатором 0.
 * Ни одно животное этот идентификатор не носит, поэтому вреда не было —
 * но набор «исключённые записи» содержал бы не запись.
 */
export const heldAnimals = (req: GateRequest): Set<number> =>
  new Set(
    (req.review?.findings ?? [])
      .filter((f) => (f.severity ?? 'fix') === 'fix')
      .map((f) => plainId(f.animal))
      .filter((n) => Number.isFinite(n) && n > 0),
  )

const dismissedKeys = (req: GateRequest): Set<string> =>
  new Set((req.review?.dismissed ?? []).map((d) => dismissKey(plainId(d.animal), d.code)))

export async function approvalBlockers(
  payload: Payload,
  req: GateRequest,
): Promise<GateResult> {
  const all = (req.animals ?? []).map(plainId).filter((n) => Number.isFinite(n) && n > 0)

  if (!all.length) return { blockers: [], gaps: [], checked: 0, limits: [] }

  const held = heldAnimals(req)
  const dismissed = dismissedKeys(req)

  const { checkAnimals } = await import('@/lib/data-checks')
  const { checkSpec } = await import('@/lib/checks-registry')

  const { docs } = await payload.find({
    collection: 'animals',
    where: { id: { in: all } },
    limit: all.length,
    depth: 0,
    overrideAccess: true,
  })

  const identOf = new Map(docs.map((d) => [Number(d.id), String(d.identNumber)]))

  const { issues, limits } = await checkAnimals(payload, docs as never)

  const byAnimal = new Map<number, string[]>()
  for (const i of issues) {
    if (i.severity !== 'fix') continue
    if (dismissed.has(dismissKey(i.animalId, i.code))) continue
    if (held.has(i.animalId)) continue
    byAnimal.set(i.animalId, [
      ...(byAnimal.get(i.animalId) ?? []),
      checkSpec(i.code)?.label ?? i.code,
    ])
  }

  /*
   * Полнота считается только по записям, которые эксперт не вывел
   * из заявки. Выведенная замечанием запись не подтверждается — требовать
   * от неё полноты значит держать заявку из-за того, что и так решено.
   */
  const gaps = (await completenessGaps(payload, all.filter((id) => !held.has(id)))).map((g) => ({
    ...g,
    ident: identOf.get(g.animalId) ?? g.ident,
  }))

  return {
    blockers: [...byAnimal.entries()].map(([animalId, labels]) => ({
      animalId,
      ident: identOf.get(animalId) ?? String(animalId),
      labels,
    })),
    gaps,
    checked: docs.length,
    limits,
  }
}

/**
 * Текст отказа — здесь же, а не в действии.
 *
 * Заслон и его объяснение — одно решение. Разведи их по файлам, и правило
 * начнёт срабатывать в одном месте, а объясняться в другом: сообщение
 * переживёт правку правила и станет неправдой раньше, чем это заметят.
 */
export { gapsMessage }

export const blockersMessage = (blockers: Blocker[]): string => {
  const uniq = [...new Set(blockers.flatMap((b) => b.labels))]
  return (
    `Записей с неразобранными существенными находками — ${blockers.length}: ` +
    `${uniq.slice(0, 3).join(', ')}${uniq.length > 3 ? ` и ещё ${uniq.length - 3}` : ''}. ` +
    'Каждую нужно либо перенести в замечания, либо снять с объяснением. ' +
    'Знак Ассоциации не ставится поверх противоречия, которое система видит.'
  )
}
