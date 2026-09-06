import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'
import { CYCLE_DEPTH, type CheckLimits, type Issue } from '@/lib/checks-registry'
import { defaultThresholds, type Thresholds } from '@/lib/check-thresholds'
import { monthsBetween } from '@/lib/afc'
import { relId } from '@/lib/visibility'

/**
 * Проверки родословной, которым мало прямых родителей.
 *
 * ## Почему отдельный модуль
 *
 * `data-checks.ts` смотрит на запись и её родителей — этого хватает
 * большинству правил. Здесь другое: чтобы найти цикл, надо подняться
 * на девять колен; чтобы поймать двух телят подряд, надо знать всех
 * потомков матери, включая тех, кого в разбираемом наборе нет.
 *
 * Разделение не косметическое. Проверки отсюда дороже прочих на порядок,
 * и держать их вперемешку с дешёвыми значило бы платить за девять колен
 * каждый раз, когда надо всего лишь сверить пол родителя.
 *
 * ## Как это не превращается в тысячу запросов
 *
 * Родословная поднимается **уровнями и сразу для всего набора**: одно
 * колено — один запрос, независимо от того, разбирают пять записей
 * или пятьсот. Девять запросов на весь разбор вместо девяти на животное.
 *
 * У обхода есть потолок по числу известных предков. Родословные сильно
 * пересекаются, и на практике до него не доходит, но испорченные данные
 * умеют раздувать обход — а разбор, который думает минуту, эксперт
 * закроет, не дождавшись. Упёрлись в потолок — говорим об этом вслух.
 */

/** Сколько предков держим в памяти, прежде чем признать обход слишком широким. */
const ANCESTOR_CAP = 20_000

/** Сколько потомков одной матери смотрим — больше двадцати у коровы не бывает. */
const OFFSPRING_CAP = 5_000

const time = (d?: string | null): number | null => {
  if (!d) return null
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? null : t
}

const asDate = (d?: string | null): string => {
  if (!d) return '—'
  const t = new Date(d)
  return Number.isNaN(t.getTime())
    ? String(d)
    : t.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const DAY = 86_400_000

type Node = {
  father: number | null
  mother: number | null
  identNumber: string
  birthDate?: string | null
  disposalDate?: string | null
}

/**
 * Родословная набора, поднятая уровнями.
 *
 * Возвращает карту «id → родители», по которой дальше ходят уже в памяти.
 * Ни один обход не делает запросов сам: иначе цикл, найденный на девятом
 * колене, стоил бы девяти запросов на каждое животное набора.
 */
async function ancestorMap(
  payload: Payload,
  startIds: number[],
  limits: CheckLimits,
): Promise<Map<number, Node>> {
  const known = new Map<number, Node>()
  let frontier = [...new Set(startIds)]

  for (let level = 0; level <= CYCLE_DEPTH && frontier.length; level++) {
    const need = frontier.filter((id) => !known.has(id))
    if (!need.length) break

    if (known.size + need.length > ANCESTOR_CAP) {
      limits.push(
        `Родословная просмотрена не до конца: обход упёрся в ${ANCESTOR_CAP} предков на ${level}-м колене. ` +
          'Циклы и возраст родителей глубже этого места не проверены.',
      )
      break
    }

    /*
     * Отказ выборки — не «предков нет».
     *
     * Здесь стоял `.catch(() => ({ docs: [] }))`, и обход при сбое
     * заканчивался тихо: ни циклов, ни возраста родителей не проверялось,
     * а хозяйство видело чистую родословную. Рядом уже ведутся `limits`
     * — там и место такому случаю.
     */
    let docs: Animal[] = []
    try {
      docs = (await payload.find({
        collection: 'animals',
        where: { id: { in: need } },
        limit: need.length,
        depth: 0,
        overrideAccess: true,
      })).docs as Animal[]
    } catch (e) {
      limits.push(
        `Родословная просмотрена не до конца: выборка предков на ${level}-м колене ` +
          `не выполнилась (${e instanceof Error ? e.message : String(e)}). ` +
          'Циклы и возраст родителей глубже этого места не проверены.',
      )
      break
    }

    for (const a of docs) {
      known.set(a.id as number, {
        father: relId(a.father),
        mother: relId(a.mother),
        identNumber: a.identNumber,
        birthDate: a.birthDate,
        disposalDate: (a as { disposalDate?: string | null }).disposalDate,
      })
    }

    frontier = docs
      .flatMap((a) => [relId(a.father), relId(a.mother)])
      .filter((x): x is number => x !== null)
  }

  return known
}

/**
 * Встречается ли животное среди своих предков.
 *
 * Обход в ширину по карте, без запросов. Множество посещённых нужно
 * не для скорости, а чтобы обход сам не зациклился на цикле, который
 * ищет: без него функция, нашедшая петлю, никогда бы не вернулась.
 */
function findsItself(start: number, map: Map<number, Node>): boolean {
  const seen = new Set<number>([start])
  let frontier: number[] = []

  const node = map.get(start)
  if (node?.father) frontier.push(node.father)
  if (node?.mother) frontier.push(node.mother)

  for (let level = 0; level < CYCLE_DEPTH && frontier.length; level++) {
    const next: number[] = []
    for (const id of frontier) {
      if (id === start) return true
      if (seen.has(id)) continue
      seen.add(id)
      const n = map.get(id)
      if (n?.father) next.push(n.father)
      if (n?.mother) next.push(n.mother)
    }
    frontier = next
  }

  return false
}

export async function pedigreeIssues(
  payload: Payload,
  animals: Animal[],
  t: Thresholds = defaultThresholds(),
): Promise<{ issues: Issue[]; limits: CheckLimits }> {
  const out: Issue[] = []
  const limits: CheckLimits = []
  if (!animals.length) return { issues: out, limits }

  const push = (a: Animal, code: Issue['code'], text: string, field?: string, severity: Issue['severity'] = 'fix') =>
    out.push({ code, animalId: a.id as number, ident: a.identNumber, field, severity, text })

  const map = await ancestorMap(
    payload,
    animals.map((a) => a.id as number),
    limits,
  )

  /* ------------------------------ Циклы ------------------------------ */

  for (const a of animals) {
    /*
     * Прямой случай ловит `self-parent` в `data-checks.ts`, и повторять
     * его здесь незачем: две находки об одном факте эксперт прочитает
     * как две разные ошибки.
     */
    const id = a.id as number
    const node = map.get(id)
    if (!node) continue
    if (node.father === id || node.mother === id) continue

    if (findsItself(id, map)) {
      push(
        a,
        'pedigree-cycle',
        'Поднимаясь по родословной, приходим обратно к этому же животному. Коэффициент инбридинга у него и у всех его потомков посчитать нельзя',
        'father',
      )
    }
  }

  /* ------------------------ Возраст родителей ------------------------ */

  for (const a of animals) {
    const born = a.birthDate
    if (!born) continue

    for (const [side, label] of [
      ['father', 'Отец'],
      ['mother', 'Мать'],
    ] as const) {
      const pid = relId(a[side])
      if (!pid) continue
      const parent = map.get(pid)
      if (!parent?.birthDate) continue

      const months = monthsBetween(parent.birthDate, born)
      if (months === null) continue

      /*
       * Отрицательный и нулевой возраст — это `parent-younger`
       * в `data-checks.ts`. Здесь только то, что старая проверка
       * пропускает: родитель старше потомка, но невозможно мало
       * или невозможно много.
       */
      if (months <= 0) continue

      if (months < t.parentAgeMinMonths) {
        push(
          a,
          'parent-age-implausible',
          `${label} № ${parent.identNumber} на момент рождения потомка был(а) в возрасте ${months} мес. — раньше ${t.parentAgeMinMonths} потомства не бывает`,
          side,
        )
      } else if (months > t.parentAgeMaxYears * 12) {
        push(
          a,
          'parent-age-implausible',
          `${label} № ${parent.identNumber} на момент рождения потомка был(а) старше ${t.parentAgeMaxYears} лет — проверьте, тот ли родитель связан`,
          side,
        )
      }
    }

    /* --------------- Отец выбыл задолго до зачатия --------------- */

    const fid = relId(a.father)
    const father = fid ? map.get(fid) : null
    const gone = time(father?.disposalDate)
    const bornAt = time(born)

    if (gone !== null && bornAt !== null && bornAt - gone > t.gestationMinDays * DAY) {
      const months = monthsBetween(father!.disposalDate, born)
      push(
        a,
        'father-disposed-before',
        `Отец № ${father!.identNumber} выбыл ${asDate(father!.disposalDate)} — за ${months} мес. до рождения потомка. Это нормально при работе с замороженным семенем; если хозяйство его не хранит, связь установлена не с тем быком`,
        'father',
        'note',
      )
    }
  }

  /* -------------------- Двое потомков подряд -------------------- */

  /*
   * Проверка требует всех потомков матери, а не только тех, что попали
   * в разбор: второй телёнок мог быть заведён год назад и в набор
   * не входить. Поэтому отдельный запрос — по матерям набора.
   */
  const motherIds = [
    ...new Set(animals.map((a) => relId(a.mother)).filter((x): x is number => x !== null)),
  ]

  if (motherIds.length) {
    const inBatch = new Map(animals.map((a) => [a.id as number, a]))

    const res = await payload
      .find({
        collection: 'animals',
        where: { mother: { in: motherIds } },
        limit: OFFSPRING_CAP,
        sort: 'birthDate',
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)

    if (!res) {
      limits.push('Потомство матерей не просмотрено: запрос не выполнился.')
    } else {
      if (res.totalDocs > OFFSPRING_CAP) {
        limits.push(
          `Потомство матерей просмотрено частично: ${OFFSPRING_CAP} записей из ${res.totalDocs}.`,
        )
      }

      const byMother = new Map<number, { id: number; ident: string; born: number }[]>()
      for (const c of res.docs) {
        const mid = relId(c.mother)
        const born = time(c.birthDate)
        if (!mid || born === null) continue
        byMother.set(mid, [
          ...(byMother.get(mid) ?? []),
          { id: c.id as number, ident: c.identNumber, born },
        ])
      }

      for (const [mid, list] of byMother) {
        const sorted = [...list].sort((x, y) => x.born - y.born)

        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1]!
          const cur = sorted[i]!
          const days = Math.round((cur.born - prev.born) / DAY)

          /*
           * Ноль дней — двойня, а не ошибка: два телёнка от одного отёла
           * рождаются в один день. Именно поэтому проверка начинается
           * с единицы, а не с нуля.
           */
          if (days < 1 || days >= t.gestationMinDays) continue

          /*
           * Находка вешается на того из двоих, кто есть в разборе.
           * Если оба — на младшего: именно его запись вызывает сомнение,
           * старший к моменту его рождения уже был.
           */
          const target = inBatch.get(cur.id) ?? inBatch.get(prev.id)
          if (!target) continue

          const mother = map.get(mid)
          push(
            target,
            'siblings-too-close',
            `У матери № ${mother?.identNumber ?? mid} двое потомков с разницей ${days} дн. — № ${prev.ident} и № ${cur.ident}. Стельность длится около 279 дней: либо один записан не той матери, либо это двойня, отмеченная двумя отёлами`,
            'mother',
          )
        }
      }
    }
  }

  return { issues: out, limits }
}
