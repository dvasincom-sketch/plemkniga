import type { Payload, Where } from 'payload'
import { computeIndex, type IndexProfile } from '@/lib/breeding-index'
import type { Animal, User } from '@/payload-types'

/**
 * Колонка индекса в списках: значения и порядок по выбранному профилю.
 *
 * Индекс считается в приложении из оценок по признакам, а не хранится числом:
 * он зависит от профиля весов, а профилей у одного животного столько, сколько
 * их завели хозяйства. Значит, ни отсортировать, ни разбить на страницы силами
 * PostgreSQL нельзя — порядок строится в памяти.
 *
 * Отсюда потолок. Выборка для ранжирования ограничена RANKING_CAP записями,
 * и когда отбор шире, это сказано вслух рядом с таблицей. Молча показать
 * «первые триста по профилю» из десяти тысяч — худшее из возможного: список
 * выглядит полным и не является им.
 *
 * Когда поголовье перерастёт потолок, ответ известен: хранить рассчитанное
 * значение рядом с профилем (значение + id профиля + версия базы + дата)
 * и пересчитывать при изменении весов. Это же нужно для воспроизводимости
 * выпущенных документов, поэтому одна работа закрывает две задачи.
 */

/**
 * Сколько записей участвует в ранжировании по профилю.
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

/** Значения индекса для уже полученной страницы — порядок при этом чужой. */
export function indexValues(animals: Animal[], profile: IndexProfile): Record<number, number> {
  const out: Record<number, number> = {}
  for (const a of animals) out[a.id as number] = computeIndex(a, profile).value
  return out
}

export type RankedResult = {
  docs: Animal[]
  /** Всего записей в отборе — считает база, потолок здесь ни при чём. */
  totalDocs: number
  values: Record<number, number>
  capped: boolean
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
  const values = indexValues(docs, profile)

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
    page: limit > 0 ? Math.floor(offset / limit) + 1 : 1,
    totalPages: limit > 0 ? Math.max(1, Math.ceil(docs.length / limit)) : 1,
  }
}
