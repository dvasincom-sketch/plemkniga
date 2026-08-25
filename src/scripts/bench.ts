import 'dotenv/config'
import os from 'node:os'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Animal } from '@/payload-types'
import { buildAnimalWhere, resolveSort, type SearchParams } from '@/lib/animal-query'
import { buildCertificateView } from '@/lib/certificate-view'
import { buildPedigree } from '@/lib/pedigree'
import { herdSummary } from '@/lib/herd-summary'
import { EXPORT_LIMIT } from '@/lib/export-formats'
import { isLocalDatabase, resolveDatabase } from '@/lib/db-url'

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
 *   npm run bench -- --save           — записать отчёт для вкладки «Замер»
 *   npm run bench -- --save --label Прод   — записать под своим именем среды
 *   npm run bench -- --save --out /tmp/b.json  — положить отчёт в другое место
 *
 * ## Запуск в боевом контейнере
 *
 * Замер прода делается на проде, а не со своей машины против прод-базы:
 * во втором случае меряется канал до неё, и на сценариях в двадцать
 * миллисекунд задержка сети и будет всем результатом.
 *
 * В образе нет ни исходников, ни `tsx`, поэтому при сборке замер
 * собирается в один файл (`npm run bench:bundle`) и кладётся рядом
 * с приложением. Порядок — в `docs/razvertyvanie.md`.
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
 * Как называется среда, в которой мерили.
 *
 * Задаётся руками, потому что машина о себе этого не знает: имя хоста
 * у ноутбука и у контейнера одинаково бессмысленно для читателя,
 * а вопрос «где эти цифры получены» требует ответа «на проде»
 * или «на моей машине». Без метки — имя хоста, чтобы замеры хотя бы
 * не затирали друг друга.
 */
const labelArg = (): string => {
  const i = process.argv.indexOf('--label')
  if (i === -1) return os.hostname()

  /*
   * Метка собирается из всех слов до следующего ключа, а не из одного.
   *
   * «Локальная машина» — два слова, и в оболочке без кавычек второе
   * теряется: в отчёт попадает замер с именем «Локальная», а рядом
   * остаётся прежний под правильным именем. Так уже случилось, и вышло
   * хуже, чем просто некрасивое имя: два замера одной и той же среды
   * встали колонками рядом, изображая сравнение.
   *
   * Требовать кавычек было бы правильно и бесполезно: команду набирают
   * руками, а имя среды по-русски почти всегда из двух слов.
   */
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
 * Файл в репозитории, а не запись в базе, и это решение, а не удобство.
 * Замер — факт об одной версии кода на одном железе: он не «текущее
 * состояние системы», которое надо где-то держать свежим, а измерение,
 * сделанное такого-то числа. Его место рядом с кодом, который он мерил,
 * и коммитится он тем же коммитом. Запись в базе означала бы, что цифры
 * с чьей-то машины попадают в базу прода и показываются как его цифры.
 */
const REPORT_PATH = (): string => {
  const i = process.argv.indexOf('--out')
  const v = i === -1 ? '' : (process.argv[i + 1] ?? '')
  /*
   * Путь можно назвать, потому что в боевом контейнере исходников нет:
   * там замер лежит одним собранным файлом, а отчёт пишется во временный
   * каталог и забирается наружу. Умолчание остаётся местным — на своей
   * машине отчёт должен ложиться туда, откуда его коммитят.
   */
  return v && !v.startsWith('--') ? v : 'src/lib/bench-report.json'
}

/** Пороги из раздела о критериях приёмки. Отсутствие порога — просто замер. */
type Scenario = {
  what: string
  limitMs?: number
  run: () => Promise<number>
  /**
   * Прогонов именно у этого сценария.
   *
   * Нужно тяжёлым: выгрузка двадцати тысяч записей с развёрнутыми связями
   * идёт секундами, и десять прогонов превращают замер в трёхминутное
   * ожидание ради разброса, которого там нет. У быстрых сценариев разброс
   * есть и важен — там прогонов много. Число печатается в отчёте, чтобы
   * «медиана из трёх» не выдавала себя за «медиану из десяти».
   */
  runs?: number
}

/**
 * Строка отчёта — то же, что печатается, только пригодное для чтения
 * страницей.
 *
 * Собирается по ходу замера, а не парсится потом из напечатанного:
 * разбор собственного вывода — способ однажды поменять формат печати
 * и молча сломать отчёт.
 */
type Row = {
  group: string
  what: string
  /** Сколько раз прогоняли: у тяжёлых сценариев меньше, чем у прочих. */
  runs: number
  medianMs: number
  worstMs: number
  coldMs: number
  rows: number
  limitMs?: number
  ok?: boolean
}

const report: Row[] = []
let group = ''

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
  const runs = s.runs ?? RUNS
  const [, cold] = await timed(s.run)

  const warm: number[] = []
  let rows = 0
  for (let i = 0; i < runs; i++) {
    const [n, took] = await timed(s.run)
    warm.push(took)
    rows = n
  }

  const med = median(warm)
  const worst = Math.max(...warm)

  const verdict = s.limitMs === undefined ? '' : worst <= s.limitMs ? '  укладывается' : '  ПРЕВЫШЕН'
  if (s.limitMs !== undefined && worst > s.limitMs) failures += 1

  report.push({
    group,
    what: s.what,
    runs,
    medianMs: Math.round(med),
    worstMs: Math.round(worst),
    coldMs: Math.round(cold),
    rows,
    limitMs: s.limitMs,
    ok: s.limitMs === undefined ? undefined : worst <= s.limitMs,
  })

  console.log(
    `  ${s.what.padEnd(46)} медиана ${ms(med).padStart(8)}` +
      `   худшее ${ms(worst).padStart(8)}` +
      `   первый ${ms(cold).padStart(8)}` +
      (rows ? `   строк ${rows}` : '') +
      verdict,
  )
}

/**
 * На чём мерили.
 *
 * Без этого блока весь отчёт — набор чисел без единицы измерения.
 * «Поиск 59 мс» ничего не значит, пока не сказано, на какой машине,
 * с какой базой и на каком объёме: те же 59 мс на ноутбуке разработчика
 * и на контейнере с одним ядром — два разных утверждения о системе,
 * и второе из первого не следует.
 *
 * Настройки PostgreSQL спрашиваются у самой базы, а не берутся
 * из конфигурации: между тем, что написано в файле, и тем, с чем
 * работает сервер, лежит его перезапуск.
 */
async function serverInfo(payload: Awaited<ReturnType<typeof getPayload>>) {
  const pool = (payload.db as unknown as { pool?: { query: (q: string) => Promise<{ rows: Record<string, string>[] }> } }).pool

  const ask = async (q: string): Promise<Record<string, string>[]> => {
    if (!pool) return []
    return pool
      .query(q)
      .then((r) => r.rows ?? [])
      /*
       * Отказ печатается, а не проглатывается. Пустая строка «версия
       * PostgreSQL» в отчёте выглядит так же, как «не спросили», —
       * а означает разное.
       */
      .catch((e: unknown) => {
        console.error('[bench] не удалось спросить у базы:', e)
        return []
      })
  }

  const [version] = await ask('select version() as v')
  const settings = await ask(
    `select name, setting, unit from pg_settings
      where name in ('shared_buffers','work_mem','effective_cache_size','max_connections','max_parallel_workers_per_gather')`,
  )
  const [size] = await ask(
    'select pg_size_pretty(pg_database_size(current_database())) as size',
  )

  const cpus = os.cpus()
  const { uri } = resolveDatabase()

  return {
    at: new Date().toISOString(),
    /*
     * Признак «база не здесь» — половина смысла замера против прода.
     *
     * Запуск скрипта со своей машины против удалённой базы меряет
     * не прод, а «моя машина плюс сеть до прода»: каждый запрос везёт
     * с собой задержку канала, и на мелких сценариях она и есть весь
     * результат. Настоящий замер прода делается на самом проде. Отчёт
     * обязан различать эти два случая, иначе цифры сравнят как равные.
     */
    remoteDatabase: !isLocalDatabase(uri),
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: cpus[0]?.model?.trim() ?? '',
    cores: cpus.length,
    memoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    postgres: (version?.v ?? '').split(' on ')[0] ?? '',
    databaseSize: size?.size ?? '',
    settings: Object.fromEntries(
      settings.map((r) => [r.name, `${r.setting}${r.unit ? ` ${r.unit}` : ''}`]),
    ),
  }
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
  group = 'Поиск по книге'
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
  group = 'Карточка и родословная'
  console.log('\nКарточка и родословная\n')

  const sample = await payload.find({
    collection: 'animals',
    /*
     * Поля родителей называются `father` и `mother`, а не `sire` и `dam`.
     * Первая редакция замера спрашивала по-английски, как в мировых
     * каталогах, и падала на `The following paths cannot be queried`.
     * Ошибка полезная: она напомнила, что Payload проверяет пути запроса
     * по конфигурации, а не подставляет пустоту, — молчаливого «ничего
     * не нашлось» здесь не бывает.
     */
    where: { and: [{ father: { exists: true } }, { mother: { exists: true } }] },
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
  group = 'Кабинет хозяйства'
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
  group = 'Выгрузка стада'
  console.log('\nВыгрузка стада\n')

  /*
   * Порога у выгрузки в ТЗ нет, и придумывать его здесь не будем.
   * Меряется она потому, что это единственное место, где система
   * сознательно берёт двадцать тысяч записей разом, — и если что-то
   * упрётся в память или время, упрётся оно здесь.
   *
   * Так и вышло: первый прогон дал шестнадцать секунд при том, что всё
   * остальное укладывалось в полсекунды. Причина была не в объёме,
   * а в `depth: 1` — Payload разворачивал связь с владельцем у каждой
   * из двадцати тысяч строк ради одной колонки. Оба сценария оставлены
   * рядом намеренно: разница между ними и есть цена развёрнутых связей,
   * и увидеть её надо не при следующем таком же замере, а сразу.
   */
  await measure({
    what: `выгрузка ${EXPORT_LIMIT.toLocaleString('ru-RU')} записей (таблица)`,
    runs: 3,
    run: async () => {
      const res = await payload.find({
        collection: 'animals',
        limit: EXPORT_LIMIT,
        depth: 0,
        sort: 'identNumber',
        overrideAccess: true,
      })
      return res.docs.length
    },
  })

  await measure({
    what: `то же с развёрнутыми связями (JSON)`,
    runs: 3,
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

  /*
   * Разбор по слоям: где именно уходят четырнадцать секунд.
   *
   * Первая догадка была «в глубине связей», и она оказалась неверной:
   * `depth: 0` снял шесть секунд из двадцати, а четырнадцать остались.
   * Догадка вторая — что дорога сама сборка документа: у карточки
   * животного больше ста полей, и Payload превращает каждую строку базы
   * в документ со всеми группами, проверками и хуками чтения. Двадцать
   * тысяч раз.
   *
   * Три сценария ниже отвечают на это замером, а не рассуждением.
   * Прямой запрос — нижняя граница, быстрее не будет никогда. `select`
   * оставляет Payload на месте, но просит у него четырнадцать полей
   * вместо ста. Разница между этими двумя и есть цена слоя.
   */
  const pool = (payload.db as unknown as { pool?: { query: (q: string) => Promise<{ rows: unknown[] }> } }).pool

  if (pool) {
    await measure({
      what: 'нижняя граница: прямой запрос к базе',
      runs: 3,
      run: async () => {
        const r = await pool.query(
          `select ident_number, name, sex, state, age_group, birth_date,
                  summary_milk_yield, summary_fat_percent, summary_protein_percent,
                  summary_fat_kg, summary_protein_kg, summary_fat_protein_sum, ipc, owner_id
             from animals
            order by ident_number
            limit ${EXPORT_LIMIT}`,
        )
        return r.rows.length
      },
    })
  }

  await measure({
    what: 'через Payload, но только нужные поля',
    runs: 3,
    run: async () => {
      const res = await payload.find({
        collection: 'animals',
        limit: EXPORT_LIMIT,
        depth: 0,
        select: {
          identNumber: true,
          name: true,
          sex: true,
          state: true,
          ageGroup: true,
          birthDate: true,
          summary: true,
          ipc: true,
          owner: true,
        },
        sort: 'identNumber',
        overrideAccess: true,
      })
      return res.docs.length
    },
  })

  /*
   * И то же без подсчёта общего числа записей. Постраничная навигация
   * выгрузке не нужна, а `count(*)` по полумиллиону строк — отдельный
   * запрос на каждый вызов.
   *
   * Число строк здесь печатается не для красоты: если Payload при
   * `pagination: false` перестанет уважать `limit`, сценарий вернёт
   * не двадцать тысяч, а всё стадо — и это будет видно сразу, до того
   * как такая правка уедет в выгрузку.
   */
  await measure({
    what: 'то же без подсчёта общего числа',
    runs: 3,
    run: async () => {
      const res = await payload.find({
        collection: 'animals',
        limit: EXPORT_LIMIT,
        depth: 0,
        pagination: false,
        select: {
          identNumber: true,
          name: true,
          sex: true,
          state: true,
          ageGroup: true,
          birthDate: true,
          summary: true,
          ipc: true,
          owner: true,
        },
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

  if (SAVE) {
    const server = await serverInfo(payload)
    const label = labelArg()

    const measured = {
      label,
      /*
       * Объём записан в замер, а не выведен из него потом. Число животных
       * — половина смысла всех остальных цифр, и отчёт, в котором его нет,
       * читается как утверждение о системе вообще. У разных сред объём
       * разный, поэтому число лежит у каждого замера своё.
       */
      animals: total.totalDocs,
      runs: RUNS,
      server,
      rows: report,
    }

    /*
     * Замеры копятся списком, а не переписывают друг друга: вкладка
     * показывает их рядом, и в этом весь смысл — «на моей машине» против
     * «на проде». Совпавшая метка заменяет прежний замер той же среды:
     * два замера одного и того же места — это не сравнение, а история,
     * а история здесь ни к чему.
     */
    const before = await readFile(REPORT_PATH(), 'utf8')
      .then((t) => JSON.parse(t) as { reports?: unknown[] })
      .catch(() => ({ reports: [] as unknown[] }))

    const kept = (before.reports ?? []).filter(
      (r) => (r as { label?: string }).label !== label,
    )

    const out = { reports: [...kept, measured] }

    await writeFile(REPORT_PATH(), JSON.stringify(out, null, 2) + '\n', 'utf8')
    console.log(`Отчёт записан: ${REPORT_PATH()} (среда «${label}»)`)
    console.log(`  ${server.cpu}, ядер ${server.cores}, память ${server.memoryGb} ГБ`)
    console.log(`  ${server.postgres}, база ${server.databaseSize}`)
    if (server.remoteDatabase)
      console.log('  ! База не местная — в цифрах сидит задержка сети до неё')
    console.log()
  }

  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
