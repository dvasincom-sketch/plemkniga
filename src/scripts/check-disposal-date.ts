import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { poolOf } from '@/lib/sql'
import { culledYear, liveFemale, notArchived } from '@/lib/sql-herd'

/**
 * Выбытие без даты выбытия: сколько его и во что оно обходится отчёту.
 *
 * ## Что случилось
 *
 * Все отчёты о выбытии считают по `disposal_date`, а не по состоянию,
 * и это правильно: состояние отвечает на вопрос «где животное сейчас»,
 * а отчёт спрашивает «когда мы его потеряли». Беда в том, что дату
 * ставили не все дороги ввода. Перемещение ставит, событие ленты ставит,
 * а поле «Состояние» в карточке — обычный список, и человек, поставивший
 * «Выбраковано» руками, ничего больше заполнить не обязан. Загрузка
 * файлом колонки для даты не имела вовсе.
 *
 * Такое животное уходит из знаменателя (оно больше не «в стаде»)
 * и не попадает в числитель (даты нет). Доля выбытия занижается дважды,
 * и заметить это было нечем: ошибки не возникало нигде.
 *
 * ## Почему прогон, а не только правило проверки
 *
 * Правило `disposal-date-missing` говорит хозяйству про его животное.
 * Здесь нужен другой ответ — на сколько врал отчёт, — и он считается
 * только сравнением двух долей: нынешней и той, что вышла бы, будь дата
 * у всех, у кого есть состояние выбытия. Разница и есть цена дыры.
 *
 * Числа, не сдвинувшиеся после починки, означают, что починка ушла
 * не туда. Этот прогон и есть измеритель сдвига: до правки он показывает
 * расхождение, после заполнения дат — ноль, и ноль этот заработанный,
 * а не объявленный.
 *
 * ## Чего он не делает
 *
 * Не проставляет даты. Дату выбытия знает человек, а не запрос: взять
 * `updated_at` или день миграции значило бы записать в книгу выдуманный
 * факт, неотличимый от настоящего. Прогон называет животных поимённо,
 * а заполняет их хозяйство — по карточке или загрузкой.
 *
 *   npm run check:disposal-date
 *   npm run check:disposal-date -- --org=12
 */

const orgArg = process.argv.find((a) => a.startsWith('--org='))
const ORG = orgArg ? Number(orgArg.slice('--org='.length)) : null

/** Сколько животных показать поимённо: список, а не простыня. */
const SHOW = 20

const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')} %`

async function main() {
  const payload = await getPayload({ config })
  const pool = poolOf(payload)

  if (!pool) {
    console.log('  ✗ прогон рассчитан на PostgreSQL-адаптер')
    process.exit(1)
  }

  const where = ORG ? 'and a.owner_id = $1' : ''
  const args = ORG ? [ORG] : []

  console.log(`check:disposal-date: выбытие без даты${ORG ? `, хозяйство #${ORG}` : ''}\n`)

  /*
   * Один запрос вместо четырёх. Считать это раздельно значило бы дать
   * четыре числа из четырёх снимков базы: между запросами хозяйство
   * успевает провести выбытие, и доли перестанут сходиться друг с другом
   * ровно настолько, насколько незаметно.
   */
  const res = await pool.query(
    `select
       count(*) filter (where ${notArchived('a')} and ${liveFemale('a')})::int                       as live,
       count(*) filter (where ${culledYear('a')})::int                                              as counted,
       count(*) filter (where a.state is not null and a.state <> 'alive'
                          and a.disposal_date is null)::int                                         as dateless,
       count(*) filter (where a.state is not null and a.state <> 'alive'
                          and a.disposal_date is null and a.archived is true)::int                  as dateless_archived
     from animals a
     where true ${where}`,
    args,
  )

  const row = (res.rows?.[0] ?? null) as {
    live: number
    counted: number
    dateless: number
    dateless_archived: number
  } | null

  /*
   * Пустой ответ на запрос со счётчиками означает не «ничего не нашлось»,
   * а что запрос не выполнился так, как мы думаем. Подставить сюда нули
   * значило бы напечатать зелёное «дыры нет» ровно там, где не посчитано
   * ничего, — та же беда, что была у обхода витрины и у разброса признаков.
   */
  if (!row) {
    console.log('  ✗ запрос не вернул ни строки: считать нечего, и это не зелёный ответ')
    process.exit(1)
  }

  const now = row.counted + row.live > 0 ? row.counted / (row.counted + row.live) : 0

  /*
   * Верхняя оценка, а не исправленное число.
   *
   * Она считает так, будто все выбывшие без даты выбыли за последние
   * двенадцать месяцев, — а часть из них выбыла раньше и в годовой отчёт
   * не попала бы всё равно. Настоящая доля лежит между двумя числами,
   * и назвать её точнее нельзя ровно потому, что дат нет. Поэтому число
   * подписано «не более чем», а не «на самом деле»: обещать точность
   * там, где её взять неоткуда, — та же беда, что мы и чиним.
   */
  const upper =
    row.counted + row.dateless + row.live > 0
      ? (row.counted + row.dateless) / (row.counted + row.dateless + row.live)
      : 0

  console.log(`Живых самок в стаде:                     ${row.live}`)
  console.log(`Выбыло за год (с датой, попадает в отчёт): ${row.counted}`)
  console.log(`Выбыло, но даты нет:                      ${row.dateless}`)
  console.log(`  из них уже в архиве:                    ${row.dateless_archived}`)
  console.log('')
  console.log(`Доля выбытия, как её показывает отчёт:    ${pct(now)}`)
  console.log(`Доля выбытия, если бы даты были:      не более ${pct(upper)}`)

  if (row.dateless === 0) {
    console.log('\n  ✓ животных с выбытием и без даты выбытия нет: отчёт считает по всем')
    process.exit(0)
  }

  const list = await pool.query(
    `select a.ident_number as ident, a.state, a.owner_id as org, a.archived
       from animals a
      where a.state is not null and a.state <> 'alive' and a.disposal_date is null ${where}
      order by a.id
      limit ${SHOW}`,
    args,
  )

  console.log(`\nПервые ${Math.min(SHOW, row.dateless)}:`)
  for (const a of list.rows as { ident: string; state: string; org: number; archived: boolean }[]) {
    console.log(
      `  · ${String(a.ident).padEnd(18)} ${String(a.state).padEnd(8)} ` +
        `хозяйство #${a.org}${a.archived ? '  в архиве' : ''}`,
    )
  }
  if (row.dateless > SHOW) console.log(`  … и ещё ${row.dateless - SHOW}`)

  /*
   * Красный ответ, но без спешки в тексте. Это не поломка кода —
   * заполнять даты будет хозяйство, и часть из них придётся поднимать
   * из бумажных актов. Прогон говорит, что именно и на сколько врёт,
   * и оставляет решение о сроке человеку.
   */
  console.log(
    '\n  ✗ дата выбытия не проставлена у ' +
      `${row.dateless} животных: в отчёты о выбытии они не попадают.` +
      '\n    Заполняется в карточке или колонкой «Дата выбытия» в загрузке;' +
      '\n    новые записи без даты книга больше не принимает (кроме загрузки истории).',
  )
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
