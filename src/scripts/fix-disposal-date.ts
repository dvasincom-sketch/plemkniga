import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { poolOf } from '@/lib/sql'

/**
 * Дата выбытия переносится из записи, где она уже есть.
 *
 * ## Что это чинит и чего не чинит
 *
 * `check:disposal-date` находит животных с состоянием выбытия и пустой
 * датой; в отчёты о выбытии они не попадают. Заполнить дату машиной
 * в общем случае нельзя — её знает человек, — но у части этих животных
 * она уже записана в книге, только в другом месте: в перемещении вида
 * «выбраковка» или «падёж» либо в событии «выбытие» на ленте карточки.
 *
 * Это и есть граница. Перенести день, записанный человеком в соседней
 * таблице, — не выдумать факт, а прекратить хранить его дважды и врозь.
 * Взять `updated_at`, день миграции или сегодняшнее число — выдумать:
 * получится дата, неотличимая от настоящей и неверная. Поэтому прогон
 * трогает только первых и молчит о вторых, оставляя их
 * `check:disposal-date` и хозяйству.
 *
 * ## Почему берётся самая ранняя из найденных
 *
 * Записей о выбытии у животного может быть несколько: сначала провели
 * перемещением, через месяц переоформили событием. Поздняя описывает
 * не выбытие, а исправление бумаг о нём, и взяв её, мы сдвинули бы
 * корову на месяц вперёд — в том числе через границу годового окна
 * отчёта.
 *
 * ## Почему по умолчанию ничего не пишется
 *
 * Прогон меняет числа во всех отчётах о выбытии сразу и по всем
 * хозяйствам. Такое показывают до, а не после: без ключа он печатает,
 * что сделал бы, и выходит. Писать заставляет `--apply`.
 *
 * ## Почему пишется запросом, а не через Payload
 *
 * Правка идёт по одному полю у сотен карточек, и проход через хуки
 * означал бы пересчёт индекса, транслитерацию клички и проверку
 * родословной на каждой — при том что ни одно из этих значений
 * не меняется. Заодно журнал правок остался бы завален сотнями строк,
 * в которых утонули бы те несколько, что внёс человек. След этой работы —
 * сам прогон и его вывод.
 *
 *   npm run fix:disposal-date              # показать, ничего не менять
 *   npm run fix:disposal-date -- --apply   # записать
 *   npm run fix:disposal-date -- --org=12 --apply
 */

const orgArg = process.argv.find((a) => a.startsWith('--org='))
const ORG = orgArg ? Number(orgArg.slice('--org='.length)) : null
const APPLY = process.argv.includes('--apply')

/** Сколько строк показать: список, а не простыня. */
const SHOW = 30

const ymd = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ''))

/**
 * Дата, лежащая в другом месте книги. Та же подстановка, что
 * в `check:disposal-date`, и повторена она здесь намеренно: два прогона
 * должны отвечать об одном множестве животных, и общее определение
 * тут — не удобство, а условие того, что найденное и починенное совпадут.
 */
const NEARBY = `least(
       (select min(m."date") from movements m
         where m.animal_id = a.id and m.kind in ('cull', 'death')),
       (select min(e."date") from events e
         where e.animal_id = a.id and e.type = 'disposal')
     )`

async function main() {
  const payload = await getPayload({ config })
  const pool = poolOf(payload)

  if (!pool) {
    console.log('  ✗ прогон рассчитан на PostgreSQL-адаптер')
    process.exit(1)
  }

  const where = ORG ? 'and a.owner_id = $1' : ''
  const args = ORG ? [ORG] : []

  console.log(
    `fix:disposal-date: перенос даты из записей книги${ORG ? `, хозяйство #${ORG}` : ''}` +
      `${APPLY ? '' : ' — показ без правки'}\n`,
  )

  const found = await pool.query(
    `select a.id, a.ident_number as ident, a.state, a.owner_id as org, ${NEARBY} as at
       from animals a
      where a.state is not null and a.state <> 'alive' and a.disposal_date is null ${where}
        and ${NEARBY} is not null
      order by a.id`,
    args,
  )

  const rows = (found.rows ?? []) as {
    id: number
    ident: string
    state: string
    org: number
    at: Date
  }[]

  if (rows.length === 0) {
    console.log('  ✓ животных, у которых дата лежит рядом и не перенесена, нет')
    process.exit(0)
  }

  console.log(`Найдено: ${rows.length}\n`)
  for (const r of rows.slice(0, SHOW)) {
    console.log(
      `  · ${String(r.ident).padEnd(18)} ${String(r.state).padEnd(8)} ` +
        `хозяйство #${String(r.org).padEnd(4)} → ${ymd(r.at)}`,
    )
  }
  if (rows.length > SHOW) console.log(`  … и ещё ${rows.length - SHOW}`)

  if (!APPLY) {
    console.log(
      '\n  Ничего не изменено. Записать: npm run fix:disposal-date -- --apply' +
        '\n  После записи прогоните npm run check:disposal-date: число без даты' +
        '\n  обязано уменьшиться ровно на это же. Не уменьшилось — правка ушла не туда.',
    )
    process.exit(0)
  }

  /*
   * Одним запросом, а не строкой на животное. Дело не в скорости:
   * между отдельными правками хозяйство успевает провести выбытие,
   * и часть карточек получила бы дату, а часть — нет, причём отчёт
   * при этом показал бы промежуточное состояние как окончательное.
   *
   * Условие `disposal_date is null` повторено внутри записи намеренно:
   * между поиском и правкой могла пройти минута, за которую дату
   * проставил человек. Его значение честнее нашего переноса.
   */
  const done = await pool.query(
    `update animals a
        set disposal_date = ${NEARBY}
      where a.state is not null and a.state <> 'alive' and a.disposal_date is null ${where}
        and ${NEARBY} is not null`,
    args,
  )

  console.log(`\n  ✓ дата перенесена у ${done.rowCount ?? 0} животных`)
  console.log('    Проверьте сдвиг: npm run check:disposal-date')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
