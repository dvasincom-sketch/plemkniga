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

  const trust = one(sp.trust)
  if (trust) and.push({ trustLevel: { greater_than_equal: Number(trust) } })

  if (one(sp.forSale) === '1') and.push({ forSale: { equals: true } })


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

/* ------------------------------------------------------------------ *
 *                        Сортировка результатов                       *
 * ------------------------------------------------------------------ */

/**
 * Варианты сортировки видимы пользователю, поэтому список намеренно короткий.
 *
 * Порядок по убыванию возможен только через служебные поля `*Rank`:
 * PostgreSQL при `ORDER BY … DESC` ставит NULL первыми, и записи без значения
 * вытеснили бы из начала списка те, у которых значение есть. По возрастанию
 * NULL и так уходят в конец, поэтому текстовым полям служебная пара не нужна.
 */
export const SORT_OPTIONS = [
  { value: 'ipc', label: 'Сначала лучшие по ИПЦ', payload: '-ipcRank' },
  { value: 'milk', label: 'Сначала высокоудойные', payload: '-summary.milkRank' },
  { value: 'name', label: 'По кличке, А→Я', payload: 'name' },
  { value: 'id', label: 'По индивидуальному №', payload: 'identNumber' },
] as const

export type SortValue = (typeof SORT_OPTIONS)[number]['value']

export const resolveSort = (sp: SearchParams): { value: SortValue; payload: string } => {
  const raw = one(sp.sort)
  const found = SORT_OPTIONS.find((o) => o.value === raw)
  const chosen = found ?? SORT_OPTIONS[0]
  return { value: chosen.value, payload: chosen.payload }
}

/* ------------------------------------------------------------------ *
 *                          Активные условия                           *
 * ------------------------------------------------------------------ */

/** Параметры, которые не являются условиями отбора. */
const NON_FILTER_KEYS = new Set(['page', 'sort', 'tab'])

/** Ключи всех условий отбора в порядке показа. */
export const FILTER_KEYS = [
  'id',
  'idFormat',
  'name',
  'sex',
  'ageGroup',
  'state',
  'relation',
  'owner',
  'herd',
  'author',
  ...ADVANCED_FIELDS.map((f) => f.name),
  'ipcFrom',
  'ipcTo',
  'trust',
  'forSale',
] as const

/** true, если задано хотя бы одно условие отбора. */
export const hasActiveFilters = (sp: SearchParams): boolean =>
  Object.entries(sp).some(([k, v]) => !NON_FILTER_KEYS.has(k) && Boolean(one(v)))

/** Строка запроса без указанного условия — для крестика на «фишке» фильтра. */
export const queryWithout = (sp: SearchParams, drop: string): string => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k === drop || k === 'page') continue
    const value = one(v)
    if (value) params.set(k, value)
  }
  const qs = params.toString()
  return qs ? `/?${qs}` : '/'
}

/** Строка запроса с изменённой сортировкой, отбор сохраняется. */
export const queryWithSort = (sp: SearchParams, sort: SortValue): string => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'page' || k === 'sort') continue
    const value = one(v)
    if (value) params.set(k, value)
  }
  if (sort !== SORT_OPTIONS[0].value) params.set('sort', sort)
  const qs = params.toString()
  return qs ? `/?${qs}` : '/'
}


/* ------------------------------------------------------------------ *
 *                          Быстрый отбор                              *
 * ------------------------------------------------------------------ */

/**
 * Готовые наборы условий под самые частые вопросы к книге.
 *
 * Каждый пресет — это просто набор query-параметров, поэтому он работает
 * теми же механизмами, что и ручной отбор: остаётся в адресе, снимается
 * «фишками» и сочетается с сортировкой.
 */
export const PRESETS = [
  { key: 'bulls', label: 'Быки-производители', params: { sex: 'male', ageGroup: 'bull' } },
  { key: 'milk', label: 'Коровы с высоким удоем', params: { sex: 'female', sort: 'milk' } },
  { key: 'pedigree', label: 'С полной родословной', params: { relation: 'bothParents' } },
  { key: 'verified', label: 'Проверено Ассоциацией', params: { trust: '3' } },
  {
    key: 'sale',
    label: 'Выставлены на продажу',
    params: { forSale: '1' },
    /*
     * Признак продажи заполняется хозяйствами вручную, и пока ни одно животное
     * не выставлено, отбор вернул бы пустую страницу. Чип с `probe` перед
     * показом считает записи и, если их нет, гаснет — вместо тупика
     * пользователь видит, что данных пока просто нет.
     */
    probe: { forSale: { equals: true } } as Where,
    emptyHint: 'Ни одно животное пока не выставлено на продажу',
  },
] as const

export type PresetKey = (typeof PRESETS)[number]['key']

/** Пресет считается активным, когда все его параметры заданы. */
export const activePreset = (sp: SearchParams): PresetKey | null => {
  for (const preset of PRESETS) {
    const match = Object.entries(preset.params).every(([k, v]) => one(sp[k]) === v)
    if (match) return preset.key
  }
  return null
}

/** Ссылка на пресет: заменяет текущий отбор целиком, чтобы не накапливать условия. */
export const presetHref = (preset: (typeof PRESETS)[number]): string => {
  const params = new URLSearchParams(preset.params as Record<string, string>)
  return `/?${params.toString()}#results`
}

/* ------------------------------------------------------------------ *
 *                      Постраничный показ и «Показать ещё»            *
 * ------------------------------------------------------------------ */

/** Сколько записей показывать за раз в публичной книге. */
export const SHOW_STEP = 12

/**
 * Сколько записей уже раскрыто на главной.
 *
 * Состояние живёт в адресе, а не в памяти компонента: ссылку на раскрытый
 * список можно переслать, работает кнопка «назад», и страница остаётся
 * серверной — без выгрузки данных в браузер.
 */
export const shownCount = (sp: SearchParams): number => {
  const raw = Number(one(sp.shown) || SHOW_STEP)
  if (!Number.isFinite(raw) || raw < SHOW_STEP) return SHOW_STEP
  return Math.min(Math.floor(raw / SHOW_STEP) * SHOW_STEP, 600)
}

/**
 * Ссылка «Показать ещё»: тот же отбор, больше записей.
 *
 * Без якоря в адресе: переход с якорем на тот же маршрут браузер иногда
 * считает прокруткой, а не навигацией, и вторая подряд «Показать ещё»
 * не срабатывает. Позиция сохраняется через `scroll={false}` у ссылки.
 */
export const showMoreHref = (sp: SearchParams, next: number): string => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'shown' || k === 'page') continue
    const value = one(v)
    if (value) params.set(k, value)
  }
  params.set('shown', String(next))
  return `/?${params.toString()}`
}

/**
 * Предел для неавторизованных.
 *
 * Первые страницы книги открыты всем — это витрина Ассоциации. Дальше
 * предлагаем завести учётную запись: бесплатно и снимает ограничение.
 */
export const ANON_SHOW_LIMIT = SHOW_STEP * 3

/* ------------------------------------------------------------------ *
 *                        Размер страницы в кабинете                   *
 * ------------------------------------------------------------------ */

export const PAGE_SIZES = [25, 100, 500, 0] as const

export const pageSizeLabel = (n: number) => (n === 0 ? 'Все' : String(n))

/** Выбранный размер страницы; 0 означает «без разбивки». */
export const resolvePageSize = (sp: SearchParams): number => {
  const raw = Number(one(sp.perPage) || PAGE_SIZES[0])
  return (PAGE_SIZES as readonly number[]).includes(raw) ? raw : PAGE_SIZES[0]
}
