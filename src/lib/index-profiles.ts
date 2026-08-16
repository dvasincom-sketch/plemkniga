import { getClient } from '@/lib/payload'
import { NO_PROFILE } from '@/lib/animal-query'
import {
  ASSOCIATION_PROFILE,
  BUILTIN_PROFILES,
  FARM_PROFILES,
  NATIONAL_PROFILES,
  PROFIT_PROFILE,
  TRAIT_BASE,
  type Base,
  type IndexProfile,
  type TraitKey,
  type WeightKind,
} from '@/lib/breeding-index'
import type { IndexProfile as IndexProfileDoc } from '@/payload-types'

/**
 * Профили весов: встроенные из кода и собственные из базы.
 *
 * Встроенные заданы в `breeding-index.ts` и в базе не лежат: они меняются
 * вместе с расчётом, и хранить их копию значило бы разойтись с кодом при
 * первом же пересмотре. Собственные профили хозяйства лежат в коллекции
 * `index-profiles` — их правит главный генетик, и они переживают деплой.
 *
 * Здесь встроенные и собственные приводятся к одному типу `IndexProfile`,
 * чтобы весь остальной код (расчёт, карточка, список) не различал, откуда
 * профиль взялся.
 */

/** Разделы списка профилей. Порядок — порядок в интерфейсе. */
export const PROFILE_GROUPS = [
  {
    key: 'association',
    title: 'Стандартный профиль Ассоциации',
    hint: 'По нему считается ИПЦ в книге, если хозяйство не выбрало свой',
    profiles: [ASSOCIATION_PROFILE],
  },
  {
    key: 'profit',
    title: 'Экономический индекс',
    hint: 'Веса в рублях на единицу признака: индекс отвечает не «на сколько лучше», а «сколько принесёт». Цены открыты ниже',
    profiles: [PROFIT_PROFILE],
  },
  {
    key: 'national',
    title: 'Национальные индексы',
    hint: 'Точка отсчёта: как то же животное выглядит по американским шкалам. Приближения по общим признакам',
    profiles: NATIONAL_PROFILES,
  },
  {
    key: 'farm',
    title: 'Готовые профили под узкое место',
    hint: 'Отвечают на ситуации, которые хозяйство называет само. Любой можно взять за основу своего',
    profiles: FARM_PROFILES,
  },
] as const

export const builtinByKey = (key: string): IndexProfile | null =>
  BUILTIN_PROFILES.find((p) => p.key === key) ?? null

/** Ключ собственного профиля: `own:<id>` — чтобы не спутать с встроенным. */
export const ownKey = (id: number | string) => `own:${id}`

export const isOwnKey = (key: string) => key.startsWith('own:')

export const ownIdOf = (key: string) => key.slice(4)

/** Документ коллекции → профиль расчёта. */
export const profileOfDoc = (doc: IndexProfileDoc): IndexProfile => {
  const weights: Partial<Record<TraitKey, number>> = {}
  for (const row of doc.weights ?? []) {
    if (!row?.trait) continue
    // Признак мог исчезнуть из базы сравнения — тогда вес просто не участвует
    if (!TRAIT_BASE.some((t) => t.key === row.trait)) continue
    weights[row.trait as TraitKey] = row.weight ?? 0
  }
  const org = doc.organization
  return {
    key: ownKey(doc.id),
    name: doc.name,
    hint: doc.hint ?? '',
    kind: (doc.kind ?? 'selection') as WeightKind,
    owner: typeof org === 'object' && org ? org.id : ((org as number | null) ?? null),
    weights,
  }
}

/** Собственные профили организации. Без организации своих профилей нет. */
export async function loadOwnProfiles(orgId?: number | string | null): Promise<{
  docs: IndexProfileDoc[]
  profiles: IndexProfile[]
  defaultDoc: IndexProfileDoc | null
}> {
  if (!orgId) return { docs: [], profiles: [], defaultDoc: null }
  const payload = await getClient()
  const res = await payload.find({
    collection: 'index-profiles',
    where: { organization: { equals: orgId } },
    limit: 100,
    sort: 'name',
    overrideAccess: true,
  })
  const docs = res.docs as IndexProfileDoc[]
  return {
    docs,
    profiles: docs.map(profileOfDoc),
    defaultDoc: docs.find((d) => d.isDefault) ?? null,
  }
}

export type ProfileChoice = {
  key: string
  label: string
  /** Профиль хозяйства, а не встроенный. */
  own?: boolean
  isDefault?: boolean
}

/**
 * Список профилей для переключателя над таблицей.
 *
 * Встроенные видны всем, включая гостя: национальные индексы и наборы под
 * узкое место — это витрина возможности, а не чья-то собственность. Свои
 * профили добавляются только своему хозяйству и помечаются, иначе «Молоко
 * на сыр» Ассоциации и одноимённый доработанный профиль хозяйства
 * не различить.
 */
export async function loadProfileChoices(orgId?: number | string | null): Promise<ProfileChoice[]> {
  const builtin = BUILTIN_PROFILES.map((p) => ({ key: p.key, label: p.name }))
  if (!orgId) return builtin
  const { docs } = await loadOwnProfiles(orgId)
  return [
    ...builtin,
    ...docs.map((d) => ({
      key: ownKey(d.id),
      label: `${d.name} · наш`,
      own: true,
      isDefault: Boolean(d.isDefault),
    })),
  ]
}

/**
 * Профиль для колонки в списке — или его отсутствие.
 *
 * Отличается от `resolveProfile` тем, что умеет вернуть «никакой». В карточке
 * животного индекс нужен всегда, и там уместен откат к профилю Ассоциации.
 * В списке — нет: рядом уже стоит колонка официального ИПЦ, и вторая колонка
 * с почти тем же смыслом, но другими числами, только сбивала бы с толку.
 * Колонка появляется, когда для неё есть повод: профиль выбран явно
 * или у хозяйства задан основной.
 */
export async function selectProfile(
  requested: string,
  orgId?: number | string | null,
): Promise<IndexProfile | null> {
  if (requested === NO_PROFILE) return null

  if (requested) {
    const builtin = builtinByKey(requested)
    if (builtin) return builtin
    if (isOwnKey(requested) && orgId) {
      const { docs } = await loadOwnProfiles(orgId)
      const doc = docs.find((d) => String(d.id) === ownIdOf(requested))
      return doc ? profileOfDoc(doc) : null
    }
    return null
  }

  const { defaultDoc } = await loadOwnProfiles(orgId)
  return defaultDoc ? profileOfDoc(defaultDoc) : null
}

/**
 * Профиль, по которому считать индекс для этого зрителя.
 *
 * Порядок: явно выбранный в адресе → профиль организации по умолчанию →
 * стандартный профиль Ассоциации. Последнее звено обязательно: у гостя
 * организации нет, а индекс в книге показывать всё равно надо.
 */
export async function resolveProfile(
  requested: string | undefined,
  orgId?: number | string | null,
): Promise<IndexProfile> {
  if (requested) {
    const builtin = builtinByKey(requested)
    if (builtin) return builtin
    if (isOwnKey(requested) && orgId) {
      const payload = await getClient()
      try {
        const doc = (await payload.findByID({
          collection: 'index-profiles',
          id: ownIdOf(requested),
          overrideAccess: true,
        })) as IndexProfileDoc
        const owner =
          typeof doc.organization === 'object' && doc.organization
            ? doc.organization.id
            : doc.organization
        if (String(owner) === String(orgId)) return profileOfDoc(doc)
      } catch {
        // Профиль удалили или он чужой — молча откатываемся к стандартному
      }
    }
  }
  const { defaultDoc } = await loadOwnProfiles(orgId)
  if (defaultDoc) return profileOfDoc(defaultDoc)
  return ASSOCIATION_PROFILE
}

/**
 * Нормированные проценты влияния — то, что показываем в интерфейсе.
 *
 * У селекционных весов интерфейс требует целых процентов в сумме 100,
 * но во встроенных профилях сумма модулей уже равна ста, а у собственного
 * профиля пользователь мог оставить любые числа. Приведение к процентам
 * здесь то же, что в расчёте, — иначе на экране одно, а в индексе другое.
 */
/**
 * Доля влияния признака в индексе, % — одна шкала для всех профилей.
 *
 * Селекционные веса уже проценты влияния. Экономические заданы в рублях
 * на единицу признака, и сравнивать их напрямую нельзя: рубль за килограмм
 * жира и рубль за балл вымени — разные рубли. Умножение на σ признака
 * переводит их в ту же шкалу: сколько рублей стоит одно стандартное
 * отклонение, то есть какую долю разброса индекса даёт признак.
 *
 * Нужна ровно для одного — сравнить профили между собой в общей таблице.
 * В самом расчёте индекса эта величина не участвует.
 */
export function influenceShares(
  profile: IndexProfile,
  base: Base,
): { key: TraitKey; share: number }[] {
  const bySd = new Map(base.traits.map((t) => [t.key, t.sd]))
  const raw = (Object.entries(profile.weights) as [TraitKey, number][]).map(([key, w]) => ({
    key,
    value: profile.kind === 'economic' ? (w ?? 0) * (bySd.get(key) ?? 1) : (w ?? 0),
  }))
  const sum = raw.reduce((a, r) => a + Math.abs(r.value), 0)
  if (!sum) return raw.map((r) => ({ key: r.key, share: 0 }))
  return raw.map((r) => ({ key: r.key, share: (r.value / sum) * 100 }))
}

export function sharesOf(profile: IndexProfile): { key: TraitKey; share: number }[] {
  const entries = Object.entries(profile.weights) as [TraitKey, number][]
  if (profile.kind === 'economic') return entries.map(([key, w]) => ({ key, share: w }))
  const sum = entries.reduce((a, [, w]) => a + Math.abs(w ?? 0), 0)
  if (!sum) return entries.map(([key]) => ({ key, share: 0 }))
  return entries.map(([key, w]) => ({ key, share: ((w ?? 0) / sum) * 100 }))
}
