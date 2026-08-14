import 'dotenv/config'
import pg from 'pg'
import { maskUri, resolveDatabase } from '@/lib/db-url'

/**
 * Разовый пересчёт служебных полей сортировки (`ipcRank`, `summary.milkRank`).
 *
 * Зачем они нужны: PostgreSQL при `ORDER BY … DESC` ставит NULL первыми,
 * поэтому животные без оценки вытесняли бы из начала книги тех, у кого оценка
 * есть. В этих полях пустое значение превращается в заведомо низкое число.
 * Новые и изменённые записи заполняют их сами, хуком коллекции; скрипт нужен
 * один раз, для записей, созданных до появления полей.
 *
 * Почему напрямую через драйвер, а не через `payload.update`. Обновление
 * документа запускает все хуки коллекции, включая проверки предметной области —
 * например, что потомок не родился раньше родителя. На накопленных данных такие
 * противоречия встречаются, и служебный пересчёт падал бы на первой же
 * несогласованной записи. Здесь меняются только два технических поля, к бизнес-
 * логике они отношения не имеют, поэтому проверки и не нужны.
 *
 * Запуск: npm run backfill:sort-ranks
 */

const EMPTY_RANK = -1_000_000

const run = async () => {
  const db = resolveDatabase()
  if (!db.uri) {
    console.error('[plemkniga] Строка подключения не найдена — проверьте .env')
    process.exit(1)
  }

  console.info(`[plemkniga] Подключаюсь: ${maskUri(db.uri)}`)
  const client = new pg.Client({ connectionString: db.driverUri, ssl: db.sslConfig })
  await client.connect()

  try {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'animals' AND column_name IN ('ipc_rank', 'summary_milk_rank')`,
    )
    const columns = new Set(rows.map((r) => r.column_name as string))

    const missing = ['ipc_rank', 'summary_milk_rank'].filter((c) => !columns.has(c))
    if (missing.length) {
      console.error(
        `[plemkniga] В базе нет колонок: ${missing.join(', ')}. Запустите сначала npm run dev — схема обновляется при старте приложения`,
      )
      process.exit(1)
    }

    const result = await client.query(
      `UPDATE animals
          SET ipc_rank = COALESCE(ipc, $1),
              summary_milk_rank = COALESCE(summary_milk_yield, $1)
        WHERE ipc_rank IS DISTINCT FROM COALESCE(ipc, $1)
           OR summary_milk_rank IS DISTINCT FROM COALESCE(summary_milk_yield, $1)`,
      [EMPTY_RANK],
    )

    console.info(`[plemkniga] Пересчитан ранг сортировки у ${result.rowCount ?? 0} записей`)
  } finally {
    await client.end()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
