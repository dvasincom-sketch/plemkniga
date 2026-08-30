import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { poolOf } from '@/lib/sql'

/**
 * Схема, которую ждёт Payload, против схемы, которая есть в базе.
 *
 * ## Из-за чего появилась
 *
 * В коллекцию `DataSubmissions` был добавлен массив `intake.valueIssues`
 * (решение №226) и прогнан `payload generate:types`. Типы переписались,
 * схема — нет: `generate:types` её не трогает, а на прод она приезжает
 * миграциями, а не push (решение №2). Миграцию написать забыли.
 *
 * Локально этого не было видно: `next dev` поднимает схему при старте
 * и живёт на ней. Прод при первом же запросе к пакетам загрузки ответил
 * `relation "data_submissions_intake_value_issues" does not exist`
 * и уронил карточку животного — вкладка «Происхождение» спрашивает
 * пакеты, чтобы показать, откуда пришли данные.
 *
 * Это и есть главная особенность такой ошибки: ломается не там, где
 * правили. Между правкой коллекции и падением — деплой, чужая страница
 * и никакой связи на вид.
 *
 * ## Как устроена проверка
 *
 * Ожидаемое берётся у самого Payload: `payload.db.tables` — это таблицы,
 * которые адаптер построил из коллекций при запуске. Своих правил
 * именования здесь нет ни одного, и разойтись с настоящими они не могут
 * по построению.
 *
 * Действительное берётся из `information_schema`: что в базе есть на самом
 * деле. Сравниваются имена таблиц и колонок.
 *
 * ## Чего проверка не делает
 *
 * Не сверяет типы колонок, ограничения и перечисления. Тип, разошедшийся
 * с ожиданием, — беда более редкая и куда менее громкая: `varchar` вместо
 * `text` работает, а недостающая таблица не работает никак. Начинать надо
 * с того, что валит страницу.
 *
 * Не чинит. Ни автоматически, ни с ключом: миграция — это текст, который
 * читают в обзоре правок, и сочинять его скриптом значит завести привычку
 * не читать.
 *
 * ## Лишние колонки — не ошибка, а вопрос
 *
 * Колонка, которая есть в базе и не нужна Payload, ничего не ломает.
 * Но она означает одно из двух: поле убрали, а миграцию не написали
 * (тогда колонка повиснет навсегда), либо миграция откатана наполовину.
 * Поэтому такие показываются отдельным списком и на итог не влияют.
 *
 *   npm run check:schema
 */

let missing = 0

const ok = (what: string) => console.log(`  ✓ ${what}`)
const bad = (what: string, detail = '') => {
  missing += 1
  console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
}

/**
 * Имена колонок таблицы drizzle.
 *
 * Колонки лежат собственными свойствами объекта таблицы, а служебное
 * добро — под символами, и в перебор не попадает. Проверка на `name`
 * нужна затем, что среди обычных свойств встречаются и не колонки:
 * взять всё подряд значило бы объявить недостающими поля, которых
 * в базе и не должно быть.
 */
const columnsOfTable = (table: unknown): Set<string> => {
  const out = new Set<string>()
  if (!table || typeof table !== 'object') return out

  for (const value of Object.values(table as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      const name = (value as { name?: unknown }).name
      if (typeof name === 'string' && name) out.add(name)
    }
  }
  return out
}

async function main() {
  const payload = await getPayload({ config })
  const pool = poolOf(payload)

  if (!pool) {
    console.error('\nПрямой доступ к базе недоступен: проверка работает только с PostgreSQL.\n')
    process.exit(1)
  }

  const tables = (payload.db as unknown as { tables?: Record<string, unknown> }).tables ?? {}
  const expectedNames = Object.keys(tables)

  if (expectedNames.length === 0) {
    console.error('\nPayload не отдал ни одной таблицы — проверять нечего, и это само по себе странно.\n')
    process.exit(1)
  }

  /*
   * Схема спрашивается у базы одним запросом, а не по таблице: три сотни
   * запросов ради списка колонок — это три сотни обращений там, где
   * достаточно одного, и разница видна на глаз даже на своей машине.
   */
  const res = await pool.query(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = current_schema()`,
  )

  const actual = new Map<string, Set<string>>()
  for (const row of res.rows ?? []) {
    const t = String(row.table_name)
    const c = String(row.column_name)
    if (!actual.has(t)) actual.set(t, new Set())
    actual.get(t)!.add(c)
  }

  /*
   * Сколько колонок вообще удалось прочитать у Payload — и отказ, если
   * подозрительно мало.
   *
   * Это защита от единственного способа, которым такая проверка врёт
   * по-настоящему опасно. Устройство объекта таблицы drizzle — не то,
   * что нам обещали: колонки лежат собственными свойствами сегодня,
   * а завтра могут уехать под символы при обновлении зависимости.
   * Тогда `columnsOfTable` вернёт пустое множество для каждой таблицы,
   * сравнивать станет нечего, и проверка бодро напишет «схема сходится»,
   * не посмотрев ни одной колонки.
   *
   * Порог грубый нарочно: он ловит не «мало колонок», а «чтение
   * сломалось». Полсотни таблиц книги несут заведомо больше сотни
   * колонок, и падение до нуля не спутать с настоящим изменением схемы.
   */
  const expectedColumns = expectedNames.reduce(
    (n, t) => n + columnsOfTable(tables[t]).size,
    0,
  )

  if (expectedColumns < expectedNames.length) {
    console.error(
      `\nУ ${expectedNames.length} таблиц прочитано всего ${expectedColumns} колонок — ` +
        'меньше одной на таблицу.\nЗначит сломалось чтение схемы, а не схема: ' +
        'колонки drizzle перестали быть\nсобственными свойствами объекта таблицы. ' +
        'Проверка отказывается отвечать\n«всё сходится», не посмотрев ничего.\n',
    )
    process.exit(1)
  }

  console.log(
    `\nСхема Payload: таблиц ${expectedNames.length}, колонок ${expectedColumns}. ` +
      `В базе таблиц: ${actual.size}.\n`,
  )

  /* ---------------- Таблицы, которых нет ---------------- */

  const absentTables = expectedNames.filter((t) => !actual.has(t)).sort()

  if (absentTables.length === 0) {
    ok('все таблицы, которые ждёт Payload, есть в базе')
  } else {
    for (const t of absentTables) {
      bad(`нет таблицы «${t}»`, 'поле в коллекции есть, миграции нет')
    }
  }

  /* ---------------- Колонки, которых нет ---------------- */

  let absentColumns = 0
  for (const t of expectedNames) {
    const have = actual.get(t)
    if (!have) continue // про такую таблицу уже сказано выше

    const want = columnsOfTable(tables[t])
    const gone = [...want].filter((c) => !have.has(c)).sort()

    for (const c of gone) {
      absentColumns += 1
      bad(`нет колонки «${t}.${c}»`, 'поле в коллекции есть, миграции нет')
    }
  }

  if (absentColumns === 0) ok('все колонки, которые ждёт Payload, есть в базе')

  /* ---------------- Лишнее в базе ---------------- */

  const extraTables = [...actual.keys()]
    .filter((t) => !tables[t])
    /*
     * Служебные таблицы миграций Payload заводит сам и в `tables`
     * не показывает. Считать их лишними — значит каждый прогон
     * печатать две строки, которые ничего не значат.
     */
    .filter((t) => t !== 'payload_migrations' && !t.startsWith('drizzle'))
    .sort()

  const extraColumns: string[] = []
  for (const [t, have] of actual) {
    if (!tables[t]) continue
    const want = columnsOfTable(tables[t])
    for (const c of have) if (!want.has(c)) extraColumns.push(`${t}.${c}`)
  }

  if (extraTables.length || extraColumns.length) {
    console.log('\n  Есть в базе, но Payload не спрашивает:')
    for (const t of extraTables) console.log(`    таблица  ${t}`)
    for (const c of extraColumns.sort()) console.log(`    колонка  ${c}`)
    console.log(
      '\n    Само по себе не ломает ничего. Но означает либо поле, убранное\n' +
        '    без миграции, либо миграцию, откатанную наполовину.',
    )
  }

  /* ---------------- Итог ---------------- */

  console.log('')
  if (missing === 0) {
    console.log('Схема сходится.\n')
  } else {
    console.log(
      `Не хватает: ${missing}. Каждая строка — поле, заведённое в коллекции\n` +
        'без миграции. Локально этого не видно: `next dev` строит схему при\n' +
        'старте. На проде схема берётся из миграций, и запись сломается там,\n' +
        'где её спрашивают, — не там, где заводили поле.\n',
    )
  }

  process.exit(missing === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nНе отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
