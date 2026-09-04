import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Метатеги постранично: у кого есть, у кого нет и чего именно не хватает.
 *
 * ## Зачем прогон, а не разовый обход глазами
 *
 * Метатеги — работа, которую делают один раз и забывают навсегда.
 * Страница, добавленная через месяц, выходит без описания, и никто этого
 * не замечает: она открывается, выглядит правильно и просто хуже
 * находится. Из тридцати пяти страниц описание однажды стояло у пяти —
 * это не небрежность автора, это то, что происходит с повторяющейся
 * работой без прогона.
 *
 * ## Что считается «есть»
 *
 * Три вещи, и они разного веса.
 *
 * **Заголовок** нужен всем без исключения, включая закрытые страницы
 * кабинета: он стоит во вкладке браузера и в закладках.
 *
 * **Описание** нужно тем, кого показывает поиск. У закрытой страницы
 * описания может не быть — её никто не ищет.
 *
 * **Указание основной страницы** (`canonical`) нужно там, где у страницы
 * есть языковые копии или несколько адресов. Его отсутствие не видно
 * вовсе: страница работает, а поисковая система сама решает, какая
 * из шести языковых копий главная, и решает обычно неудачно.
 *
 * ## Почему помощники засчитываются
 *
 * `siteMetadata` и `pageMetadata` из `lib/seo.ts` выдают все три поля
 * сразу — на то они и заведены. Страница, зовущая их, проверена
 * по построению, и требовать от неё отдельного `description` значило бы
 * заставлять писать второе описание рядом с первым.
 *
 * ## Второй столбец: сколько на странице непереведённого
 *
 * Он здесь не случайно и не «заодно». Наборы строк проверяет `check:i18n`,
 * и там всё полно — а текст, набранный прямо в разметке, ни одна проверка
 * переводов не видит вовсе. Именно он и создаёт то, что видит посетитель:
 * страница на английском с русскими абзацами. Поэтому долг по переводу
 * считается там же, где метатеги, — обе беды об одном: страница выглядит
 * рабочей и потому не чинится.
 *
 * Комментарии из счёта убраны: они по-русски намеренно и переводу
 * не подлежат. Проверка, спотыкающаяся о собственный комментарий,
 * наведена не туда.
 *
 *   npm run check:seo
 */

const ROOT = 'src/app/(frontend)'

/**
 * Разделы, закрытые от поиска: заголовок нужен, описание — нет.
 *
 * Список неполон намеренно: это разделы, закрытые целиком общим слоем
 * (`robots: { index: false }` в разметке раздела). Одиночные страницы
 * с таким же запретом опознаются по самому запрету, а не по адресу —
 * иначе список пришлось бы вести руками, и он бы отстал.
 */
const PRIVATE = ['/account', '/association', '/admin', '/checks', '/bench', '/login', '/join']

/** Страница сама запретила себя показывать. */
const noindex = (src: string): boolean => /index:\s*false/.test(src)

type Row = {
  route: string
  file: string
  title: boolean
  description: boolean
  canonical: boolean
  russian: number
  private: boolean
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return name === 'page.tsx' ? [full] : []
  })

/** Адрес страницы: без корня, без групп маршрутизации, без `page.tsx`. */
const routeOf = (file: string): string => {
  const rel = file.slice(ROOT.length).replace(/\/page\.tsx$/, '')
  const clean = rel
    .split('/')
    .filter((s) => !s.startsWith('(') && s !== '')
    .join('/')
  return `/${clean}`
}

/**
 * Убрать комментарии.
 *
 * Грубо, без разбора языка: строковые литералы с `//` внутри тут
 * не встречаются, а адреса вида `https://` защищены проверкой символа
 * перед двумя косыми.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')

const CYRILLIC = /[А-Яа-яЁё][А-Яа-яЁё\s,.:;«»()—–-]{9,}/g

const rows: Row[] = []

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8')
  const route = routeOf(file)

  const helper = /siteMetadata\(|pageMetadata\(/.test(src)
  const hasMetadata = /export (const|async function) (metadata|generateMetadata)/.test(src)
  /* Перенаправление — не страница: у него нет ни текста, ни выдачи. */
  const redirectOnly = /redirect\(/.test(src) && !/<main|<section|<h1/.test(src)

  if (redirectOnly) continue

  rows.push({
    route,
    file,
    title: hasMetadata || helper,
    description: helper || /description:/.test(src),
    canonical: helper || /alternates:/.test(src),
    russian: (stripComments(src).match(CYRILLIC) ?? []).length,
    private: PRIVATE.some((p) => route.startsWith(p)) || noindex(src),
  })
}

rows.sort((a, b) => a.route.localeCompare(b.route))

/* ------------------------------- Отчёт ------------------------------------ */

const mark = (ok: boolean) => (ok ? '  ✓ ' : '  ✗ ')
const pad = (s: string, n: number) => s.padEnd(n)

console.log(pad('Адрес', 42) + 'Загл.  Опис.  Канон.  Русского в разметке')
console.log('─'.repeat(90))

for (const r of rows) {
  console.log(
    pad(r.route + (r.private ? ' ·' : ''), 42) +
      mark(r.title) +
      mark(r.description || r.private) +
      mark(r.canonical || r.private) +
      (r.russian > 0 ? `  ${r.russian}` : '  —'),
  )
}

console.log('\n· — закрытая от поиска страница: описание и канонический адрес ей не нужны.')

/* ------------------------------- Итог ------------------------------------- */

const noTitle = rows.filter((r) => !r.title)
const noDescription = rows.filter((r) => !r.private && !r.description)
const noCanonical = rows.filter((r) => !r.private && !r.canonical)

/**
 * Разделы витрины, живущие по-русски намеренно.
 *
 * Разборы и породные страницы объявлены русскими в самом коде
 * (`lib/notes.ts`, `lib/breed-pages.ts`): шесть языков от текста, вся
 * ценность которого в точности формулировок, дали бы пять машинных
 * переводов. «Эволюция продукта» — та же история, и адрес у неё
 * без языка.
 *
 * Считать их долгом значило бы держать в отчёте постоянную красную
 * строку, которую никто никогда не закроет, — а такую строку через
 * месяц перестают читать вместе со всем отчётом.
 */
const RU_ONLY = ['/site/[locale]/razbory', '/site/[locale]/breeds/[slug]', '/site/evolution']

const debt = rows
  .filter(
    (r) =>
      r.route.startsWith('/site') &&
      r.russian > 0 &&
      !RU_ONLY.some((prefix) => r.route.startsWith(prefix)),
  )
  .sort((a, b) => b.russian - a.russian)

console.log(`\nСтраниц: ${rows.length}, из них закрытых: ${rows.filter((r) => r.private).length}`)
console.log(`Без заголовка: ${noTitle.length}`)
console.log(`Без описания: ${noDescription.length}`)
console.log(`Без канонического адреса: ${noCanonical.length}`)

for (const r of noTitle) console.log(`  ✗ ${r.route} — нет заголовка (${r.file})`)
for (const r of noDescription) console.log(`  ✗ ${r.route} — нет описания`)
for (const r of noCanonical) console.log(`  ✗ ${r.route} — нет канонического адреса`)

console.log(
  '\nДолг по переводу шестиязычных страниц — строк русского текста прямо в разметке\n' +
    '(разборы, породные страницы и «Эволюция» русские намеренно и здесь не считаются):',
)
for (const r of debt.slice(0, 15)) console.log(`  ${String(r.russian).padStart(4)}  ${r.route}`)
console.log(`  ${'—'.repeat(4)}`)
console.log(`  ${String(debt.reduce((s, r) => s + r.russian, 0)).padStart(4)}  всего`)

/* ------------------- Заголовок не повторяет свой хвост --------------------- */

/**
 * Хвост заголовка вкладки приклеивает раскладка ко всякому заголовку
 * страницы. Написать то же слово ещё и в самом заголовке — значит
 * получить «Голштинская порода — характеристика, поголовье, племенная
 * книга — Племенная книга»: выдача показывает около шестидесяти знаков,
 * и половина их уходит на повтор.
 *
 * Ошибка не видна ни при какой правке: страница открывается, заголовок
 * осмысленный, а склеенную строку целиком видно только в выдаче.
 *
 * Законный способ обойтись без хвоста — объявить заголовок целиком своим
 * (`title: { absolute: … }`). Так стоят главная и английская экскурсия:
 * там имя продукта, и повторять за ним нечего.
 */
const SUFFIXES = [
  'Племенная книга',
  'племенная книга',
  'племенной книги',
  'Herdbook',
  'herdbook',
  'Асыл тұқым кітабы',
  'Ցեղային մատյան',
  'Пляменная кніга',
  'Асыл тукум китеби',
]

const repeated: string[] = []

for (const file of walk(ROOT)) {
  const src = stripComments(readFileSync(file, 'utf8'))
  if (!routeOf(file).startsWith('/site')) continue

  for (const m of src.matchAll(/title:\s*(`[^`]*`|'[^']*')/g)) {
    const value = m[1]!
    if (!SUFFIXES.some((s) => value.includes(s))) continue
    repeated.push(`${routeOf(file)} — ${value.slice(0, 70)}`)
  }
}

if (repeated.length > 0) {
  console.log('\nЗаголовки, повторяющие хвост, который приклеит раскладка:')
  for (const r of repeated) console.log(`  ✗ ${r}`)
}

const failed = noTitle.length + noDescription.length + noCanonical.length + repeated.length
console.log(
  failed === 0
    ? '\n  ✓ метатеги на месте у всех страниц'
    : `\n  ✗ страниц с неполными метатегами: ${failed}`,
)
process.exit(failed === 0 ? 0 : 1)
