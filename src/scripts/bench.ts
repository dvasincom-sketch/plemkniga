import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Animal } from '@/payload-types'
import { buildAnimalWhere, resolveSort, type SearchParams } from '@/lib/animal-query'
import { buildCertificateView } from '@/lib/certificate-view'
import { buildPedigree } from '@/lib/pedigree'
import { herdSummary } from '@/lib/herd-summary'
import { EXPORT_LIMIT } from '@/lib/export-formats'

/**
 * Замер по критериям приёмки: поиск, свидетельство, выгрузка.
 *
 * ## Что здесь меряется и почему именно так
 *
 * Техническое задание требует поиска быстрее секунды на пятидесяти тысячах
 * записей и свидетельства не дольше пяти секунд. Ни то, ни другое до сих
 * пор не измерялось — в базе лежало шестьсот восемьдесят животных,
 * и на таком объёме быстро всё.
 *
 * **Меряется путь страницы, а не запрос к базе.** Соблазн был написать
 * прямые `select` и получить красивые миллисекунды. Они были бы правдой
 * о базе и неправдой о системе: страница строит `where` из адреса,
 * просит Payload разрешить связи, считает общее число записей для
 * постраничной навигации — и каждый из этих шагов вносит своё. Поэтому
 * замер зовёт `buildAnimalWhere` и `payload.find` ровно так, как их зовёт
 * страница поиска.
 *
 * **Берётся медиана и худшее, среднее не берётся.** Среднее прячет
 * выброс: девять запросов по сто миллисекунд и один на четыре секунды
 * дают среднее в полсекунды и вывод «укладываемся». Критерий приёмки
 * не про среднее — он про то, сколько человек ждёт, и ждёт он в том
 * числе тот десятый раз.
 *
 * **Первый прогон считается отдельно, а не отбрасывается.** Он греет
 * кэш PostgreSQL, и по нему нельзя судить об установившемся темпе —
 * но именно его получает первый человек, открывший книгу утром.
 * Отбросить его молча значило бы измерить систему в состоянии,
 * в котором её никто не застаёт.
 *
 *   npm run bench
 *   npm run bench -- --runs 20        — больше прогонов на сценарий
 *   npm run bench -- --parallel 50    — проверить одновременных читателей
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

/** Пороги из раздела о критериях приёмки. Отсутствие порога — просто замер. */
type Scenario = {
  what: string
  limitMs?: number
  run: () => Promise<number>
}

const ms = (v: number) => `${Math.round(v)} мс`

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

const timed = async <T,>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t = process.hrtime.bigint()
  const out = await fn()
  return [out, Number(process.hrtime.bigint() - t) / 1e6]
}

let failures = 0

async function measure(s: Scenario) {
  const [, cold] = await timed(s.run)

  const warm: number[] = []
  let rows = 0
  for (let i = 0; i < RUNS; i++) {
    const [n, took] = await timed(s.run)
    warm.push(took)
    rows = n
  }

  const med = median(warm)
  const worst = Math.max(...warm)

  const verdict = s.limitMs === undefined ? '' : worst <= s.limitMs ? '  укладывается' : '  ПРЕВЫШЕН'
  if (s.limitMs !== undefined && worst > s.limitMs) failures += 1

  console.log(
    `  ${s.what.padEnd(46)} медиана ${ms(med).padStart(8)}` +
      `   худшее ${ms(worst).padStart(8)}` +
      `   первый ${ms(cold).padStart(8)}` +
      (rows ? `   строк ${rows}` : '') +
      verdict,
  )
}

async function main() {
  const payload = await getPayload({ config })

  const total = await payload.count({ collection: 'animals', overrideAccess: true })
  console.log(`\nЖивотных в базе: ${total.totalDocs.toLocaleString('ru-RU')}`)
  console.log(`Прогонов на сценарий: ${RUNS}\n`)

  /*
   * Объём назван вслух и сравнён с требованием. Замер на шестистах
   * записях выглядит точно так же, как замер на пятидесяти тысячах, —
   * те же строки, те же миллисекунды, — и разницу видно только тому,
   * кто помнит, сколько записей было. Помнить об этом должен скрипт.
   */
  if (total.totalDocs < 50_000) {
    console.log(
      `  ! В базе меньше 50 000 записей, а требование сформулировано именно на них.\n` +
        `    Цифры ниже говорят о системе на текущем объёме и о приёмке не говорят ничего.\n` +
        `    Набрать объём: npm run seed:bulk -- --animals 50000\n`,
    )
  }

  /* ---------------------------------------------------------------- */
  console.log('Поиск по книге (порог ТЗ — 1000 мс)\n')

  const find = (sp: SearchParams, limit = 25) => async () => {
    const sort = resolveSort(sp)
    const res = await payload.find({
      collection: 'animals',
      where: buildAnimalWhere(sp),
      limit,
      depth: 1,
      sort: sort.payload || 'identNumber',
      overrideAccess: true,
    })
    return res.docs.length
  }

  await measure({ what: 'первая страница без условий', limitMs: 1000, run: find({}) })
  await measure({
    what: 'номер по подстроке',
    limitMs: 1000,
    run: find({ id: '99' }),
  })
  await measure({
    what: 'кличка по подстроке',
    limitMs: 1000,
    run: find({ name: 'а' }),
  })
  await measure({
    what: 'порог по удою и жиру',
    limitMs: 1000,
    run: find({ milk: '9000', fatPercent: '3.8' }),
  })
  await measure({
    what: 'быки-производители (плашка)',
    limitMs: 1000,
    run: find({ sex: 'male', ageGroup: 'bull' }),
  })
  await measure({
    what: 'порядок по ИПЦ',
    limitMs: 1000,
    run: find({ sort: 'ipc' }),
  })
  /*
   * Глубокая страница — отдельный сценарий, потому что ломается она
   * иначе, чем первая: `offset` в PostgreSQL честно пролистывает всё,
   * что пропускает. На двадцать пятой странице это незаметно, на пятисотой
   * — уже нет, а до неё доходят: отбор по признаку и порядок по индексу
   * ровно для того и заведены, чтобы смотреть хвост.
   */
  await measure({
    what: 'страница 200 того же отбора',
    limitMs: 1000,
    run: find({ page: '200', sort: 'ipc' }),
  })
  await measure({
    what: 'страница на 500 строк',
    limitMs: 1000,
    run: find({ perPage: '500' }, 500),
  })

  /* ---------------------------------------------------------------- */
  console.log('\nКарточка и родословная\n')

  const sample = await payload.find({
    collection: 'animals',
    where: { and: [{ sire: { exists: true } }, { dam: { exists: true } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const animal = sample.docs[0] as Animal | undefined

  if (!animal) {
    failures += 1
    console.log('  ✗ не нашлось животного с обоими родителями — родословную мерить не на чем')
  } else {
    console.log(`  (на животном № ${animal.identNumber})\n`)

    await measure({
      what: 'родословная, три ряда',
      limitMs: 1000,
      run: async () => (await buildPedigree(payload, animal, 3)).length,
    })
    await measure({
      what: 'родословная, девять рядов',
      run: async () => (await buildPedigree(payload, animal, 9)).length,
    })

    /*
     * Свидетельство — единственное место, где порог ТЗ пять секунд,
     * а не одна. Это оправдано: внутри сборка родословной, разбор
     * происхождения и расчёт инбридинга. Но пять секунд — это порог
     * отказа, а не цель: человек, нажавший «выдать», к третьей секунде
     * успевает решить, что кнопка не сработала.
     */
    await measure({
      what: 'свидетельство целиком (порог ТЗ — 5000 мс)',
      limitMs: 5000,
      run: async () => {
        const view = await buildCertificateView(payload, animal, 'pedigree')
        return view.nodes.length
      },
    })
  }

  /* ---------------------------------------------------------------- */
  console.log('\nКабинет хозяйства\n')

  const org = await payload.find({
    collection: 'organizations',
    limit: 1,
    depth: 0,
    sort: '-createdAt',
    overrideAccess: true,
  })
  const orgId = org.docs[0]?.id as number | undefined

  if (!orgId) {
    console.log('  ! организаций в базе нет — разбор стада мерить не на чем')
  } else {
    await measure({
      what: 'сводка по стаду (Обзор)',
      limitMs: 1000,
      run: async () => {
        const s = await herdSummary(payload, orgId)
        return s ? 1 : 0
      },
    })
  }

  /* ---------------------------------------------------------------- */
  console.log('\nВыгрузка стада\n')

  /*
   * Порога у выгрузки в ТЗ нет, и придумывать его здесь не будем.
   * Меряется она потому, что это единственное место, где система
   * сознательно берёт двадцать тысяч записей разом, — и если что-то
   * упрётся в память или время, упрётся оно здесь.
   */
  await measure({
    what: `выгрузка ${EXPORT_LIMIT.toLocaleString('ru-RU')} записей из базы`,
    run: async () => {
      const res = await payload.find({
        collection: 'animals',
        limit: EXPORT_LIMIT,
        depth: 1,
        sort: 'identNumber',
        overrideAccess: true,
      })
      return res.docs.length
    },
  })

  /* ---------------------------------------------------------------- */
  if (PARALLEL > 0) {
    console.log(`\nОдновременные читатели: ${PARALLEL}\n`)

    /*
     * Это не проверка «пятисот пользователей» из ТЗ и выдавать её
     * за неё нельзя. Пятьсот пользователей — это пятьсот браузеров,
     * своя сеть, свои страницы целиком и пул соединений на другой
     * стороне; здесь один процесс шлёт запросы в один пул. Меряется
     * ровно одно, зато честно: во сколько раз проседает время ответа,
     * когда запросов много. Если проседает линейно — упирается в пул,
     * если хуже — в саму базу.
     */
    const one = find({ sort: 'ipc' })
    const [, single] = await timed(one)

    const t = process.hrtime.bigint()
    await Promise.all(Array.from({ length: PARALLEL }, () => one()))
    const all = Number(process.hrtime.bigint() - t) / 1e6

    console.log(`  один запрос                      ${ms(single)}`)
    console.log(`  ${String(PARALLEL).padEnd(4)} одновременно, всего        ${ms(all)}`)
    console.log(`  в пересчёте на запрос            ${ms(all / PARALLEL)}`)
    console.log(`  просадка                         ×${(all / PARALLEL / single).toFixed(1)}`)
  }

  console.log(
    failures === 0
      ? '\nВсе пороги выдержаны.\n'
      : `\nПорогов превышено: ${failures}.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
