import 'dotenv/config'
import { Pool } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { BLOOD_TOLERANCE } from '../lib/checks-registry'

/**
 * Кровность синтетики — привести к родительской.
 *
 * ## Что чинится
 *
 * `seed:bulk` разыгрывал кровность каждому животному независимо:
 * `gauss(93, 8)` быку, матери и дочери порознь. Кровность же — величина
 * не случайная, она следует из родительских: потомок получает половину
 * от каждого. Правило `blood-vs-parents` сверяет ровно это и находило
 * расхождение у каждой четырнадцатой записи книги — 7,3 % на ревизии.
 *
 * Находка была настоящей: врал сид, а не проверка. Но пользы от прогона,
 * в котором заведомо семь процентов находок, нет никакой — настоящее
 * расхождение в них утонет. Тот же довод, что был у инбридинга
 * (решение о `seed:bulk`, 78 % на `inbreeding-mismatch`).
 *
 * Сам сид починен: дочери получают полусумму родительских. Этот скрипт
 * существует ради уже залитых данных — чтобы не пересобирать триста
 * тысяч записей ради одной колонки.
 *
 * ## Почему только синтетика
 *
 * Условие `ident_number like '99%'` — не оптимизация, а граница.
 * Расхождение кровности у настоящей записи означает одно из двух:
 * ошибку в кровности либо не того родителя в связи. И то и другое —
 * находка для эксперта и повод для разговора с хозяйством. Переписать
 * её «как правильно» значит стереть след ошибки вместе с ошибкой,
 * причём молча.
 *
 * Синтетику переписывать можно: она наша, и её значения не означают
 * ничего, кроме нагрузки.
 *
 * ## Чего скрипт не делает
 *
 * Не заводит примеров расхождения. Проверка без единого примера
 * не проверена — но заводить их должен сид, а не уборка: скрипт
 * с именем «привести к правильному» не имеет права портить данные,
 * даже намеренно и даже с комментарием.
 *
 *   npm run repair:blood -- --dry     посчитать, ничего не меняя
 *   npm run repair:blood -- --yes     выполнить
 */

const dry = process.argv.includes('--dry')
const confirmed = process.argv.includes('--yes')

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

/*
 * Условие расхождения списано с `blood-vs-parents` дословно, включая
 * порог. Разойдись они — скрипт правил бы записи, которых правило
 * не считает ошибочными, и наоборот.
 */
const WHERE = `
      a.ident_number like '99%'
  and a.father_id is not null
  and a.mother_id is not null
  and f.blood_percent is not null
  and m.blood_percent is not null
  and a.blood_percent is not null
  and abs(a.blood_percent - (f.blood_percent + m.blood_percent) / 2) > ${BLOOD_TOLERANCE.note}
`

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})`)

  const pool = new Pool({ connectionString: driverUri, ssl: sslConfig, max: 2 })
  const client = await pool.connect()

  try {
    const { rows } = await client.query(
      `select count(*)::int as n
         from animals a
         join animals f on f.id = a.father_id
         join animals m on m.id = a.mother_id
        where ${WHERE}`,
    )
    const n = Number(rows[0]?.n ?? 0)

    console.log(`\nЗаписей синтетики с расхождением больше ${BLOOD_TOLERANCE.note} п. п.: ${n}\n`)

    if (!n) {
      console.log('Править нечего.\n')
      return
    }

    if (dry) {
      console.log('Пробный прогон: ничего не изменено. Чтобы выполнить, повторите с --yes.\n')
      return
    }

    if (!confirmed) {
      console.log('Чтобы выполнить, добавьте --yes. Проверьте базу в первой строке.\n')
      process.exitCode = 1
      return
    }

    const res = await client.query(
      `update animals a
          set blood_percent = round(((f.blood_percent + m.blood_percent) / 2)::numeric, 1)
         from animals f, animals m
        where a.father_id = f.id
          and a.mother_id = m.id
          and ${WHERE}`,
    )

    console.log(`Приведено к родительской: ${res.rowCount ?? 0}\n`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error('\nНе отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
