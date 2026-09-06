import 'dotenv/config'
import { Pool } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { ADE_FEED_TABLES } from '../lib/ade/core'

/**
 * Аудит индексов: какие работают, какие лежат мёртвым грузом, каких не хватает.
 *
 * Индекс не бесплатен. Он занимает место, но главное — его надо обновлять
 * при каждой записи, и на загрузке в двести тысяч строк лишний индекс стоит
 * минут. Обратная ошибка дороже: недостающий индекс на трёхстах тысячах
 * животных превращает страницу в секунды ожидания у каждого посетителя.
 *
 * Поэтому решение принимается не по схеме, а по счётчикам обращений, которые
 * PostgreSQL ведёт сам (`pg_stat_user_indexes`). И здесь главная ловушка,
 * ради которой скрипт и написан: **счётчики бессмысленны, пока по системе
 * не поработали**. На свежей базе «не использовался» значит «сценарий
 * не запускали», а не «индекс лишний». Скрипт это проверяет первым делом
 * и отказывается советовать, если статистика холодная.
 *
 * Что считается достаточным. Сотня тысяч обращений к индексам суммарно
 * и хотя бы неделя с момента сброса счётчиков — порог грубый, но он отсекает
 * случай «развернули и сразу посмотрели». На проде до этого дозревают
 * за месяц обычной работы; на базе разработки — прогоном нагрузки.
 *
 * Что скрипт никогда не предлагает удалять:
 *
 *  - первичные ключи и уникальные индексы. Они не для скорости, а для
 *    целостности: индивидуальный номер животного уникален потому, что так
 *    устроена предметная область, и сколько раз по нему искали — неважно;
 *  - индексы внешних ключей. По ним ходит не приложение, а сама база —
 *    при проверке ссылок и при удалении родителя, и в счётчик обращений
 *    это попадает не всегда;
 *  - индексы, на которых стоит известный редкий сценарий. Первым таким
 *    стала лента изменений обмена: она сортирует по времени правки,
 *    то есть ровно по `*_updated_at_idx` всех коллекций ленты. Счётчик у них
 *    нулевой не потому, что они лишние, а потому, что ленту по этой базе
 *    ещё никто не тянул. Удалив их, мы узнали бы об ошибке от партнёра,
 *    у которого полная выгрузка стала занимать часы.
 *
 *    Это ровно тот случай, о котором скрипт и предупреждает словами
 *    «редкие сценарии могли не случиться ни разу», — но предупреждение,
 *    которое нужно помнить самому, работает хуже списка. Список берётся
 *    из кода обмена (`ADE_FEED_TABLES`), а не переписан сюда руками:
 *    появится новая коллекция обмена — она попадёт в защиту сама.
 *
 * Скрипт читает и печатает готовые команды. Выполнять их — решение
 * человека: индекс, ненужный сегодня, может понадобиться завтрашней странице.
 *
 * Единственное исключение — ключ `--reset`: он необратимо обнуляет
 * накопленную статистику всей базы, то есть уничтожает основание
 * для всех последующих решений. Поэтому он требует подтверждения,
 * а в шапке это сказано отдельно: «только читает» было неправдой ровно
 * про него.
 *
 *   npm run audit:indexes
 *   npm run audit:indexes -- --reset   # обнулить счётчики перед прогоном нагрузки
 */

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

const reset = process.argv.includes('--reset')
const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

const ru = (n: number) => n.toLocaleString('ru-RU')
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))

/** Порог, ниже которого статистике верить нельзя. */
const WARM_SCANS = 100_000
const WARM_DAYS = 7

type IndexRow = {
  table: string
  index: string
  scans: number
  size: number
  is_unique: boolean
  is_primary: boolean
  is_fk: boolean
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  if (reset) {
    /*
     * Обнуление необратимо и стирает основание для решений об индексах:
     * после него аудит показывает, что не используется ничего, и так
     * будет до следующей заметной нагрузки. На боевой базе это дороже
     * всего, поэтому нужен второй ключ.
     */
    if (!process.argv.includes('--yes')) {
      console.log(
        'Ключ --reset обнуляет счётчики обращений всей базы, и это необратимо.\n' +
          'После него аудит покажет, что не используется ничего, пока по системе\n' +
          'снова не поработают. Если вы уверены: npm run audit:indexes -- --reset --yes\n',
      )
      process.exitCode = 1
      return
    }
    await pool.query('select pg_stat_reset()')
    console.log(
      'Счётчики обращений обнулены.\n\n' +
        'Дальше нужна нагрузка: обычная работа на проде либо прогон сценариев\n' +
        'на базе разработки. Возвращайтесь к аудиту, когда по системе поработают,\n' +
        'иначе он покажет, что не используется ничего.\n',
    )
    return
  }

  /* ------------------------- Достаточно ли данных ------------------------- */

  const scanRow = await pool.query<{ scans: string }>(
    `select coalesce(sum(idx_scan), 0)::text as scans from pg_stat_user_indexes where schemaname = 'public'`,
  )
  // Время сброса счётчиков живёт в статистике базы, а не индексов
  /*
   * Время печатается по UTC, а не по поясу сервера: соседние прогоны
   * делают так же, и час, показанный в двух поясах, спорит сам с собой.
   * Пустой `stats_reset` («счётчики не сбрасывались ни разу») отличается
   * от нуля дней: прежде `Number(null ?? 0)` давал ноль, печаталось
   * «неизвестно (0 дн. назад)», и предупреждение о коротком окне
   * не срабатывало никогда.
   */
  const resetRow = await pool.query<{ since: string | null; days: string | null }>(
    `select to_char(stats_reset at time zone 'UTC', 'DD.MM.YYYY HH24:MI') as since,
            extract(day from now() - stats_reset)::text as days
       from pg_stat_database where datname = current_database()`,
  )

  const totalScans = Number(scanRow.rows[0]?.scans ?? 0)
  const rawDays = resetRow.rows[0]?.days
  const days = rawDays === null || rawDays === undefined ? null : Number(rawDays)

  /*
   * Достаточность меряется обращениями, а не сроком: нагрузку можно набрать
   * и прогоном сценариев за час. Срок — отдельная оговорка, и она про другое:
   * редкие сценарии (выпуск документов, месячная выгрузка) за короткое окно
   * просто не случаются, и их индексы попадут в «простаивают» незаслуженно.
   */
  const warm = totalScans >= WARM_SCANS

  console.log(`Обращений к индексам с момента сброса: ${ru(totalScans)}`)
  console.log(
    `Счётчики обнулены: ${resetRow.rows[0]?.since ?? 'ни разу'}` +
      (days === null ? ' (окно наблюдения неизвестно)' : ` (${ru(days)} дн. назад, UTC)`),
  )
  if (warm && days !== null && days < WARM_DAYS) {
    console.log(
      `\nОкно наблюдения короткое (${ru(days ?? 0)} дн.). Обращений достаточно, но редкие\n` +
        'сценарии — выпуск документов, месячные выгрузки, работа Ассоциации\n' +
        'с пакетами — за такой срок могли не случиться ни разу. Их индексы\n' +
        'окажутся в списке кандидатов незаслуженно; сверяйтесь со списком\n' +
        'сценариев, а не только со счётчиком.',
    )
  }
  console.log('')

  /* ------------------------------ Сбор данных ----------------------------- */

  const { rows } = await pool.query<IndexRow>(`
    select
      t.relname                          as table,
      i.relname                          as index,
      s.idx_scan                         as scans,
      pg_relation_size(i.oid)            as size,
      ix.indisunique                     as is_unique,
      ix.indisprimary                    as is_primary,
      exists (
        select 1 from pg_constraint c
         where c.conrelid = t.oid and c.contype = 'f'
           and c.conkey[1] = ix.indkey[0]
      )                                  as is_fk
    from pg_stat_user_indexes s
    join pg_class i  on i.oid = s.indexrelid
    join pg_class t  on t.oid = s.relid
    join pg_index ix on ix.indexrelid = s.indexrelid
    where s.schemaname = 'public'
    order by s.idx_scan, pg_relation_size(i.oid) desc
  `)

  const domain = rows.filter((r) => !r.table.startsWith('payload_'))
  const used = domain.filter((r) => Number(r.scans) > 0)
  const idle = domain.filter((r) => Number(r.scans) === 0)
  /*
   * Индексы, которых ждёт известный сценарий, — по имени таблицы и поля.
   * Имя вида `<таблица>_updated_at_idx` собирает Payload, и здесь оно
   * повторяется; расхождение поймает сам прогон — защищённого индекса
   * просто не найдётся в базе, и он не пропадёт из кандидатов, что видно.
   */
  const scenarioNames = new Map<string, string>()
  for (const table of ADE_FEED_TABLES) {
    scenarioNames.set(`${table}_updated_at_idx`, 'лента изменений: порядок по времени правки')
  }
  scenarioNames.set('ade_tombstones_deleted_at_idx', 'лента изменений: порядок удалений')
  scenarioNames.set('ade_tombstones_dataset_idx', 'лента изменений: отбор надгробий по набору')

  const isScenario = (name: string) => scenarioNames.has(name)

  const removable = idle.filter(
    (r) => !r.is_primary && !r.is_unique && !r.is_fk && !isScenario(r.index),
  )
  const protectedIdle = idle.filter((r) => r.is_primary || r.is_unique || r.is_fk)
  const scenarioIdle = idle.filter(
    (r) => !r.is_primary && !r.is_unique && !r.is_fk && isScenario(r.index),
  )

  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
  const totalIdleSize = removable.reduce((a, r) => a + Number(r.size), 0)

  console.log(
    `Индексов предметной модели: ${ru(domain.length)} — ` +
      `работают ${ru(used.length)}, простаивают ${ru(idle.length)}\n`,
  )

  /* ------------------------------ Кто работает ---------------------------- */

  console.log('Самые нагруженные\n' + '─'.repeat(78))
  console.log(pad('Индекс', 52) + pad('Обращений', 14) + 'Размер')
  for (const r of [...used].sort((a, b) => Number(b.scans) - Number(a.scans)).slice(0, 12)) {
    console.log(pad(r.index, 52) + pad(ru(Number(r.scans)), 14) + `${mb(Number(r.size))} МБ`)
  }

  /* ------------------------------ Кто простаивает ------------------------- */

  if (protectedIdle.length) {
    console.log(
      `\nПростаивают, но нужны не для скорости: ${ru(protectedIdle.length)}\n` + '─'.repeat(78),
    )
    console.log(
      'Первичные ключи, уникальность и внешние ключи. Уникальность — правило\n' +
        'предметной области, а не оптимизация; по индексам внешних ключей ходит\n' +
        'сама база при проверке ссылок. Удалять нельзя независимо от счётчика.\n',
    )
    for (const r of protectedIdle.slice(0, 10)) {
      const why = r.is_primary ? 'первичный ключ' : r.is_unique ? 'уникальность' : 'внешний ключ'
      console.log(`  ${pad(r.index, 52)} ${why}`)
    }
    if (protectedIdle.length > 10) console.log(`  … и ещё ${ru(protectedIdle.length - 10)}`)
  }

  if (scenarioIdle.length) {
    console.log(
      `\nПростаивают, но их ждёт известный сценарий: ${ru(scenarioIdle.length)}\n` + '─'.repeat(78),
    )
    console.log(
      'Счётчик нулевой потому, что сценарий ещё не случился, а не потому, что\n' +
        'индекс лишний. Удалять нельзя: беда всплывёт у того, кто этот сценарий\n' +
        'запустит первым, и выглядеть будет как наша поломка.\n',
    )
    for (const r of scenarioIdle) {
      console.log(`  ${pad(r.index, 52)} ${scenarioNames.get(r.index)}`)
    }
  }

  console.log(`\nКандидаты на удаление: ${ru(removable.length)}, ${mb(totalIdleSize)} МБ\n` + '─'.repeat(78))

  if (!removable.length) {
    console.log('Ни одного: каждый индекс хоть раз пригодился.\n')
  } else if (!warm) {
    console.log(
      'Список не печатаю — статистике нельзя верить.\n\n' +
        `Нужно не меньше ${ru(WARM_SCANS)} обращений, сейчас ${ru(totalScans)}.\n` +
        'На такой статистике «не использовался» означает «сценарий не запускали»:\n' +
        'удалите по ней индекс — и первым же редким отчётом получите полное\n' +
        'сканирование таблицы.\n\n' +
        'Дайте системе поработать (на проде — месяц обычной работы, на базе\n' +
        'разработки — прогон сценариев) и повторите.\n',
    )
  } else {
    console.log(pad('Индекс', 52) + pad('Таблица', 22) + 'Размер')
    for (const r of removable) {
      console.log(pad(r.index, 52) + pad(r.table, 22) + `${mb(Number(r.size))} МБ`)
    }
    console.log(
      '\nЕсли решите убрать — эти индексы создаёт Payload из `index: true`\n' +
        'у поля, поэтому снимать надо там, а не `DROP INDEX`: иначе `drizzle push`\n' +
        'в разработке вернёт их обратно, а миграция разойдётся со схемой.\n',
    )
  }

  /* --------------------------- Чего не хватает ---------------------------- */

  console.log('\nГде база читает таблицу целиком\n' + '─'.repeat(78))

  const seq = await pool.query<{
    table: string
    seq_scan: string
    seq_rows: string
    idx_scan: string
    live: string
  }>(`
    select relname as table, seq_scan::text, seq_tup_read::text as seq_rows,
           coalesce(idx_scan, 0)::text as idx_scan, n_live_tup::text as live
      from pg_stat_user_tables
     where schemaname = 'public' and n_live_tup > 10000
     order by seq_tup_read desc
     limit 8
  `)

  if (!seq.rows.length) {
    console.log('  Крупных таблиц пока нет — смотреть нечего.')
  } else {
    console.log(pad('Таблица', 24) + pad('Сканирований', 15) + pad('Строк прочитано', 18) + 'По индексу')
    for (const r of seq.rows) {
      console.log(
        pad(r.table, 24) +
          pad(ru(Number(r.seq_scan)), 15) +
          pad(ru(Number(r.seq_rows)), 18) +
          ru(Number(r.idx_scan)),
      )
    }
    console.log(
      '\nПолное сканирование само по себе не беда: подсчёт итога по большой\n' +
        'выборке база и должна читать целиком. Тревожно, когда сканирований\n' +
        'много, а обращений по индексу мало — значит, запрос не нашёл, за что\n' +
        'зацепиться. Такие места ищите в журнале медленных запросов:\n' +
        '  alter system set log_min_duration_statement = 200;\n',
    )
  }

  console.log('')
}

main()
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
