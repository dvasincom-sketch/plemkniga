import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dateRu, dateTimeRu, FALLBACK_TIME_ZONE } from '@/lib/format'

/**
 * Проверка показа дат и времени.
 *
 * ## Что здесь проверяется и почему это нельзя увидеть глазами
 *
 * Обе ошибки, ради которых написан этот скрипт, невидимы в том поясе,
 * где на них смотрят. Дата рождения, съехавшая на сутки, съезжает только
 * западнее Гринвича — открыв страницу в Москве, её не увидишь никогда.
 * А время без подписи выглядит правильным ровно до разговора двух людей
 * из разных поясов. Поэтому проверка запускает себя же в четырёх поясах
 * и сверяет ответы между собой.
 *
 * Пояс задаётся дочернему процессу при запуске, а не переменной на ходу:
 * Node пересчитывает пояс лениво и не обещает, когда именно, — на этом
 * уже обожглись в `check:xlsx`, где первая редакция проверки давала
 * то один ответ, то другой на одних и тех же данных.
 *
 *   npm run check:time
 *
 * Скрипт ничего не читает из базы и ничего не пишет.
 */

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${what}`)
  } else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Пояса нарочно по обе стороны от Гринвича и по обе от Москвы. */
const ZONES = ['UTC', 'Europe/Moscow', 'Asia/Vladivostok', 'America/Los_Angeles']

/** Календарная дата, как её хранит Payload: полночь по UTC. */
const BIRTH = '2023-04-17T00:00:00.000Z'
/** Момент времени — тот самый пример из журнала. */
const MOMENT = '2026-08-25T07:11:00.000Z'

function probe() {
  console.log(
    JSON.stringify({
      tz: process.env.TZ ?? '',
      date: dateRu(BIRTH),
      fallback: dateTimeRu(MOMENT),
      moscow: dateTimeRu(MOMENT, 'Europe/Moscow'),
      vladivostok: dateTimeRu(MOMENT, 'Asia/Vladivostok'),
    }),
  )
}

type Probe = { tz: string; date: string; fallback: string; moscow: string; vladivostok: string }

function main() {
  if (process.argv.includes('--probe')) {
    probe()
    return
  }

  const results: Probe[] = []
  for (const tz of ZONES) {
    const run = spawnSync('npx', ['tsx', fileURLToPath(import.meta.url), '--probe'], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    })
    const line = (run.stdout ?? '').trim().split('\n').pop() ?? ''
    try {
      results.push(JSON.parse(line) as Probe)
    } catch {
      failures += 1
      console.log(`  ✗ прогон в поясе ${tz} не дал ответа — ${run.stderr.slice(-200)}`)
    }
  }

  console.log('\nКалендарная дата не зависит от пояса\n')

  /*
   * Утверждение здесь именно такое: не «дата верна», а «дата одинакова
   * везде». Верность одного значения ничего не доказывает — до правки
   * оно было верным в трёх поясах из четырёх, и потому ошибка прожила
   * так долго.
   */
  for (const r of results) {
    check(r.date === '17.04.2023', `${r.tz}: дата рождения — 17.04.2023`, r.date)
  }

  const dates = new Set(results.map((r) => r.date))
  check(dates.size === 1, 'во всех поясах дата одна и та же', [...dates].join(' / '))

  console.log('\nМомент времени подписан поясом\n')

  for (const r of results) {
    /*
     * Подпись проверяется по наличию смещения в самой строке, а не по
     * тому, что мы её туда положили. Настройка `timeZoneName` могла бы
     * быть потеряна при правке формата, и строка осталась бы правдоподобной
     * — как раз такой, какой она была до этой работы.
     */
    check(/GMT[+-]?\d*|UTC/.test(r.moscow), `${r.tz}: в подписи назван пояс`, r.moscow)
  }

  /*
   * Пояс приходит параметром, значит один и тот же вызов обязан давать
   * один и тот же ответ, где бы ни выполнялся. Это и есть то свойство,
   * которого не было: раньше сервер и браузер отвечали по-разному,
   * и никакая подпись не могла быть верной сразу в обоих.
   */
  const moscow = new Set(results.map((r) => r.moscow))
  check(moscow.size === 1, 'московское время одинаково во всех поясах запуска', [...moscow].join(' / '))
  check(
    results[0]?.moscow.startsWith('25.08.2026, 10:11'),
    'момент 07:11 UTC показан как 10:11 по Москве',
    results[0]?.moscow,
  )

  const vlad = new Set(results.map((r) => r.vladivostok))
  check(vlad.size === 1, 'владивостокское время одинаково во всех поясах запуска', [...vlad].join(' / '))
  check(
    results[0]?.vladivostok.startsWith('25.08.2026, 17:11'),
    'тот же момент показан как 17:11 во Владивостоке',
    results[0]?.vladivostok,
  )

  console.log('\nЗапасной пояс назван и работает\n')

  check(FALLBACK_TIME_ZONE === 'Europe/Moscow', 'запасной пояс — московский', FALLBACK_TIME_ZONE)
  const fallback = new Set(results.map((r) => r.fallback))
  check(
    fallback.size === 1,
    'вызов без пояса не зависит от окружения',
    [...fallback].join(' / '),
  )
  check(
    results[0]?.fallback === results[0]?.moscow,
    'вызов без пояса даёт московское время',
    `${results[0]?.fallback} / ${results[0]?.moscow}`,
  )

  console.log('\nПустое значение\n')

  check(dateRu(null) === '—' && dateTimeRu(null) === '—', 'пустая метка показана прочерком')
  check(dateRu('не дата') === '—' && dateTimeRu('не дата') === '—', 'мусор не притворяется датой')

  console.log(failures === 0 ? '\nВсё сходится.\n' : `\nНе сходится: ${failures}.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
