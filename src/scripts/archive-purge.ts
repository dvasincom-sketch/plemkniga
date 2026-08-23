import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { Pool } from 'pg'
import { resolveDatabase } from '../lib/db-url'
import {
  ARCHIVE_RETENTION_DAYS,
  daysLeft,
  removalBlockers,
  removalDueAt,
} from '../lib/archive-retention'

/**
 * Очистка архива: убрать из книги то, что пролежало срок.
 *
 * ## Почему сценарий, а не фоновая задача приложения
 *
 * Удаление данных — не то, что должно случаться от того, что кто-то
 * открыл страницу. У сервера приложения нет расписания, а у того, что
 * есть, нет журнала: удалило — и никто не узнал. Сценарий запускается
 * по расписанию машины (cron, systemd timer, планировщик хостинга),
 * печатает, что сделал, и его вывод можно прочитать завтра.
 *
 * Пока его никто не запустил, из базы не исчезает ничего. Это тоже
 * решение: срок — обещание удалить, а не удаление.
 *
 *   npm run archive:purge            # показать, что будет удалено
 *   npm run archive:purge -- --apply # удалить
 *
 * ## Почему по умолчанию ничего не удаляется
 *
 * Первый запуск после включения правила — самый опасный: в архиве лежат
 * записи, отправленные туда, когда архив был вечным. Миграция дала им
 * тридцать дней, но если сценарий впервые запустят через полгода,
 * кандидатами станут все разом. Показать список и дать посмотреть на него
 * дешевле, чем разбираться потом.
 *
 * ## Как удаляются связанные записи
 *
 * Таблицы, ссылающиеся на животное, сценарий ищет сам — в системном
 * каталоге PostgreSQL, по внешним ключам на `animals`. Список в коде
 * устарел бы при первой же новой коллекции и упёрся бы во внешний ключ
 * на чужой машине; каталог не забывает.
 *
 * Саму `animals` каталог тоже возвращает — из-за `father_id`/`mother_id`.
 * Строки в ней не удаляются: у ссылок на удаляемую запись проставляется
 * пустота. Удалять потомков вслед за родителем нельзя ни при каких
 * обстоятельствах, а живые потомки до этого места и не доходят —
 * их отсекает заслон `removalBlockers`.
 */

const APPLY = process.argv.includes('--apply')

const { driverUri, sslConfig } = resolveDatabase()

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))
const dateRu = (d: Date) => d.toLocaleDateString('ru-RU')

/**
 * Таблицы и колонки, ссылающиеся на `animals`, — из каталога, а не из памяти.
 *
 * `array_length(conkey, 1) = 1` отсекает составные внешние ключи: у них
 * `conkey[1]` — только первая колонка, и удалять по ней было бы неверно.
 * Таких ключей на `animals` сейчас нет, но условие дешевле проверки
 * «а не появились ли».
 *
 * `_parent_id` исключён намеренно. Так называется колонка дочерних таблиц
 * массивов самой карточки (`animals_dna_tests` и прочие) — это не связанные
 * записи, а части записи, и убирает их Payload вместе с ней. Считать их
 * в «удалено связанных записей» значило бы сказать хозяйству, что вместе
 * с коровой пропали две чужие записи, хотя пропали две строки её же
 * карточки.
 */
async function referencingColumns(pool: Pool): Promise<{ table: string; column: string }[]> {
  const { rows } = await pool.query<{ table: string; column: string }>(`
    select src.relname as table, att.attname as column
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class tgt on tgt.oid = c.confrelid
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
     where c.contype = 'f'
       and tgt.relname = 'animals'
       and array_length(c.conkey, 1) = 1
       and att.attname <> '_parent_id'
     order by 1, 2`)
  return rows
}

async function main() {
  const payload = await getPayload({ config })
  const pool = new Pool({ connectionString: driverUri, ssl: sslConfig, max: 2 })

  const refs = await referencingColumns(pool)
  const own = refs.filter((r) => r.table === 'animals')
  const others = refs.filter((r) => r.table !== 'animals')

  console.log('')
  console.log(`ОЧИСТКА АРХИВА — срок хранения ${ARCHIVE_RETENTION_DAYS} дней`)
  console.log(APPLY ? '  режим: удаление' : '  режим: только показать (--apply чтобы удалить)')
  console.log(
    `  таблиц со ссылкой на животное: ${others.length}` +
      (own.length ? `, плюс ${own.length} ссылки внутри самой книги (обнуляются)` : ''),
  )
  console.log('')

  const { docs } = await payload.find({
    collection: 'animals',
    where: { archived: { equals: true } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    sort: 'archivedAt',
  })

  if (!docs.length) {
    console.log('  Архив пуст.')
    console.log('')
    await pool.end()
    process.exit(0)
  }

  let removed = 0
  let kept = 0
  let waiting = 0

  for (const a of docs) {
    const id = Number(a.id)
    const ident = String(a.identNumber ?? id)
    const left = daysLeft(a.archivedAt)
    const due = removalDueAt(a.archivedAt)

    /*
     * Пустая дата архивации — не «ноль дней», а «срок не начинался».
     * Такую запись сценарий не трогает и говорит об этом: молчаливое
     * удаление по отсутствующей дате — ровно та ошибка, ради которой
     * дата и заводилась.
     */
    if (left === null) {
      console.log(`  ${pad(ident, 22)} без даты архивации — пропущена`)
      kept++
      continue
    }

    if (left > 0) {
      waiting++
      continue
    }

    const blockers = await removalBlockers(payload, id)
    if (blockers.length) {
      console.log(`  ${pad(ident, 22)} срок вышел, но удалить нельзя:`)
      for (const b of blockers) console.log(`      ${b.text}`)
      kept++
      continue
    }

    if (!APPLY) {
      console.log(`  ${pad(ident, 22)} будет удалена (срок вышел ${due ? dateRu(due) : '—'})`)
      removed++
      continue
    }

    const client = await pool.connect()
    let dependents = 0
    try {
      await client.query('begin')

      for (const r of others) {
        const res = await client.query(
          `delete from "${r.table}" where "${r.column}" = $1`,
          [id],
        )
        dependents += res.rowCount ?? 0
      }

      // Ссылки внутри книги обнуляются: потомок остаётся, происхождение — нет
      for (const r of own) {
        await client.query(`update "animals" set "${r.column}" = null where "${r.column}" = $1`, [
          id,
        ])
      }

      /*
       * След пишется до удаления и в той же транзакции.
       *
       * Напиши его после — и обрыв между двумя действиями оставит книгу
       * без записи и без следа о ней, то есть ровно с той дырой, ради
       * закрытия которой реестр и заводился.
       */
      await client.query(
        `insert into "animal_removals"
           ("ident_number", "name", "owner_id", "birth_date", "archived_at",
            "removed_at", "archived_by_id", "archive_reason", "removed_records",
            "updated_at", "created_at")
         values ($1, $2, $3, $4, $5, now(), $6, $7, $8, now(), now())`,
        [
          ident,
          a.name ?? null,
          typeof a.owner === 'number' ? a.owner : null,
          a.birthDate ?? null,
          a.archivedAt ?? null,
          typeof a.archivedBy === 'number' ? a.archivedBy : null,
          a.archiveReason ?? null,
          dependents,
        ],
      )

      await client.query('commit')
    } catch (e) {
      await client.query('rollback').catch(() => {})
      console.log(`  ${pad(ident, 22)} не удалена: ${e instanceof Error ? e.message : String(e)}`)
      kept++
      client.release()
      continue
    }
    client.release()

    /*
     * Саму карточку удаляет Payload, а не SQL: за ней тянутся дочерние
     * таблицы её же массивов (ДНК-тесты, гаплотипы, альтернативные
     * номера), и перечислять их руками — та же ошибка, от которой
     * спасает каталог.
     */
    try {
      await payload.delete({ collection: 'animals', id, overrideAccess: true })
      console.log(`  ${pad(ident, 22)} удалена, связанных записей: ${dependents}`)
      removed++
    } catch (e) {
      console.log(
        `  ${pad(ident, 22)} след записан, но карточка осталась: ${
          e instanceof Error ? e.message : String(e)
        }`,
      )
      kept++
    }
  }

  console.log('')
  console.log(`  Срок вышел: ${removed + kept}, из них ${APPLY ? 'удалено' : 'к удалению'}: ${removed}, оставлено: ${kept}`)
  console.log(`  Ждут срока: ${waiting}`)
  if (!APPLY && removed) console.log('  Ничего не удалено. Повторите с --apply.')
  console.log('')

  await pool.end()
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
