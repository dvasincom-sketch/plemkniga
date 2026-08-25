import 'dotenv/config'
import os from 'node:os'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import { runBench } from '@/lib/bench'
import type { BenchRow } from '@/lib/bench-report'
import { buildAnimalWhere, resolveSort } from '@/lib/animal-query'

/**
 * Замер по критериям приёмки — со своей машины.
 *
 * Сами сценарии живут в `src/lib/bench.ts`: их же зовёт закрытый маршрут
 * `/bench`, которым замер запускается на проде. Здесь остаётся только то,
 * что нужно человеку у терминала, — печать по ходу и запись отчёта
 * в файл.
 *
 *   npm run bench
 *   npm run bench -- --runs 20             — больше прогонов на сценарий
 *   npm run bench -- --parallel 50         — проверить одновременных читателей
 *   npm run bench -- --save                — записать отчёт для вкладки «Замер»
 *   npm run bench -- --save --label Прод   — записать под своим именем среды
 *   npm run bench -- --save --out /tmp/b.json  — положить отчёт в другое место
 *   npm run bench -- --heavy              — разбор выгрузки по слоям (только у себя)
 *
 * ## Замер прода
 *
 * Делается на проде, а не со своей машины против прод-базы: во втором
 * случае меряется канал до неё, и на сценариях в двадцать миллисекунд
 * задержка сети будет всем результатом. Порядок — в `docs/razvertyvanie.md`.
 *
 * Скрипт ничего не пишет в базу. Объём набирается отдельно:
 * `npm run seed:bulk -- --animals 50000`.
 */

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const n = Number(process.argv[i + 1])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const RUNS = arg('runs', 10)
const PARALLEL = arg('parallel', 0)
const SAVE = process.argv.includes('--save')

/**
 * Разбор выгрузки по слоям — по требованию.
 *
 * На своей машине он безопасен и полезен: именно он показал, что прямой
 * запрос идёт 122 мс против 6 349 у Payload. На боевой — исчерпал память
 * и убил процесс, поэтому в общий прогон он больше не входит.
 */
const HEAVY = process.argv.includes('--heavy')

/**
 * Как называется среда, в которой мерили.
 *
 * Задаётся руками, потому что машина о себе этого не знает: имя хоста
 * у ноутбука и у контейнера одинаково бессмысленно для читателя,
 * а вопрос «где получены цифры» требует ответа «на проде».
 *
 * Метка собирается из всех слов до следующего ключа, а не из одного.
 * «Локальная машина» — два слова, и в оболочке без кавычек второе
 * теряется: в отчёт попадает замер с именем «Локальная», а прежний
 * остаётся рядом под правильным. Так уже случилось, и вышло хуже, чем
 * некрасивое имя, — два замера одной среды встали колонками, изображая
 * сравнение. Требовать кавычек было бы правильно и бесполезно: команду
 * набирают руками, а имя среды по-русски почти всегда из двух слов.
 */
const labelArg = (): string => {
  const i = process.argv.indexOf('--label')
  if (i === -1) return os.hostname()

  const words: string[] = []
  for (let k = i + 1; k < process.argv.length; k++) {
    const w = process.argv[k]!
    if (w.startsWith('--')) break
    words.push(w)
  }

  return words.length ? words.join(' ') : os.hostname()
}

/**
 * Куда ложится отчёт.
 *
 * Файл в репозитории, а не запись в базе: замер — факт об одной версии
 * кода на одном железе, а не «текущее состояние системы», которое надо
 * держать свежим. Его место рядом с кодом, который он мерил.
 *
 * Путь можно назвать, потому что в боевом контейнере каталога
 * с исходниками нет: там отчёт пишется во временный. Умолчание остаётся
 * местным — на своей машине отчёт должен ложиться туда, откуда его
 * коммитят.
 */
const reportPath = (): string => {
  const i = process.argv.indexOf('--out')
  const v = i === -1 ? '' : (process.argv[i + 1] ?? '')
  return v && !v.startsWith('--') ? v : 'src/lib/bench-report.json'
}

const ms = (v: number) => `${Math.round(v)} мс`

let failures = 0

const printRow = (r: BenchRow) => {
  const verdict = r.limitMs === undefined ? '' : r.ok ? '  укладывается' : '  ПРЕВЫШЕН'
  if (r.ok === false) failures += 1

  console.log(
    `  ${r.what.padEnd(46)} медиана ${ms(r.medianMs).padStart(8)}` +
      `   худшее ${ms(r.worstMs).padStart(8)}` +
      `   первый ${ms(r.coldMs).padStart(8)}` +
      (r.rows ? `   строк ${r.rows}` : '') +
      verdict,
  )
}

async function main() {
  const payload = await getPayload({ config })

  console.log(`\nПрогонов на сценарий: ${RUNS}`)

  const measured = await runBench(payload, {
    runs: RUNS,
    label: labelArg(),
    heavy: HEAVY,
    onGroup: (name) => console.log(`\n${name}\n`),
    onNote: (text) => console.log(`  ! ${text}`),
    onRow: printRow,
  })

  console.log(`\nЖивотных в базе: ${measured.animals.toLocaleString('ru-RU')}`)

  /* ---------------------------------------------------------------- */
  if (PARALLEL > 0) {
    console.log(`\nОдновременные читатели: ${PARALLEL}\n`)

    /*
     * Это не проверка «пятисот пользователей» из ТЗ, и выдавать её за неё
     * нельзя. Пятьсот пользователей — это пятьсот браузеров, своя сеть
     * и страницы целиком; здесь один процесс шлёт запросы в один пул.
     * Меряется ровно одно, зато честно: во сколько раз проседает время
     * ответа, когда запросов много. Линейно — упирается в пул, хуже —
     * в саму базу.
     *
     * Сценарий здесь свой, а не из общего списка: параллельность нужна
     * человеку у терминала и не нужна отчёту, поэтому в строки замера
     * она не попадает.
     */
    const one = async () => {
      const sp = { sort: 'ipc' }
      const res = await payload.find({
        collection: 'animals',
        where: buildAnimalWhere(sp),
        limit: 25,
        depth: 1,
        sort: resolveSort(sp).payload || 'identNumber',
        overrideAccess: true,
      })
      return res.docs.length
    }

    const t0 = process.hrtime.bigint()
    await one()
    const single = Number(process.hrtime.bigint() - t0) / 1e6

    const t = process.hrtime.bigint()
    await Promise.all(Array.from({ length: PARALLEL }, () => one()))
    const all = Number(process.hrtime.bigint() - t) / 1e6

    console.log(`  один запрос                      ${ms(single)}`)
    console.log(`  ${String(PARALLEL).padEnd(4)} одновременно, всего        ${ms(all)}`)
    console.log(`  в пересчёте на запрос            ${ms(all / PARALLEL)}`)
    console.log(`  просадка                         ×${(all / PARALLEL / single).toFixed(1)}`)
  }

  console.log(
    failures === 0 ? '\nВсе пороги выдержаны.\n' : `\nПорогов превышено: ${failures}.\n`,
  )

  if (SAVE) {
    /*
     * Замеры копятся списком, а не переписывают друг друга: вкладка
     * показывает их рядом, и в этом весь смысл — «на моей машине» против
     * «на проде». Совпавшая метка заменяет прежний замер той же среды:
     * два замера одного места — это не сравнение, а история, а история
     * здесь ни к чему.
     */
    const before = await readFile(reportPath(), 'utf8')
      .then((t) => JSON.parse(t) as { reports?: unknown[] })
      .catch(() => ({ reports: [] as unknown[] }))

    const kept = (before.reports ?? []).filter(
      (r) => (r as { label?: string }).label !== measured.label,
    )

    await writeFile(
      reportPath(),
      JSON.stringify({ reports: [...kept, measured] }, null, 2) + '\n',
      'utf8',
    )

    const s = measured.server
    console.log(`Отчёт записан: ${reportPath()} (среда «${measured.label}»)`)
    if (s) {
      console.log(`  ${s.cpu}, ядер ${s.cores}, память ${s.memoryGb} ГБ`)
      console.log(`  ${s.postgres}, база ${s.databaseSize}`)
      if (s.remoteDatabase)
        console.log('  ! База не местная — в цифрах сидит задержка сети до неё')
    }
    console.log()
  }

  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
