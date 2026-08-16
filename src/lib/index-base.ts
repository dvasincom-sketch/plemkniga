import type { Payload } from 'payload'
import {
  DEFAULT_BASE,
  TRAIT_BASE,
  type Base,
  type TraitBase,
  type TraitKey,
} from '@/lib/breeding-index'
import type { IndexBase as IndexBaseDoc } from '@/payload-types'

/**
 * Действующая база сравнения.
 *
 * Из базы данных берутся только среднее и отклонение — то, что зависит
 * от популяции. Наследуемость, повторяемость, единица измерения и путь
 * к оценке остаются из кода: это свойства признака и устройства системы,
 * а не выборки, и дублировать их в базе значило бы завести второе место,
 * где они могут разойтись.
 *
 * Признак, которого в записанной базе нет (мало оценок при пересчёте),
 * молча берётся из заимствованной таблицы. Иначе профиль, где этот признак
 * весит, просто перестал бы учитываться — и индекс изменился бы необъяснимо.
 */

export async function loadActiveBase(payload: Payload): Promise<Base> {
  try {
    const res = await payload.find({
      collection: 'index-bases',
      where: { isActive: { equals: true } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const doc = res.docs[0] as IndexBaseDoc | undefined
    if (!doc) return DEFAULT_BASE
    return baseOfDoc(doc)
  } catch {
    /*
     * Коллекции может ещё не быть — например, до применения миграции.
     * Расчёт при этом должен работать: заимствованная база на месте, в коде.
     */
    return DEFAULT_BASE
  }
}

export function baseOfDoc(doc: IndexBaseDoc): Base {
  const byKey = new Map<TraitKey, { mean: number; sd: number }>()
  for (const row of doc.traits ?? []) {
    if (!row?.trait) continue
    if (typeof row.mean !== 'number' || typeof row.sd !== 'number' || row.sd <= 0) continue
    byKey.set(row.trait as TraitKey, { mean: row.mean, sd: row.sd })
  }

  const traits: TraitBase[] = TRAIT_BASE.map((t) => {
    const own = byKey.get(t.key)
    return own ? { ...t, mean: own.mean, sd: own.sd } : t
  })

  return { traits, version: doc.version }
}
