import 'dotenv/config'
import pg from 'pg'
import { randomUUID } from 'crypto'
import { resolveDatabase, maskUri } from '@/lib/db-url'

/**
 * Починка поля `animals.uuid` перед созданием уникального индекса.
 *
 * Откуда берётся поломка. При изменении структуры коллекции Payload обновляет
 * схему через drizzle push, а тот иногда трактует появление новой колонки как
 * переименование старой и переносит в неё чужие значения — так в `uuid`
 * оказываются, например, названия пород. Дальше создание уникального индекса
 * падает с «could not create unique index», и Payload не может стартовать
 * вообще: ни `npm run dev`, ни другие скрипты.
 *
 * Поэтому скрипт работает напрямую через драйвер, без Payload: тот всё равно
 * не поднимется, пока данные не исправлены. Значения, не похожие на UUID,
 * и дубликаты заменяются свежими UUID. Ничего, кроме этого поля, не трогается.
 *
 * ## Почему сухой прогон и ключ
 *
 * Скрипт выглядит служебным, а трогает ключ сопоставления при загрузке
 * файлов: по `uuid` загрузка находит свою запись (`src/actions/data.ts`).
 * Переписанный uuid означает, что файл хозяйства перестанет находить
 * животное и заведёт дубль — молча, через месяц, на чужой стороне.
 * Раньше `npm run repair:uuid` писал сразу, без единого вопроса.
 *
 * У дубликатов прежний uuid сохраняет запись с меньшим номером. Это
 * произвол, и признать его лучше, чем прятать: какая из двух записей
 * «настоящая» для внешней системы, база не знает. Поэтому дубликаты
 * называются поимённо, а не только считаются.
 *
 * Правка идёт одной транзакцией: обрыв посреди цикла оставлял часть
 * записей с новыми ключами, часть со старыми, и повторный прогон
 * не мог отличить одно от другого.
 *
 *   npm run repair:uuid            — показать, что будет заменено
 *   npm run repair:uuid -- --apply — заменить
 */

const APPLY = process.argv.includes('--apply')

const UUID_RE = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

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
    const { rows: exists } = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'animals' AND column_name = 'uuid'`,
    )
    if (exists.length === 0) {
      console.info('[plemkniga] Колонки animals.uuid нет — чинить нечего')
      return
    }

    // 1. Значения, не похожие на UUID (мусор от переименования колонок)
    const { rows: broken } = await client.query(
      `SELECT id, uuid FROM animals WHERE uuid IS NULL OR uuid !~ $1`,
      [UUID_RE],
    )

    // 2. Дубликаты среди внешне корректных UUID — оставляем первую запись
    const { rows: duplicates } = await client.query(
      `SELECT id FROM (
         SELECT id, row_number() OVER (PARTITION BY uuid ORDER BY id) AS rn
         FROM animals WHERE uuid ~ $1
       ) t WHERE rn > 1`,
      [UUID_RE],
    )

    const ids = [...broken.map((r) => r.id), ...duplicates.map((r) => r.id)]

    if (ids.length === 0) {
      console.info('[plemkniga] Все значения animals.uuid корректны и уникальны')
      return
    }

    const samples = broken
      .slice(0, 5)
      .map((r) => `${r.id}: ${r.uuid === null ? 'пусто' : String(r.uuid).slice(0, 40)}`)
    if (samples.length) console.info(`[plemkniga] Примеры испорченных значений — ${samples.join('; ')}`)

    console.info(
      `[plemkniga] К замене: ${ids.length} (некорректных ${broken.length}, дубликатов ${duplicates.length})`,
    )

    if (duplicates.length) {
      /*
       * Дубликаты называются номерами: прежний ключ остаётся у записи
       * с меньшим номером, и это решение принято за нас порядком
       * заведения. Человек, знающий, какая запись настоящая для внешней
       * системы, должен иметь возможность вмешаться до правки.
       */
      const shown = duplicates.slice(0, 20).map((r) => r.id).join(', ')
      console.info(
        `[plemkniga] Новый ключ получат дубликаты: ${shown}` +
          (duplicates.length > 20 ? ` и ещё ${duplicates.length - 20}` : ''),
      )
    }

    if (!APPLY) {
      console.info('[plemkniga] Ничего не записано. Заменить: npm run repair:uuid -- --apply')
      console.info(
        '[plemkniga] По uuid загрузка файлом находит свою запись: заменённый ключ' +
          ' означает дубль в книге при следующей загрузке.',
      )
      return
    }

    /*
     * Одной транзакцией: обрыв посреди цикла оставил бы часть записей
     * с новыми ключами, а часть со старыми, и отличить одно от другого
     * при повторном прогоне было бы нечем.
     */
    await client.query('BEGIN')
    try {
      for (const id of ids) {
        await client.query('UPDATE animals SET uuid = $1 WHERE id = $2', [randomUUID(), id])
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }

    console.info(`[plemkniga] Заменено значений: ${ids.length}`)
    console.info('[plemkniga] Теперь запустите npm run dev — схема обновится без ошибки')
  } finally {
    await client.end()
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
