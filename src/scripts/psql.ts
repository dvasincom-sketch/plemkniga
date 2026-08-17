import 'dotenv/config'
import { spawn } from 'child_process'
import { maskUri, resolveDatabase } from '../lib/db-url'

/**
 * psql к той базе, с которой работает приложение.
 *
 * Мелочь, которая стоила времени не раз. Строка подключения лежит в `.env`
 * — файле, который оболочка не читает, — поэтому `psql "$DATABASE_URI"`
 * в терминале подключается в пустоту, а команда из документации,
 * где строка обозначена многоточием, честно ищет хост с именем «…».
 *
 * Здесь строка берётся тем же кодом, что и в приложении: те же переменные
 * в том же порядке, тот же разбор. Значит, подключение гарантированно
 * к той базе, о которой идёт речь, а не к соседней.
 *
 *   npm run db:psql                                  — интерактивно
 *   npm run db:psql -- -c "select count(*) from milk_tests"
 *   DATABASE_URI='postgres://…прод…' npm run db:psql -- -c "..."
 *
 * Скрипт ничего не решает за psql: аргументы после `--` уходят ему как есть.
 *
 * Одна засада не от нас. `npm run` вырезает кавычки внутри аргументов,
 * поэтому запрос со строковым литералом до psql доходит покалеченным:
 * `where name = 'dev'` превращается в `where name = dev`, и база отвечает
 * «column "dev" does not exist». Обходов два, оба надёжные:
 *
 *   echo "delete from t where name = 'dev'" | npm run db:psql   — через stdin
 *   npx tsx src/scripts/psql.ts -c "delete from t where name = 'dev'"
 *
 * Либо обойтись без литерала: `where batch = -1` кавычек не требует.
 */

const { uri, source } = resolveDatabase()

if (!uri) {
  console.error(
    '\nСтрока подключения не найдена. Проверьте DATABASE_URI в .env\n' +
      'или передайте её перед командой: DATABASE_URI=… npm run db:psql\n',
  )
  process.exit(1)
}

const args = process.argv.slice(2)

console.error(`\nБаза: ${maskUri(uri)} (из ${source})\n`)

/*
 * psql передаётся исходная строка, а не та, что уходит драйверу: `sslmode`
 * из неё вырезают для node-postgres, который трактует его по-своему,
 * а libpq понимает правильно и без помощи.
 */
const child = spawn('psql', [uri, ...args], { stdio: 'inherit' })

child.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'ENOENT') {
    console.error(
      'psql не найден. Он ставится вместе с клиентом PostgreSQL:\n' +
        '  macOS:  brew install libpq && brew link --force libpq\n' +
        '  Debian: apt install postgresql-client\n',
    )
  } else {
    console.error('Не удалось запустить psql:', e.message)
  }
  process.exit(1)
})

child.on('exit', (code) => process.exit(code ?? 0))
