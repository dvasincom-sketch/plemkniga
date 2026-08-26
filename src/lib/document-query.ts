import type { Where } from 'payload'
import { DOCUMENT_TYPES, labelOf } from '@/lib/dictionaries'

/**
 * Отбор документов хозяйства.
 *
 * ## Зачем отдельный разбор, а не общий с животными
 *
 * У животных свой словарь условий (`animal-query.ts`) — пол, возраст,
 * удой, — и ни одно из них к документам не относится. Общий разбор
 * пришлось бы ветвить по типу выдачи в каждой функции, и обе половины
 * стали бы хуже.
 *
 * ## Почему у ключей приставка «d»
 *
 * Документы живут подразделом стада (`?tab=herd&sub=documents`), то есть
 * делят строку запроса с поиском по животным. «Номер» там и здесь значат
 * разное: у животного индивидуальный, у документа — номер бланка.
 * Без приставки переход из списка в документы тащил бы за собой чужие
 * условия и молча сужал выдачу.
 *
 * ## Что здесь считается состоянием
 *
 * Выданный документ не удаляют: он существовал, на него ссылались, по нему
 * продавали. Поэтому «отозван» — отметка, а не отсутствие записи, и отбор
 * по состоянию читает именно её.
 */

/** Кем выдан документ — главное различие в этом разделе. */
export const DOC_ORIGINS = [
  { value: 'all', label: 'Все' },
  { value: 'association', label: 'Выдано Ассоциацией' },
  { value: 'own', label: 'Загружено вами' },
] as const

export const DOC_STATES = [
  { value: 'active', label: 'Действующие' },
  { value: 'revoked', label: 'Отозванные' },
  { value: 'all', label: 'Все' },
] as const

/** Ключи условий в порядке показа. */
export const DOC_FILTER_KEYS = [
  'dnum',
  'danimal',
  'dtype',
  'dorigin',
  'dstate',
  'dfrom',
  'dto',
] as const

export type SearchParams = Record<string, string | string[] | undefined>

export const one = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? ''

/**
 * Условия отбора для Payload.
 *
 * Хозяйство всегда своё: условие владельца не приходит из адреса
 * и снять его нельзя. Отбор — это способ смотреть на свои документы,
 * а не способ добраться до чужих.
 */
export function buildDocumentWhere(sp: SearchParams, organizationId?: number): Where {
  const and: Where[] = organizationId ? [{ organization: { equals: organizationId } }] : []

  const num = one(sp.dnum)
  if (num) and.push({ number: { like: num } })

  const animal = one(sp.danimal)
  // Отбор по номеру животного, а не по его идентификатору: хозяйство
  // помнит номер на бирке, а не строку из базы
  if (animal) and.push({ 'animal.identNumber': { like: animal } })

  const type = one(sp.dtype)
  if (type) and.push({ type: { equals: type } })

  const origin = one(sp.dorigin)
  /*
   * «Выдано Ассоциацией» узнаётся по заполненному «кто выдал».
   * Тип документа для этого не годится: зоотехнический сертификат
   * выпускает Ассоциация, а отчёт о генотипировании хозяйство может
   * и загрузить само, и получить от неё.
   */
  if (origin === 'association') and.push({ issuedBy: { exists: true } })
  if (origin === 'own') and.push({ issuedBy: { exists: false } })

  const state = one(sp.dstate)
  if (state === 'revoked') and.push({ 'revoked.at': { exists: true } })
  if (state === 'active' || !state) and.push({ 'revoked.at': { exists: false } })

  const from = one(sp.dfrom)
  if (from) and.push({ issuedAt: { greater_than_equal: from } })

  const to = one(sp.dto)
  /*
   * Верхняя граница — конец дня, а не его начало. «По 26.08» человек
   * понимает как «включая двадцать шестое», и документ, выданный
   * в этот день, обязан попасть в выдачу.
   */
  if (to) and.push({ issuedAt: { less_than_equal: `${to}T23:59:59.999Z` } })

  return and.length ? { and } : {}
}

/** Есть ли хоть одно условие, кроме состояния по умолчанию. */
export const hasDocumentFilters = (sp: SearchParams): boolean =>
  DOC_FILTER_KEYS.some((k) => {
    const v = one(sp[k])
    if (!v) return false
    // «Действующие» и «Все» по происхождению — не отбор, а вид по умолчанию
    if (k === 'dstate' && v === 'active') return false
    if (k === 'dorigin' && v === 'all') return false
    return true
  })

/** Человеческое имя условия — для фишки с крестиком. */
export function describeDocumentFilter(
  key: string,
  value: string,
): { label: string; value: string } | null {
  if (!value) return null
  switch (key) {
    case 'dnum':
      return { label: 'Номер', value }
    case 'danimal':
      return { label: 'Животное', value }
    case 'dtype':
      return { label: 'Тип', value: labelOf(DOCUMENT_TYPES, value) }
    case 'dorigin':
      return value === 'all'
        ? null
        : { label: 'Кем выдан', value: DOC_ORIGINS.find((o) => o.value === value)?.label ?? value }
    case 'dstate':
      return value === 'active'
        ? null
        : { label: 'Состояние', value: DOC_STATES.find((o) => o.value === value)?.label ?? value }
    case 'dfrom':
      return { label: 'Выдан с', value }
    case 'dto':
      return { label: 'Выдан по', value }
    default:
      return null
  }
}

/**
 * Адрес раздела без одного условия — для крестика на фишке.
 *
 * Свой, а не общий с животными: тот жёстко возвращает корень сайта,
 * а документы живут подразделом стада. Страница разбивки сбрасывается
 * заодно: сняв условие, человек ждёт начала списка, а не седьмой
 * страницы прежней выдачи.
 */
export function documentsHrefWithout(sp: SearchParams, drop?: string): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k === drop || k === 'page' || k === 'tab' || k === 'sub') continue
    const value = one(v)
    if (value) params.set(k, value)
  }
  params.set('tab', 'herd')
  params.set('sub', 'documents')
  return `/account?${params.toString()}`
}
