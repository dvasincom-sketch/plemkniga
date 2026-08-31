import { birthCountIssue, birthTypeOf, isCalvingEvent } from '@/lib/calving'

/**
 * Приплод, записанный тремя способами, — на выдуманных отёлах.
 *
 * ## Почему не на живой базе
 *
 * Проверка «Приплод не сходится сам с собой» ищет редкое: запись,
 * в которой тип рождения, числа и карточки телят спорят. На живой базе
 * таких сегодня почти нет, и прогон по ней сказал бы «сработала ноль
 * раз» — а это одинаково означает и «правило работает», и «правило
 * не работает». Различить их можно только записью, про которую заранее
 * известно, что она неверна.
 *
 * Стенд `seed:flaws` такую запись сажает, но он требует базы и трогает
 * данные. Здесь то же самое без базы вовсе: функция чистая, и утверждать
 * о ней можно прямо.
 *
 * ## Почему отдельным скриптом
 *
 * `check:all` зовёт то, что ходит в базу. Этот прогон не ходит никуда
 * и потому годится в любой момент — в том числе до того, как база
 * поднята.
 *
 *   npm run check:calving
 */

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ------------------------------------------------------------------ */

console.log('\nТип события: отёл, аборт, запуск\n')

check(isCalvingEvent('calving'), 'отёл считается отёлом')
check(!isCalvingEvent('abortion'), 'аборт отёлом не считается')
check(!isCalvingEvent('dryOff'), 'запуск отёлом не считается')

/*
 * Пустой тип — старый отёл, а не неизвестность: до появления типа
 * других записей в книге не было, а миграция проставила «Аборт» ровно
 * тем, у кого он стоял в результате.
 */
check(isCalvingEvent(null), 'пустой тип читается как отёл')
check(isCalvingEvent(undefined), 'и отсутствующий тоже')

console.log('\nТип рождения из чисел\n')

check(birthTypeOf({ liveHeifers: 1 }) === 'one', 'один плод — «Один»')
check(birthTypeOf({ liveBulls: 1, stillborn: 1 }) === 'twins', 'живой и мёртвый — «Двойня»')
check(birthTypeOf({ liveHeifers: 2, liveBulls: 1 }) === 'triplets', 'трое — «Тройня»')
check(birthTypeOf({ liveHeifers: 4 }) === 'multiple', 'четверо — «Множественные роды»')
check(birthTypeOf({}) === undefined, 'без чисел тип не выдумывается')
check(
  birthTypeOf({ liveHeifers: 0, liveBulls: 0, stillborn: 0 }) === undefined,
  'три нуля тоже не дают типа',
)

console.log('\nПриплод против самого себя\n')

const ok = (
  result: string | null,
  counts: Parameters<typeof birthCountIssue>[1],
  calves: number | null,
  what: string,
) => check(birthCountIssue(result, counts, calves) === null, what, String(birthCountIssue(result, counts, calves)))

const bad = (
  result: string | null,
  counts: Parameters<typeof birthCountIssue>[1],
  calves: number | null,
  what: string,
  expect: string,
) => {
  const got = birthCountIssue(result, counts, calves)
  check(got !== null && got.includes(expect), what, got === null ? 'молчит' : got)
}

/* --- Согласие --- */

ok('one', { liveHeifers: 1, liveBulls: 0, stillborn: 0 }, 1, 'один плод, одна тёлочка, одна карточка')
ok('twins', { liveHeifers: 1, liveBulls: 1, stillborn: 0 }, 2, 'двойня, два живых, две карточки')
ok('twins', { liveHeifers: 1, liveBulls: 0, stillborn: 1 }, 1, 'двойня, один живой и один мёртвый — одна карточка')

/*
 * Мертворождённым карточку не заводят — ради этого числа и заведены
 * отдельно. Карточек ноль при одном мертворождённом — не расхождение.
 */
ok('one', { liveHeifers: 0, liveBulls: 0, stillborn: 1 }, 0, 'мертворождённый без карточки — не расхождение')

/* --- Тип против чисел --- */

bad(
  'twins',
  { liveHeifers: 1, liveBulls: 0, stillborn: 0 },
  null,
  'двойня при одном плоде в числах',
  'двойня',
)
bad(
  'one',
  { liveHeifers: 1, liveBulls: 1, stillborn: 0 },
  null,
  'один при двух плодах в числах',
  'один',
)

/* --- Тип против карточек, когда чисел нет --- */

bad('twins', {}, 1, 'двойня, а карточка одна', 'связано 1')
bad('triplets', {}, 2, 'тройня, а карточки две', 'связано 2')
ok('multiple', {}, 5, 'множественные роды точного числа не обещают')

/* --- Числа против карточек --- */

bad(
  'twins',
  { liveHeifers: 1, liveBulls: 1, stillborn: 0 },
  1,
  'два живых, а карточка одна',
  'живых по числам 2',
)

/*
 * При заполненных числах карточки сравниваются с ними, а не с типом:
 * числа говорят о живых прямо, а тип — обо всех плодах вместе.
 */
ok('twins', { liveHeifers: 1, liveBulls: 0, stillborn: 1 }, 1, 'карточка сверяется с живыми, а не с типом')

/* --- Что ни с чем не спорит --- */

/*
 * «Не определено» и «Смешанного типа» гасят сравнение с типом — и только
 * его. Числа с карточками они сверять не мешают: тип, который ничего
 * не утверждает, не отменяет того, что утверждают числа.
 *
 * Первая редакция этих утверждений требовала полного молчания и падала.
 * Падала верно: в ней стояла двойня по числам при одной карточке, и код
 * назвал это несогласием, потому что это оно и есть.
 */
ok('unknown', { liveHeifers: 1, liveBulls: 1 }, 2, '«Не определено» не спорит с числами')
ok(
  'multipleMixed',
  { liveHeifers: 1, liveBulls: 1 },
  2,
  '«Смешанного типа» тоже: границы его реестр не поясняет',
)
bad(
  'unknown',
  { liveHeifers: 1, liveBulls: 1 },
  1,
  'но карточки с числами сверяются и при «Не определено»',
  'живых по числам 2',
)
ok(null, { liveHeifers: 1, liveBulls: 1 }, 2, 'без типа сравнивать не с чем')
ok('twins', {}, 0, 'пустой приплод не сравнивается: телят часто не заводят')
ok('twins', {}, null, 'и когда карточки не смотрим — тоже')

/* --- Одна находка на запись --- */

/*
 * Запись, где спорит всё сразу, даёт одно замечание, а не три: эксперт
 * прочтёт первое и перестанет читать остальные.
 */
const many = birthCountIssue('twins', { liveHeifers: 1, liveBulls: 0, stillborn: 0 }, 3)
check(typeof many === 'string' && !many.includes(';'), 'на запись приходится одно несогласие', String(many))

console.log('')
if (failures) {
  console.log(`Не сошлось: ${failures}\n`)
  process.exit(1)
}
console.log('Всё сошлось.\n')
