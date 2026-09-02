import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * Ссылка внутри ссылки.
 *
 * ## Что случилось
 *
 * На странице для стран ЕАЭС знак Ассоциации был обёрнут в ссылку
 * на главную. Знак сам по себе ссылка — так он написан с самого начала
 * и так ведёт себя во всех шапках, — и получились вложенные `<a>`.
 *
 * По HTML это недопустимо, и браузер молча чинит разметку по-своему:
 * закрывает внешнюю ссылку раньше, чем написано. Дерево, которое собрал
 * сервер, и дерево, которое получилось в браузере, расходятся —
 * и React жалуется на расхождение при гидратации, то есть на симптом,
 * а не на причину. Найти по такому сообщению исходную обёртку можно,
 * но не сразу.
 *
 * ## Почему это легко повторить
 *
 * Компонент, который сам является ссылкой, снаружи выглядит как обычный
 * значок. Пишущий шапку думает «знак должен вести на главную» и делает
 * ровно то, что думает. Узнать, что знак уже ведёт на главную, можно
 * только открыв его исходник, — а его открывают редко, потому что он
 * работает.
 *
 * ## Что проверяется
 *
 * Два случая.
 *
 * **Явная вложенность**: `<Link>` или `<a>` внутри другого `<Link>`
 * или `<a>` в одном файле.
 *
 * **Вложенность через компонент**: `<Link>` вокруг компонента, который
 * сам рисует ссылку. Такие компоненты находятся автоматически — файл
 * ввозит `next/link` и возвращает `<Link>` первым элементом.
 *
 * Проверка работает по тексту, а не по дереву разбора, и потому груба:
 * условная ссылка внутри условной ссылки в одном блоке ей покажется
 * вложенностью. Ложное срабатывание стоит взгляда человека и оговорки;
 * пропуск стоит сломанной гидратации на боевой странице.
 *
 *   npm run check:links
 */

const ROOT = 'src'
const fails: string[] = []

/**
 * Убрать комментарии, сохранив длину текста.
 *
 * Первая редакция проверки этого не делала — и первой же находкой стал
 * её собственный комментарий: в нём было написано «обёртка давала
 * вложенные `<a>`», и разбор увидел там открытую ссылку, которая
 * никогда не закроется. Дальше всё в файле оказалось «внутри» неё.
 *
 * Это ровно тот случай, о котором в проекте уже записано решение:
 * проверка, спотыкающаяся о собственный комментарий, нацелена не туда.
 *
 * Длина сохраняется намеренно: смещения нужны, чтобы находка указывала
 * на верную строку. Поэтому комментарии не вырезаются, а забиваются
 * пробелами, а переводы строк остаются на местах.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      walk(path, out)
      continue
    }
    if (path.endsWith('.tsx')) out.push(path)
  }
}

const files: string[] = []
walk(ROOT, files)

/* ------------------------------------------------------------------ *
 *  Кто сам является ссылкой                                          *
 * ------------------------------------------------------------------ */

/**
 * Компонент считается ссылкой, если его файл ввозит `next/link`
 * и возвращает `<Link>` первым элементом разметки.
 *
 * Имя берётся из имени файла, а не из объявления: в этом проекте
 * компонент и файл называются одинаково, и разбирать `export function`
 * ради того же ответа значило бы усложнить проверку без выгоды.
 */
const linkComponents = new Set<string>()

/* Имена файлов, которые компонентами не являются вовсе. */
const NOT_A_COMPONENT = new Set(['page', 'layout', 'route', 'error', 'not-found', 'loading'])

for (const file of files) {
  const text = stripComments(readFileSync(file, 'utf8'))
  if (!text.includes("from 'next/link'")) continue

  const name = basename(file, '.tsx')
  if (NOT_A_COMPONENT.has(name) || !/^[A-Z]/.test(name)) continue

  /* `return (` и через строку-другую `<Link` — знак того, что весь компонент ссылка. */
  if (/return\s*\(\s*\n?\s*<Link\b/.test(text) || /return\s+<Link\b/.test(text)) {
    linkComponents.add(name)
  }
}

console.log(
  `Компонентов, которые сами являются ссылкой: ${linkComponents.size}` +
    (linkComponents.size ? ` (${[...linkComponents].join(', ')})` : ''),
)

/* ------------------------------------------------------------------ *
 *  Поиск вложенности                                                 *
 * ------------------------------------------------------------------ */

/** Открывающие и закрывающие ссылочные теги в порядке появления. */
type Tag = { kind: 'open' | 'close'; name: string; index: number; line: number }

const TAG = /<(\/?)(Link|a)(\s|>|\/>)/g

for (const file of files) {
  const text = stripComments(readFileSync(file, 'utf8'))

  /* Заранее — номер строки по смещению, чтобы находка указывала на место. */
  const lineOf = (index: number) => text.slice(0, index).split('\n').length

  const tags: Tag[] = []
  TAG.lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = TAG.exec(text))) {
    /*
     * Самозакрывающийся тег открытым не считается: `<Link … />` ничего
     * в себя не вкладывает. Проверяем по концу тега, а не по совпадению.
     */
    const end = text.indexOf('>', m.index)
    const selfClosing = end > 0 && text[end - 1] === '/'
    if (selfClosing) continue

    tags.push({
      kind: m[1] === '/' ? 'close' : 'open',
      name: m[2]!,
      index: m.index,
      line: lineOf(m.index),
    })
  }

  const stack: Tag[] = []

  for (const tag of tags) {
    if (tag.kind === 'close') {
      /* Закрываем ближайший подходящий; лишние закрытия молча пропускаем. */
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.name === tag.name) {
          stack.splice(i, 1)
          break
        }
      }
      continue
    }

    if (stack.length > 0) {
      const outer = stack[stack.length - 1]!
      fails.push(
        `${file}:${tag.line}: <${tag.name}> внутри <${outer.name}> со строки ${outer.line}. ` +
          `Вложенные ссылки недопустимы по HTML: браузер перестроит разметку по-своему, ` +
          `и гидратация разойдётся`,
      )
    }

    stack.push(tag)
  }

  /* Компонент-ссылка, обёрнутый в ссылку. */
  if (linkComponents.size) {
    const inner = new RegExp(`<(${[...linkComponents].join('|')})\\b`, 'g')
    let c: RegExpExecArray | null
    while ((c = inner.exec(text))) {
      /* Открыта ли в этой точке какая-нибудь ссылка. */
      const before = tags.filter((t) => t.index < c!.index)
      let depth = 0
      for (const t of before) depth += t.kind === 'open' ? 1 : -1
      if (depth > 0) {
        fails.push(
          `${file}:${lineOf(c.index)}: <${c[1]}> обёрнут в ссылку, но сам является ссылкой. ` +
            `Уберите обёртку — компонент принимает href и подпись доводами`,
        )
      }
    }
  }
}

console.log(`Просмотрено файлов: ${files.length}`)

if (fails.length) {
  console.log('')
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\n  ✓ вложенных ссылок нет')
process.exit(0)
