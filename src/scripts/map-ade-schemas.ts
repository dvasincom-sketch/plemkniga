import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Выписка о схемах ICAR: что лежит в копии и что участвует в сверке.
 *
 * ## Зачем считать, а не написать
 *
 * Страница «Чем проверяется наш обмен» говорит числами: столько-то схем
 * в дереве, столько-то работает, столько-то тем стандарта вне книги.
 * Написанные словами, они отстали бы при первом обновлении копии —
 * и отстали бы именно там, где обещана точность.
 *
 * ## Что значит «участвует в сверке»
 *
 * Не «мы её открываем», а «без неё сверка не состоится». Наши ресурсы
 * ссылаются на общие предки, те — на типы, типы — на перечисления.
 * Замкнутый круг этих ссылок и есть настоящее множество схем, которыми
 * проверяется ответ книги.
 *
 * Разница существенная: файлов в копии триста три, в круге — семьдесят
 * семь. Назвать триста три «проверяемыми» было бы ровно тем завышением,
 * от которого мы защищаем страницу соответствия.
 *
 * ## Почему список точек входа здесь, а не берётся из кода
 *
 * Соблазн был импортировать `ADE_OURS` и не держать второй список.
 * Так нельзя: тот файл читает выписку, которую этот скрипт создаёт, —
 * получился бы круг, в котором первый запуск невозможен. Расхождение
 * между списками ловит `check:ade-map`.
 *
 *   npm run ade:map
 */

const VENDOR = 'vendor/icar-ade'
const OUT = 'src/data/ade-schemas.json'

/** Ресурсы, которые книга отдаёт. От них считается замкнутый круг ссылок. */
const ENTRY = [
  'icarAnimalCoreResource',
  'icarTestDayResultEventResource',
  'icarReproParturitionEventResource',
  'icarReproInseminationEventResource',
  'icarWeightEventResource',
  'icarReproPregnancyCheckEventResource',
  'icarTypeClassificationEventResource',
  'icarBreedingValueResource',
  'icarMovementArrivalEventResource',
  'icarMovementDepartureEventResource',
  'icarMovementDeathEventResource',
]

const DIRS = ['resources', 'types', 'enums', 'collections']

if (!existsSync(VENDOR)) {
  console.log(`Схем ICAR нет в ${VENDOR}. Подкачайте их: npm run ade:schemas`)
  process.exit(1)
}

/** Все `$ref` документа, на любой глубине. */
const refsOf = (node: unknown, out: string[] = []): string[] => {
  if (Array.isArray(node)) {
    for (const v of node) refsOf(v, out)
    return out
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === '$ref' && typeof v === 'string') out.push(v)
      else refsOf(v, out)
    }
  }
  return out
}

/* Замкнутый круг ссылок от точек входа. */
const seen = new Set<string>()
const queue = ENTRY.map((n) => resolve(join(VENDOR, 'resources', `${n}.json`)))

while (queue.length) {
  const file = queue.pop()!
  if (seen.has(file) || !existsSync(file)) continue
  seen.add(file)

  const doc = JSON.parse(readFileSync(file, 'utf8')) as unknown
  for (const ref of refsOf(doc)) {
    /* Внутренняя ссылка `#/definitions/...` файла не требует. */
    const rel = ref.split('#')[0]
    if (rel) queue.push(resolve(dirname(file), rel))
  }
}

/* Все схемы копии. */
const rows: { name: string; dir: string; in: boolean }[] = []

for (const dir of DIRS) {
  const full = join(VENDOR, dir)
  if (!existsSync(full)) continue

  for (const entry of readdirSync(full).sort()) {
    if (!entry.endsWith('.json')) continue
    rows.push({
      name: entry.replace(/\.json$/, ''),
      dir,
      in: seen.has(resolve(join(full, entry))),
    })
  }
}

/*
 * Дата копии переносится в карту вместе с веткой и коммитом.
 *
 * Страница обмена показывает её читателю: сведения о соответствии
 * стандарту стареют молча, и «на какое число это верно» — первое,
 * что должен узнать тот, кто пришёл проверять. Брать её со страницы
 * прямо из `vendor/` нельзя: приложение не должно читать каталог,
 * который сносится и перезаписывается целиком.
 */
const source = JSON.parse(readFileSync(join(VENDOR, 'SOURCE.json'), 'utf8')) as {
  branch: string
  commit: string
  fetchedAt: string
}

const used = rows.filter((r) => r.in).length

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      source: 'https://github.com/adewg/ICAR',
      branch: source.branch,
      commit: source.commit,
      fetchedAt: source.fetchedAt,
      total: rows.length,
      used,
      schemas: rows,
    },
    null,
    2,
  )}\n`,
)

console.log(`Схем в копии: ${rows.length}`)
console.log(`Участвует в сверке: ${used}`)
console.log(`Точек входа: ${ENTRY.length}`)
console.log(`\n  ✓ выписка записана: ${OUT}`)
