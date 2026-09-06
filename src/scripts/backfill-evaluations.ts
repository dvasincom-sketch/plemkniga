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
 *   npm run backfill:evaluations                     # показать, что будет сделано
 *   npm run backfill:evaluations -- --apply          # перенести
 *   npm run backfill:evaluations -- --resync         # показать расхождения снимка
 *   npm run backfill:evaluations -- --resync --apply # переписать снимки
 *
 * `--resync` нужен, когда карточка и история разошлись: ручной UPDATE, сбой
 * посреди работы, откат части записей. Он идёт в обратную сторону — читает
 * действующие строки истории и переписывает ими снимок в карточке. Это
 * единственное место, где данные текут обратно, и течь они могут только так:
 * из истории в снимок, никогда наоборот.
 *
 * Именно поэтому `--apply` нужен и ему. Раньше `--resync` писал сразу:
 * ключ проверялся до всякой оглядки на `--apply`, и команда, отличающаяся
 * от безопасной одним словом, переписывала снимок в карточках всех
 * животных с действующей строкой истории. Обратный поток данных —
 * единственное место, где значения текут назад, и оно же оставалось
 * единственным без предохранителя.
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

/*
 * Условие «снимок и история разошлись» — одно на счёт и на правку.
 *
 * Без него `rowCount` равнялся числу животных с действующей строкой
 * истории всегда, даже когда карточка и история совпадали до последней
 * цифры: «Снимки переписаны: 287 431» не отличало «расхождений не было»
 * от «расхождения были у всех». Заодно правка стала вдесятеро дешевле —
 * трогаются только разошедшиеся строки.
 *
 * Сравнение через `is distinct from`: обычное `<>` для NULL даёт NULL,
 * и пара «в карточке пусто, в истории число» не считалась бы
 * расхождением.
 */
const differs = (map: [string, string][], alias: string) =>
  map.map(([from, to]) => `a."${from}" is distinct from ${alias}."${to}"`).join('\n       or ')

const EVAL_DIFFERS = `(${differs(EVALUATION_MAP, 'e')}
       or a.evaluation_date is distinct from date_trunc('day', e.evaluated_at at time zone 'UTC'))`

/** Переписать снимок в карточках из действующих строк истории. */
async function resyncSnapshots(write: boolean) {
  const started = Date.now()

  /*
   * У животного действующая строка истории должна быть одна. Если их две,
   * `update ... from` молча возьмёт произвольную — то есть скрипт-«сведение»
   * тихо выберет одну из двух правд. Такое состояние чинится не здесь,
   * и продолжать по нему нельзя.
   */
  for (const [table, what] of [
    ['animal_evaluations', 'оценок'],
    ['animal_exteriors', 'экстерьеров'],
  ] as const) {
    const dup = await pool.query(
      `select count(*)::int as n from (
         select animal_id from "${table}" where is_current
          group by animal_id having count(*) > 1
       ) t`,
    )
    const n = Number((dup.rows[0] as { n?: number } | undefined)?.n ?? 0)
    if (n > 0) {
      console.error(
        `\nУ ${n} животных больше одной действующей строки ${what}. Сведение отменено:\n` +
          `  select animal_id from ${table} where is_current group by animal_id having count(*) > 1;\n`,
      )
      process.exitCode = 1
      return
    }
  }

  const counts = await pool.query(`
    select
      (select count(*) from animals a join animal_evaluations e
        on e.animal_id = a.id and e.is_current where ${EVAL_DIFFERS})::int as evals,
      (select count(*) from animals a join animal_exteriors x
        on x.animal_id = a.id and x.is_current
       where ${differs(EXTERIOR_MAP, 'x')})::int as exts`)

  const row = counts.rows[0] as { evals?: number; exts?: number } | undefined
  const evalsOff = Number(row?.evals ?? 0)
  const extsOff = Number(row?.exts ?? 0)

  console.log(`Расходится снимок по оценкам:    ${evalsOff}`)
  console.log(`Расходится снимок по экстерьеру: ${extsOff}\n`)

  if (evalsOff === 0 && extsOff === 0) {
    console.log('Сводить нечего — карточка и история совпадают.')
    return
  }

  if (!write) {
    console.log(
      'Это предварительный просмотр, база не изменена.\n' +
        'Переписать снимки:\n  npm run backfill:evaluations -- --resync --apply\n\n' +
        'Пишет он в карточки животных, а не в историю: направление обратное\n' +
        'обычному прогону.',
    )
    return
  }

  /*
   * Дата оценки — календарный день, а `evaluated_at` — момент. Без
   * приведения к суткам по UTC момент времени лёг бы обратно в поле-день,
   * и любое `::date` над ним на сервере западнее Гринвича дало бы
   * предыдущее число.
   */
  const evals = await pool.query(`
    update animals a set
      ${EVALUATION_MAP.map(([from, to]) => `"${from}" = e."${to}"`).join(',\n      ')},
      evaluation_date = date_trunc('day', e.evaluated_at at time zone 'UTC'),
      updated_at = now()
    from animal_evaluations e
    where e.animal_id = a.id and e.is_current and ${EVAL_DIFFERS}
  `)

  const exts = await pool.query(`
    update animals a set
      ${EXTERIOR_MAP.map(([from, to]) => `"${from}" = x."${to}"`).join(',\n      ')},
      updated_at = now()
    from animal_exteriors x
    where x.animal_id = a.id and x.is_current and ${differs(EXTERIOR_MAP, 'x')}
  `)

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`Снимки переписаны за ${secs} с.`)
  console.log(`  по оценкам:     ${evals.rowCount}`)
  console.log(`  по экстерьеру:  ${exts.rowCount}`)

  /*
   * Ранг сортировки живёт только в хуке карточки, и прямой `UPDATE`
   * его не касается: книга сортировалась бы по прежнему ИПЦ, показывая
   * новый. Расхождение видно лишь тому, кто сверит порядок с колонкой.
   */
  console.log('\nПорядок сортировки по ИПЦ пересчитывается отдельно:')
  console.log('  npm run backfill:sort-ranks')
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  if (resync) {
    await resyncSnapshots(apply)
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
      /*
       * Дата оценки — календарный день, а created_at — момент с часами,
       * и в поле-день он ложился как есть: дальше любое приведение
       * к суткам на сервере западнее Гринвича давало предыдущее число.
       * Обратных кавычек здесь стоять не может: комментарий лежит внутри
       * шаблонной строки, и первая же из них закрыла бы её посреди SQL.
       */
      coalesce(a.evaluation_date, date_trunc('day', a.created_at at time zone 'UTC')),
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
      /*
       * Дата оценки — календарный день, а created_at — момент с часами,
       * и в поле-день он ложился как есть: дальше любое приведение
       * к суткам на сервере западнее Гринвича давало предыдущее число.
       * Обратных кавычек здесь стоять не может: комментарий лежит внутри
       * шаблонной строки, и первая же из них закрыла бы её посреди SQL.
       */
      coalesce(a.evaluation_date, date_trunc('day', a.created_at at time zone 'UTC')),
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
