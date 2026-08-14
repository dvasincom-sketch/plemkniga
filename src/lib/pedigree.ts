import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'

/**
 * Построение генеалогического древа и расчёт коэффициента инбридинга.
 *
 * ТЗ, UC-02 п. 6.2.2: визуализация родословной, коэффициент инбридинга
 * рассчитывается автоматически по формуле Райта
 *   F = Σ (1/2)^(p+q+1) · (1 + F_A),
 * где p и q — число поколений от отца и от матери до общего предка A,
 * F_A — коэффициент инбридинга самого общего предка.
 *
 * Контрольные значения (ТЗ): родитель–потомок 0,5; полные сибсы 0,5;
 * двоюродные 0,125; неродственные ≈ 0.
 */

export type PedigreeAnimal = {
  id: number
  identNumber: string
  name?: string | null
  birthDate?: string | null
  sex?: string | null
}

export type PedigreeNode = {
  /** Код позиции: О, М, ОО, МО, ООО… (читается справа налево) */
  code: string
  /** Запись в системе, если предок заведён */
  animal: PedigreeAnimal | null
  /** Данные из текстовой родословной, когда карточки предка нет */
  text: { identNumber?: string | null; name?: string | null } | null
  children: PedigreeNode[]
}

type ParentIds = { father: number | null; mother: number | null }

const idOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: number }).id
  return null
}

/** Кэширующий загрузчик животных — одно обращение к БД на предка. */
export function createAnimalLoader(payload: Payload) {
  const cache = new Map<number, Animal | null>()

  return async (id: number): Promise<Animal | null> => {
    if (cache.has(id)) return cache.get(id)!
    let doc: Animal | null = null
    try {
      doc = (await payload.findByID({
        collection: 'animals',
        id,
        depth: 0,
        overrideAccess: true,
      })) as Animal
    } catch {
      doc = null
    }
    cache.set(id, doc)
    return doc
  }
}

const toPedigreeAnimal = (a: Animal): PedigreeAnimal => ({
  id: a.id as number,
  identNumber: a.identNumber,
  name: a.name,
  birthDate: a.birthDate,
  sex: a.sex,
})

/**
 * Собирает дерево предков заданной глубины.
 * `depth = 3` даёт три ряда: О/М → ОО/МО/ОМ/ММ → 8 узлов третьего ряда.
 */
export async function buildPedigree(
  payload: Payload,
  animal: Animal,
  depth = 3,
): Promise<PedigreeNode[]> {
  const load = createAnimalLoader(payload)

  const node = async (
    parentId: number | null,
    code: string,
    level: number,
    fallback: { identNumber?: string | null; name?: string | null } | null,
  ): Promise<PedigreeNode> => {
    const doc = parentId ? await load(parentId) : null

    const children: PedigreeNode[] = []
    if (level < depth) {
      const f = doc ? idOf(doc.father) : null
      const m = doc ? idOf(doc.mother) : null
      const fb = doc?.pedigreeText

      children.push(
        await node(f, `О${code}`, level + 1, {
          identNumber: fb?.fatherId,
          name: fb?.fatherName,
        }),
        await node(m, `М${code}`, level + 1, {
          identNumber: fb?.motherId,
          name: fb?.motherName,
        }),
      )
    }

    const hasFallback = Boolean(fallback?.identNumber || fallback?.name)

    return {
      code,
      animal: doc ? toPedigreeAnimal(doc) : null,
      text: !doc && hasFallback ? fallback : null,
      children,
    }
  }

  const pt = animal.pedigreeText

  return [
    await node(idOf(animal.father), 'О', 1, {
      identNumber: pt?.fatherId,
      name: pt?.fatherName,
    }),
    await node(idOf(animal.mother), 'М', 1, {
      identNumber: pt?.motherId,
      name: pt?.motherName,
    }),
  ]
}

/* ------------------------------------------------------------------ */
/*                  Коэффициент инбридинга (формула Райта)              */
/* ------------------------------------------------------------------ */

/**
 * Все предки животного с минимальным числом поколений до него.
 * Возвращает Map<id предка, набор длин путей>.
 */
async function ancestorPaths(
  load: (id: number) => Promise<Animal | null>,
  startId: number | null,
  maxDepth: number,
): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>()
  if (!startId) return result

  const walk = async (id: number | null, dist: number) => {
    if (!id || dist > maxDepth) return
    const paths = result.get(id) ?? []
    paths.push(dist)
    result.set(id, paths)

    const doc = await load(id)
    if (!doc) return
    await walk(idOf(doc.father), dist + 1)
    await walk(idOf(doc.mother), dist + 1)
  }

  await walk(startId, 0)
  return result
}

/**
 * Коэффициент инбридинга животного, %.
 * Учитывает только общих предков отца и матери в пределах `maxDepth` поколений.
 */
export async function wrightInbreeding(
  payload: Payload,
  animal: Animal,
  maxDepth = 5,
): Promise<number> {
  const load = createAnimalLoader(payload)

  const fatherId = idOf(animal.father)
  const motherId = idOf(animal.mother)
  if (!fatherId || !motherId) return 0

  const [sirePaths, damPaths] = await Promise.all([
    ancestorPaths(load, fatherId, maxDepth),
    ancestorPaths(load, motherId, maxDepth),
  ])

  let f = 0
  for (const [ancestorId, ps] of sirePaths) {
    const qs = damPaths.get(ancestorId)
    if (!qs) continue

    // Коэффициент инбридинга самого общего предка (одно поколение вглубь)
    const ancestor = await load(ancestorId)
    const aFather = ancestor ? idOf(ancestor.father) : null
    const aMother = ancestor ? idOf(ancestor.mother) : null
    let fa = 0
    if (aFather && aMother) {
      const [afp, amp] = await Promise.all([
        ancestorPaths(load, aFather, Math.max(0, maxDepth - 2)),
        ancestorPaths(load, aMother, Math.max(0, maxDepth - 2)),
      ])
      for (const [cid, cps] of afp) {
        const cqs = amp.get(cid)
        if (!cqs) continue
        for (const p of cps) for (const q of cqs) fa += 0.5 ** (p + q + 1)
      }
    }

    for (const p of ps) {
      for (const q of qs) {
        f += 0.5 ** (p + q + 1) * (1 + fa)
      }
    }
  }

  return Math.round(f * 100 * 100) / 100
}

/** Плоский список узлов — для проверок и выгрузок. */
export const flattenPedigree = (nodes: PedigreeNode[]): PedigreeNode[] =>
  nodes.flatMap((n) => [n, ...flattenPedigree(n.children)])

/* ------------------------------------------------------------------ */
/*                     Разметка древа для визуализации                  */
/* ------------------------------------------------------------------ */

/**
 * Состояние узла родословной. Порядок важен: чем выше в списке,
 * тем приоритетнее при отображении.
 *
 *  common     — предок встречается и со стороны отца, и со стороны матери.
 *               Именно такие предки дают вклад в коэффициент инбридинга животного.
 *  repeated   — предок повторяется внутри одной стороны. На инбридинг самого
 *               животного не влияет, но говорит, что инбредным является родитель.
 *  unverified — карточка предка есть, но данные не подтверждены (уровень < 2).
 *  missing    — предка нет ни карточкой, ни в текстовой родословной: обрыв ветви.
 *  normal     — обычный узел.
 */
export type NodeState = 'common' | 'repeated' | 'unverified' | 'missing' | 'normal'

export type NodeMark = {
  state: NodeState
  /** Индекс цвета для повторяющегося предка (0…N). */
  group?: number
  /** Узел лежит на пути от родителя к повторяющемуся предку. */
  onPath?: boolean
  /** Идентификатор животного — по нему подсвечиваются все вхождения при наведении. */
  animalId?: number
}

export type PedigreeAnalysis = {
  marks: Record<string, NodeMark>
  /** Повторяющиеся предки: id → цвет, стороны, коды вхождений. */
  groups: {
    animalId: number
    identNumber: string
    name?: string | null
    group: number
    kind: 'common' | 'repeated'
    codes: string[]
  }[]
}

/** Сторона родословной: код читается справа налево, последняя буква — корень. */
const sideOf = (code: string): 'O' | 'M' => (code.endsWith('О') ? 'O' : 'M')

/** Все узлы пути от корня к данному коду: ООО → [О, ОО, ООО]. */
const pathCodes = (code: string): string[] => {
  const out: string[] = []
  for (let i = code.length - 1; i >= 0; i--) out.push(code.slice(i))
  return out
}

export function analyzePedigree(
  roots: PedigreeNode[],
  trustByAnimal: Record<number, number | null | undefined> = {},
): PedigreeAnalysis {
  const nodes = flattenPedigree(roots)
  const marks: Record<string, NodeMark> = {}

  // Собираем вхождения каждого животного
  const occurrences = new Map<number, { codes: string[]; sides: Set<'O' | 'M'> }>()
  for (const n of nodes) {
    if (!n.animal) continue
    const rec = occurrences.get(n.animal.id) ?? { codes: [], sides: new Set<'O' | 'M'>() }
    rec.codes.push(n.code)
    rec.sides.add(sideOf(n.code))
    occurrences.set(n.animal.id, rec)
  }

  const groups: PedigreeAnalysis['groups'] = []
  const groupByAnimal = new Map<number, { group: number; kind: 'common' | 'repeated' }>()
  const onPath = new Set<string>()

  let groupIndex = 0
  for (const [animalId, rec] of occurrences) {
    if (rec.codes.length < 2) continue

    const kind: 'common' | 'repeated' = rec.sides.size > 1 ? 'common' : 'repeated'
    groupByAnimal.set(animalId, { group: groupIndex, kind })

    const sample = nodes.find((n) => n.animal?.id === animalId)!
    groups.push({
      animalId,
      identNumber: sample.animal!.identNumber,
      name: sample.animal!.name,
      group: groupIndex,
      kind,
      codes: rec.codes,
    })

    for (const c of rec.codes) for (const pc of pathCodes(c)) onPath.add(pc)
    groupIndex++
  }

  // Общие предки идут первыми — им достаются первые цвета палитры
  groups.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'common' ? -1 : 1))
  groups.forEach((g, i) => {
    g.group = i
    groupByAnimal.set(g.animalId, { group: i, kind: g.kind })
  })

  for (const n of nodes) {
    const id = n.animal?.id
    const dup = id !== undefined ? groupByAnimal.get(id) : undefined

    let state: NodeState = 'normal'
    if (dup) state = dup.kind
    else if (!n.animal && !n.text) state = 'missing'
    else if (n.animal && (trustByAnimal[n.animal.id] ?? 0) < 2) state = 'unverified'

    marks[n.code] = {
      state,
      group: dup?.group,
      onPath: onPath.has(n.code),
      animalId: id,
    }
  }

  return { marks, groups }
}
