import { TRAIT_BASE, type Base, type IndexProfile, type TraitKey } from '@/lib/breeding-index'

/**
 * Матрица генетических корреляций и коррелированный отклик.
 *
 * Признаки связаны генетически: отбирая по одному, вы двигаете и остальные,
 * в том числе те, которым не дали никакого веса. Это самая частая ловушка
 * пользовательского индекса — хозяйство ставит сорок процентов на белок,
 * получает белок и через три года обнаруживает просевшую фертильность,
 * потому что связь между ними отрицательная и о ней никто не сказал.
 *
 * Матрица здесь литературная — сводные оценки по голштинской породе.
 * Заимствование того же рода, что и заимствованная база сравнения: своей
 * матрицы у Ассоциации нет, а получить её можно только из компонент дисперсии
 * на большой выборке — это работа расчётного центра. Порядок величин
 * и знаки при этом устойчивы между странами, и для предупреждения
 * «осторожно, просядет фертильность» их достаточно.
 *
 * Важно: корреляции заданы в «желательном» направлении признака — так же,
 * как считается стандартизованное отклонение в индексе. У смертности приплода
 * рост значения означает ухудшение, и знак уже перевёрнут при стандартизации;
 * в матрице она участвует как «сохранность приплода». Иначе пришлось бы
 * держать в голове два разных знака для одного и того же признака.
 */

type Pair = [TraitKey, TraitKey, number]

/**
 * Ненулевые корреляции. Пары, которых здесь нет, считаются нулевыми:
 * связь либо не установлена, либо пренебрежимо мала.
 */
const PAIRS: Pair[] = [
  // Продуктивность внутри себя: удой тянет за собой валовые жир и белок
  ['milk', 'fatKg', 0.55],
  ['milk', 'proteinKg', 0.85],
  ['fatKg', 'proteinKg', 0.65],

  // Классический антагонизм: чем выше удой, тем хуже воспроизводство
  // и здоровье вымени. Это и есть главная причина показывать отклик
  ['milk', 'fertility', -0.3],
  ['milk', 'udderHealth', -0.25],
  ['milk', 'productiveLongevity', 0.1],
  ['fatKg', 'productiveLongevity', 0.1],
  ['proteinKg', 'productiveLongevity', 0.15],
  ['fatKg', 'fertility', -0.15],
  ['proteinKg', 'fertility', -0.2],

  // Долголетие складывается из здоровья и экстерьера
  ['productiveLongevity', 'udderHealth', 0.35],
  ['productiveLongevity', 'fertility', 0.4],
  ['productiveLongevity', 'udderComposite', 0.3],
  ['productiveLongevity', 'legsComposite', 0.25],
  ['productiveLongevity', 'bodyComposite', -0.15],

  // Отёл: лёгкость и сохранность приплода — по сути одно событие
  ['calvingEase', 'calfMortality', 0.55],
  ['calvingEase', 'bodyComposite', -0.15],
  ['calfMortality', 'bodyComposite', -0.1],
  ['calvingEase', 'fertility', 0.15],

  // Экстерьер и здоровье вымени
  ['udderComposite', 'udderHealth', 0.3],
  ['legsComposite', 'udderHealth', 0.1],
  ['udderComposite', 'legsComposite', 0.2],
  ['bodyComposite', 'udderComposite', -0.1],
  ['fertility', 'udderHealth', 0.1],
  ['milk', 'bodyComposite', 0.2],
  ['milk', 'udderComposite', 0.05],
]

const KEYS = TRAIT_BASE.map((t) => t.key)

/** Симметричная матрица с единицами на диагонали. */
export const G_CORR: Record<TraitKey, Record<TraitKey, number>> = (() => {
  const m = {} as Record<TraitKey, Record<TraitKey, number>>
  for (const a of KEYS) {
    m[a] = {} as Record<TraitKey, number>
    for (const b of KEYS) m[a][b] = a === b ? 1 : 0
  }
  for (const [a, b, r] of PAIRS) {
    m[a][b] = r
    m[b][a] = r
  }
  return m
})()

export type Response = {
  key: TraitKey
  label: string
  unit: string
  /** Вес признака в профиле, доля влияния. Ноль — веса не давали. */
  weight: number
  /** Ожидаемый сдвиг за поколение в долях σ, в «желательную» сторону. */
  sigma: number
  /**
   * То же в единицах самого признака — со знаком этих единиц.
   *
   * У перевёрнутых признаков знак противоположен `sigma`: улучшение
   * смертности приплода это её уменьшение.
   */
  units: number
  /** Рост значения признака — ухудшение. */
  inverted: boolean
}

/**
 * Интенсивность отбора: на сколько σ отобранная группа лучше среднего.
 *
 * Значение зависит от того, какую долю оставляют в родители. Десять
 * процентов — обычная жёсткость отбора быков-производителей.
 */
export const SELECTION_INTENSITY = { key: 'top10', label: 'отбор 10 % лучших', i: 1.755 }

/**
 * Коррелированный отклик: что произойдёт с признаками при отборе по профилю.
 *
 * Δz_j = i · (R·b)_j / √(bᵀ·R·b)
 *
 * где b — веса в стандартизованной шкале, R — матрица корреляций, i —
 * интенсивность отбора. Знаменатель — стандартное отклонение самого индекса:
 * без него ответ зависел бы от масштаба весов, а не от их пропорций.
 *
 * Проверка формулы на вырожденном случае: если весь вес отдан одному
 * признаку, отклик по нему равен ровно i, а по остальным — i, умноженному
 * на корреляцию. Это и есть классическая формула коррелированного отклика.
 *
 * Чего расчёт не учитывает: разной достоверности оценок по признакам
 * и того, что часть отклика съедается инбридингом. Оба уточнения требуют
 * данных, которых нет; порядок величин от них не меняется.
 */
export function correlatedResponse(
  profile: IndexProfile,
  base: Base,
  intensity: number = SELECTION_INTENSITY.i,
): Response[] {
  const byKey = new Map(base.traits.map((t) => [t.key, t]))

  /*
   * Веса приводятся к стандартизованной шкале. Селекционные уже в ней —
   * это доли влияния. Экономические заданы в рублях на единицу признака,
   * и чтобы сравнить их между собой, каждый умножается на σ своего
   * признака: рубль за килограмм жира и рубль за балл вымени — разные рубли.
   */
  const b = {} as Record<TraitKey, number>
  let norm = 0
  for (const key of KEYS) {
    const raw = profile.weights[key] ?? 0
    const sd = byKey.get(key)?.sd ?? 1
    const value = profile.kind === 'economic' ? raw * sd : raw
    b[key] = value
    norm += Math.abs(value)
  }
  if (norm > 0) for (const key of KEYS) b[key] = b[key] / norm

  // R·b
  const rb = {} as Record<TraitKey, number>
  for (const a of KEYS) {
    let sum = 0
    for (const c of KEYS) sum += G_CORR[a][c] * b[c]
    rb[a] = sum
  }

  // σ индекса в стандартизованной шкале: √(bᵀ·R·b)
  let variance = 0
  for (const a of KEYS) variance += b[a] * rb[a]
  const sd = Math.sqrt(Math.max(variance, 1e-9))

  return KEYS.map((key) => {
    const trait = byKey.get(key)!
    const sigma = (intensity * rb[key]) / sd
    /*
     * `sigma` — отклик в «желательную» сторону, `units` — в единицах
     * самого признака, и у перевёрнутых признаков это разные знаки.
     *
     * Прежде `units` считались просто `sigma * sd`, и строка выглядела
     * так: «Смертность приплода +0,4 %», зелёным. Читалось это как рост
     * смертности, а означало ровно обратное — что смертность падает
     * на 0,4 %. У признака, где рост значения есть ухудшение, знак
     * в его собственных единицах обязан быть перевёрнут.
     */
    const direction = trait.inverted ? -1 : 1
    return {
      key,
      label: trait.label,
      unit: trait.unit,
      weight: b[key],
      sigma,
      units: sigma * trait.sd * direction,
      inverted: Boolean(trait.inverted),
    }
  }).sort((x, y) => Math.abs(y.sigma) - Math.abs(x.sigma))
}
