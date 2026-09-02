import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { poolOf } from '@/lib/sql'
import { buildAiid } from '@/lib/aiid'

/**
 * Коды пород — на живой базе.
 *
 * ## Что это меняет
 *
 * Трёхбуквенный код породы — HOL, JER, AYR — ведёт Interbull, и он один
 * и тот же у WHFF и у ICAR. В книге он лежит в справочнике пород под
 * именем `whffCode`.
 *
 * От него зависят две вещи разом. Первая: порода уезжает в обмен по ADE
 * полем `primaryBreed` — парой «схема + код», и без кода поле просто
 * не отправляется. Вторая: девятнадцатисимвольный международный номер
 * животного начинается с кода породы, и без него собирается только
 * шестнадцатисимвольный.
 *
 * ## Почему прогон, а не правка
 *
 * Заполнить коды может только человек, знающий породы. Подставить их
 * сопоставлением по названию — верный способ приписать «чёрно-пёстрой»
 * чужой код: в справочнике Interbull своей строки у неё может не быть
 * вовсе, а похожая найдётся всегда.
 *
 * Поэтому здесь отчёт, а не заполнение. Прогон говорит, у скольких пород
 * кода нет и сколько животных это затрагивает; вписать код — минута
 * в справочнике, и делает это тот, кто отвечает за породу.
 *
 * ## Что здесь ломается молча
 *
 * **Код неверной формы.** `Голштинская`, `HOL `, `hol`, `H` — всё это
 * пройдёт в текстовое поле и всё это сломает и обмен, и номер. При
 * отправке код приводится к верхнему регистру и обрезается по краям,
 * но двухбуквенный или русский не спасти ничем.
 *
 * **Порода без кода у большого стада.** Одна незаполненная строка
 * справочника означает, что тысяча животных уезжает без породы. Число
 * затронутых животных поэтому важнее числа пород.
 *
 *   npm run check:breed-codes
 */

async function main() {
  const payload = await getPayload({ config })
  const pool = poolOf(payload)

  if (!pool) {
    console.log('  ✗ прогон рассчитан на PostgreSQL-адаптер')
    process.exit(1)
  }

  const fails: string[] = []

  /*
   * Одним запросом: порода, её код и сколько живых записей на неё
   * ссылается. Архивные не считаются — они не уезжают в обмен,
   * и раздувать ими число затронутых значило бы напугать зря.
   */
  const res = await pool.query(`
    select b.id,
           b.name,
           b.whff_code,
           count(a.id) filter (where a.archived is not true)::int as animals
      from breeds b
      left join animals a on a.breed_id = b.id
     group by b.id, b.name, b.whff_code
     order by animals desc, b.name
  `)

  type Row = { id: number; name: string; whff_code: string | null; animals: number }
  const rows = (res.rows ?? []) as unknown as Row[]

  if (!rows.length) {
    console.log('  ✗ в справочнике нет ни одной породы')
    process.exit(1)
  }

  const withCode = rows.filter((r) => r.whff_code?.trim())
  const without = rows.filter((r) => !r.whff_code?.trim() && r.animals > 0)

  /* Форма кода: две-три заглавные латинские буквы, без пробелов внутри. */
  const malformed = withCode.filter((r) => !/^[A-Z]{2,3}$/.test(r.whff_code!.trim().toUpperCase()))

  const covered = withCode.reduce((n, r) => n + r.animals, 0)
  const uncovered = without.reduce((n, r) => n + r.animals, 0)
  const total = covered + uncovered

  console.log(`Пород в справочнике: ${rows.length}, из них с кодом: ${withCode.length}`)
  console.log(
    `Животных в работе: ${total}, с кодом породы: ${covered}` +
      (total ? ` (${Math.round((covered / total) * 100)} %)` : ''),
  )

  if (without.length) {
    console.log('\n  Породы без кода — по убыванию поголовья:')
    for (const r of without.slice(0, 20)) {
      console.log(`    ${String(r.animals).padStart(6)}  ${r.name}`)
    }
    if (without.length > 20) console.log(`    … и ещё ${without.length - 20}`)
  }

  for (const r of malformed) {
    fails.push(
      `порода «${r.name}»: код «${r.whff_code}» не из двух-трёх заглавных латинских букв — ` +
        `ни в обмен, ни в международный номер он не пройдёт`,
    )
  }

  /*
   * Проверка не по вере, а по сборке: берём код каждой породы и пробуем
   * собрать с ним настоящий девятнадцатисимвольный номер. Если сборка
   * отказала — код негоден, как бы он ни выглядел на глаз.
   */
  for (const r of withCode) {
    const built = buildAiid({
      breedCode: r.whff_code!.trim().toUpperCase(),
      country: 'RUS',
      sex: 'female',
      number: '1',
    })
    if (!built) {
      fails.push(`порода «${r.name}»: с кодом «${r.whff_code}» международный номер не собирается`)
    }
  }

  /*
   * Незаполненный код — не ошибка прогона. Это работа человека, и прогон
   * о ней сообщает, а не валит сборку: иначе первый же новый вид скота
   * в справочнике останавливал бы выкладку.
   */
  if (uncovered > 0) {
    console.log(
      `\n  ! ${uncovered} животных уедут в обмен без породы и получат только ` +
        `шестнадцатисимвольный номер вместо девятнадцати.`,
    )
    console.log('    Код вписывается в справочнике пород, поле «Код породы (WHFF / ICAR)».')
    console.log('    Справочник кодов: https://interbull.org/ib/icarbreedcodes')
  }

  if (fails.length) {
    console.log('')
    for (const f of fails) console.log(`  ✗ ${f}`)
    process.exit(1)
  }

  console.log(
    uncovered > 0
      ? '\n  ✓ все заполненные коды годны; незаполненные перечислены выше'
      : '\n  ✓ у всех пород с поголовьем есть годный код',
  )
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
