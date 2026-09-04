import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BOOK_FEATURES } from '@/lib/book-features'

/**
 * Нарисованные экраны разделов книги действительно кому-то показываются.
 *
 * ## Что здесь может сломаться молча
 *
 * Экран выбирается сравнением строк: `feature.slug === 'reports'`.
 * Опечатка в этой строке — `reprts` — правильна с точки зрения языка
 * и типов: сравнение допустимо, ветка просто никогда не выполняется.
 * Разработчик видит зелёный `tsc`, зелёную сборку и страницу без
 * рисунка, а причину ищет в разметке рисунка.
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
const named = new Set<string>()

for (const file of pages) {
  const src = readFileSync(file, 'utf8')
  /*
     Ищется именно сравнение, а не упоминание слова: названия разделов
     встречаются и в пояснениях рядом с рисунками, и в комментариях.
     Проверка, спотыкающаяся о собственный комментарий, наведена не туда.
  */
  for (const m of src.matchAll(/feature\.slug\s*===\s*'([^']+)'/g)) {
    const slug = m[1]!
    named.add(slug)
    if (!slugs.has(slug)) fail(`${file} — ветка для «${slug}», а такого раздела нет`)
  }
}

console.log(`Разделов: ${slugs.size}, из них с экраном: ${named.size}`)

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
    ? '\nВсе экраны показываются, все ветки называют живые разделы.'
    : `\nНеувязок: ${failures}`,
)
process.exit(failures === 0 ? 0 : 1)
