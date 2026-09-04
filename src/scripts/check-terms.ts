import { NOTES } from '@/lib/notes'
import { BOOK_FEATURES } from '@/lib/book-features'
import { BREED_PAGES } from '@/lib/breed-pages'
import { STUDIES } from '@/lib/studies'
import { TERMS, TERM_GROUPS, TERM_PAGES, termsIn } from '@/lib/terms'

/**
 * Словарь не обещает больше, чем в нём есть.
 *
 * ## Что здесь ловится
 *
 * **Ссылка в пустоту.** «Читать дальше» ведёт на разбор, раздел книги
 * или соседний термин — и любой из этих адресов может не существовать.
 * На странице такая ссылка выглядит рабочей: она подчёркнута и по ней
 * можно нажать. Узнаёт о ней только читатель, и узнаёт «страницей
 * не найдено» — то есть в тот момент, когда мы обещали ему ответ.
 *
 * При наполнении словаря таких ссылок оказалось десять сразу, и все
 * одного вида: путь к термину, у которого статьи нет. Сам адрес теперь
 * считается (`termHref` в `lib/terms.ts`), но слаг в нём всё ещё пишут
 * руками, и опечатка в слаге даёт ту же беду.
 *
 * **Тонкая статья.** Определение на сто слов не находится поиском
 * и тянет вниз соседние страницы домена. Такому термину место строкой
 * на указателе, и проверка об этом говорит, а не додумывает: перенести
 * или дописать — решение автора.
 *
 * **Определение, не помещающееся в строку.** `short` уезжает
 * и в указатель, и в описание страницы для выдачи. То, что не влезло,
 * читатель не увидит ни там, ни там, — значит и писать это туда незачем.
 *
 * **Статья без одной из трёх частей.** Тип требует все три, но пустой
 * массив типу не противоречит, а статья без «чего это не означает»
 * превращается в рекламный буклет — ровно то, ради избавления от чего
 * жанр и заведён.
 *
 * **Опечатка в списке слов страницы.** Разбор, исследование и страница
 * породы перечисляют термины, которые в них употреблены, и из этих
 * списков считается обратное направление — «где это работает» на статье
 * словаря. Слаг с опечаткой `termsOf` просто не показывает: страница
 * открывается, блок выглядит целым, и связь исчезает, не сказав ни слова.
 * Заметить такое глазами нельзя ни с одной из двух сторон, потому что
 * с одной пропажа не видна, а с другой её нечем ждать.
 *
 * ## Что здесь считается, а не ловится
 *
 * Сколько терминов со статьёй не упомянуты нигде. Это не ошибка: статья
 * пишется потому, что слово требует объяснения, а не потому, что на неё
 * кто-то сослался. Но страница, на которую не ведёт ничего изнутри,
 * обходится последней и читателем, и поиском, — поэтому список печатается,
 * а прогон от него не падает.
 *
 *   npm run check:terms
 */

let failures = 0
const fail = (text: string) => {
  failures += 1
  console.log(`  ✗ ${text}`)
}

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length

/** Сколько слов должно быть в статье, чтобы у неё был свой адрес. */
const MIN_ARTICLE_WORDS = 250

/** Сколько знаков выдача показывает под заголовком. */
const MAX_SHORT = 200

const noteSlugs = new Set(NOTES.map((n) => n.slug))
const featureSlugs = new Set(BOOK_FEATURES.map((f) => f.slug))
const breedSlugs = new Set(BREED_PAGES.map((b) => b.slug))
const termSlugs = new Set(TERMS.map((t) => t.slug))

/* ----------------------------- 1. Сами слова ------------------------------ */

const seen = new Set<string>()

for (const t of TERMS) {
  if (seen.has(t.slug)) fail(`${t.slug} — слаг повторяется`)
  seen.add(t.slug)

  if (!/^[a-z0-9-]+$/.test(t.slug)) fail(`${t.slug} — в слаге не только строчная латиница`)
  if (t.title.trim() === '') fail(`${t.slug} — пустой заголовок`)

  if (t.short.trim() === '') fail(`${t.slug} — нет определения строкой`)
  else if (t.short.length > MAX_SHORT) {
    fail(`${t.slug} — определение ${t.short.length} знаков, выдача покажет ${MAX_SHORT}`)
  }

  if (!t.body) continue

  const { what, how, not } = t.body
  if (what.length === 0) fail(`${t.slug} — нет части «что это»`)
  if (how.length === 0) fail(`${t.slug} — нет части «как это считает книга»`)
  if (not.length === 0) fail(`${t.slug} — нет части «чего это не означает»`)

  const size = [...what, ...how, ...not].reduce((n, p) => n + words(p), 0)
  if (size < MIN_ARTICLE_WORDS) {
    fail(`${t.slug} — статья ${size} слов: тонкой странице место строкой в указателе`)
  }
}

console.log(`Терминов: ${TERMS.length}, из них со статьёй: ${TERM_PAGES.length}`)

/* ------------------------- 2. Ссылки «читать дальше» ---------------------- */

let links = 0

for (const t of TERMS) {
  for (const s of t.see ?? []) {
    links += 1
    const href = s.href

    /*
       Адрес термина проверяется по слагу, а не по пути: путь к термину
       без статьи считается на месте показа, и здесь важно одно —
       существует ли вообще термин с таким слагом.
    */
    if (href.startsWith('/ru/slovar/')) {
      const slug = href.slice('/ru/slovar/'.length)
      if (!termSlugs.has(slug)) fail(`${t.slug} → нет термина «${slug}»`)
      continue
    }

    if (href.startsWith('/ru/razbory/')) {
      const slug = href.slice('/ru/razbory/'.length)
      if (!noteSlugs.has(slug)) fail(`${t.slug} → нет разбора «${slug}»`)
      continue
    }

    if (href.startsWith('/ru/book/')) {
      const slug = href.slice('/ru/book/'.length)
      if (!featureSlugs.has(slug)) fail(`${t.slug} → нет раздела книги «${slug}»`)
      continue
    }

    if (href.startsWith('/ru/breeds/')) {
      const slug = href.slice('/ru/breeds/'.length)
      if (!breedSlugs.has(slug)) fail(`${t.slug} → нет страницы породы «${slug}»`)
      continue
    }

    if (!href.startsWith('/')) fail(`${t.slug} → внешний адрес в «читать дальше»: ${href}`)
  }

  for (const src of t.sources ?? []) {
    if (src.title.trim() === '') fail(`${t.slug} — источник без названия`)
    if (src.url && !/^https?:\/\//.test(src.url)) {
      fail(`${t.slug} — адрес источника не абсолютный: ${src.url}`)
    }
  }
}

console.log(`Ссылок «читать дальше»: ${links}`)

/* ---------------------------- 3. Группы ----------------------------------- */

for (const g of TERM_GROUPS) {
  const n = termsIn(g.key).length
  if (n === 0) fail(`группа «${g.title}» пуста — на указателе её не будет вовсе`)
  else console.log(`  · ${g.title}: ${n}`)
}

/* ------------------------ 4. Слова страниц -------------------------------- */

/*
   Все три раздела проверяются одним проходом: правило у них общее,
   а разное только то, как называть страницу в сообщении об ошибке.
*/
const uses: { kind: string; page: string; terms: string[] }[] = [
  ...NOTES.map((n) => ({ kind: 'разбор', page: n.slug, terms: n.terms ?? [] })),
  ...STUDIES.map((s) => ({ kind: 'исследование', page: s.slug, terms: s.terms ?? [] })),
  ...BREED_PAGES.map((b) => ({ kind: 'порода', page: b.slug, terms: b.terms ?? [] })),
]

const mentioned = new Set<string>()
let declared = 0

for (const u of uses) {
  const own = new Set<string>()

  for (const slug of u.terms) {
    declared += 1

    if (!termSlugs.has(slug)) fail(`${u.kind} «${u.page}» → нет термина «${slug}»`)
    else mentioned.add(slug)

    if (own.has(slug)) fail(`${u.kind} «${u.page}» — термин «${slug}» назван дважды`)
    own.add(slug)
  }
}

console.log(`Слов на страницах: ${declared}, разных терминов упомянуто: ${mentioned.size}`)

/*
   Печатается по названию, а не по слагу: список читают глазами и решают,
   дописать ли слово в подходящий разбор, — а решать это удобнее над теми
   словами, какими термин назван на указателе.
*/
const orphans = TERM_PAGES.filter((t) => !mentioned.has(t.slug))

if (orphans.length > 0) {
  console.log(`\nСтатей, на которые не ведёт ни одна страница: ${orphans.length}`)
  for (const t of orphans) console.log(`  · ${t.title} (${t.slug})`)
}

console.log(
  failures === 0
    ? '\n  ✓ словарь ни на что не ссылается в пустоту'
    : `\n  ✗ мест, где словарь обещает лишнее: ${failures}`,
)
process.exit(failures === 0 ? 0 : 1)
