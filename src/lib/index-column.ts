import type { Payload, Where } from 'payload'
import { computeIndex, type Base, type IndexProfile } from '@/lib/breeding-index'
import { loadActiveBase } from '@/lib/index-base'
import type { Animal, IndexValue, User } from '@/payload-types'

/**
 * Колонка индекса в списках: значения и порядок по выбранному профилю.
 *
 * Основной путь — хранимые значения (`index-values`, по строке на пару
 * «животное + профиль»). Порядок и разбивку на страницы строит PostgreSQL,
 * поэтому список точен на любом размере книги. Отбор при этом задан условиями
 * к животному, а запрос идёт к значениям — условия переносятся на связь
 * (`prefixWhere`), чтобы не заводить второе описание тех же фильтров.
 *
 * Запасной путь — расчёт в памяти по порции записей. Он остаётся на случай,
 * когда хранимых значений ещё нет: новый профиль до пересчёта, свежая база,
 * выключенные хуки. Порция ограничена RANKING_CAP, и об усечении говорится
 * рядом с таблицей: молча показать «первые три тысячи» из десяти — худшее
 * из возможного, список выглядит полным и не является им.
 */

/**
 * Сколько записей участвует в ранжировании в памяти — только для запасного пути.
 *
 * Три тысячи — это несколько десятков миллисекунд на расчёт и запас к текущему
 * размеру книги. Число намеренно не «сколько влезет»: сортировка в памяти
 * не должна быть незаметно дорогой операцией, за которую платит каждый
 * посетитель.
 */
export const RANKING_CAP = 3000

export type IndexColumn = {
  profile: IndexProfile
  /** Подпись колонки: название профиля, а не «Индекс» — их может быть несколько. */
  label: string
  /** Значение по id животного. */
  values: Record<number, number>
  /** Порядок построен не по всей выдаче: записей больше потолка. */
  capped: boolean
  cap: number
}

/**
 * Значения индекса для уже полученной страницы — порядок при этом чужой.
 *
 * База сравнения передаётся, а не берётся по умолчанию. Хранимые значения
 * (`index-values.ts`) считаются на активной базе, а этот путь работал
 * на заимствованной из кода: пока строк по профилю нет, колонка и карточка
 * показывали числа, посчитанные по разным σ, — и подпись объясняла только
 * усечение выборки, но не разницу в базе.
 */
export function indexValues(
  animals: Animal[],
  profile: IndexProfile,
  base?: Base,
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const a of animals) out[a.id as number] = computeIndex(a, profile, base).value
  return out
}

/**
 * Поля животного, продублированные в самой строке значения индекса.
 *
 * Условие на связь Payload превращает в отдельный `left join` — и отдельный
 * на каждое условие. Страница книги по умолчанию отбирает по трём признакам
 * (не в архиве, публичная, живая, иногда владелец), и запрос получал три копии
 * таблицы животных: на трёхстах тысячах записей это 1,3 секунды на один
 * только подсчёт итога против 190 миллисекунд с единственным join.
 *
 * Дублирование здесь дёшево и само поддерживается: строки значений
 * переписываются хуком при каждом изменении животного, вместе со значением
 * обновляются и эти три поля. Расходиться им негде — они пишутся из того же
 * места и в тот же момент.
 *
 * Список намеренно короткий. Это не «вынести все фильтры», а «вынести те,
 * что стоят в каждом запросе»: видимость и архив приходят из слоя доступа
 * и применяются всегда, владелец — почти всегда. Остальные фильтры человек
 * задаёт сам, они сужают выборку и стоят своего join.
 */
const LOCAL_FIELDS = new Set(['archived', 'publicVisible', 'owner', 'state'])

/**
 * Перенос условий отбора на связь: `sex` → `animal.sex`.
 *
 * Запрос идёт к значениям индекса, а отбор описан в терминах животного —
 * тем же `buildAnimalWhere`, что и везде. Переписывать фильтры вторым набором
 * правил нельзя: два описания одного и того же расходятся при первой же правке,
 * и расхождение всплывает не там, где его сделали.
 *
 * Исключение — поля из `LOCAL_FIELDS`: они есть в самой строке, и условие
 * остаётся без префикса. Это единственная разница между «отбором по животному»
 * и «отбором по значению», и она про скорость, а не про смысл.
 */
export function prefixWhere(where: Where, prefix = 'animal'): Where {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(where)) {
    if ((key === 'and' || key === 'or') && Array.isArray(value)) {
      out[key] = (value as Where[]).map((w) => prefixWhere(w, prefix))
    } else if (LOCAL_FIELDS.has(key)) {
      out[key] = value
    } else {
      out[`${prefix}.${key}`] = value
    }
  }
  return out as Where
}

export type RankedResult = {
  docs: Animal[]
  /** Всего записей в отборе — считает база, потолок здесь ни при чём. */
  totalDocs: number
  values: Record<number, number>
  capped: boolean
  /** Порядок построен по хранимым значениям, а не расчётом в памяти. */
  stored: boolean
  /*
   * Номер и число страниц считаются от порции, а не от всей выдачи: страниц
   * за потолком не существует, и предлагать переход на них значило бы вести
   * человека в пустоту.
   */
  page: number
  totalPages: number
}

/**
 * Страница списка, упорядоченного по индексу профиля.
 *
 * Записи берутся порцией в RANKING_CAP, отсортированной по хранимому ИПЦ.
 * Это не случайная порция: если отбор шире потолка, в неё попадают лучшие
 * по официальной оценке — те же животные, что обычно оказываются наверху
 * и по частному профилю. Совпадение не гарантировано, поэтому факт усечения
 * возвращается наружу и показывается пользователю.
 */
export async function findRankedByProfile({
  payload,
  where,
  profile,
  offset = 0,
  limit,
  user,
  overrideAccess = false,
}: {
  payload: Payload
  where: Where
  profile: IndexProfile
  offset?: number
  /** 0 — без ограничения: столько же, сколько влезло в порцию. */
  limit: number
  user?: User | null
  overrideAccess?: boolean
}): Promise<RankedResult> {
  const pool = await payload.find({
    collection: 'animals',
    where,
    depth: 1,
    limit: RANKING_CAP,
    sort: '-ipcRank',
    overrideAccess,
    ...(overrideAccess ? {} : { user }),
  })

  const docs = pool.docs as Animal[]
  const values = indexValues(docs, profile, await loadActiveBase(payload))

  const ordered = [...docs].sort(
    (a, b) => (values[b.id as number] ?? 0) - (values[a.id as number] ?? 0),
  )

  const total = pool.totalDocs ?? docs.length
  const slice = limit > 0 ? ordered.slice(offset, offset + limit) : ordered.slice(offset)

  return {
    docs: slice,
    totalDocs: total,
    values,
    capped: total > docs.length,
    stored: false,
    page: limit > 0 ? Math.floor(offset / limit) + 1 : 1,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(docs.length / limit)) : 1,
  }
}

/**
 * Страница списка, упорядоченная по профилю: хранимые значения, если они есть,
 * иначе расчёт в памяти.
 *
 * Вызывающему разница видна только по флагу `stored` — он нужен, чтобы честно
 * подписать усечение, а не чтобы выбирать путь. Выбор здесь один на всё
 * приложение: иначе один список молча оказался бы точнее другого.
 */
export async function rankByProfile(args: {
  payload: Payload
  where: Where
  profile: IndexProfile
  offset?: number
  limit: number
  user?: User | null
  overrideAccess?: boolean
}): Promise<RankedResult> {
  const stored = await findByStoredIndex(args)
  return stored ?? findRankedByProfile(args)
}

/**
 * Страница списка по хранимым значениям индекса.
 *
 * Возвращает `null`, если по профилю ещё ничего не посчитано, — тогда вызывающий
 * откатывается к расчёту в памяти. Пустой список и «значений пока нет» —
 * разные вещи, и различать их должен вызывающий, а не пользователь по догадке.
 */
export async function findByStoredIndex({
  payload,
  where,
  profile,
  offset = 0,
  limit,
  user,
  overrideAccess = false,
}: {
  payload: Payload
  where: Where
  profile: IndexProfile
  offset?: number
  limit: number
  user?: User | null
  overrideAccess?: boolean
}): Promise<RankedResult | null> {
  const scope: Where = {
    and: [{ profileKey: { equals: profile.key } }, prefixWhere(where)],
  }

  /*
   * Два запроса вместо одного с `depth: 2`.
   *
   * Раньше страница тянулась одним вызовом с глубиной 2: Payload доставал
   * двадцать значений индекса, к каждому животное, а к каждому животному —
   * владельца, стадо, породу, отца и мать, и к ним ещё по кругу. На книге
   * из двухсот записей это стоило миллисекунды, на трёхстах тысячах —
   * полторы секунды на страницу, при том что сами запросы к базе занимали
   * две миллисекунды. Всё время уходило на сотню мелких дозапросов.
   *
   * Теперь сначала идентификаторы и значения без связей вовсе, затем одна
   * выборка животных той же глубины, что и в обычном списке. Порядок
   * восстанавливается в памяти по массиву идентификаторов: `where id in (…)`
   * возвращает строки в своём порядке, и полагаться на него нельзя.
   */
  const found = await payload.find({
    collection: 'index-values',
    where: scope,
    sort: '-value',
    depth: 0,
    limit: limit > 0 ? limit : 0,
    page: limit > 0 ? Math.floor(offset / limit) + 1 : 1,
    overrideAccess,
    ...(overrideAccess ? {} : { user }),
  })

  const rows = found.docs as IndexValue[]

  /*
   * Пустая страница ещё ничего не значит: отбор мог просто никого не найти.
   * А вот полное отсутствие значений по профилю — значит, и тогда порядок
   * нужно строить в памяти, иначе список окажется пустым на ровном месте.
   */
  if (rows.length === 0) {
    const any = await payload.count({
      collection: 'index-values',
      where: { profileKey: { equals: profile.key } },
      overrideAccess: true,
    })
    if ((any.totalDocs ?? 0) === 0) return null
  }

  const values: Record<number, number> = {}
  const order: number[] = []
  for (const row of rows) {
    const id = typeof row.animal === 'object' && row.animal ? row.animal.id : row.animal
    if (typeof id !== 'number') continue
    order.push(id)
    values[id] = row.value
  }

  const docs: Animal[] = []
  if (order.length) {
    const loaded = await payload.find({
      collection: 'animals',
      where: { id: { in: order } },
      depth: 1,
      limit: order.length,
      overrideAccess,
      ...(overrideAccess ? {} : { user }),
    })
    const byId = new Map((loaded.docs as Animal[]).map((a) => [a.id as number, a]))
    for (const id of order) {
      const animal = byId.get(id)
      if (animal) docs.push(animal)
    }
  }

  return {
    docs,
    totalDocs: found.totalDocs ?? docs.length,
    values,
    capped: false,
    stored: true,
    page: found.page ?? 1,
    totalPages: found.totalPages ?? 1,
  }
}
