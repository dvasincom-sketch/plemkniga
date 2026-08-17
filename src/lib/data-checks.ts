import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'

/**
 * Автоматический поиск несостыковок в данных.
 *
 * Зачем это здесь. Эксперт смотрит пакет из пятисот строк. Глазами он найдёт
 * то, что бросается в глаза, и не найдёт того, что не бросается: мать,
 * родившуюся позже дочери на два месяца; быка, записанного матерью; удой
 * в четырнадцать тысяч, который выглядит правдоподобно, пока не посмотришь
 * на число доек. Всё это находится запросом — и должно находиться запросом,
 * а не вниманием человека, которого хватит на первые сто строк.
 *
 * Что это не заменяет. Проверки не выносят решения и ничего не меняют.
 * Они говорят «посмотрите сюда». Решение остаётся за экспертом, и он вправе
 * сказать, что находка несущественна: правило написано программистом, а не
 * зоотехником, и жизнь богаче правила. Поэтому каждую находку он либо
 * записывает в замечания хозяйству одним нажатием, либо пропускает.
 *
 * Почему пороги такие. Границы правдоподобия ниже — не нормативы, а рамки,
 * за которыми начинается «этого не бывает»: удой 25 000 кг за лактацию
 * встречается у мировых рекордисток, 40 000 не встречается ни у кого.
 * Ошибку в единицах измерения (граммы вместо килограммов, дни вместо
 * месяцев) такие рамки ловят, а хорошее животное — нет.
 */

export type CheckSeverity = 'fix' | 'note'

export type Issue = {
  /** Код правила — по нему потом можно посчитать статистику находок */
  code: string
  animalId: number
  ident: string
  /** Поле карточки, к которому относится замечание */
  field?: string
  severity: CheckSeverity
  text: string
}

const year = (d?: string | null): number | null => {
  if (!d) return null
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? null : t.getFullYear()
}

const time = (d?: string | null): number | null => {
  if (!d) return null
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? null : t
}

const idOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: number }).id
  return null
}

const rel = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null

/** Рамки правдоподобия. Не нормативы — границы, за которыми «так не бывает». */
const PLAUSIBLE = {
  milkYield: { min: 500, max: 25_000, unit: 'кг за лактацию' },
  fatPercent: { min: 2.0, max: 6.5, unit: '%' },
  proteinPercent: { min: 2.0, max: 5.0, unit: '%' },
  bloodPercent: { min: 0, max: 100, unit: '%' },
  ageYears: 25,
} as const

/**
 * Проверки, которым хватает самой записи.
 *
 * Отделены от тех, что ходят в базу: этих много, они дешёвые, и гонять
 * ради них запросы незачем.
 */
function localIssues(a: Animal): Issue[] {
  const out: Issue[] = []
  const push = (code: string, text: string, field?: string, severity: CheckSeverity = 'fix') =>
    out.push({ code, animalId: a.id as number, ident: a.identNumber, field, severity, text })

  const born = time(a.birthDate)

  if (!a.birthDate) {
    push('no-birth-date', 'Не указана дата рождения — без неё нельзя ни рассчитать возраст, ни выпустить свидетельство', 'birthDate')
  } else if (born !== null && born > Date.now()) {
    push('birth-in-future', 'Дата рождения в будущем', 'birthDate')
  } else if (born !== null) {
    const age = (Date.now() - born) / (365.25 * 86_400_000)
    if (age > PLAUSIBLE.ageYears && a.state === 'alive') {
      push(
        'too-old-alive',
        `Возраст ${Math.floor(age)} лет, при этом животное числится в стаде — вероятно, не отмечено выбытие`,
        'state',
      )
    }
  }

  if (!a.breed) {
    push('no-breed', 'Не указана порода', 'breed', 'note')
  }

  const bp = a.bloodPercent
  if (typeof bp === 'number' && (bp < PLAUSIBLE.bloodPercent.min || bp > PLAUSIBLE.bloodPercent.max)) {
    push('blood-out-of-range', `Кровность по голштину ${bp}% вне диапазона 0…100`, 'bloodPercent')
  }

  const s = a.summary ?? {}

  const milk = s.milkYield
  if (typeof milk === 'number' && (milk < PLAUSIBLE.milkYield.min || milk > PLAUSIBLE.milkYield.max)) {
    push(
      'milk-implausible',
      `Удой ${milk.toLocaleString('ru-RU')} ${PLAUSIBLE.milkYield.unit} вне правдоподобных границ — проверьте единицы измерения`,
      'summary.milkYield',
    )
  }

  const fat = s.fatPercent
  if (typeof fat === 'number' && (fat < PLAUSIBLE.fatPercent.min || fat > PLAUSIBLE.fatPercent.max)) {
    push('fat-implausible', `Жир ${fat}% вне правдоподобных границ`, 'summary.fatPercent')
  }

  const protein = s.proteinPercent
  if (
    typeof protein === 'number' &&
    (protein < PLAUSIBLE.proteinPercent.min || protein > PLAUSIBLE.proteinPercent.max)
  ) {
    push('protein-implausible', `Белок ${protein}% вне правдоподобных границ`, 'summary.proteinPercent')
  }

  /*
   * Жир и белок в килограммах должны соответствовать удою и процентам.
   * Расхождение больше десятой доли — не округление, а разные источники
   * данных, и какой из них верен, знает только хозяйство.
   */
  if (typeof milk === 'number' && typeof fat === 'number' && typeof s.fatKg === 'number') {
    const expected = (milk * fat) / 100
    if (expected > 0 && Math.abs(expected - s.fatKg) / expected > 0.1) {
      push(
        'fat-kg-mismatch',
        `Жир ${s.fatKg} кг не сходится с удоем и процентом жира (ожидалось около ${Math.round(expected)} кг)`,
        'summary.fatKg',
        'note',
      )
    }
  }

  // Выбытие отмечено причиной, но состояние осталось «в стаде» — или наоборот
  if (a.disposalReason && a.state === 'alive') {
    push('disposal-vs-state', 'Указана причина выбытия, но животное числится в стаде', 'state')
  }
  if (a.state !== 'alive' && !a.disposalReason) {
    push('state-vs-disposal', 'Животное выбыло, но причина выбытия не указана', 'disposalReason', 'note')
  }

  // Инбридинг выше 25% — запись сохраняется, но требует ручного подтверждения
  if (typeof a.inbreeding === 'number' && a.inbreeding > 25) {
    push(
      'high-inbreeding',
      `Коэффициент инбридинга ${a.inbreeding}% — требуется подтверждение происхождения`,
      'inbreeding',
    )
  }

  return out
}

/**
 * Проверки, которым нужны соседние записи: родители, однофамильцы по бирке.
 *
 * Родители догружаются одним запросом на весь набор, а не по одному
 * на животное: пакет из пятисот строк дал бы тысячу запросов, и разбор
 * пакета стал бы заметно медленнее самого импорта.
 */
async function relationalIssues(payload: Payload, animals: Animal[]): Promise<Issue[]> {
  const out: Issue[] = []
  if (!animals.length) return out

  const parentIds = new Set<number>()
  for (const a of animals) {
    const f = idOf(a.father)
    const m = idOf(a.mother)
    if (f) parentIds.add(f)
    if (m) parentIds.add(m)
  }

  const parents = new Map<number, Animal>()
  if (parentIds.size) {
    const { docs } = await payload.find({
      collection: 'animals',
      where: { id: { in: [...parentIds] } },
      limit: parentIds.size,
      depth: 0,
      overrideAccess: true,
    })
    for (const d of docs) parents.set(d.id as number, d as Animal)
  }

  for (const a of animals) {
    const push = (code: string, text: string, field?: string, severity: CheckSeverity = 'fix') =>
      out.push({ code, animalId: a.id as number, ident: a.identNumber, field, severity, text })

    const born = time(a.birthDate)

    for (const [side, label, expectedSex] of [
      ['father', 'Отец', 'male'],
      ['mother', 'Мать', 'female'],
    ] as const) {
      const pid = idOf(a[side])
      if (!pid) continue

      // Раскрытая связь бывает уже загружена страницей — тогда берём её
      const parent = parents.get(pid) ?? (rel(a[side]) as Animal | null)
      if (!parent || typeof parent.identNumber !== 'string') continue

      if (parent.sex && parent.sex !== expectedSex) {
        push(
          'parent-wrong-sex',
          `${label} — животное № ${parent.identNumber} — записан(а) с полом «${parent.sex === 'male' ? 'мужской' : 'женский'}»`,
          side,
        )
      }

      const parentBorn = time(parent.birthDate)
      if (born !== null && parentBorn !== null && parentBorn >= born) {
        push(
          'parent-younger',
          `${label} № ${parent.identNumber} родился(ась) ${parentBorn === born ? 'в тот же день' : 'позже потомка'} — ${year(parent.birthDate)} против ${year(a.birthDate)}`,
          side,
        )
      }

      if (pid === a.id) {
        push('self-parent', `${label} — само это животное`, side)
      }
    }

    if (!a.father && !a.mother && !a.pedigreeText?.fatherId && !a.pedigreeText?.motherId) {
      push(
        'no-parents',
        'Не указан ни один из родителей — ни ссылкой, ни по документам',
        'father',
        'note',
      )
    }
  }

  /*
   * Дубли по номеру бирки внутри одного набора.
   *
   * Индивидуальный номер уникален на уровне базы, а ушная бирка — нет
   * и не должна быть: её меняют, теряют, перевешивают. Но два живых
   * животных с одной биркой в одном хозяйстве — почти наверняка опечатка.
   */
  const byTag = new Map<string, Animal[]>()
  for (const a of animals) {
    const tag = a.altIds?.earTag?.trim()
    if (!tag) continue
    const list = byTag.get(tag) ?? []
    list.push(a)
    byTag.set(tag, list)
  }
  for (const [tag, list] of byTag) {
    if (list.length < 2) continue
    for (const a of list) {
      out.push({
        code: 'duplicate-ear-tag',
        animalId: a.id as number,
        ident: a.identNumber,
        field: 'altIds.earTag',
        severity: 'note',
        text: `Ушная бирка ${tag} встречается у ${list.length} животных пакета`,
      })
    }
  }

  return out
}

/** Все проверки по набору записей. */
export async function checkAnimals(payload: Payload, animals: Animal[]): Promise<Issue[]> {
  const local = animals.flatMap(localIssues)
  const relational = await relationalIssues(payload, animals)
  return [...local, ...relational]
}

/** Сводка для показа: сколько существенных, сколько на усмотрение. */
export const summarize = (issues: Issue[]) => ({
  total: issues.length,
  fix: issues.filter((i) => i.severity === 'fix').length,
  note: issues.filter((i) => i.severity === 'note').length,
  animals: new Set(issues.map((i) => i.animalId)).size,
})
