import 'dotenv/config'
import { spawn } from 'child_process'
import { Pool } from 'pg'
import { isLocalDatabase, maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Привести журнал миграций в соответствие с базой и применить недостающее.
 *
 * Зачем отдельная команда. Один и тот же танец повторяется после каждого
 * `git pull`, и повторяется он не от неаккуратности, а по устройству
 * Payload: в разработке он держит схему через `drizzle push`, минуя
 * миграции. Схема при этом уже правильная, а журнал о ней не знает —
 * и `payload migrate` честно пытается создать то, что есть, и падает
 * с «constraint … already exists». Простыня SQL в логе выглядит как
 * поломка базы; на деле это рассинхронизация двух списков.
 *
 * Три шага, каждый из которых делался руками:
 *
 *   1. убрать отметку `dev` (её оставляет push; из-за неё прод при старте
 *      спрашивает разрешение на миграции и молча выходит);
 *   2. сверить журнал с базой и отметить применённое как применённое
 *      (`migrate:baseline --apply`);
 *   3. применить то, чего в базе действительно нет (`payload migrate`).
 *
 * Порядок важен: без первого шага третий повиснет на вопросе, без второго —
 * упадёт на уже существующем объекте.
 *
 *   npm run db:sync
 *   DATABASE_URI='postgres://…прод…' npm run db:sync
 *
 * Ничего не создаёт и не удаляет в схеме сам: вся работа делается теми же
 * командами, которыми её делали руками, — они просто вызваны по порядку.
 */

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('\nСтрока подключения не найдена. Проверьте DATABASE_URI в .env\n')
  process.exit(1)
}

const run = (command: string, args: string[]): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
    child.on('exit', (code) => resolve(code ?? 0))
    child.on('error', () => resolve(1))
  })

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}`)
  console.log(isLocalDatabase(driverUri) ? 'Локальная база\n' : 'ВНИМАНИЕ: база не локальная\n')

  /* ---------------------- 1. Отметка dev в журнале ---------------------- */

  const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })
  try {
    const journal = await pool.query(`select to_regclass('public.payload_migrations') as t`)
    if (journal.rows[0]?.t === null) {
      console.log('Журнала миграций нет — база пустая. Применяю миграции с нуля.\n')
    } else {
      const res = await pool.query(`delete from payload_migrations where batch = -1`)
      console.log(
        res.rowCount
          ? `1/3 Отметка dev убрана (строк: ${res.rowCount}).\n`
          : '1/3 Отметки dev в журнале нет.\n',
      )
    }
  } finally {
    await pool.end()
  }

  /* ------------------- 2. Сверка журнала с реальностью ------------------- */

  console.log('2/3 Сверка журнала с базой')
  const baseline = await run('npm', ['run', '--silent', 'migrate:baseline', '--', '--apply'])
  if (baseline !== 0) {
    console.error('\nСверка не прошла — миграции не запускаю.\n')
    process.exit(1)
  }

  /* ----------------------- 3. Применение недостающего -------------------- */

  console.log('\n3/3 Применение недостающих миграций')
  /*
   * `--force-accept-warning` — не «пропустить проверку», а единственный
   * способ пройти её без человека.
   *
   * Найдя в журнале отметку dev-режима, Payload спрашивает разрешение
   * на миграции. В терминале на это отвечают; в контейнере отвечать
   * некому, и на отказ по умолчанию процесс выходит с кодом 0, не начав
   * работу. Снаружи это выглядит как «сборка прошла, а сайт не открылся» —
   * и именно так и выглядело на проде.
   *
   * Саму отметку `migrate:baseline --apply` убирает шагом выше, так что
   * до вопроса дело обычно не доходит. Флаг стоит на случай, когда
   * отметка появится снова: деплой не должен зависать в ожидании ответа.
   */
  const migrate = await run('npm', [
    'run',
    '--silent',
    'payload',
    'migrate',
    '--',
    '--force-accept-warning',
  ])
  if (migrate !== 0) {
    console.error(
      '\nМиграции не прошли. Если ошибка вида «уже существует» — значит, опорный\n' +
        'объект новой миграции не описан в src/scripts/migrate-baseline.ts,\n' +
        'и сверка о ней не знает. Добавьте строку и повторите.\n',
    )
    process.exit(1)
  }

  console.log('\nГотово: журнал и база сходятся.\n')
}

main().catch((e) => {
  console.error('\nОшибка:', e instanceof Error ? e.message : e)
  process.exit(1)
})
