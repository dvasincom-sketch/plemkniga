import type { Where } from 'payload'

export type SearchParams = Record<string, string | string[] | undefined>

export const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? ''

const num = (v: string | string[] | undefined): number | undefined => {
  const s = one(v)
  if (!s) return undefined
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/** Поля расширенного фильтра «больше чем». */
export const ADVANCED_FIELDS = [
  { name: 'milk', label: 'Удой (л)', path: 'summary.milkYield' },
  { name: 'fatPercent', label: 'Жир (%)', path: 'summary.fatPercent' },
  { name: 'proteinPercent', label: 'Белок (%)', path: 'summary.proteinPercent' },
  { name: 'fatKg', label: 'Жир (кг)', path: 'summary.fatKg' },
  { name: 'proteinKg', label: 'Белок (кг)', path: 'summary.proteinKg' },
  { name: 'sum', label: 'Сумма Ж+Б (кг)', path: 'summary.fatProteinSum' },
] as const

/** Собирает Payload-`where` из query-параметров формы поиска. */
export function buildAnimalWhere(sp: SearchParams, extra?: Where): Where {
  const and: Where[] = []

  const id = one(sp.id)
  if (id) and.push({ identNumber: { like: id } })

  const idFormat = one(sp.idFormat)
  if (idFormat) and.push({ idFormat: { equals: idFormat } })

  const name = one(sp.name)
  if (name) and.push({ name: { like: name } })

  const sex = one(sp.sex)
  if (sex) and.push({ sex: { equals: sex } })

  const ageGroup = one(sp.ageGroup)
  if (ageGroup) and.push({ ageGroup: { equals: ageGroup } })

  const state = one(sp.state)
  if (state) and.push({ state: { equals: state } })

  const herd = one(sp.herd)
  if (herd) and.push({ herd: { equals: Number(herd) } })

  const owner = one(sp.owner)
  if (owner) and.push({ 'owner.name': { like: owner } })

  const author = one(sp.author)
  if (author) {
    and.push({
      or: [{ 'author.lastName': { like: author } }, { 'author.email': { like: author } }],
    })
  }

  const relation = one(sp.relation)
  if (relation === 'father') and.push({ father: { exists: true } })
  if (relation === 'mother') and.push({ mother: { exists: true } })
  if (relation === 'bothParents')
    and.push({ father: { exists: true } }, { mother: { exists: true } })

  for (const f of ADVANCED_FIELDS) {
    const v = num(sp[f.name])
    if (v !== undefined) and.push({ [f.path]: { greater_than: v } } as Where)
  }

  const ipcFrom = num(sp.ipcFrom)
  if (ipcFrom !== undefined) and.push({ ipc: { greater_than_equal: ipcFrom } })
  const ipcTo = num(sp.ipcTo)
  if (ipcTo !== undefined) and.push({ ipc: { less_than_equal: ipcTo } })

  if (extra) and.push(extra)

  return and.length ? { and } : {}
}

/** true, если хотя бы одно поле расширенного фильтра заполнено. */
export const hasAdvancedValues = (sp: SearchParams): boolean =>
  ADVANCED_FIELDS.some((f) => one(sp[f.name])) || Boolean(one(sp.ipcFrom) || one(sp.ipcTo))

export const currentPage = (sp: SearchParams): number => {
  const p = Number(one(sp.page) || '1')
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1
}
