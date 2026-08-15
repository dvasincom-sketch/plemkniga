import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'

/**
 * Разбор родословной вглубь — до девятого колена и дальше.
 *
 * Дерево на такую глубину не рисуют: ряды удваиваются, и девятое колено —
 * это 512 клеток, из которых в реальной базе заполнены единицы. Да и вопрос
 * на глубине уже другой. Три-четыре колена отвечают «кто родители»,
 * дальше спрашивают «чья кровь в животном» и «откуда инбридинг», а это
 * не картинка, а список с числами.
 *
 * Поэтому здесь родословная обходится вширь и сворачивается в таблицу
 * предков: сколько раз каждый встречается, в каких коленах, какую долю
 * крови даёт и сколько приносит в коэффициент инбридинга.
 *
 * Два решения, без которых обход на девять колен невозможен:
 *
 * 1. Загрузка по колену, а не по узлу. Предки образуют граф, а не дерево:
 *    один бык встречается в родословной десятки раз, но в базе он один.
 *    Уровень целиком забирается одним запросом `id in (…)`, поэтому девять
 *    колен стоят девять запросов, а не тысячу.
 *
 * 2. Кратности вместо путей. Число путей до предка растёт экспоненциально,
 *    и перечислять их нельзя. Вместо списка путей хранится счётчик:
 *    «сюда ведёт 6 путей длиной 7». Все нужные формулы — суммы по путям,
 *    и с кратностями они считаются так же точно.
 */

export const ANCESTRY_DEPTH = 9

export type AncestorRow = {
  id: number
  identNumber: string
  name?: string | null
  sex?: string | null
  birthDate?: string | null
  /** Колена, в которых предок встречается, по возрастанию. */
  generations: number[]
  /** Число путей до предка — во сколько клеток родословной он попадает. */
  occurrences: number
  /** Доля крови, %: сумма (1/2)^колено по всем путям. */
  bloodShare: number
  /** Встречается и со стороны отца, и со стороны матери — источник инбридинга. */
  onBothSides: boolean
  /** Вклад в коэффициент инбридинга животного, %. */
  coiContribution: number
}

export type AncestryReport = {
  ancestors: AncestorRow[]
  /** Коэффициент инбридинга по Райту, %, — сумма вкладов из таблицы. */
  coi: number
  /** Заполненность по коленам: сколько различных предков известно из возможных. */
  coverage: { generation: number; known: number; possible: number }[]
  /** Самое глубокое колено, где нашёлся хотя бы один предок. */
  deepest: number
  /** Всего различных предков во всей родословной. */
  totalDistinct: number
  depth: number
}

type Side = 'father' | 'mother'

/** id связанной записи независимо от глубины выборки. */
const idOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: number }).id
  return null
}

/** Кратности: id предка → колено → число путей. */
type Counts = Map<number, Map<number, number>>

const addCount = (counts: Counts, id: number, generation: number, paths: number) => {
  const byGen = counts.get(id) ?? new Map<number, number>()
  byGen.set(generation, (byGen.get(generation) ?? 0) + paths)
  counts.set(id, byGen)
}

/**
 * Обход вширь от одного корня.
 *
 * На каждом шаге в работе — множество различных предков текущего колена
 * с числом путей до каждого. Родители всего колена забираются одним
 * запросом, кратности складываются.
 */
async function walk(
  fetchLevel: (ids: number[]) => Promise<Map<number, Animal>>,
  startId: number | null,
  depth: number,
): Promise<Counts> {
  const counts: Counts = new Map()
  if (!startId) return counts

  let frontier = new Map<number, number>([[startId, 1]])
  let generation = 1

  while (frontier.size > 0 && generation <= depth) {
    for (const [id, paths] of frontier) addCount(counts, id, generation, paths)

    if (generation === depth) break

    const docs = await fetchLevel([...frontier.keys()])
    const next = new Map<number, number>()

    for (const [id, paths] of frontier) {
      const doc = docs.get(id)
      if (!doc) continue
      for (const parent of [idOf(doc.father), idOf(doc.mother)]) {
        if (parent === null) continue
        next.set(parent, (next.get(parent) ?? 0) + paths)
      }
    }

    frontier = next
    generation++
  }

  return counts
}

/**
 * Загрузчик животных с общим кэшем на весь разбор.
 *
 * Кэш здесь не оптимизация, а необходимость: обходов несколько (по отцу,
 * по матери, плюс по одному на каждого общего предка ради его собственного
 * инбридинга), и они идут по сильно пересекающимся частям графа.
 */
function createLevelLoader(payload: Payload) {
  const cache = new Map<number, Animal | null>()

  return async (ids: number[]): Promise<Map<number, Animal>> => {
    const missing = ids.filter((id) => !cache.has(id))

    if (missing.length > 0) {
      try {
        const found = await payload.find({
          collection: 'animals',
          where: { id: { in: missing } },
          limit: missing.length,
          depth: 0,
          overrideAccess: true,
        })
        for (const doc of found.docs) cache.set(doc.id as number, doc as Animal)
      } catch {
        // Отсутствующий предок — обрыв ветви, а не ошибка страницы
      }
      for (const id of missing) if (!cache.has(id)) cache.set(id, null)
    }

    const out = new Map<number, Animal>()
    for (const id of ids) {
      const doc = cache.get(id)
      if (doc) out.set(id, doc)
    }
    return out
  }
}

/**
 * Вклад общего предка в коэффициент инбридинга (формула Райта).
 *
 * F = Σ (1/2)^(p+q+1) · (1 + F_A), где p и q — число поколений от отца
 * и от матери до общего предка A. В обходе колено считается от самого
 * животного, поэтому p = колено − 1, и показатель степени сворачивается
 * до (колено_отца + колено_матери − 1).
 */
const contribution = (
  fromSire: Map<number, number>,
  fromDam: Map<number, number>,
  ownCoi: number,
): number => {
  let sum = 0
  for (const [p, pathsP] of fromSire) {
    for (const [q, pathsQ] of fromDam) {
      sum += pathsP * pathsQ * 0.5 ** (p + q - 1) * (1 + ownCoi)
    }
  }
  return sum
}

export async function analyzeAncestry(
  payload: Payload,
  animal: Animal,
  depth = ANCESTRY_DEPTH,
): Promise<AncestryReport> {
  const fetchLevel = createLevelLoader(payload)

  const fatherId = idOf(animal.father)
  const motherId = idOf(animal.mother)

  const [sire, dam] = await Promise.all([
    walk(fetchLevel, fatherId, depth),
    walk(fetchLevel, motherId, depth),
  ])

  /*
   * Собственный инбридинг общего предка.
   *
   * Считается тем же обходом, но на меньшую глубину и только для тех
   * предков, которые действительно встречаются с обеих сторон: их обычно
   * единицы, а полный расчёт для каждого узла родословной превратил бы
   * страницу в вычислительную задачу.
   */
  const coiCache = new Map<number, number>()
  const ownCoiOf = async (id: number): Promise<number> => {
    const cached = coiCache.get(id)
    if (cached !== undefined) return cached

    coiCache.set(id, 0) // защита от циклов в испорченных данных
    const docs = await fetchLevel([id])
    const doc = docs.get(id)
    const f = doc ? idOf(doc.father) : null
    const m = doc ? idOf(doc.mother) : null

    let value = 0
    if (f && m) {
      const [fp, mp] = await Promise.all([
        walk(fetchLevel, f, Math.max(1, depth - 2)),
        walk(fetchLevel, m, Math.max(1, depth - 2)),
      ])
      for (const [ancestorId, byGen] of fp) {
        const other = mp.get(ancestorId)
        if (other) value += contribution(byGen, other, 0)
      }
    }

    coiCache.set(id, value)
    return value
  }

  // Объединяем стороны
  const allIds = new Set<number>([...sire.keys(), ...dam.keys()])
  const docs = await fetchLevel([...allIds])

  const rows: AncestorRow[] = []
  let coi = 0

  for (const id of allIds) {
    const fromSire = sire.get(id)
    const fromDam = dam.get(id)
    const onBothSides = Boolean(fromSire && fromDam)

    let occurrences = 0
    let bloodShare = 0
    const generations = new Set<number>()

    for (const byGen of [fromSire, fromDam]) {
      if (!byGen) continue
      for (const [generation, paths] of byGen) {
        occurrences += paths
        bloodShare += paths * 0.5 ** generation
        generations.add(generation)
      }
    }

    let coiContribution = 0
    if (onBothSides) {
      coiContribution = contribution(fromSire!, fromDam!, await ownCoiOf(id))
      coi += coiContribution
    }

    const doc = docs.get(id)

    rows.push({
      id,
      identNumber: doc?.identNumber ?? String(id),
      name: doc?.name,
      sex: doc?.sex,
      birthDate: doc?.birthDate,
      generations: [...generations].sort((a, b) => a - b),
      occurrences,
      bloodShare: bloodShare * 100,
      onBothSides,
      coiContribution: coiContribution * 100,
    })
  }

  /*
   * Сортировка по доле крови, а не по колену.
   *
   * Предок из третьего колена, встречающийся один раз, даёт 12,5 %;
   * предок из седьмого, но повторённый двадцать раз, — больше. Именно
   * второй случай и есть то, ради чего смотрят вглубь.
   */
  rows.sort((a, b) => b.bloodShare - a.bloodShare)

  const coverage = Array.from({ length: depth }, (_, i) => {
    const generation = i + 1
    const known = rows.filter((r) => r.generations.includes(generation)).length
    return { generation, known, possible: 2 ** generation }
  })

  const deepest = coverage.reduce((max, c) => (c.known > 0 ? c.generation : max), 0)

  return {
    ancestors: rows,
    coi: Math.round(coi * 100 * 100) / 100,
    coverage,
    deepest,
    totalDistinct: rows.length,
    depth,
  }
}
