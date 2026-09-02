import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

/**
 * Подкачка настоящих JSON-схем ICAR ADE в дерево проекта.
 *
 * ## Зачем свои схемы, если есть свои перечисления
 *
 * Наш прогон `check:ade` сверяет собранный ресурс с **нашей же** копией
 * перечислений. Это ловит опечатки и забытые поля, но не ловит главного:
 * расхождения с самим стандартом. Если ICAR переименует значение или
 * сделает поле обязательным, копия останется прежней, прогон останется
 * зелёным, и узнаем мы об этом от партнёра, у которого наш ответ
 * не прошёл сверку.
 *
 * ## Почему копия в дереве, а не загрузка при каждом прогоне
 *
 * Прогон, который ходит в сеть, перестаёт быть прогоном: он падает,
 * когда GitHub недоступен, и зеленеет, когда недоступен незаметно.
 * Хуже того, он делает сборку зависимой от чужого сервера в момент,
 * когда чинят совсем другое.
 *
 * Копия лежит в `vendor/icar-ade/` вместе с отметкой, откуда и когда
 * взята. Обновляется руками, этой же командой, и обновление видно
 * в истории изменений — то есть расхождение со стандартом становится
 * событием, которое кто-то заметил и принял, а не тихим дрейфом.
 *
 * ## Про лицензию
 *
 * Репозиторий `adewg/ICAR` под Apache 2.0 — копирование схем в чужой
 * проект разрешено. Файл `vendor/icar-ade/LICENSE-NOTICE.md` записывает
 * это вместе с источником: копия без указания происхождения через год
 * читается как наша собственная выдумка.
 *
 * ## Почему обход, а не список файлов
 *
 * Схемы ссылаются друг на друга через `$ref` с относительными путями,
 * и глубина неизвестна заранее: событие ссылается на общий предок,
 * тот — на типы, типы — на перечисления. Списком это не выписать,
 * а выписав однажды, мы получили бы список, который молча устареет.
 *
 *   npm run ade:schemas
 */

const BRANCH = process.env.ADE_BRANCH ?? 'ADE-1'
const BASE = `https://raw.githubusercontent.com/adewg/ICAR/${BRANCH}`
const OUT = 'vendor/icar-ade'

/*
 * Точки входа — ровно те ресурсы, которые книга отдаёт. Остальное
 * подтянется по ссылкам: тянуть репозиторий целиком значило бы принести
 * триста файлов, из которых мы смотрим одиннадцать.
 */
const ENTRY = [
  'resources/icarAnimalCoreResource.json',
  'resources/icarTestDayResultEventResource.json',
  'resources/icarReproParturitionEventResource.json',
  'resources/icarReproInseminationEventResource.json',
  'resources/icarReproPregnancyCheckEventResource.json',
  'resources/icarTypeClassificationEventResource.json',
  'resources/icarWeightEventResource.json',
  'resources/icarBreedingValueResource.json',
  'resources/icarMovementArrivalEventResource.json',
  'resources/icarMovementDepartureEventResource.json',
  'resources/icarMovementDeathEventResource.json',
  'resources/icarBatchResult.json',
  'resources/icarResponseMessageResource.json',
]

const seen = new Set<string>()
const queue = [...ENTRY]
let fetched = 0

/** Собрать все `$ref` из документа, на любой глубине. */
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

while (queue.length) {
  const path = queue.shift()!
  if (seen.has(path)) continue
  seen.add(path)

  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) {
    console.error(`  ✗ ${path}: ${res.status} ${res.statusText}`)
    process.exit(1)
  }

  const text = await res.text()
  const file = join(OUT, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  fetched += 1
  console.log(`  ${path}`)

  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    console.error(`  ✗ ${path}: не разобралось как JSON`)
    process.exit(1)
  }

  for (const ref of refsOf(doc)) {
    /*
     * Внутренние ссылки вида `#/definitions/...` никуда не ведут наружу
     * и файла не требуют. Ссылки на другой файл начинаются с пути,
     * а якорь после `#` для подкачки не нужен.
     */
    if (ref.startsWith('#')) continue
    const rel = ref.split('#')[0]!
    if (!rel) continue
    queue.push(normalize(join(dirname(path), rel)))
  }
}

mkdirSync(OUT, { recursive: true })

writeFileSync(
  join(OUT, 'SOURCE.json'),
  `${JSON.stringify(
    {
      repository: 'https://github.com/adewg/ICAR',
      branch: BRANCH,
      fetchedAt: new Date().toISOString(),
      files: fetched,
    },
    null,
    2,
  )}\n`,
)

writeFileSync(
  join(OUT, 'LICENSE-NOTICE.md'),
  [
    '# Схемы ICAR ADE',
    '',
    'Копия JSON-схем из репозитория [adewg/ICAR](https://github.com/adewg/ICAR),',
    'распространяемого под лицензией Apache License 2.0.',
    '',
    'Файлы не изменялись. Ветка и дата подкачки записаны в `SOURCE.json`.',
    'Обновление: `npm run ade:schemas`.',
    '',
    'Копия лежит в дереве проекта намеренно: прогон, ходящий в сеть,',
    'падает, когда чужой сервер недоступен, и зеленеет, когда недоступен',
    'незаметно. Обновление копии видно в истории изменений — значит,',
    'расхождение со стандартом становится событием, которое кто-то принял,',
    'а не тихим дрейфом.',
    '',
  ].join('\n'),
)

console.log(`\n  ✓ подкачано файлов: ${fetched}, ветка ${BRANCH}`)
