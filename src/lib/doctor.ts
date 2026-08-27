import { Pool } from 'pg'
import { isLocalDatabase, resolveDatabase } from '@/lib/db-url'

/**
 * Осмотр базы: почему система не поднимется — до того, как не поднялась.
 *
 * ## Почему это библиотека, а не только скрипт
 *
 * Раньше осмотр жил целиком в `src/scripts/doctor.ts` и умел одно: печатать
 * в терминал. Печать нельзя ни сохранить, ни показать на странице, ни
 * сравнить с прошлым разом — а именно это и понадобилось, когда осмотр
 * потребовалось гонять по расписанию и показывать результат.
 *
 * Поэтому расчёт отделён от печати. Здесь — только выводы структурой;
 * скрипт их печатает, ручка прогона сохраняет. Два потребителя одного
 * расчёта вместо двух расчётов, которые однажды разойдутся.
 *
 * ## Что он делает и чего не делает
 *
 * Каждая проверка появилась не из соображений полноты, а после
 * случившегося: база недоступна, журнал миграций разошёлся со схемой,
 * в журнале осталась отметка `dev` — и приложение при старте спрашивает
 * разрешения на миграции у контейнера, в котором некому отвечать.
 *
 * Ничего не чинит и не меняет: читает и говорит, что не так и что с этим
 * делать. Это условие применимости, а не осторожность — осмотр гоняется
 * по боевой базе.
 */

export type DoctorCheck = {
  ok: boolean
  title: string
  /** Подробность находки: числа, имена таблиц, текст ошибки. */
  detail?: string
  /** Что с этим делать. Только у неудачных: у удачных советовать нечего. */
  fix?: string
}

const ru = (n: number) => n.toLocaleString('ru-RU')

export async function runDoctor(): Promise<DoctorCheck[]> {
  const { driverUri, sslConfig } = resolveDatabase()
  const checks: DoctorCheck[] = []
  const add = (c: DoctorCheck) => checks.push(c)

  /* ------------------------- 1. База отвечает ----------------------------- */

  if (!driverUri) {
    add({
      ok: false,
      title: 'Строка подключения не найдена',
      fix: 'Проверьте DATABASE_URI в .env или в переменных окружения контейнера.',
    })
    return checks
  }

  /*
   * Свой пул, а не общий с приложением. Осмотр должен отвечать и тогда,
   * когда общий пул исчерпан, — а именно это и бывает поводом его звать.
   */
  const pool = new Pool({
    connectionString: driverUri,
    ssl: sslConfig,
    connectionTimeoutMillis: 8000,
  })

  try {
    await pool.query('select 1')
    add({ ok: true, title: 'База отвечает' })
  } catch (e) {
    add({
      ok: false,
      title: 'База не отвечает',
      detail: e instanceof Error ? e.message : String(e),
      fix:
        'Проверьте, что сервер поднят и доступен с этой машины, а в строке ' +
        'подключения верны хост, порт и режим TLS (sslmode).',
    })
    await pool.end()
    return checks
  }

  try {
    const local = isLocalDatabase(driverUri)

    /* --------------------- 2. Отметка dev в журнале ----------------------- */

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
            'Её оставляет drizzle push — значит, по этой базе ходили из режима ' +
            'разработки. Перед прогоном миграций Payload находит эту запись ' +
            'и спрашивает разрешение: «возможна потеря данных, продолжать?» ' +
            'В контейнере отвечать некому, и на отказ процесс выходит с кодом 0, ' +
            'не начав работу. Снаружи это выглядит как «сборка прошла, а сайт ' +
            'не открывается».',
          fix:
            'npm run db:psql -- -c "delete from payload_migrations where batch = -1", ' +
            'затем сверьте журнал: npm run migrate:baseline',
        })
      } else if (hasDev) {
        add({ ok: true, title: 'Отметка dev в журнале — база локальная, это нормально' })
      } else {
        add({ ok: true, title: 'Отметки dev в журнале нет' })
      }
    }

    /* ----------------------- 3. Схема против журнала ---------------------- */

    const applied = await pool.query<{ n: string }>(
      `select count(*)::text as n from payload_migrations where name <> 'dev'`,
    )
    add({
      ok: true,
      title: `Миграций записано в журнал: ${ru(Number(applied.rows[0]?.n ?? 0))}`,
      detail: 'Полная сверка со схемой — npm run migrate:baseline',
    })

    /* ------------------------------ 4. Место ------------------------------ */

    /*
     * Место проверяется в двух видах, потому что кончиться оно может
     * по-разному. Миграция, меняющая тип колонки, переписывает таблицу
     * целиком: ей нужно свободного места примерно столько же, сколько весит
     * самая большая таблица. Об этом узнают в тот момент, когда прод уже
     * не встаёт.
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
        'Миграция, меняющая тип колонки, переписывает таблицу целиком: ' +
        'на диске должно быть свободно не меньше размера крупнейшей.',
    })

    /* ------------------------- 5. Долгие транзакции ----------------------- */

    /*
     * Проверяется раньше раздутых таблиц не по важности, а по порядку
     * действий: пока живёт старая транзакция, VACUUM почти ничего не уберёт.
     * Она держит снимок, а строка, которая может понадобиться хоть кому-то
     * из открытых снимков, мёртвой не считается.
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
              `pid ${r.pid}, ${r.minutes} мин, ${r.state}${r.app ? `, ${r.app}` : ''}: ${r.query ?? '—'}`,
          )
          .join('; '),
        fix:
          (idle
            ? 'Состояние idle in transaction означает забытую транзакцию: работа ' +
              'не идёт, а снимок держится. Такую можно снимать. '
            : 'Состояние active означает, что запрос всё ещё выполняется, — ' +
              'посмотрите на текст выше и дождитесь, если это ваш скрипт. ') +
          'Пока транзакция жива, VACUUM не уберёт мёртвые строки. Снять ' +
          'принудительно, разобравшись, чья она: ' +
          'npm run db:psql -- -c "select pg_terminate_backend(PID)"',
      })
    } else {
      add({ ok: true, title: 'Долгих транзакций нет' })
    }

    /* -------------------------- 6. Раздутые таблицы ----------------------- */

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
       *
       * Только «пусто» здесь нельзя брать из n_live_tup: это оценка сборщика
       * статистики, и после массового удаления она показывает ноль у таблицы,
       * в которой ещё лежат живые строки. Один раз по такому нулю чуть
       * не был предложен truncate таблице с девятью сотнями настоящих записей.
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
          .join('; '),
        fix:
          (stuck.rows.length
            ? 'Сначала разберитесь с долгими транзакциями выше — пока они живы, ' +
              'уборка почти ничего не даст. '
            : '') +
          'npm run db:psql -- -c "vacuum analyze ИМЯ_ТАБЛИЦЫ". Место вернётся ' +
          'под повторное использование этой же таблицей, но файл на диске ' +
          'не уменьшится.' +
          (emptied.length
            ? ` Проверено запросом — пусты целиком: ${emptied.join(', ')}. ` +
              'Если данные не вернутся, короче truncate.'
            : ''),
      })
    } else {
      add({ ok: true, title: 'Раздутых таблиц нет' })
    }

    /* --------------------- 7. Ограничения против данных ------------------- */

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
  } finally {
    /*
     * Пул закрывается в любом случае. Осмотр, оставивший за собой открытое
     * соединение, сам становится той бедой, которую ищет.
     */
    await pool.end()
  }

  return checks
}
