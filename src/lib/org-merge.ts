import type { SqlPool } from '@/lib/sql'

/**
 * Слияние двух карточек хозяйства: перевод всех ссылок с дубля на цель.
 *
 * ## Почему список ссылок берётся у базы, а не пишется рукой
 *
 * Первая редакция переписывала три поля: отправителя и получателя
 * у перемещений и владельца у животных. Всё остальное оставалось на дубле,
 * и это не мелочь: люди хозяйства (`users.organization`) продолжали числиться
 * за карточкой, которой больше нет в поиске, стада висели на ней же,
 * выданные документы ссылались на неё, прежние владельцы в родословной
 * показывали слитую карточку, а собственник семени — тем более. То есть
 * слияние отчитывалось «карточки слиты», а половина книги про это не знала.
 *
 * Дописать недостающие семь полей мало. Ссылок на организацию в модели
 * четыре десятка, они лежат и в группах, и в массивах, и новая коллекция
 * добавляет их не спрашивая, — рукописный список отстанет на первой же
 * правке модели, и отставание будет невидимым: слияние по-прежнему скажет,
 * что всё прошло.
 *
 * Поэтому список берётся из каталога внешних ключей. Он описывает ровно
 * то, что в базе есть на самом деле, и пополняется сам вместе со схемой:
 * новое поле-ссылка приходит со своим внешним ключом и попадает в перевод
 * без единой правки здесь.
 *
 * ## Почему не `on update cascade` и не переписывание идентификатора
 *
 * Соблазн — поменять `id` дубля на `id` цели и дать базе разнести это
 * каскадом. Не годится: у цели такая строка уже есть, идентификаторы
 * должны остаться разными, и дубль обязан сохраниться. Он остаётся
 * с отметкой «слито с»: на него ссылаются выданные бумаги и ушедшие
 * наружу выгрузки, и удаление превратило бы их в ссылки в никуда.
 *
 * ## Что делает `_rels`
 *
 * Множественные связи Payload хранит отдельными таблицами `<коллекция>_rels`.
 * После перевода у одного животного может оказаться два прежних владельца
 * с одним и тем же идентификатором — дубль и цель были в списке оба.
 * Поэтому после перевода одинаковые строки таких таблиц схлопываются.
 */

export type MergeReport = {
  /** Сколько колонок-ссылок нашлось в схеме. */
  columns: number
  /** Сколько строк переведено, по таблицам и колонкам. */
  moved: { table: string; column: string; rows: number }[]
  /** Сколько сдвоенных строк множественных связей убрано. */
  deduped: number
}

/** Колонки, ссылающиеся на `organizations.id`, — прямо из каталога базы. */
const REFERENCES = `
  select tc.table_name  as tbl,
         kcu.column_name as col
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
   where tc.constraint_type = 'FOREIGN KEY'
     and tc.table_schema = current_schema()
     and ccu.table_name = 'organizations'
     and ccu.column_name = 'id'
   order by tbl, col
`

/**
 * Перевести все ссылки с дубля на цель.
 *
 * Отметку «слито с» ставит вызывающий: она про решение Ассоциации,
 * а не про целостность ссылок, и писать её надо через Payload, чтобы
 * сработали хуки коллекции.
 *
 * Пустой список колонок — не «нечего переводить», а поломка: ссылки
 * на организацию в этой базе есть заведомо. Поэтому такой ответ
 * превращается в ошибку, а не в тихий успех.
 */
export async function moveOrganizationRefs(
  pool: SqlPool,
  duplicate: number,
  target: number,
): Promise<MergeReport> {
  const found = await pool.query(REFERENCES)
  const refs = (found.rows ?? []).map((r) => ({ tbl: String(r.tbl), col: String(r.col) }))
  if (!refs.length) {
    throw new Error('Не найдено ни одной ссылки на организации — слияние отменено')
  }

  const moved: MergeReport['moved'] = []
  const relTables = new Set<string>()

  for (const { tbl, col } of refs) {
    /*
     * Собственная строка дубля не трогается: `organizations.merged_into_id`
     * у него как раз и должен указать на цель, и ставит его вызывающий.
     * А вот чужие отметки «слито с дублем» переводятся — иначе получилась
     * бы цепочка, и поиск слитой карточки упёрся бы в промежуточную.
     */
    const res = await pool.query(
      `update "${tbl}" set "${col}" = $1 where "${col}" = $2`,
      [target, duplicate],
    )
    const rows = res.rowCount ?? 0
    if (rows) moved.push({ table: tbl, column: col, rows })
    if (tbl.endsWith('_rels')) relTables.add(tbl)
  }

  let deduped = 0
  for (const tbl of relTables) {
    /*
     * Схлопывание идёт по «родителю, пути и цели» — тройке, которая
     * и означает одну связь. Порядковый номер в ключ не входит намеренно:
     * две строки с разным порядком, но одной целью — это и есть дубль.
     */
    const res = await pool.query(
      `delete from "${tbl}" a
        using "${tbl}" b
        where a.id > b.id
          and a.parent_id = b.parent_id
          and a."path" = b."path"
          and a.organizations_id = b.organizations_id
          and a.organizations_id = $1`,
      [target],
    )
    deduped += res.rowCount ?? 0
  }

  return { columns: refs.length, moved, deduped }
}
