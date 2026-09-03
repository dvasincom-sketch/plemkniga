import registry from '@/data/fgias-dairy-breeds.json'
import { BOOK_FEATURES } from '@/lib/book-features'
import { SITE_MESSAGES } from '@/lib/i18n/site-messages'
import { LOCALE_CODES } from '@/lib/i18n/locales'
import {
  ICAR_BREEDS,
  ICAR_BY_CODE,
  RU_TO_ICAR,
  STATE_LABEL,
  breedState,
  buildCatalog,
  countByState,
  type RegistryBreed,
} from '@/lib/breeds-catalog'

/**
 * Каталог пород: коды настоящие, состояния вычислены, обещаний нет.
 *
 * ## Что здесь ломается молча
 *
 * **Выдуманный код ICAR.** Мост «русское имя → трёхбуквенный код»
 * написан руками, и опечатка в нём не видна ничем: страница покажет
 * `HOL` там, где должно быть `RED`, а код уедет в международный номер
 * животного и объявит чужой стране чужую породу. Поэтому каждый код
 * моста обязан существовать в копии списка Interbull.
 *
 * **Состояние, проставленное вручную.** Его здесь нет вовсе, и проверка
 * следит, чтобы не завелось: «книга ведётся» обязано следовать
 * из действующей книги, а не из галочки, которую однажды поставили
 * и забыли снять.
 *
 * **Число на витрине, которого не из чего получить.** «Пятьдесят пять
 * пород» и «книга ведётся у одной» считаются здесь же, из тех же
 * данных, что покажет страница.
 *
 *   npm run check:breeds
 */

const fails: string[] = []
const fail = (m: string) => fails.push(m)

const rows = registry.breeds as RegistryBreed[]

/* ------------------------------------------------------------------ *
 *  Выписка реестра                                                   *
 * ------------------------------------------------------------------ */

if (rows.length === 0) fail('выписка пород реестра пуста — страница покажет ноль пород')

for (const b of rows) {
  if (!b.uuid || !b.name) fail(`в выписке строка без имени или идентификатора: ${JSON.stringify(b)}`)
}

const dupes = rows.length - new Set(rows.map((b) => b.uuid)).size
if (dupes) fail(`в выписке ${dupes} повторяющихся идентификаторов`)

console.log(`Пород в выписке реестра: ${rows.length}`)

/* ------------------------------------------------------------------ *
 *  Мост к кодам ICAR                                                 *
 * ------------------------------------------------------------------ */

/*
 * Каждый код моста обязан быть в копии списка. Опечатка здесь тихая:
 * страница покажет код, которого не существует, и первый же партнёр
 * получит животное с несуществующей породой.
 */
for (const [name, code] of Object.entries(RU_TO_ICAR)) {
  if (!ICAR_BY_CODE.has(code)) {
    fail(`«${name}» сопоставлена коду ${code}, которого нет в списке Interbull`)
  }
}

/* Имена моста берутся из выписки, а не из головы. */
const inRegistry = new Set(rows.map((b) => b.name))
for (const name of Object.keys(RU_TO_ICAR)) {
  if (!inRegistry.has(name)) {
    fail(`в мосте есть «${name}», а в выписке реестра такой породы нет — имя устарело`)
  }
}

console.log(`Список Interbull: ${ICAR_BREEDS.length} строк, кодов ${ICAR_BY_CODE.size}`)
console.log(`Мост «имя реестра → код»: ${Object.keys(RU_TO_ICAR).length}`)

/* ------------------------------------------------------------------ *
 *  Состояния                                                         *
 * ------------------------------------------------------------------ */

/*
 * Действующая книга сильнее любой готовности: порода с книгой обязана
 * получить «книга ведётся», даже если у неё нет ни одного справочного
 * ключа. Обратное означало бы, что витрина не видит того, что уже
 * работает.
 */
const withBook = breedState({
  icar: null,
  fgiasUuid: null,
  direction: 'dairy',
  bookUrl: 'https://holstein.plem.online',
})
if (withBook !== 'book') fail(`порода с действующей книгой получила состояние «${withBook}»`)

/* Без кода ICAR порода не готова: наружу она не уедет. */
if (breedState({ icar: null, fgiasUuid: 'u', direction: 'dairy', bookUrl: null }) !== 'listed') {
  fail('порода без кода ICAR объявлена готовой — в обмен она уйти не сможет')
}

/* Без идентификатора реестра — тоже: выгрузка не примется. */
if (breedState({ icar: 'HOL', fgiasUuid: null, direction: 'dairy', bookUrl: null }) !== 'listed') {
  fail('порода без идентификатора реестра объявлена готовой — выгрузка не примется')
}

/* Мясная порода не «готова к ведению», сколько бы ключей у неё ни было. */
if (breedState({ icar: 'AAN', fgiasUuid: 'u', direction: 'beef', bookUrl: null }) !== 'listed') {
  fail('мясная порода объявлена готовой — молочных признаков и порогов у нас нет')
}

/* ------------------------------------------------------------------ *
 *  Каталог целиком                                                   *
 * ------------------------------------------------------------------ */

/*
 * Сборка без нашей базы и без книг: так каталог выглядит у того,
 * кто развернул систему с нуля. Это нижняя граница — всё, что
 * добавляет живая база, только улучшает картину.
 */
const bare = buildCatalog(rows, [], {})
const bareCount = countByState(bare)

if (bare.length !== rows.length) fail(`каталог собрал ${bare.length} строк из ${rows.length}`)
if (bareCount.book !== 0) fail('на пустой базе нашлась ведущаяся книга — состояние не вычисляется')

/*
 * С голштинской книгой ведущейся обязана стать **ровно одна** порода.
 *
 * Первая редакция связывала книгу с кодом ICAR, и этот прогон сразу
 * показал беду: под `HOL` в реестре стоят три породы, и все три
 * объявились ведущимися. Одна книга обещала себя за три породы —
 * на витрине это выглядело бы как три работающих книги вместо одной.
 */
const withHolstein = buildCatalog(rows, [], { Голштинская: 'https://holstein.plem.online' })
const holsteinCount = countByState(withHolstein)

if (holsteinCount.book === 0) {
  fail('голштинская книга есть, а в каталоге ни одной ведущейся — имя породы не совпало')
}
if (holsteinCount.book > 1) {
  fail(
    `одна книга объявила себя за ${holsteinCount.book} пород: ` +
      withHolstein
        .filter((r) => r.state === 'book')
        .map((r) => r.name)
        .join(', '),
  )
}

const named = withHolstein.filter((r) => r.state === 'book').map((r) => r.name)
console.log(`С кодом ICAR: ${bare.filter((r) => r.icar).length} из ${bare.length}`)
console.log(`Состояния на живой книге: ${STATE_LABEL.book} — ${named.join(', ') || '—'}`)
console.log(
  `Готово к ведению: ${holsteinCount.ready}, в справочнике: ${holsteinCount.listed}`,
)

/* ------------------------------------------------------------------ *
 *  Разделы книги: подпись и страница ходят парой                     *
 * ------------------------------------------------------------------ */

/*
 * Перечень на витрине и разборы разделов — два списка, идущие в паре
 * по порядку. Разъехавшись, они дают худшее: подпись «Родословная»
 * ведёт на страницу про документы, и заметит это не разработчик,
 * а посетитель.
 */
for (const code of LOCALE_CODES) {
  const items = SITE_MESSAGES[code].inside.items
  if (items.length !== BOOK_FEATURES.length) {
    fails.push(
      `у языка «${code}» ${items.length} подписей разделов, а разборов ${BOOK_FEATURES.length} — ` +
        'подпись поведёт не на свою страницу',
    )
  }
}

const slugs = new Set(BOOK_FEATURES.map((f) => f.slug))
if (slugs.size !== BOOK_FEATURES.length) fails.push('у разделов книги повторяются адреса')

for (const f of BOOK_FEATURES) {
  if (!f.limits.length) {
    fails.push(`у раздела «${f.title}» не названы пределы — он читается как реклама`)
  }
  if (!f.body.length) fails.push(`у раздела «${f.title}» нет разбора`)
}

console.log(`Разделов книги: ${BOOK_FEATURES.length}, у каждого названы пределы`)

/* ------------------------------------------------------------------ */

if (fails.length) {
  console.log('')
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\n  ✓ каталог пород собирается из справочников, а не из обещаний')
process.exit(0)
