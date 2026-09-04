import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BOOK_FEATURES } from '@/lib/book-features'
import { BOOK_PAGE_TEXT } from '@/lib/book-page-text'

/**
 * Нарисованные экраны разделов книги действительно кому-то показываются.
 *
 * ## Что здесь может сломаться молча
 *
 * Экран выбирается по слугу раздела: ключом в таблице рисунков и ключом
 * в наборе подписей. Опечатка — `reprts` вместо `reports` — правильна
 * и для языка, и для типов: ключ просто ни с чем не совпадёт. Разработчик
 * видит зелёный `tsc`, зелёную сборку и страницу без рисунка, а причину
 * ищет в разметке рисунка.
 *
 * Обратная беда тише: компонент написан, вывезен наружу, но нигде
 * не вставлен. Он собирается, попадает в поставку и не показывается
 * никому. Ни одна проверка на такое не жалуется — работа сделана
 * и потеряна.
 *
 * ## Почему проверка не требует рисунка у каждого раздела
 *
 * Потому что правило другое. Рисунок появляется там, где у раздела есть
 * утверждение, которого нет в тексте; раздел без такого утверждения
 * остаётся без рисунка намеренно (`docs/reshenya.md`, запись «Последние
 * три экрана»). Проверка, требующая картинку у каждого, заставляла бы
 * рисовать «что-нибудь» — ровно то, чего мы решили не делать.
 *
 * Здесь проверяется другое: что нарисованное **дошло** до страницы,
 * а названное на странице существует.
 */

const PAGES = 'src/app/(frontend)/site'
const SCREENS = 'src/components/site/BookScreens.tsx'

let failures = 0
const fail = (text: string) => {
  failures += 1
  console.log(`  ✗ ${text}`)
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : []
  })

const pages = walk(PAGES)
const everywhere = pages.map((file) => readFileSync(file, 'utf8')).join('\n')

/* ------------------------- Ветки называют живые разделы ------------------- */

const slugs = new Set(BOOK_FEATURES.map((f) => f.slug))

/*
   Рисунки перечислены таблицей по слугу — раньше это были двенадцать
   веток `feature.slug === '…'`. Опечатка одинаково тиха в обоих видах:
   ключ, не совпавший ни с одним разделом, просто никогда не найдётся,
   и страница выйдет без рисунка при зелёной сборке.

   Ключи берутся из объявления таблицы в самом файле страницы. Регулярное
   выражение смотрит на строки внутри `const SCREENS`, а не на слова
   в тексте: названия разделов встречаются и в пояснениях, и в
   комментариях, и проверка, спотыкающаяся о собственный комментарий,
   наведена не туда.
*/
const named = new Set<string>()

for (const file of pages) {
  const src = readFileSync(file, 'utf8')
  const table = src.match(/const SCREENS[^=]*=\s*\{([\s\S]*?)\n  \}/)
  if (!table) continue

  for (const m of table[1]!.matchAll(/^\s{4}(\w+):\s*\{/gm)) {
    const slug = m[1]!
    named.add(slug)
    if (!slugs.has(slug)) fail(`${file} — рисунок для «${slug}», а такого раздела нет`)
  }
}

/* Подписи под рисунками и заголовки окон — по тем же слугам. */
for (const [locale, text] of Object.entries(BOOK_PAGE_TEXT)) {
  for (const slug of Object.keys(text?.note ?? {})) {
    if (!slugs.has(slug)) fail(`${locale}: подпись к рисунку «${slug}», а такого раздела нет`)
  }
  for (const slug of Object.keys(text?.frame ?? {})) {
    if (!slugs.has(slug)) fail(`${locale}: рамка окна для «${slug}», а такого раздела нет`)
  }
  for (const slug of named) {
    if (!text?.note[slug]) fail(`${locale}: у рисунка «${slug}» нет подписи`)
  }
}

console.log(`Разделов: ${slugs.size}, из них с рисунком: ${named.size}`)

/* --------------------- Нарисованное дошло до страницы --------------------- */

const screens = [...readFileSync(SCREENS, 'utf8').matchAll(/export function (\w+)\(/g)].map(
  (m) => m[1]!,
)

if (screens.length === 0) fail(`${SCREENS} — не нашлось ни одного экрана; изменился вид файла?`)

for (const name of screens) {
  /* `<Имя` — именно вставка в разметку, а не строка ввоза */
  if (everywhere.includes(`<${name}`)) console.log(`  ✓ ${name}`)
  else fail(`${name} — нарисован, но нигде не вставлен`)
}

console.log(
  failures === 0
    ? '\nВсе экраны показываются, у каждого есть подпись на каждом языке.'
    : `\nНеувязок: ${failures}`,
)
process.exit(failures === 0 ? 0 : 1)
