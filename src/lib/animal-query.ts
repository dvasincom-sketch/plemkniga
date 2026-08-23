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
  { name: 'milk', label: 'Удой, кг', path: 'summary.milkYield' },
  { name: 'fatPercent', label: 'Жир (%)', path: 'summary.fatPercent' },
  { name: 'proteinPercent', label: 'Белок (%)', path: 'summary.proteinPercent' },
  { name: 'fatKg', label: 'Жир (кг)', path: 'summary.fatKg' },
  { name: 'proteinKg', label: 'Белок (кг)', path: 'summary.proteinKg' },
  { name: 'sum', label: 'Сумма Ж+Б (кг)', path: 'summary.fatProteinSum' },
] as const

/** Собирает Payload-`where` из query-параметров формы поиска. */
/**
 * Служебные записи предков в списках не участвуют — см. пояснение
 * в `buildAnimalWhere`. Вынесено отдельно, потому что счётчики строятся
 * не через сборку фильтра, а прямыми запросами.
 */
export const NOT_ARCHIVED: Where = {
  or: [{ archived: { equals: false } }, { archived: { exists: false } }],
}

export function buildAnimalWhere(sp: SearchParams, extra?: Where): Where {
  /*
   * Архив из списков исключён.
   *
   * В архиве лежат не выбывшие животные, а служебные записи предков: они
   * заведены ради построения родословных и в стаде никогда не стояли.
   * ТЗ запрещает удалять данные, поэтому такие записи остаются в системе
   * и открываются по ссылке из родословной — но в книге и в «Моих животных»
   * им не место: они смешивались с настоящим поголовьем и ломали счётчики.
   *
   * Условие через `or`: у записей, заведённых до появления признака,
   * в поле NULL, а `not_equals: true` отбросил бы и их тоже.
   */
  const and: Where[] = [NOT_ARCHIVED]

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

export type SortValue = (typeof SORT_OPTIONS)[number]['value'] | 'profile'

/**
 * Порядок по индексу выбранного профиля.
 *
 * Варианта нет в общем списке: он появляется, только когда профиль выбран, —
 * иначе половина книги видела бы сортировку по тому, чего у неё нет.
 * Поля `payload` у него тоже нет: этот порядок база построить не может,
 * он собирается в памяти (`findRankedByProfile`).
 */
export const PROFILE_SORT = { value: 'profile' as const, label: 'Сначала лучшие по профилю' }

export const resolveSort = (
  sp: SearchParams,
  /** Профиль выбран — тогда порядок по нему становится и возможным, и стандартным. */
  profileActive = false,
): { value: SortValue; payload: string } => {
  const raw = one(sp.sort)
  if (profileActive && (raw === 'profile' || !raw)) return { value: 'profile', payload: '' }
  const found = SORT_OPTIONS.find((o) => o.value === raw)
  const chosen = found ?? SORT_OPTIONS[0]
  return { value: chosen.value, payload: chosen.payload }
}

/* ------------------------------------------------------------------ *
 *                          Активные условия                           *
 * ------------------------------------------------------------------ */

/**
 * Параметры, которые не являются условиями отбора.
 *
 * `perPage` здесь наравне со страницей и сортировкой: сколько строк показывать —
 * это способ смотреть на результат, а не условие, по которому он получен.
 * Без этого выбор «по 100» считался бы отбором, и пустая таблица объясняла бы
 * себя ссылкой «сбросить отбор», которая ничего не меняет.
 */
const NON_FILTER_KEYS = new Set(['page', 'sort', 'tab', 'perPage', 'shown', 'profile'])

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

/**
 * Строка запроса с изменённой сортировкой, отбор сохраняется.
 *
 * Порядок по умолчанию из адреса убирается — кроме случая, когда выбран
 * профиль: там стандартным становится порядок по профилю, и «сначала лучшие
 * по ИПЦ» без явного параметра тут же вернулось бы обратно к профилю.
 */
export const queryWithSort = (sp: SearchParams, sort: SortValue): string => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'page' || k === 'sort') continue
    const value = one(v)
    if (value) params.set(k, value)
  }
  const implicit = one(sp.profile) ? PROFILE_SORT.value : SORT_OPTIONS[0].value
  if (sort !== implicit) params.set('sort', sort)
  const qs = params.toString()
  return qs ? `/?${qs}` : '/'
}

/**
 * Значение параметра `profile`, означающее «считать только официальный ИПЦ».
 *
 * Живёт рядом с остальными параметрами адреса, а не в модуле профилей:
 * тот тянет за собой Payload, а переключатель профиля — клиентский компонент,
 * и вся серверная машинерия уехала бы вместе с константой в браузер.
 */
export const NO_PROFILE = 'none'

/**
 * Строка запроса со сменой профиля расчёта.
 *
 * Сортировка при смене профиля сбрасывается: «сначала лучшие по профилю»
 * относится к прежнему профилю, а сохранять порядок, который человек выбирал
 * для другого набора весов, — обманывать его ожидания.
 */
export const queryWithProfile = (sp: SearchParams, profile: string): string => {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'page' || k === 'sort' || k === 'profile') continue
    const value = one(v)
    if (value) params.set(k, value)
  }
  if (profile) params.set('profile', profile)
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
  /*
   * «Высокий удой» — это условие отбора, а не порядок показа.
   *
   * Раньше чип задавал `sort: milk`: список оставался прежним, менялась только
   * последовательность строк. Отсюда две неприятности. Выбор сортировки после
   * чипа выглядел как сброс отбора — потому что чип и был сортировкой. А сам
   * чип гас, стоило переключить порядок, хотя отбор не менялся.
   *
   * Порог 9000 кг делит стадо примерно пополам по верхней границе: это
   * осмысленная выборка, а не «все коровы в другом порядке».
   */
  { key: 'milk', label: 'Коровы с высоким удоем', params: { sex: 'female', milk: '9000' } },
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

/**
 * Ссылка на пресет: заменяет отбор целиком, чтобы условия не накапливались.
 *
 * Выбранный порядок показа при этом сохраняется. Сортировка — не условие
 * отбора, а способ смотреть на результат, и терять её при переключении
 * чипа незачем: человек только что сказал, в каком порядке ему удобно.
 */
export const presetHref = (
  preset: (typeof PRESETS)[number],
  sp: SearchParams = {},
): string => {
  const params = new URLSearchParams(preset.params as Record<string, string>)
  const sort = one(sp.sort)
  if (sort && (sort === PROFILE_SORT.value || SORT_OPTIONS.some((o) => o.value === sort)))
    params.set('sort', sort)
  // Профиль — способ смотреть, а не условие: быстрый отбор его не сбрасывает
  const profile = one(sp.profile)
  if (profile) params.set('profile', profile)
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
