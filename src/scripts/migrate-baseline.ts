import 'dotenv/config'
import { Pool } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Сверка журнала миграций с тем, что на самом деле есть в базе.
 *
 * Зачем нужно. В режиме разработки Payload держит схему в актуальном виде
 * сам — командой `drizzle push`, минуя миграции. Таблицы при этом появляются,
 * а записей в `payload_migrations` не остаётся. Потом на такой базе запускают
 * `payload migrate`, она честно берёт первую миграцию, и PostgreSQL отвечает
 * «type enum_users_role already exists»: схема уже есть, а журнал пуст.
 *
 * Ошибка выглядит страшно — простыня SQL на несколько экранов, — но означает
 * ровно одно: база и журнал разошлись. Данные при этом целы, ничего чинить
 * в схеме не нужно. Нужно отметить в журнале то, что фактически применено.
 *
 * Что делает скрипт. Для каждой миграции проверяет по опорному объекту
 * (таблице или колонке), есть ли она в базе, и сверяет с журналом. Без флага
 * `--apply` только показывает таблицу сверки и ничего не пишет.
 *
 * Что скрипт не делает никогда: не создаёт, не меняет и не удаляет ни одного
 * объекта схемы и ни одной строки данных. Единственная запись — строки
 * в `payload_migrations`.
 *
 *   npm run migrate:baseline            # посмотреть расхождения
 *   npm run migrate:baseline -- --apply # отметить применённые как применённые
 *
 * Ограничение: опорные объекты перечислены ниже вручную. Добавили миграцию —
 * добавьте строку сюда, иначе скрипт о ней не узнает.
 */

type Probe =
  | { kind: 'table'; name: string }
  | { kind: 'column'; table: string; column: string }

/** Порядок тот же, что в `src/migrations/index.ts`. */
const MIGRATIONS: { name: string; probe: Probe; note: string }[] = [
  {
    name: '20260814_195548',
    probe: { kind: 'table', name: 'animals' },
    note: 'начальная схема',
  },
  {
    name: '20260815_061539',
    probe: { kind: 'column', table: 'animals', column: 'for_sale' },
    note: 'признак продажи',
  },
  {
    name: '20260815_075706',
    probe: { kind: 'column', table: 'users', column: 'notify_submissions' },
    note: 'настройки уведомлений',
  },
  {
    name: '20260815_112204_access_requests',
    probe: { kind: 'table', name: 'access_requests' },
    note: 'запросы доступа',
  },
  {
    name: '20260816_071534_index_profiles',
    probe: { kind: 'table', name: 'index_profiles' },
    note: 'профили индекса',
  },
]

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

const apply = process.argv.includes('--apply')

const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

const exists = async (probe: Probe): Promise<boolean> => {
  if (probe.kind === 'table') {
    const r = await pool.query(`select to_regclass($1) as t`, [`public.${probe.name}`])
    return r.rows[0]?.t !== null
  }
  const r = await pool.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [probe.table, probe.column],
  )
  return r.rowCount === 1
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  const journalTable = await pool.query(`select to_regclass('public.payload_migrations') as t`)
  if (journalTable.rows[0]?.t === null) {
    console.log(
      'Таблицы payload_migrations нет — база пустая или создавалась не Payload.\n' +
        'Это не случай для этого скрипта: запустите `npm run payload migrate`,\n' +
        'она создаст схему с нуля.',
    )
    return
  }

  const journal = await pool.query<{ name: string; batch: string }>(
    `select name, batch from payload_migrations order by id`,
  )
  const recorded = new Map(journal.rows.map((r) => [r.name, Number(r.batch)]))

  /*
   * Строка `dev` — не миграция. Её пишет Payload, когда держит схему через
   * push в режиме разработки. Для сверки она интересна лишь тем, что прямо
   * указывает на причину расхождения.
   */
  const devRow = recorded.has('dev')

  const rows: { name: string; inDb: boolean; inJournal: boolean; note: string }[] = []
  for (const m of MIGRATIONS) {
    rows.push({
      name: m.name,
      inDb: await exists(m.probe),
      inJournal: recorded.has(m.name),
      note: m.note,
    })
  }

  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))
  console.log(pad('Миграция', 34) + pad('В базе', 9) + pad('В журнале', 11) + 'Что добавляет')
  console.log('─'.repeat(90))
  for (const r of rows) {
    console.log(
      pad(r.name, 34) +
        pad(r.inDb ? 'да' : 'нет', 9) +
        pad(r.inJournal ? 'да' : 'нет', 11) +
        r.note,
    )
  }
  console.log('')

  if (devRow) {
    console.log(
      'В журнале есть строка `dev`: схему держал `drizzle push` в режиме разработки.\n' +
        'Это и есть причина расхождения. Строку можно оставить — на работу\n' +
        'миграций она не влияет, но объясняет, откуда взялась схема без журнала.\n',
    )
  }

  // Записана, а в базе нет — журнал и база разошлись в обратную сторону
  const ghost = rows.filter((r) => r.inJournal && !r.inDb)
  if (ghost.length) {
    console.log(
      'Внимание: ' +
        ghost.map((r) => r.name).join(', ') +
        ' — записаны в журнале, но их объектов в базе нет.\n' +
        'Автоматически это не чинится: скрипт только отмечает применённое,\n' +
        'а здесь наоборот. Разбирайтесь вручную, ничего не запуская.\n',
    )
    return
  }

  const missing = rows.filter((r) => r.inDb && !r.inJournal)
  const pending = rows.filter((r) => !r.inDb && !r.inJournal)

  if (!missing.length) {
    console.log('Расхождений нет.')
    if (pending.length)
      console.log(
        `Не применены: ${pending.map((r) => r.name).join(', ')} — их применит\n` +
          '`npm run payload migrate` обычным порядком.',
      )
    return
  }

  /*
   * История миграций линейна: применённое не может идти после неприменённого.
   * Если порядок нарушен, значит картина сложнее, чем «схему создал push»,
   * и додумывать за человека нельзя.
   */
  const firstPending = rows.findIndex((r) => !r.inDb)
  const lastPresent = rows.map((r) => r.inDb).lastIndexOf(true)
  if (firstPending !== -1 && lastPresent > firstPending) {
    console.log(
      'Порядок нарушен: применённая миграция стоит после неприменённой.\n' +
        'Скрипт на такое не рассчитан — разберитесь вручную.',
    )
    return
  }

  if (!apply) {
    console.log(
      `Применено, но не записано: ${missing.map((r) => r.name).join(', ')}.\n\n` +
        'Отметить как применённые:\n' +
        '  npm run migrate:baseline -- --apply\n\n' +
        'Скрипт добавит строки в payload_migrations и не тронет ни схему,\n' +
        'ни данные. После этого `npm run payload migrate` пройдёт нормально\n' +
        'и применит только то, чего в базе действительно нет.',
    )
    return
  }

  const nextBatch =
    Math.max(0, ...journal.rows.map((r) => Number(r.batch)).filter((n) => Number.isFinite(n))) + 1

  for (const r of missing) {
    await pool.query(
      `insert into payload_migrations (name, batch, updated_at, created_at)
       values ($1, $2, now(), now())`,
      [r.name, nextBatch],
    )
    console.log(`отмечена применённой: ${r.name}`)
  }

  console.log(
    `\nГотово, записей добавлено: ${missing.length}, партия ${nextBatch}.\n` +
      'Дальше `npm run payload migrate` применит только недостающее.',
  )
  if (pending.length)
    console.log(`Ждут применения: ${pending.map((r) => r.name).join(', ')}`)
}

main()
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
