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
 * 2. Пути, а не кратности. Прежде обход хранил только счётчик «сюда
 *    ведёт 6 путей длиной 7» — для доли крови этого достаточно, для
 *    инбридинга нет. Формула Райта суммирует только пути, в которых
 *    ни одно животное не встречается дважды, а счётчик не помнит, через
 *    кого путь прошёл. Из-за этого вклад общего предка P считался вместе
 *    со вкладами всех предков P — путь «отец → P → дед → P → мать» проходит
 *    через P дважды и в формулу входить не должен: собственные предки P
 *    учтены множителем (1 + F_P). Потомок полных сибсов получал 37,5 %
 *    вместо 25 %, отец × дочь при полной родословной — к 50 % вместо 25 %,
 *    и чем полнее была родословная, тем сильнее завышение. Число при этом
 *    оставалось правдоподобным, и семь проверочных животных без дедов
 *    его не ловили.
 *
 *    Путей на глубину девять не больше 2⁸ = 256 с каждой стороны — это
 *    не «нельзя перечислить», как считалось раньше, а несколько десятков
 *    тысяч пар в худшем случае. Поэтому каждый путь хранится списком
 *    пройденных животных, и пара путей входит в сумму, только если списки
 *    не пересекаются.
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
const relId = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: number }).id
  return null
}

/**
 * Путь от корня обхода до предка: колено предка и все животные, через
 * которых путь прошёл, включая сам корень. Предок в список не входит —
 * он конец пути, и у пары путей с обеих сторон он общий по построению.
 */
type PathTo = { gen: number; via: number[] }

/** id предка → пути до него. */
type Paths = Map<number, PathTo[]>

/**
 * Обход вширь от одного корня с перечислением путей.
 *
 * На каждом шаге в работе — список путей текущего колена. Родители всего
 * колена по-прежнему забираются одним запросом, поэтому девять колен
 * стоят девять запросов, а не тысячу. Путь, который упёрся бы в животное,
 * уже пройденное им же, обрывается: в правильной родословной такого
 * не бывает, а в испорченной это единственная защита от бесконечного
 * обхода по кругу.
 */
async function walk(
  fetchLevel: (ids: number[]) => Promise<Map<number, Animal>>,
  startId: number | null,
  depth: number,
): Promise<Paths> {
  const paths: Paths = new Map()
  if (!startId) return paths

  let frontier: { id: number; via: number[] }[] = [{ id: startId, via: [] }]
  let generation = 1

  while (frontier.length > 0 && generation <= depth) {
    for (const { id, via } of frontier) {
      const list = paths.get(id) ?? []
      list.push({ gen: generation, via })
      paths.set(id, list)
    }

    if (generation === depth) break

    const docs = await fetchLevel([...new Set(frontier.map((f) => f.id))])
    const next: { id: number; via: number[] }[] = []

    for (const { id, via } of frontier) {
      const doc = docs.get(id)
      if (!doc) continue
      for (const parent of [relId(doc.father), relId(doc.mother)]) {
        if (parent === null) continue
        if (parent === id || via.includes(parent)) continue
        next.push({ id: parent, via: [...via, id] })
      }
    }

    frontier = next
    generation++
  }

  return paths
}

/** Число путей до предка по коленам — то, чем считаются доля крови и кратность. */
const byGeneration = (list: PathTo[]): Map<number, number> => {
  const out = new Map<number, number>()
  for (const p of list) out.set(p.gen, (out.get(p.gen) ?? 0) + 1)
  return out
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
 * и от матери до общего предка A, а сумма идёт по парам путей, в которых
 * ни одно животное не встречается дважды. В обходе колено считается
 * от самого животного, поэтому p = колено − 1, и показатель степени
 * сворачивается до (колено_отца + колено_матери − 1).
 *
 * Пересечение проверяется по спискам пройденных животных: в них входят
 * и сами корни обхода, поэтому путь через отца к его же отцу и обратно
 * через мать-дочь отбрасывается той же проверкой, что и путь через
 * общего деда, — отдельного правила для «отец × дочь» не нужно.
 */
const contribution = (fromSire: PathTo[], fromDam: PathTo[], ownCoi: number): number => {
  let sum = 0
  for (const s of fromSire) {
    const seen = new Set(s.via)
    for (const d of fromDam) {
      if (d.via.some((id) => seen.has(id))) continue
      sum += 0.5 ** (s.gen + d.gen - 1) * (1 + ownCoi)
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

  const fatherId = relId(animal.father)
  const motherId = relId(animal.mother)

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
    const f = doc ? relId(doc.father) : null
    const m = doc ? relId(doc.mother) : null

    let value = 0
    if (f && m) {
      const [fp, mp] = await Promise.all([
        walk(fetchLevel, f, Math.max(1, depth - 2)),
        walk(fetchLevel, m, Math.max(1, depth - 2)),
      ])
      for (const [ancestorId, list] of fp) {
        const other = mp.get(ancestorId)
        if (other) value += contribution(list, other, 0)
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

    for (const list of [fromSire, fromDam]) {
      if (!list) continue
      for (const [generation, paths] of byGeneration(list)) {
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
