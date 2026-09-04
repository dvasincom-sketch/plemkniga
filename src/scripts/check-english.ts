import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Английская витрина остаётся английской.
 *
 * ## Что здесь ловится
 *
 * Ровно одна беда, и она возвращается сама собой: страница, у которой
 * половина текста переведена, а половина нет. Появляется она не от лени,
 * а от устройства — абзац, набранный прямо в разметке, не виден ни одной
 * проверке переводов, потому что тех интересуют наборы строк. Человек
 * добавляет на страницу новый блок, пишет его по-русски, и английская
 * версия молча становится наполовину русской.
 *
 * Поэтому проверяются два разных места.
 *
 * **Наборы строк по языкам** (`Translated<T>`): у каждого должна быть
 * английская ветка, и в ней не должно быть кириллицы. Пропущенное `en`
 * означает откат на русский, а кириллица внутри `en` — недоделанный
 * перевод, который выглядит доделанным.
 *
 * **Разметка страниц и рисунков витрины**: русского текста в ней быть
 * не должно вовсе — весь текст обязан приходить из наборов строк
 * или из данных. Это не вкусовщина: строка, набранная в разметке,
 * непереводима по построению.
 *
 * ## Чего проверка намеренно не требует
 *
 * Перевода разделов, объявленных русскими: разборы (`/razbory`),
 * страницы отдельных пород и «Эволюция продукта». Довод — в
 * `docs/kontent-plan.md` и `docs/lokalizatsiya.md`: текст, вся ценность
 * которого в точности формулировок, на шести языках означает пять
 * машинных переводов. Требовать от них английского значило бы держать
 * в отчёте красную строку, которую никто никогда не закроет, — а такой
 * отчёт перестают читать целиком.
 *
 * Комментарии в коде тоже не в счёт: они по-русски намеренно и объясняют
 * «почему». Проверка, спотыкающаяся о собственный комментарий, наведена
 * не туда.
 *
 *   npm run check:english
 */

/** Где живёт витрина: страницы и рисунки к ним. */
const ROOTS = ['src/app/(frontend)/site', 'src/components/site']

/** Наборы строк по языкам лежат здесь. */
const TEXT_DIR = 'src/lib'

/**
 * Разделы, живущие по-русски намеренно.
 *
 * Список короткий и должен таким остаться: каждая строка здесь — обещание
 * читателю на другом языке, что он увидит русский текст.
 */
const RU_ONLY = [
  'site/[locale]/razbory',
  'site/[locale]/breeds/[slug]',
  'site/evolution',
  'site/razbory',
  'components/site/NoteFrame.tsx',
]

/** Имя продукта и знак: не текст страницы, а название. */
const BRAND = ['ПЛЕМ online', 'ПЛЕМ', 'Разборы']

const CYRILLIC = /[А-Яа-яЁё]/

let failures = 0
const fail = (text: string) => {
  failures += 1
  console.log(`  ✗ ${text}`)
}

const walk = (dir: string, ext: string[]): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full, ext)
    return ext.some((e) => name.endsWith(e)) ? [full] : []
  })

/**
 * Убрать комментарии.
 *
 * Три вида: блочные, строчные и обёрнутые в фигурные скобки внутри
 * разметки. Последние важнее прочих: именно ими объясняют «почему»
 * рядом с версткой, и без них проверка ругалась бы на каждый разбор.
 */
const stripComments = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    /*
       Русские имена в описаниях кортежей — `[признак: IndexPart, вклад:
       number]` — тоже комментарий, только средствами языка: они называют
       колонки для читателя кода и никуда не выводятся. Убираются здесь,
       иначе проверка ругалась бы на пояснение, а не на текст.
    */
    .replace(/[А-Яа-яЁё]+:\s*(?=[A-Za-z[{])/g, '')

const isRuOnly = (file: string): boolean => RU_ONLY.some((part) => file.includes(part))

/* ------------------- 1. Разметка витрины без русского --------------------- */

let checkedPages = 0

for (const root of ROOTS) {
  for (const file of walk(root, ['.tsx'])) {
    if (isRuOnly(file)) continue
    checkedPages += 1

    const body = stripComments(readFileSync(file, 'utf8'))
    /*
       Ищутся куски текста, а не отдельные буквы: `ru-RU`, `ru` в ключах
       и однобуквенные обозначения — не текст страницы. Порог в три знака
       отсекает их, не пропуская ни одного настоящего слова.
    */
    const found = (body.match(/[А-Яа-яЁё][А-Яа-яЁё\s,.:;«»()—–-]{3,}/g) ?? []).filter(
      (s) => !BRAND.some((b) => s.trim().startsWith(b)),
    )

    if (found.length > 0) {
      fail(`${file} — русский текст в разметке (${found.length})`)
      for (const s of found.slice(0, 3)) console.log(`      ${s.trim().slice(0, 70)}`)
    }
  }
}

console.log(`Файлов витрины проверено: ${checkedPages}`)

/* ------------------- 2. Наборы строк с английской веткой ------------------ */

let sets = 0

for (const file of walk(TEXT_DIR, ['.ts'])) {
  const src = readFileSync(file, 'utf8')
  if (!/Translated</.test(src)) continue
  /* Сам файл с механикой перевода набором строк не является. */
  if (file.endsWith('i18n/translated.ts')) continue

  sets += 1
  const body = stripComments(src)

  if (!/\ben:\s*EN\b|\ben:\s*\{/.test(body)) {
    fail(`${file} — набор строк без английской ветки`)
    continue
  }

  /*
     Английская ветка вырезается от `const EN` до конца объявления.
     Способ грубый, но достаточный: русская строка, попавшая в английский
     набор, найдётся, а ложных срабатываний на русской ветке не будет.
  */
  const at = body.indexOf('const EN')
  if (at === -1) continue
  const tail = body.slice(at)
  const end = tail.indexOf('\n}')
  const english = end === -1 ? tail : tail.slice(0, end)

  const leftovers = (english.match(/[А-Яа-яЁё][А-Яа-яЁё\s,.:;«»()—–-]{3,}/g) ?? []).filter(
    (s) => !BRAND.some((b) => s.trim().startsWith(b)),
  )

  if (leftovers.length > 0) {
    fail(`${file} — русский текст в английской ветке (${leftovers.length})`)
    for (const s of leftovers.slice(0, 3)) console.log(`      ${s.trim().slice(0, 70)}`)
  }
}

console.log(`Наборов строк по языкам: ${sets}`)

console.log(
  failures === 0
    ? '\n  ✓ на английской витрине русского текста не осталось'
    : `\n  ✗ мест с непереведённым текстом: ${failures}`,
)
process.exit(failures === 0 ? 0 : 1)
