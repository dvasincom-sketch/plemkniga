import 'dotenv/config'
import { Pool } from 'pg'
import { EXTERIOR_COMPOSITES, EXTERIOR_TRAITS, HEALTH_TRAITS, PRODUCTION_TRAITS } from '../lib/dictionaries'
import { maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Перенос текущих оценок из карточек в историю.
 *
 * До появления `animal-evaluations` оценка жила прямо в `animals` — одной
 * строкой на животное, без прошлого. Этот скрипт заводит истории первую
 * запись: то, что сейчас в карточке, становится действующей оценкой
 * с датой `evaluation_date` и источником «загружено из файла».
 *
 * Дату берём из карточки, а где её нет — из даты создания записи. Второе
 * не выдумка, а меньшее из зол: строка истории без даты бессмысленна,
 * а дата создания карточки — единственное, что мы про эту оценку знаем
 * наверняка. Отличить одно от другого потом можно: у придуманных дат
 * источник `import` и совпадение с `created_at`.
 *
 * Экстерьер переносится отдельной записью в `animal-exteriors` — у него
 * своя история и свой оценщик, хотя дата на первых порах та же.
 *
 * Запускать можно повторно: животные, у которых история уже есть,
 * пропускаются. Карточки скрипт не трогает вовсе — снимок в них уже лежит,
 * и переписывать его тем же значением незачем.
 *
 *   npm run backfill:evaluations             # показать, что будет сделано
 *   npm run backfill:evaluations -- --apply  # перенести
 *   npm run backfill:evaluations -- --resync # переписать снимки из истории
 *
 * `--resync` нужен, когда карточка и история разошлись: ручной UPDATE, сбой
 * посреди работы, откат части записей. Он идёт в обратную сторону — читает
 * действующие строки истории и переписывает ими снимок в карточке. Это
 * единственное место, где данные текут обратно, и течь они могут только так:
 * из истории в снимок, никогда наоборот.
 */

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

const apply = process.argv.includes('--apply')
const resync = process.argv.includes('--resync')
const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

/** Колонки карточки → колонки истории оценок. */
const EVALUATION_MAP: [from: string, to: string][] = [
  ['ipc', 'ipc'],
  ['ipc_details_r', 'ipc_r'],
  ['ipc_details_percentile', 'ipc_percentile'],
  ['production_reliability_level', 'production_reliability_level'],
  ['health_reliability_level', 'health_reliability_level'],
  ['reproduction_fertility_forecast', 'fertility_forecast'],
  ['reproduction_fertility_r', 'fertility_r'],
]

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

for (const t of PRODUCTION_TRAITS) {
  EVALUATION_MAP.push([`production_${snake(t.key)}_forecast`, `${snake(t.key)}_forecast`])
  EVALUATION_MAP.push([`production_${snake(t.key)}_r`, `${snake(t.key)}_r`])
}
for (const t of HEALTH_TRAITS) {
  EVALUATION_MAP.push([`health_${snake(t.key)}_forecast`, `${snake(t.key)}_forecast`])
  EVALUATION_MAP.push([`health_${snake(t.key)}_r`, `${snake(t.key)}_r`])
}

/** Колонки карточки → колонки истории экстерьера. */
const EXTERIOR_MAP: [from: string, to: string][] = [...EXTERIOR_TRAITS, ...EXTERIOR_COMPOSITES].map(
  (t) => [`exterior_${snake(t.key)}`, snake(t.key)],
)

/** «Есть ли что переносить»: хоть одно значение непустое. */
const anyFilled = (cols: string[]) => cols.map((c) => `"${c}" is not null`).join(' or ')

/** Переписать снимок в карточках из действующих строк истории. */
async function resyncSnapshots() {
  const started = Date.now()

  const evals = await pool.query(`
    update animals a set
      ${EVALUATION_MAP.map(([from, to]) => `"${from}" = e."${to}"`).join(',\n      ')},
      evaluation_date = e.evaluated_at
    from animal_evaluations e
    where e.animal_id = a.id and e.is_current
  `)

  const exts = await pool.query(`
    update animals a set
      ${EXTERIOR_MAP.map(([from, to]) => `"${from}" = x."${to}"`).join(',\n      ')}
    from animal_exteriors x
    where x.animal_id = a.id and x.is_current
  `)

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`Снимки переписаны за ${secs} с.`)
  console.log(`  по оценкам:     ${evals.rowCount}`)
  console.log(`  по экстерьеру:  ${exts.rowCount}`)
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  if (resync) {
    await resyncSnapshots()
    return
  }

  const evalCols = EVALUATION_MAP.map(([from]) => from)
  const extCols = EXTERIOR_MAP.map(([from]) => from)

  const counts = await pool.query<{ evaluations: string; exteriors: string }>(`
    select
      (select count(*) from animals a
        where (${anyFilled(evalCols)})
          and not exists (select 1 from animal_evaluations e where e.animal_id = a.id)
      )::text as evaluations,
      (select count(*) from animals a
        where (${anyFilled(extCols)})
          and not exists (select 1 from animal_exteriors x where x.animal_id = a.id)
      )::text as exteriors
  `)

  const toEvaluate = Number(counts.rows[0]?.evaluations ?? 0)
  const toExterior = Number(counts.rows[0]?.exteriors ?? 0)

  console.log(`Оценок к переносу:    ${toEvaluate}`)
  console.log(`Экстерьеров к переносу: ${toExterior}\n`)

  if (toEvaluate === 0 && toExterior === 0) {
    console.log('Переносить нечего — история уже заполнена.')
    return
  }

  if (!apply) {
    console.log(
      'Это предварительный просмотр, база не изменена.\n' +
        'Перенести:\n  npm run backfill:evaluations -- --apply\n\n' +
        'Скрипт только добавляет строки в animal_evaluations и animal_exteriors.\n' +
        'Карточки животных он не трогает: снимок в них уже лежит.',
    )
    return
  }

  const started = Date.now()

  /*
   * Одним INSERT ... SELECT, а не построчно. На трёхстах тысячах животных
   * разница между этим и циклом по строкам — минуты против часов, а никакой
   * логики, которую нельзя выразить запросом, здесь нет.
   */
  const evalInsert = await pool.query(`
    insert into animal_evaluations (
      animal_id, evaluated_at, source, is_current,
      ${EVALUATION_MAP.map(([, to]) => `"${to}"`).join(', ')},
      updated_at, created_at
    )
    select
      a.id,
      coalesce(a.evaluation_date, a.created_at),
      'import',
      true,
      ${EVALUATION_MAP.map(([from]) => `a."${from}"`).join(', ')},
      now(), now()
    from animals a
    where (${anyFilled(evalCols)})
      and not exists (select 1 from animal_evaluations e where e.animal_id = a.id)
  `)

  const extInsert = await pool.query(`
    insert into animal_exteriors (
      animal_id, assessed_at, is_current,
      ${EXTERIOR_MAP.map(([, to]) => `"${to}"`).join(', ')},
      updated_at, created_at
    )
    select
      a.id,
      coalesce(a.evaluation_date, a.created_at),
      true,
      ${EXTERIOR_MAP.map(([from]) => `a."${from}"`).join(', ')},
      now(), now()
    from animals a
    where (${anyFilled(extCols)})
      and not exists (select 1 from animal_exteriors x where x.animal_id = a.id)
  `)

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`Готово за ${secs} с.`)
  console.log(`  оценок записано:     ${evalInsert.rowCount}`)
  console.log(`  экстерьеров записано: ${extInsert.rowCount}`)
  console.log(
    '\nКарточки не изменялись: то, что в них лежит, и есть перенесённая\n' +
      'действующая оценка. Дальше историю пополняют загрузки и расчётный центр.',
  )
}

main()
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
