import type { Animal } from '@/payload-types'

/**
 * Расчёт индекса племенной ценности.
 *
 * До сих пор ИПЦ был хранимым числом: его привозили извне, а система только
 * показывала. Здесь он считается — из оценок по отдельным признакам, которые
 * в модели уже есть, базы сравнения и набора весов.
 *
 * Формула стандартная для селекционного индекса:
 *
 *     I = Σ wᵢ · (EBVᵢ − μᵢ) / σᵢ · МАСШТАБ
 *
 * Три составляющие и три причины, по которым ни одну нельзя пропустить:
 *
 *   EBVᵢ — оценка племенной ценности по признаку. Хранится в карточке парой
 *          «прогноз + достоверность»: `production.milk.forecast` и так далее.
 *
 *   μᵢ, σᵢ — среднее и стандартное отклонение по референтной группе. Без них
 *          складывать килограммы молока с баллами вымени нельзя: получится
 *          сумма несопоставимых величин. Деление на σ переводит все признаки
 *          в одну шкалу — доли генетического стандартного отклонения.
 *
 *   wᵢ  — веса. Задаются профилем: либо экономические (рублей на единицу
 *          признака), либо селекционные (доли влияния в процентах).
 *
 * Числа базы взяты из опубликованных генетических параметров голштинской
 * популяции США (CDCB, Net Merit 2025) и пересчитаны в метрические единицы.
 * Это осознанное заимствование: собственной российской базы сравнения нет,
 * а голштин — порода международная, и разброс племенных ценностей внутри неё
 * сопоставим. Как только Ассоциация накопит собственную выборку, таблицу
 * `TRAIT_BASE` следует пересчитать по ней — ради этого у базы есть версия.
 */

/* ------------------------------------------------------------------ *
 *                         База сравнения                              *
 * ------------------------------------------------------------------ */

import { ECONOMIC_WEIGHTS } from '@/lib/economics'

export type TraitKey =
  | 'milk'
  | 'fatKg'
  | 'proteinKg'
  | 'productiveLongevity'
  | 'udderHealth'
  | 'fertility'
  | 'calvingEase'
  | 'calfMortality'
  | 'bodyComposite'
  | 'udderComposite'
  | 'legsComposite'

export type TraitBase = {
  key: TraitKey
  label: string
  unit: string
  /** Среднее по референтной группе: у базы племенных ценностей оно нулевое. */
  mean: number
  /** Генетическое стандартное отклонение признака. */
  sd: number
  /** Коэффициент наследуемости — нужен для расчёта достоверности. */
  heritability: number
  /** Повторяемость признака у одного животного между лактациями. */
  repeatability: number
  /** Путь к прогнозу в карточке животного. */
  path: string
  /** Признак, у которого рост значения — ухудшение. */
  inverted?: boolean
}

/**
 * Версия базы. Меняется при пересчёте средних и отклонений; хранится вместе
 * с результатом, иначе через полгода нельзя объяснить, откуда взялось число
 * в выпущенном документе.
 */
export const BASE_VERSION = 'CDCB-2025-metric'

/**
 * Генетические стандартные отклонения из Net Merit 2025 (CDCB), переведённые
 * в килограммы: 566,88 фунта молока = 257,1 кг, 24,88 фунта жира = 11,29 кг,
 * 15,27 фунта белка = 6,93 кг.
 *
 * Среднее у всех признаков нулевое, потому что племенная ценность измеряется
 * отклонением от базы породы, а не абсолютной величиной. Это не упрощение:
 * так устроены все национальные базы, и при смене базы средние обнуляют заново.
 */
export const TRAIT_BASE: TraitBase[] = [
  {
    key: 'milk',
    label: 'Удой',
    unit: 'кг',
    mean: 0,
    sd: 257.1,
    heritability: 0.3,
    repeatability: 0.55,
    path: 'production.milk',
  },
  {
    key: 'fatKg',
    label: 'Жир',
    unit: 'кг',
    mean: 0,
    sd: 11.29,
    heritability: 0.3,
    repeatability: 0.55,
    path: 'production.fatKg',
  },
  {
    key: 'proteinKg',
    label: 'Белок',
    unit: 'кг',
    mean: 0,
    sd: 6.93,
    heritability: 0.3,
    repeatability: 0.55,
    path: 'production.proteinKg',
  },
  {
    key: 'productiveLongevity',
    label: 'Продуктивное долголетие',
    unit: 'мес.',
    mean: 0,
    sd: 1.7,
    heritability: 0.085,
    repeatability: 0.1,
    path: 'health.productiveLongevity',
  },
  {
    // В модели признак назван «здоровье вымени» и растёт в сторону улучшения.
    // Международный аналог — SCS, соматические клетки, где рост означает
    // ухудшение; отсюда разные знаки весов в профилях
    key: 'udderHealth',
    label: 'Здоровье вымени',
    unit: 'балл',
    mean: 0,
    sd: 0.14 * 7.14, // шкала признака в системе крупнее логарифмической SCS
    heritability: 0.12,
    repeatability: 0.3,
    path: 'health.udderHealth',
  },
  {
    key: 'fertility',
    label: 'Фертильность',
    unit: '%',
    mean: 0,
    sd: 1.37,
    heritability: 0.04,
    repeatability: 0.1,
    path: 'reproduction.fertility',
  },
  {
    key: 'calvingEase',
    label: 'Лёгкость отёла',
    unit: 'балл',
    mean: 0,
    sd: 1.3,
    heritability: 0.08,
    repeatability: 0.15,
    path: 'health.calvingEase',
  },
  {
    key: 'calfMortality',
    label: 'Смертность приплода',
    unit: '%',
    mean: 0,
    sd: 1.62,
    heritability: 0.02,
    repeatability: 0.05,
    path: 'health.calfMortality',
    inverted: true,
  },
  {
    key: 'bodyComposite',
    label: 'Композит тела',
    unit: 'балл',
    mean: 0,
    sd: 0.76,
    heritability: 0.28,
    repeatability: 0.5,
    path: 'exterior.bodyComposite',
  },
  {
    key: 'udderComposite',
    label: 'Композит вымени',
    unit: 'балл',
    mean: 0,
    sd: 0.65,
    heritability: 0.28,
    repeatability: 0.5,
    path: 'exterior.udderComposite',
  },
  {
    key: 'legsComposite',
    label: 'Композит ног',
    unit: 'балл',
    mean: 0,
    sd: 0.53,
    heritability: 0.15,
    repeatability: 0.4,
    path: 'exterior.legsComposite',
  },
]

const BY_KEY = new Map(TRAIT_BASE.map((t) => [t.key, t]))

/**
 * База сравнения, по которой считается индекс.
 *
 * По умолчанию — таблица из кода (Net Merit 2025, переведённая в метрические
 * единицы). Ассоциация может пересчитать средние и отклонения по собственной
 * популяции; тогда сюда передаётся её база, а версия уходит вместе
 * с результатом. Без версии число в выпущенном документе через полгода
 * нечем объяснить: те же оценки на другой базе дают другой индекс.
 */
export type Base = { traits: TraitBase[]; version: string }

export const DEFAULT_BASE: Base = { traits: TRAIT_BASE, version: BASE_VERSION }

/* ------------------------------------------------------------------ *
 *                            Профили весов                            *
 * ------------------------------------------------------------------ */

/**
 * Два способа задать веса — и это не вопрос вкуса.
 *
 * `economic` — рублей на единицу признака. Так устроены NM$ и Pro$: индекс
 *   получается в деньгах и отвечает на вопрос «сколько эта корова принесёт
 *   за жизнь». Требует экономических допущений: цена молока, стоимость
 *   нетели, цена случая мастита.
 *
 * `selection` — доли влияния в процентах, в сумме 100. Так устроены TPI
 *   и LPI. Не требует экономики и понятнее селекционеру: «сорок процентов
 *   давления на белок и жир». Именно этот способ Lactanet даёт хозяйствам
 *   для персонального индекса.
 */
export type WeightKind = 'economic' | 'selection'

export type IndexProfile = {
  key: string
  name: string
  /** Одна фраза о том, для кого профиль. */
  hint: string
  kind: WeightKind
  /** Владелец профиля: null — стандартный профиль Ассоциации. */
  owner?: number | null
  /** Вес по признаку. Для `selection` — проценты, для `economic` — ₽/единицу. */
  weights: Partial<Record<TraitKey, number>>
}

/**
 * Стандартный профиль Ассоциации.
 *
 * Относительное влияние признаков повторяет Net Merit 2025 с поправкой
 * на состав признаков в системе: у нас нет отдельных RFI, HCR/CCR и
 * стоимости здоровья, поэтому их доли перераспределены между близкими
 * признаками. Проценты даны по модулю и в сумме дают 100.
 */
export const ASSOCIATION_PROFILE: IndexProfile = {
  key: 'association',
  name: 'ИПЦ Ассоциации',
  hint: 'Стандартный индекс: сбалансированное давление на продуктивность, долголетие и здоровье',
  kind: 'selection',
  owner: null,
  weights: {
    fatKg: 27,
    proteinKg: 14,
    milk: 3,
    productiveLongevity: 16,
    udderHealth: 6,
    fertility: 6,
    calvingEase: 4,
    calfMortality: 6,
    bodyComposite: -8,
    udderComposite: 6,
    legsComposite: 4,
  },
}

/**
 * Национальные индексы — как точки отсчёта, а не как копии.
 *
 * Пересчитать NM$ или TPI один в один нельзя: в них входят признаки, которых
 * в системе нет (остаточное потребление корма, стельность тёлок, живучесть
 * коров). Это приближения по общим признакам, и подпись должна об этом
 * говорить — иначе число сравнят с официальным и не сойдётся.
 */
export const NATIONAL_PROFILES: IndexProfile[] = [
  {
    key: 'nm',
    name: 'NM$ (приближение)',
    hint: 'США, CDCB: пожизненная прибыль. Считается по общим признакам, без RFI и живучести',
    kind: 'selection',
    owner: null,
    weights: {
      fatKg: 36,
      proteinKg: 15,
      milk: 4,
      productiveLongevity: 15,
      udderHealth: 3,
      fertility: 2,
      calvingEase: 4,
      calfMortality: 7,
      bodyComposite: -12,
      udderComposite: 1,
      legsComposite: 1,
    },
  },
  {
    key: 'tpi',
    name: 'TPI (приближение)',
    hint: 'США, Holstein Association: баланс продуктивности, здоровья и типа',
    kind: 'selection',
    owner: null,
    weights: {
      fatKg: 20,
      proteinKg: 19,
      milk: 3,
      productiveLongevity: 13,
      udderHealth: 5,
      fertility: 8,
      calvingEase: 3,
      calfMortality: 3,
      bodyComposite: -3,
      udderComposite: 15,
      legsComposite: 8,
    },
  },
]

/**
 * Готовые профили под конкретные узкие места хозяйства.
 *
 * Это не «пресеты для красоты»: каждый отвечает на ситуацию, которую
 * хозяйство называет само, когда объясняет, что у него болит.
 */
export const FARM_PROFILES: IndexProfile[] = [
  {
    key: 'cheese',
    name: 'Молоко на сыр',
    hint: 'Белок дороже жира: сдача на сыродельный завод с оплатой по белку',
    kind: 'selection',
    owner: null,
    weights: {
      proteinKg: 34,
      fatKg: 14,
      milk: 2,
      productiveLongevity: 14,
      udderHealth: 8,
      fertility: 6,
      calvingEase: 3,
      calfMortality: 4,
      bodyComposite: -6,
      udderComposite: 6,
      legsComposite: 3,
    },
  },
  {
    key: 'longevity',
    name: 'Удержать первотёлок',
    hint: 'Узкое место — выбытие после первой лактации: долголетие, вымя и ноги',
    kind: 'selection',
    owner: null,
    weights: {
      productiveLongevity: 28,
      udderComposite: 14,
      legsComposite: 10,
      udderHealth: 10,
      fatKg: 12,
      proteinKg: 8,
      fertility: 8,
      calfMortality: 4,
      bodyComposite: -4,
      calvingEase: 2,
    },
  },
  {
    key: 'calving',
    name: 'Разгрузить роддом',
    hint: 'Переполненный роддом: лёгкость отёла и сохранность приплода в приоритете',
    kind: 'selection',
    owner: null,
    weights: {
      calvingEase: 24,
      calfMortality: 18,
      productiveLongevity: 12,
      fatKg: 14,
      proteinKg: 8,
      fertility: 8,
      udderHealth: 5,
      udderComposite: 5,
      legsComposite: 3,
      bodyComposite: -3,
    },
  },
]

/**
 * Профиль в деньгах.
 *
 * Отвечает на вопрос «сколько это животное принесёт за продуктивную жизнь»,
 * как NM$ в США и Pro$ в Канаде. Веса — рубли на единицу признака, они
 * не нормируются: у них есть собственный смысл, и сумма получается
 * в рублях, а не в очках.
 *
 * Цена честности — прозрачность допущений: индекс верен ровно настолько,
 * насколько верны цены под ним. Все они собраны в `src/lib/economics.ts`
 * и показаны в интерфейсе рядом с профилем.
 */
export const PROFIT_PROFILE: IndexProfile = {
  key: 'profit',
  name: 'Прибыль, ₽ за жизнь',
  hint: 'Экономический индекс: рубли на единицу признака по ценам 2026 года. Допущения открыты и правятся',
  kind: 'economic',
  owner: null,
  weights: ECONOMIC_WEIGHTS,
}

export const BUILTIN_PROFILES = [
  ASSOCIATION_PROFILE,
  PROFIT_PROFILE,
  ...NATIONAL_PROFILES,
  ...FARM_PROFILES,
]

/* ------------------------------------------------------------------ *
 *                              Расчёт                                 *
 * ------------------------------------------------------------------ */

/**
 * Масштаб индекса.
 *
 * Стандартизованная сумма живёт около нуля с разбросом примерно в единицу —
 * такие числа неудобно читать и сравнивать. Умножение на 1000 даёт привычный
 * вид: ИПЦ +1500 понятнее, чем +1,5. Ровно так же поступают TPI и LPI.
 */
export const INDEX_SCALE = 1000

/** Значение по пути вида `production.milk` — прогноз и достоверность. */
const readTrait = (
  animal: Animal,
  path: string,
): { forecast: number | null; r: number | null } => {
  const parts = path.split('.')
  let node: unknown = animal
  for (const p of parts) {
    if (node && typeof node === 'object') node = (node as Record<string, unknown>)[p]
    else return { forecast: null, r: null }
  }
  // Композиты экстерьера хранятся одним числом, без пары «прогноз + R»
  if (typeof node === 'number') return { forecast: node, r: null }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    return {
      forecast: typeof o.forecast === 'number' ? o.forecast : null,
      r: typeof o.r === 'number' ? o.r : null,
    }
  }
  return { forecast: null, r: null }
}

export type Contribution = {
  key: TraitKey
  label: string
  unit: string
  /** Прогноз племенной ценности по признаку, в единицах признака. */
  forecast: number
  /** Отклонение от базы в долях генетического σ. */
  standardized: number
  weight: number
  /** Вклад признака в итоговое значение индекса. */
  points: number
  /** Достоверность оценки по признаку, %. */
  reliability: number | null
}

export type IndexResult = {
  profile: IndexProfile
  baseVersion: string
  /** Итоговое значение индекса. */
  value: number
  /** Достоверность индекса, %. */
  reliability: number
  /** Сколько признаков из профиля удалось учесть. */
  used: number
  total: number
  contributions: Contribution[]
}

/**
 * Нормировка весов.
 *
 * Селекционные веса приводятся к сумме модулей 100 — иначе два профиля
 * с одинаковыми пропорциями, но разными абсолютными числами дали бы разные
 * значения индекса, и сравнить животных между профилями стало бы нельзя.
 * Экономические веса не нормируются: у них есть собственный смысл — рубли.
 */
const normalize = (profile: IndexProfile): Partial<Record<TraitKey, number>> => {
  if (profile.kind === 'economic') return profile.weights
  const sum = Object.values(profile.weights).reduce((a, w) => a + Math.abs(w ?? 0), 0)
  if (!sum) return profile.weights
  const out: Partial<Record<TraitKey, number>> = {}
  for (const [k, w] of Object.entries(profile.weights)) {
    out[k as TraitKey] = ((w ?? 0) / sum) * 100
  }
  return out
}

export function computeIndex(
  animal: Animal,
  profile: IndexProfile,
  base: Base = DEFAULT_BASE,
): IndexResult {
  const weights = normalize(profile)
  const contributions: Contribution[] = []
  const byKey = base === DEFAULT_BASE ? BY_KEY : new Map(base.traits.map((t) => [t.key, t]))

  let value = 0
  let total = 0

  for (const [key, rawWeight] of Object.entries(weights)) {
    const weight = rawWeight ?? 0
    if (!weight) continue
    total++

    const trait = byKey.get(key as TraitKey)
    if (!trait) continue

    const { forecast, r } = readTrait(animal, trait.path)
    if (forecast === null) continue

    const direction = trait.inverted ? -1 : 1
    const standardized = ((forecast - trait.mean) / trait.sd) * direction

    /*
     * Экономический вес умножается на саму племенную ценность в единицах
     * признака — рубли на килограмм дают рубли. Селекционный работает
     * со стандартизованным отклонением: проценты влияния имеют смысл
     * только на общей шкале.
     */
    const points =
      profile.kind === 'economic'
        ? weight * (forecast - trait.mean) * direction
        : (weight / 100) * standardized * INDEX_SCALE

    value += points
    contributions.push({
      key: trait.key,
      label: trait.label,
      unit: trait.unit,
      forecast,
      standardized,
      weight,
      points,
      reliability: r,
    })
  }

  contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))

  return {
    profile,
    baseVersion: base.version,
    value: Math.round(value * 10) / 10,
    reliability: indexReliability(contributions, weights, byKey),
    used: contributions.length,
    total,
    contributions,
  }
}

/* ------------------------------------------------------------------ *
 *                           Достоверность                             *
 * ------------------------------------------------------------------ */


/**
 * Достоверность индекса.
 *
 * Строго она выводится из матрицы ковариаций между признаками. На практике
 * берут среднее достоверностей компонентов, взвешенное по их вкладу
 * в дисперсию индекса: признак с большим весом и большим σ определяет
 * итог сильнее, и его достоверность должна весить больше.
 */
function indexReliability(
  contributions: Contribution[],
  weights: Partial<Record<TraitKey, number>>,
  byKey: Map<TraitKey, TraitBase> = BY_KEY,
): number {
  let num = 0
  let den = 0

  for (const c of contributions) {
    if (c.reliability === null) continue
    const trait = byKey.get(c.key)
    if (!trait) continue
    const share = Math.abs(weights[c.key] ?? 0) * trait.sd
    num += share * c.reliability
    den += share
  }

  if (!den) return 0
  return Math.round((num / den) * 10) / 10
}
