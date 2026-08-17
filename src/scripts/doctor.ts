import 'dotenv/config'
import { Pool } from 'pg'
import { isLocalDatabase, maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Осмотр перед запуском: почему система не поднимется — до того, как не поднялась.
 *
 * Сборка проходит, типы сходятся, а сайт лежит. Так бывает потому, что
 * `next build` проверяет код, а падает окружение: база недоступна, журнал
 * миграций разошёлся со схемой, кончилось место, в журнале осталась отметка
 * `dev` — и приложение при старте спрашивает разрешения на миграции
 * у контейнера, в котором некому отвечать.
 *
 * Каждая проверка здесь появилась не из соображений полноты, а после
 * случившегося. Скрипт ничего не чинит и не меняет: читает и говорит,
 * что не так и что с этим делать.
 *
 *   npm run doctor
 *   DATABASE_URI='postgres://…прод…' npm run doctor
 *
 * Код возврата: 0 — можно запускаться, 1 — есть препятствие.
 */

const { driverUri, uri, source, sslConfig } = resolveDatabase()

const ru = (n: number) => n.toLocaleString('ru-RU')

type Check = { ok: boolean; title: string; detail?: string; fix?: string }
const checks: Check[] = []

const add = (c: Check) => checks.push(c)

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  /* ------------------------- 1. База отвечает ----------------------------- */

  if (!driverUri) {
    add({
      ok: false,
      title: 'Строка подключения не найдена',
      fix: 'Проверьте DATABASE_URI в .env или в переменных окружения контейнера.',
    })
    report()
    return
  }

  const pool = new Pool({ connectionString: driverUri, ssl: sslConfig, connectionTimeoutMillis: 8000 })

  try {
    await pool.query('select 1')
    add({ ok: true, title: 'База отвечает' })
  } catch (e) {
    add({
      ok: false,
      title: 'База не отвечает',
      detail: e instanceof Error ? e.message : String(e),
      fix:
        'Проверьте, что сервер поднят и доступен с этой машины, а в строке\n' +
        '     подключения верны хост, порт и режим TLS (sslmode).',
    })
    report()
    await pool.end()
    return
  }

  const local = isLocalDatabase(driverUri)

  /* --------------------- 2. Отметка dev в журнале ------------------------- */

  /*
   * Самая коварная из проверок. Отметку `dev` оставляет `drizzle push`,
   * то есть запуск чего угодно из режима разработки. Если она попала
   * в боевую базу, приложение при старте начинает спрашивать разрешение
   * на миграции — и повисает навсегда, потому что отвечать некому.
   */
  const journalExists = await pool.query(`select to_regclass('public.payload_migrations') as t`)
  if (journalExists.rows[0]?.t === null) {
    add({
      ok: false,
      title: 'Журнала миграций нет',
      detail: 'Таблица payload_migrations отсутствует — база пустая либо создана не Payload.',
      fix: 'npm run payload migrate — она создаст схему с нуля.',
    })
  } else {
    /*
     * Ищется по batch = -1, а не по имени. Имя `dev` кладёт push сегодня,
     * а Payload перед миграциями смотрит именно на номер пакета — и по нему
     * решает, спрашивать ли разрешение. Проверять надо то, на что смотрит он.
     */
    const dev = await pool.query(`select 1 from payload_migrations where batch = -1`)
    const hasDev = (dev.rowCount ?? 0) > 0

    if (hasDev && !local) {
      add({
        ok: false,
        title: 'В боевом журнале осталась отметка dev',
        detail:
          'Её оставляет `drizzle push` — значит, по этой базе ходили из режима\n' +
          '     разработки. Перед прогоном миграций Payload находит эту запись\n' +
          '     и спрашивает разрешение: «возможна потеря данных, продолжать?»\n' +
          '     В контейнере отвечать некому, и на отказ процесс выходит\n' +
          '     с кодом 0, не начав работу. Снаружи это выглядит как «сборка\n' +
          '     прошла, а сайт не открывается».',
        fix:
          'npm run db:psql -- -c "delete from payload_migrations where batch = -1"\n' +
          '     Затем сверьте журнал: npm run migrate:baseline',
      })
    } else if (hasDev) {
      add({ ok: true, title: 'Отметка dev в журнале — база локальная, это нормально' })
    } else {
      add({ ok: true, title: 'Отметки dev в журнале нет' })
    }
  }

  /* ----------------------- 3. Схема против журнала ------------------------ */

  const applied = await pool.query<{ n: string }>(
    `select count(*)::text as n from payload_migrations where name <> 'dev'`,
  )
  add({
    ok: true,
    title: `Миграций записано в журнал: ${ru(Number(applied.rows[0]?.n ?? 0))}`,
    detail: 'Полная сверка со схемой — npm run migrate:baseline',
  })

  /* ------------------------------ 4. Место -------------------------------- */

  /*
   * Место проверяется в двух видах, потому что кончиться оно может
   * по-разному. Миграция, меняющая тип колонки, переписывает таблицу целиком:
   * ей нужно свободного места примерно столько же, сколько весит самая
   * большая таблица. Об этом узнают в тот момент, когда прод уже не встаёт.
   */
  const size = await pool.query<{ db: string; biggest: string; bytes: string; name: string }>(`
    select
      pg_size_pretty(pg_database_size(current_database())) as db,
      pg_size_pretty(max(pg_total_relation_size(c.oid)))   as biggest,
      max(pg_total_relation_size(c.oid))::text             as bytes,
      (array_agg(c.relname order by pg_total_relation_size(c.oid) desc))[1] as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  `)

  const row = size.rows[0]
  add({
    ok: true,
    title: `Размер базы: ${row?.db ?? '—'}, крупнейшая таблица ${row?.name ?? '—'} — ${row?.biggest ?? '—'}`,
    detail:
      'Миграция, меняющая тип колонки, переписывает таблицу целиком:\n' +
      '     на диске должно быть свободно не меньше размера крупнейшей.',
  })

  /* ------------------------- 5. Долгие транзакции -------------------------- */

  /*
   * Проверяется раньше раздутых таблиц не по важности, а по порядку действий:
   * пока живёт старая транзакция, VACUUM почти ничего не уберёт. Она держит
   * снимок, а строка, которая может понадобиться хоть кому-то из открытых
   * снимков, мёртвой не считается. Убирать сначала мусор, потом транзакцию —
   * значит проделать работу дважды.
   *
   * Активная транзакция и забытая — разные вещи, поэтому печатается состояние
   * и начало запроса: `active` обычно означает, что скрипт всё ещё работает
   * и его надо дождаться; `idle in transaction` — что кто-то открыл
   * транзакцию и ушёл, и вот её снимать не жалко.
   */
  const stuck = await pool.query<{
    pid: string
    minutes: string
    state: string
    app: string | null
    query: string | null
  }>(`
    select pid::text,
           round(extract(epoch from now() - xact_start) / 60)::text as minutes,
           state,
           nullif(application_name, '') as app,
           left(regexp_replace(query, '\\s+', ' ', 'g'), 90) as query
      from pg_stat_activity
     where datname = current_database() and xact_start is not null
       and pid <> pg_backend_pid()
       and now() - xact_start > interval '10 minutes'
     order by xact_start limit 5
  `)

  if (stuck.rows.length) {
    const idle = stuck.rows.filter((r) => r.state?.startsWith('idle')).length
    add({
      ok: false,
      title: `Долгие транзакции: ${stuck.rows.length}`,
      detail: stuck.rows
        .map(
          (r) =>
            `pid ${r.pid}, ${r.minutes} мин, ${r.state}${r.app ? `, ${r.app}` : ''}\n` +
            `       ${r.query ?? '—'}`,
        )
        .join('\n     '),
      fix:
        (idle
          ? 'Состояние idle in transaction означает забытую транзакцию: работа\n' +
            '     не идёт, а снимок держится. Такую можно снимать.\n     '
          : 'Состояние active означает, что запрос всё ещё выполняется, —\n' +
            '     посмотрите на текст выше и дождитесь, если это ваш скрипт.\n     ') +
        'Пока транзакция жива, VACUUM не уберёт мёртвые строки: они могут\n' +
        '     понадобиться её снимку. Снять принудительно, разобравшись, чья она:\n' +
        '     npm run db:psql -- -c "select pg_terminate_backend(PID)"',
    })
  } else {
    add({ ok: true, title: 'Долгих транзакций нет' })
  }

  /* -------------------------- 6. Раздутые таблицы ------------------------- */

  const bloat = await pool.query<{
    relname: string
    qname: string
    live: string
    dead: string
    size: string
  }>(`
    select relname, relid::regclass::text as qname,
           n_live_tup::text as live, n_dead_tup::text as dead,
           pg_size_pretty(pg_total_relation_size(relid)) as size
      from pg_stat_user_tables
     where schemaname = 'public' and n_dead_tup > 100000 and n_dead_tup > n_live_tup / 2
     order by n_dead_tup desc limit 5
  `)

  if (bloat.rows.length) {
    /*
     * Полностью опустевшая таблица — отдельный случай: VACUUM вернёт её
     * страницы под будущие вставки в неё же, но файл на диске не уменьшит.
     * Если наполнять нечем, короче TRUNCATE — он отдаёт файл системе сразу.
     *
     * Только «пусто» здесь нельзя брать из n_live_tup. Это оценка сборщика
     * статистики, и после массового удаления она показывает ноль у таблицы,
     * в которой ещё лежат живые строки: статистика обновится не раньше
     * следующего прохода. Один раз по такому нулю чуть не был предложен
     * truncate таблице с девятью сотнями настоящих записей.
     *
     * Поэтому пустота проверяется запросом, и запрос ограничен по времени:
     * на таблице, где живого действительно нет, он честно прочитает все
     * мёртвые строки, прежде чем ответить. Не успел — молчим: осмотр не
     * вправе задерживать себя ради необязательного совета.
     */
    const emptied: string[] = []
    for (const r of bloat.rows) {
      if (Number(r.live) !== 0) continue
      const probe = await pool.connect()
      try {
        // set local действует до конца транзакции — потому begin, а не просто set:
        // иначе таймаут остался бы на соединении, которое вернётся в пул
        await probe.query('begin')
        await probe.query('set local statement_timeout = 5000')
        const res = await probe.query<{ any: boolean }>(
          `select exists(select 1 from ${r.qname}) as any`,
        )
        if (res.rows[0]?.any === false) emptied.push(r.relname)
      } catch {
        /* не успели или нет прав — совета про truncate просто не будет */
      } finally {
        await probe.query('rollback').catch(() => {})
        probe.release()
      }
    }

    add({
      ok: false,
      title: `Раздуты мёртвыми строками: ${bloat.rows.map((r) => r.relname).join(', ')}`,
      detail: bloat.rows
        .map(
          (r) =>
            `${r.relname}: живых ${ru(Number(r.live))} (оценка), мёртвых ${ru(Number(r.dead))}, ` +
            `на диске ${r.size}`,
        )
        .join('\n     '),
      fix:
        (stuck.rows.length
          ? 'Сначала разберитесь с долгими транзакциями выше — пока они живы,\n' +
            '     уборка почти ничего не даст.\n     '
          : '') +
        'npm run db:psql -- -c "vacuum analyze ИМЯ_ТАБЛИЦЫ"\n' +
        '     Место вернётся под повторное использование этой же таблицей,\n' +
        '     но файл на диске не уменьшится. Сжать файл может только\n' +
        '     VACUUM FULL: он блокирует таблицу и требует запаса места\n' +
        '     размером с неё.' +
        (emptied.length
          ? `\n     Проверено запросом — пусты целиком: ${emptied.join(', ')}.\n` +
            '     Если данные не вернутся, короче truncate — он отдаёт файл\n' +
            '     системе сразу, не требуя ни блокировки, ни запаса места.'
          : ''),
    })
  } else {
    add({ ok: true, title: 'Раздутых таблиц нет' })
  }

  /* --------------------- 7. Ограничения против данных --------------------- */

  const violating = await pool.query<{ conname: string; relname: string }>(`
    select conname, conrelid::regclass::text as relname
      from pg_constraint
     where connamespace = 'public'::regnamespace and contype = 'c' and not convalidated
  `)

  if (violating.rows.length) {
    add({
      ok: false,
      title: `Ограничения не проверены на данных: ${violating.rows.length}`,
      detail: violating.rows.map((r) => `${r.relname}.${r.conname}`).join(', '),
      fix: 'npm run db:precheck покажет строки, которые их не проходят.',
    })
  } else {
    add({ ok: true, title: 'Ограничения целостности в порядке' })
  }

  await pool.end()
  report()
}

function report() {
  const failed = checks.filter((c) => !c.ok)

  console.log('Проверки\n' + '─'.repeat(76))
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'}  ${c.title}`)
    if (c.detail) console.log(`     ${c.detail}`)
    if (!c.ok && c.fix) console.log(`     → ${c.fix}`)
    if (!c.ok) console.log('')
  }

  console.log('')
  if (!failed.length) {
    console.log('Препятствий к запуску не видно.\n')
    return
  }

  console.log(`Препятствий: ${failed.length}. Разберитесь с ними до выкладки.\n`)
  process.exitCode = 1
}

main().catch((e) => {
  console.error('\nОшибка осмотра:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
