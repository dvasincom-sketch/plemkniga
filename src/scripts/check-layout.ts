import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Раскладка, которую не видно на одной странице.
 *
 * Два разных утверждения, и общее у них то, что ни одно не проверяется
 * взглядом на отдельную страницу.
 *
 * **Порядок частей в кабинете.** Меню кабинета стоит раньше заголовка
 * страницы. Каждая страница по отдельности выглядит разумно, а разнобой
 * замечает только тот, кто переходит между ними и видит, как меню
 * прыгает. Всё, что выше неизменного, заставляет искать неизменное
 * заново при каждом переходе.
 *
 * **Раскладка не задаётся свойством в `style`.** Свойство в `style`
 * действует на любой ширине и старше любого класса, поэтому соседний
 * `grid-cols-1` или `sm:flex-row` рядом с ним не работает вовсе —
 * молча, без предупреждения сборки. Именно так подвал книги перестал
 * складываться на телефоне: колонки стали считаться по книге, расчёт
 * уехал в `style`, и `grid-cols-1` умер, а на широком экране всё
 * осталось правильным. Ошибку такого рода не видит ни компилятор,
 * ни глаз того, кто правил соседнюю строку.
 *
 * Вычисленное значение поэтому уезжает в переменную CSS, а переключает
 * его класс с брейкпойнтом: `style={{ '--footer-columns': … }}` плюс
 * `md:[grid-template-columns:var(--footer-columns)]`.
 *
 * Цвета, отступы и размеры в `style` под запрет не попадают: они
 * отзывчивость вокруг себя не отменяют.
 */

const ROOT = process.argv[2] ?? 'src/app/(frontend)'
let failures = 0

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('page.tsx') ? [full] : []
  })

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8')

  const nav = Math.max(src.indexOf('<AccountNav'), src.indexOf('<AssociationNav'))
  if (nav === -1) continue

  /* Страница на общем каркасе порядок задать неверно не может */
  if (src.includes('<CabinetPage')) {
    console.log(`  ✓ ${file} — на общем каркасе`)
    continue
  }

  const title = src.indexOf('<h1')
  if (title === -1) {
    console.log(`  ✓ ${file} — без заголовка страницы`)
    continue
  }

  if (nav < title) {
    console.log(`  ✓ ${file}`)
  } else {
    failures += 1
    console.log(`  ✗ ${file} — заголовок стоит выше меню кабинета`)
  }
}

console.log(failures === 0 ? '\nПорядок везде одинаковый.' : `\nРазнобой: ${failures}`)

/* ------------- Раскладка не задаётся свойством в `style` ------------------ */

/**
 * Свойства, которые отменяют отзывчивость.
 *
 * Список короткий намеренно: сюда попадает только то, чем задают
 * раскладку, — сетка, направление потока, способ показа. Ширина, отступ
 * и цвет в `style` законны и встречаются часто.
 */
const LAYOUT_PROPS = [
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridTemplateAreas',
  'gridAutoFlow',
  'flexDirection',
  'flexWrap',
  'columnCount',
  'display',
]

const TSX_ROOTS = ['src/app', 'src/components']

/**
 * Единственное законное исключение.
 *
 * `global-error.tsx` показывается, когда рухнула сама раскладка — до
 * того, как доехали стили. Класс, не доехавший до браузера, оставил бы
 * поломку поверх поломки, поэтому там всё разметкой намеренно, и правило
 * про отзывчивость к странице без стилей просто неприменимо.
 *
 * Список из одного файла и должен остаться коротким: каждая строка здесь
 * — место, куда проверка больше не смотрит.
 */
const ALLOWED = ['src/app/global-error.tsx']

const walkTsx = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walkTsx(full) : full.endsWith('.tsx') ? [full] : []
  })

let inline = 0

for (const root of TSX_ROOTS) {
  for (const file of walkTsx(root)) {
    if (ALLOWED.includes(file)) continue
    const src = readFileSync(file, 'utf8')

    /*
       Разбирается кусок от `style={{` до ближайшей закрывающей скобки,
       а не весь объект: имена свойств стоят в самом начале, а полный
       разбор споткнулся бы о вложенные шаблонные строки и приведение
       типа, которым как раз и объявляют переменную CSS.
    */
    for (const m of src.matchAll(/style=\{\{/g)) {
      const chunk = src.slice(m.index, src.indexOf('}', m.index))
      const found = LAYOUT_PROPS.filter((p) => chunk.includes(p))
      if (found.length === 0) continue

      inline += 1
      failures += 1
      console.log(`  ✗ ${file} — раскладка в style: ${found.join(', ')}`)
    }
  }
}

console.log(
  inline === 0
    ? 'Раскладка везде задана классами.'
    : `Мест, где style отменяет отзывчивость: ${inline}`,
)

process.exit(failures === 0 ? 0 : 1)
