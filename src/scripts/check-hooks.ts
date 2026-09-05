import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Хук, который пишет в базу мимо своей транзакции, — разбором исходников.
 *
 * ## Что ловим
 *
 * Обращение к Payload изнутри хука коллекции обязано получать `req`.
 * Хук работает внутри транзакции записи, и запрос без `req` уходит
 * по отдельному подключению — то есть в другую транзакцию, которая
 * не видит ещё не зафиксированных строк и, хуже того, может встать
 * на блокировке.
 *
 * Встаёт она так: вставка строки с внешним ключом на животное держит
 * на строке животного блокировку, а правка карточки со стороны ждёт
 * её снятия — а снимется она только после того, как хук вернёт
 * управление. Ошибки нет, отката нет, есть зависание до таймаута.
 *
 * ## Почему проверка появилась
 *
 * Это решение №20. Оно записано в журнале, объяснено словами
 * в `lib/evaluation-snapshot.ts` и там же соблюдено. И всё равно
 * повторено заново в хуке бонитировки: сид повис на первом же животном
 * и висел пятнадцать минут.
 *
 * Правило, известное одному файлу, не знает о себе в другом. Между
 * записью в журнале и проверкой в прогоне разница в том, что журнал
 * читают до ошибки, а проверка ловит после — и второе надёжнее.
 *
 * Заодно нашлись две давние такие же в `IndexBases` и `IndexProfiles`:
 * стояли годами и не срабатывали, потому что до записи там доходило
 * редко.
 *
 * ## Почему разбором текста, а не типами
 *
 * Тип `req` у Payload необязательный по существу: те же методы зовут
 * и снаружи хуков — из скриптов, серверных действий, миграций, — и там
 * `req` неоткуда взять. Сделать поле обязательным нельзя, а спросить
 * «внутри ли мы хука» тип не умеет. Зато умеет папка: всё, что лежит
 * в `src/collections`, — это описания коллекций, и обращения к Payload
 * оттуда идут только из хуков.
 *
 *   npm run check:hooks
 */

const DIR = 'src/collections'
const OPS = ['update', 'create', 'delete', 'find', 'findByID', 'count']

/**
 * Помощники, которых зовут из хуков.
 *
 * Хук редко пишет сам: он зовёт `syncTrustFromLab`, `recordOperation`,
 * `snapshotEvaluation` — и запрос уходит уже оттуда. Проверка смотрела
 * только в папку коллекций и такие обращения не видела вовсе: тот самый
 * повтор решения №20, ради которого она написана, был возможен на один
 * файл в сторону.
 *
 * Список — те модули `lib`, которые импортируются из коллекций и ходят
 * в базу. Правило для них мягче и точнее: спрашивается не со всего файла,
 * а с тех функций, которые `req` принимают. Функция без него позвана
 * не из хука (страницей, действием, скриптом), и требовать от неё
 * транзакцию бессмысленно — а требовать со всего файла значило бы
 * получить красные строки там, где никакой транзакции нет.
 *
 * Внутри такой функции запрос обязан прокидываться: `req` ключом или
 * `...(req ? { req } : {})`.
 */
const HELPERS = [
  'src/lib/trust.ts',
  'src/lib/evaluation-snapshot.ts',
  'src/lib/index-values.ts',
]

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Ключи верхнего уровня объекта, начинающегося на `at` (индекс `{`).
 *
 * Считаем глубину скобок: `req` внутри `data` или `where` — это данные,
 * а не передача транзакции, и засчитывать его нельзя. Строки и шаблоны
 * пропускаются целиком, иначе фигурная скобка внутри текста сбила бы
 * счёт.
 */
const topLevelKeys = (src: string, at: number): { keys: string[]; end: number } => {
  const keys: string[] = []
  let depth = 0
  let i = at

  for (; i < src.length; i++) {
    const c = src[i]!

    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++
        i++
      }
      continue
    }

    if (c === '{' || c === '[' || c === '(') {
      depth++
      continue
    }

    if (c === '}' || c === ']' || c === ')') {
      depth--
      if (depth === 0) break
      continue
    }

    if (depth === 1 && /[A-Za-z_]/.test(c)) {
      const rest = src.slice(i)
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*[:,]/.exec(rest)
      if (m) {
        keys.push(m[1]!)
        i += m[1]!.length - 1
      }
    }
  }

  return { keys, end: i }
}

console.log('\nОбращения к Payload из хуков коллекций\n')

const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'))
let calls = 0

for (const file of files) {
  const src = readFileSync(join(DIR, file), 'utf8')

  for (const op of OPS) {
    const needle = `payload.${op}({`
    let from = 0

    for (;;) {
      const at = src.indexOf(needle, from)
      if (at === -1) break
      from = at + needle.length

      const brace = at + needle.length - 1
      const { keys, end } = topLevelKeys(src, brace)
      calls += 1

      if (!keys.includes('req')) {
        const line = src.slice(0, at).split('\n').length
        check(false, `${file}: payload.${op} без req`, `строка ${line}`)
      }

      from = end
    }
  }
}

check(calls > 0, 'обращения к Payload в коллекциях нашлись', `найдено ${calls}`)

/* ------------------ Помощники, которых зовут из хуков ------------------ */

console.log('\nОбращения к Payload из помощников, вызываемых хуками\n')

let helperCalls = 0

for (const file of HELPERS) {
  if (!existsSync(file)) {
    check(false, `${file}: файла нет — список помощников отстал от кода`)
    continue
  }

  const src = readFileSync(file, 'utf8')
  /*
   * Хотя бы одна функция файла обязана принимать `req` — иначе помощник
   * в транзакции не позвать вовсе, и список помощников отстал от кода.
   */
  if (!/\breq\??:\s*PayloadRequest/.test(src)) {
    check(false, `${file}: ни одна функция не принимает req`)
    continue
  }

  /*
   * Границы функций, принимающих `req`: от объявления до закрывающей
   * скобки нулевого уровня. Разбор грубый и достаточный — файлы наши,
   * и объявления в них стоят с начала строки.
   */
  const zones: [start: number, end: number][] = []
  /*
   * Объявления двух видов: обычная функция и стрелка в `const`.
   * Второй вид пропускался, и файл со стрелками выглядел как «функции
   * с req не разобрались» — то есть проверка честно говорила, что
   * ничего не смотрела, но искать причину пришлось бы вручную.
   */
  const decl = /^(?:export\s+)?(?:(?:async\s+)?function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?)\s*\(/gm
  for (;;) {
    const m = decl.exec(src)
    if (!m) break
    const open = src.indexOf('(', m.index)
    const { end: paramsEnd } = topLevelKeys(src, open)
    const params = src.slice(open, paramsEnd + 1)
    if (!/\breq\b/.test(params)) continue

    const bodyStart = src.indexOf('{', paramsEnd)
    if (bodyStart === -1) continue
    const { end: bodyEnd } = topLevelKeys(src, bodyStart)
    zones.push([bodyStart, bodyEnd])
  }

  if (zones.length === 0) {
    check(false, `${file}: функции с req не разобрались — проверка ничего не смотрела`)
    continue
  }

  /*
   * Имена, за которыми прячется тот же `req`: `const scope = req ? { req } : {}`
   * и потом `...scope` в вызове. Форма законная и читается лучше, чем
   * повтор условия в каждом обращении, — но для поиска по тексту она
   * выглядит как вызов без запроса.
   */
  const scopeNames = [...src.matchAll(/const\s+(\w+)\s*=\s*req\s*\?\s*\{\s*req\s*\}\s*:\s*\{\s*\}/g)].map(
    (m) => m[1]!,
  )

  for (const op of OPS) {
    const needle = `payload.${op}({`
    let from = 0

    for (;;) {
      const at = src.indexOf(needle, from)
      if (at === -1) break
      from = at + needle.length

      const inZone = zones.some(([a, b]) => at > a && at < b)
      if (!inZone) continue

      const brace = at + needle.length - 1
      const { keys, end } = topLevelKeys(src, brace)
      helperCalls += 1

      /*
       * `...(req ? { req } : {})` — законная форма: ключа `req` в разборе
       * верхнего уровня нет, но запрос прокидывается. Ищется она прямо
       * в тексте вызова.
       */
      const body = src.slice(at, end)
      const spread = scopeNames.some((n) => body.includes(`...${n}`))
      if (!keys.includes('req') && !/\.\.\.\(req\s*\?/.test(body) && !spread) {
        const line = src.slice(0, at).split('\n').length
        check(false, `${file}: payload.${op} без req`, `строка ${line}`)
      }

      from = end
    }
  }
}

check(
  helperCalls > 0,
  'обращения к Payload в помощниках нашлись',
  `найдено ${helperCalls}`,
)

/*
 * Отдельно: хотя бы одно обращение должно быть в файлах, где хуки точно
 * есть. Проверка, ничего не нашедшая из-за переименованной папки, была бы
 * зелёной и пустой — а зелёный цвет тогда означал бы не «сошлось»,
 * а «не смотрели».
 */
check(
  files.includes('Calvings.ts') && files.includes('Gradings.ts'),
  'коллекции с хуками на месте',
  `файлов ${files.length}`,
)

console.log('')
if (failures) {
  console.log(`Не сошлось: ${failures}\n`)
  process.exit(1)
}
console.log(`Всё сошлось: ${calls} обращений, у всех есть req.\n`)
