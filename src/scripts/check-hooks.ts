import { readFileSync, readdirSync } from 'fs'
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
