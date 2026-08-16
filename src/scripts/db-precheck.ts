import 'dotenv/config'
import { Pool } from 'pg'
import { DOMAIN_RULES, INTEGER_COLUMNS } from '../lib/db-constraints'
import { maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Проверка данных перед миграцией ограничений.
 *
 * Зачем нужен. `ALTER TABLE ... ADD CONSTRAINT` проверяет каждую строку
 * и падает на первой неподходящей, обрывая всю миграцию. Сообщение при этом
 * называет ограничение, но не строку: «check constraint
 * "chk_animals_trust_level" of relation "animals" is violated by some row» —
 * какой именно строкой, PostgreSQL не говорит.
 *
 * Так и вышло в первый раз: в разработке все записи укладывались в диапазон,
 * на проде нашлись отклонённые (`trust_level = -1`), и узнали мы об этом
 * из упавшей миграции, а не заранее. Ограничение было исправлено, а скрипт
 * появился, чтобы вопрос «пройдут ли данные» задавался до миграции и той же
 * базе, к которой она поедет.
 *
 *   npm run db:precheck
 *
 * Скрипт ничего не меняет: только SELECT. Он читает тот же список правил,
 * из которого строятся сами ограничения, — расходиться им негде.
 *
 * Кроме диапазонов проверяются дробные значения в колонках, которые миграция
 * переводит в `integer`. Там ошибки не будет: PostgreSQL молча округлит,
 * и 2.5 попытки осеменения превратятся в 3. Молча — хуже, чем с ошибкой,
 * поэтому такие строки показываются отдельно.
 */

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

const tableExists = async (name: string) => {
  const r = await pool.query(`select to_regclass($1) as t`, [`public.${name}`])
  return r.rows[0]?.t !== null
}

/** Колонки, упомянутые в предикате: `"trust_level"` → trust_level. */
const columnsOf = (expr: string) => [...new Set(expr.match(/"([a-z_0-9]+)"/g) ?? [])].join(', ')

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  let problems = 0

  /* ---------------------- Диапазоны и знаки значений ---------------------- */

  console.log('Ограничения предметной области\n' + '─'.repeat(78))

  for (const rule of DOMAIN_RULES) {
    if (!(await tableExists(rule.table))) {
      console.log(`  ?  ${rule.name} — таблицы ${rule.table} нет, пропущено`)
      continue
    }

    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from "${rule.table}" where not (${rule.expr})`,
    )
    const n = Number(rows[0]?.n ?? 0)

    if (n === 0) {
      console.log(`  ✓  ${rule.name} — ${rule.note}`)
      continue
    }

    problems += 1
    console.log(`\n  ✗  ${rule.name} — ${rule.note}`)
    console.log(`     не проходят строк: ${n}`)

    // Показываем сами значения: без них непонятно, чинить данные или правило
    const sample = await pool.query(
      `select id, ${columnsOf(rule.expr)} from "${rule.table}"
        where not (${rule.expr}) order by id limit 5`,
    )
    for (const row of sample.rows) {
      console.log(
        '     ' +
          Object.entries(row)
            .map(([k, v]) => `${k}=${v === null ? 'null' : v}`)
            .join('  '),
      )
    }
    if (n > sample.rowCount!) console.log(`     … и ещё ${n - sample.rowCount!}`)
    console.log('')
  }

  /* ------------------------ Дробное в целых колонках ---------------------- */

  console.log('\nПеревод счётчиков в integer\n' + '─'.repeat(78))

  for (const col of INTEGER_COLUMNS) {
    if (!(await tableExists(col.table))) {
      console.log(`  ?  ${col.table}.${col.column} — таблицы нет, пропущено`)
      continue
    }

    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from "${col.table}"
        where "${col.column}" is not null
          and "${col.column}" <> round("${col.column}")`,
    )
    const n = Number(rows[0]?.n ?? 0)

    if (n === 0) {
      console.log(`  ✓  ${col.table}.${col.column} — ${col.note}, дробных нет`)
      continue
    }

    problems += 1
    console.log(`  ✗  ${col.table}.${col.column} — ${col.note}: дробных значений ${n}`)
    console.log('     PostgreSQL округлит их без предупреждения при смене типа')
    const sample = await pool.query(
      `select id, "${col.column}" as v from "${col.table}"
        where "${col.column}" is not null and "${col.column}" <> round("${col.column}")
        order by id limit 5`,
    )
    for (const row of sample.rows) console.log(`     id=${row.id}  ${col.column}=${row.v}`)
  }

  /* -------------------------------- Итог ---------------------------------- */

  console.log('')
  if (problems === 0) {
    console.log('Данные проходят все проверки — миграцию можно применять.\n')
    return
  }

  console.log(
    `Проблемных проверок: ${problems}.\n\n` +
      'Миграция на такой базе упадёт целиком: PostgreSQL проверяет ограничение\n' +
      'по всем строкам сразу. Решений два, и выбор смысловой, а не технический:\n' +
      '  — данные неверны: исправьте строки, показанные выше;\n' +
      '  — данные верны, а правило слишком узко: поправьте его\n' +
      '    в src/lib/db-constraints.ts и пересоздайте миграцию.\n',
  )
  process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
