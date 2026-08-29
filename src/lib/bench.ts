import os from 'node:os'
import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'
import { buildAnimalWhere, resolveSort, type SearchParams } from '@/lib/animal-query'
import { buildCertificateView } from '@/lib/certificate-view'
import { buildPedigree } from '@/lib/pedigree'
import { herdSummary } from '@/lib/herd-summary'
import { EXPORT_LIMIT } from '@/lib/export-formats'
import { isLocalDatabase, resolveDatabase } from '@/lib/db-url'
import type { BenchMeasurement, BenchRow, BenchServer } from '@/lib/bench-report'
import { poolOf } from '@/lib/sql'

/**
 * Замер по критериям приёмки: поиск, свидетельство, выгрузка.
 *
 * ## Почему измерение живёт здесь, а не в скрипте
 *
 * Замер зовут из двух мест, и оба нужны. Со своей машины его запускает
 * скрипт — там он печатает по ходу и складывает отчёт в файл. На проде
 * консоли внутрь контейнера нет, и замер зовётся закрытым маршрутом,
 * который отдаёт тот же результат ответом.
 *
 * Разведи мы эти два пути по двум копиям кода — и они разошлись бы
 * при первой же правке сценария, а сравнивать среды после этого стало
 * бы нельзя: колонки в таблице означали бы разное. Поэтому сценарии
 * здесь одни, а разница между вызывающими сводится к тому, что делать
 * с готовыми строками.
 *
 * ## Что меряется и почему именно так
 *
 * **Меряется путь страницы, а не запрос к базе.** Соблазн был написать
 * прямые `select` и получить красивые миллисекунды. Они были бы правдой
 * о базе и неправдой о системе: страница строит `where` из адреса,
 * просит Payload разрешить связи, считает общее число записей для
 * постраничной навигации — и каждый шаг вносит своё.
 *
 * **Берётся медиана и худшее, среднее не берётся.** Среднее прячет
 * выброс: девять запросов по сто миллисекунд и один на четыре секунды
 * дают среднее в полсекунды и вывод «укладываемся». Критерий приёмки
 * не про среднее — он про то, сколько человек ждёт, и ждёт он в том
 * числе тот десятый раз.
 *
 * **Первый прогон считается отдельно, а не отбрасывается.** Он греет
 * кэш и по нему нельзя судить об установившемся темпе — но именно его
 * получает первый человек, открывший книгу утром.
 */

export type BenchOptions = {
  runs?: number
  label?: string
  /**
   * Прогонять ли разбор выгрузки по слоям.
   *
   * По умолчанию — нет, и это не осторожность, а вывод из случившегося.
   * Первый же замер на боевом сервере дошёл до этих сценариев и **уронил
   * контейнер**: `Reached heap limit — JavaScript heap out of memory`.
   * Двадцать тысяч документов Payload со всеми группами не помещаются
   * в память боевой машины, и замер, который валит то, что меряет,
   * не замер, а поломка.
   *
   * Сценарии эти написаны были ради одного разового вопроса — где именно
   * теряются секунды, — и на него они ответили: прямой запрос 122 мс
   * против 6 349 у Payload. Ответ получен, выгрузка переведена на прямой
   * запрос, и повторять опыт при каждом замере незачем.
   *
   * Остаются доступными по явному требованию: вопрос может вернуться,
   * а способ ответить на него — нет.
   */
  heavy?: boolean
  /** Зовётся на каждой готовой строке — скрипту, чтобы печатать по ходу. */
  onRow?: (row: BenchRow) => void
  /** Зовётся на каждом новом разделе. */
  onGroup?: (name: string) => void
  /** Зовётся с замечанием, которое не является строкой замера. */
  onNote?: (text: string) => void
}

type Scenario = {
  what: string
  limitMs?: number
  run: () => Promise<number>
  /**
   * Прогонов именно у этого сценария.
   *
   * Нужно тяжёлым: выгрузка двадцати тысяч записей с развёрнутыми связями
   * идёт секундами, и десять прогонов превращают замер в трёхминутное
   * ожидание ради разброса, которого там нет. Число попадает в отчёт,
   * чтобы «медиана из трёх» не выдавала себя за «медиану из десяти».
   */
  runs?: number
}

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

/**
 * На чём мерили.
 *
 * Без этого блока весь отчёт — набор чисел без единицы измерения.
 * «Поиск 59 мс» ничего не значит, пока не сказано, на какой машине,
 * с какой базой и на каком объёме: те же 59 мс на ноутбуке разработчика
 * и на контейнере с одним ядром — два разных утверждения о системе.
 *
 * Настройки PostgreSQL спрашиваются у самой базы, а не берутся
 * из конфигурации: между тем, что написано в файле, и тем, с чем
 * работает сервер, лежит его перезапуск.
 */
export async function serverInfo(payload: Payload): Promise<BenchServer> {
  const pool = poolOf(payload)

  const ask = async (q: string): Promise<Record<string, unknown>[]> => {
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
    "select name, setting, unit from pg_settings where name in" +
      " ('shared_buffers','work_mem','effective_cache_size','max_connections'," +
      "'max_parallel_workers_per_gather')",
  )
  const [size] = await ask('select pg_size_pretty(pg_database_size(current_database())) as size')

  const cpus = os.cpus()
  const { uri } = resolveDatabase()

  return {
    at: new Date().toISOString(),
    /*
     * Признак «база не здесь» — половина смысла замера против прода.
     *
     * Запуск со своей машины против удалённой базы меряет не прод,
     * а канал до него: каждый запрос везёт задержку сети, и на мелких
     * сценариях она и есть весь результат. Отчёт обязан различать эти
     * два случая, иначе цифры сравнят как равные.
     */
    remoteDatabase: !isLocalDatabase(uri),
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: cpus[0]?.model?.trim() ?? '',
    cores: cpus.length,
    memoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    postgres: String(version?.v ?? '').split(' on ')[0] ?? '',
    databaseSize: String(size?.size ?? ''),
    settings: Object.fromEntries(
      settings.map((r) => [
        String(r.name),
        `${String(r.setting)}${r.unit ? ` ${String(r.unit)}` : ''}`,
      ]),
    ),
  }
}

export async function runBench(
  payload: Payload,
  options: BenchOptions = {},
): Promise<BenchMeasurement> {
  const RUNS = options.runs ?? 10
  const rows: BenchRow[] = []
  let group = ''

  const note = (t: string) => options.onNote?.(t)
  const startGroup = (name: string) => {
    group = name
    options.onGroup?.(name)
  }

  const measure = async (s: Scenario) => {
    const runs = s.runs ?? RUNS
    const [, cold] = await timed(s.run)

    const warm: number[] = []
    let got = 0
    for (let i = 0; i < runs; i++) {
      const [n, took] = await timed(s.run)
      warm.push(took)
      got = n
    }

    const row: BenchRow = {
      group,
      what: s.what,
      runs,
      medianMs: Math.round(median(warm)),
      worstMs: Math.round(Math.max(...warm)),
      coldMs: Math.round(cold),
      rows: got,
      limitMs: s.limitMs,
      ok: s.limitMs === undefined ? undefined : Math.max(...warm) <= s.limitMs,
    }

    rows.push(row)
    options.onRow?.(row)
  }

  const total = await payload.count({ collection: 'animals', overrideAccess: true })

  /*
   * Объём назван вслух и сравнён с требованием. Замер на шестистах
   * записях выглядит точно так же, как замер на пятидесяти тысячах —
   * те же строки, те же миллисекунды, — и разницу видит только тот,
   * кто помнит, сколько записей было. Помнить должен замер.
   */
  if (total.totalDocs < 50_000)
    note(
      `В базе ${total.totalDocs.toLocaleString('ru-RU')} записей, а требование ` +
        'сформулировано на пятидесяти тысячах. Цифры говорят о системе на текущем ' +
        'объёме и о приёмке не говорят ничего.',
    )

  /* ---------------------------------------------------------------- */
  startGroup('Поиск по книге')

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
  await measure({ what: 'номер по подстроке', limitMs: 1000, run: find({ id: '99' }) })
  await measure({ what: 'кличка по подстроке', limitMs: 1000, run: find({ name: 'а' }) })
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
  await measure({ what: 'порядок по ИПЦ', limitMs: 1000, run: find({ sort: 'ipc' }) })
  /*
   * Глубокая страница — отдельный сценарий, потому что ломается иначе,
   * чем первая: `offset` в PostgreSQL честно пролистывает всё, что
   * пропускает. На двадцать пятой странице это незаметно, на двухсотой
   * уже нет, а до неё доходят: отбор по признаку и порядок по индексу
   * ровно для того и заведены, чтобы смотреть хвост.
   */
  await measure({
    what: 'страница 200 того же отбора',
    limitMs: 1000,
    run: find({ page: '200', sort: 'ipc' }),
  })
  await measure({ what: 'страница на 500 строк', limitMs: 1000, run: find({ perPage: '500' }, 500) })

  /* ---------------------------------------------------------------- */
  startGroup('Карточка и родословная')

  const sample = await payload.find({
    collection: 'animals',
    /*
     * Поля родителей называются `father` и `mother`, а не `sire` и `dam`.
     * Первая редакция спрашивала по-английски, как в мировых каталогах,
     * и падала на `The following paths cannot be queried`. Ошибка полезная:
     * Payload проверяет пути запроса по конфигурации, а не подставляет
     * пустоту, — молчаливого «ничего не нашлось» здесь не бывает.
     */
    where: { and: [{ father: { exists: true } }, { mother: { exists: true } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const animal = sample.docs[0] as Animal | undefined

  if (!animal) {
    note('Животного с обоими родителями не нашлось — родословную мерить не на чем.')
  } else {
    note(`Родословная и свидетельство — на животном № ${animal.identNumber}.`)

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
     * происхождения и расчёт инбридинга. Но пять секунд — порог отказа,
     * а не цель: человек, нажавший «выдать», к третьей секунде успевает
     * решить, что кнопка не сработала.
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
  startGroup('Кабинет хозяйства')

  const org = await payload.find({
    collection: 'organizations',
    limit: 1,
    depth: 0,
    sort: '-createdAt',
    overrideAccess: true,
  })
  const orgId = org.docs[0]?.id as number | undefined

  if (!orgId) note('Организаций в базе нет — сводку по стаду мерить не на чем.')
  else
    await measure({
      what: 'сводка по стаду (Обзор)',
      limitMs: 1000,
      run: async () => {
        const s = await herdSummary(payload, orgId)
        return s ? 1 : 0
      },
    })

  /* ---------------------------------------------------------------- */
  startGroup('Выгрузка стада')

  const exportSelect = {
    identNumber: true,
    name: true,
    sex: true,
    state: true,
    ageGroup: true,
    birthDate: true,
    summary: true,
    ipc: true,
    owner: true,
  } as const

  /*
   * Порога у выгрузки в ТЗ нет, и придумывать его здесь не будем.
   * Меряется она потому, что это единственное место, где система
   * сознательно берёт двадцать тысяч записей разом.
   *
   * ## Почему по умолчанию меряется только прямой запрос
   *
   * Потому что именно им выгрузка теперь и работает. Замер обязан мерить
   * то, что система делает сегодня, а не то, что она делала до починки.
   *
   * Есть и вторая причина, весомее первой. Прогон через Payload
   * на боевом сервере **уронил контейнер**: двадцать тысяч документов
   * со всеми группами не поместились в память, и процесс умер
   * с `Reached heap limit`. Замер, валящий то, что он меряет, — поломка,
   * а не измерение. Разбор по слоям остаётся доступным по явному
   * требованию: он ответил на свой вопрос один раз и может понадобиться
   * снова, но не при каждом запуске.
   */
  const pool = poolOf(payload)

  if (pool)
    await measure({
      what: `выгрузка ${EXPORT_LIMIT.toLocaleString('ru-RU')} записей (как в кабинете)`,
      runs: 3,
      run: async () => {
        const r = await pool.query(
          'select ident_number, name, sex, state, age_group, birth_date,' +
            ' summary_milk_yield, summary_fat_percent, summary_protein_percent,' +
            ' summary_fat_kg, summary_protein_kg, summary_fat_protein_sum, ipc, owner_id' +
            ' from animals order by ident_number limit $1',
          [EXPORT_LIMIT],
        )
        return r.rows?.length ?? 0
      },
    })

  if (options.heavy) {
    /*
     * Разбор по слоям: сколько стоит сам Payload на двадцати тысячах
     * записей. Прямой запрос выше — нижняя граница; разница с ним и есть
     * цена слоя. Здесь она измерена трижды: с полным документом,
     * с развёрнутыми связями и с просьбой отдать только нужные поля.
     *
     * Запускать это на боевом сервере нельзя — проверено падением.
     */
    startGroup('Выгрузка стада: разбор по слоям')

    const exportSelect = {
      identNumber: true,
      name: true,
      sex: true,
      state: true,
      ageGroup: true,
      birthDate: true,
      summary: true,
      ipc: true,
      owner: true,
    } as const

    await measure({
      what: 'через Payload, полный документ',
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
      what: 'то же с развёрнутыми связями (JSON)',
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

    await measure({
      what: 'через Payload, только нужные поля',
      runs: 3,
      run: async () => {
        const res = await payload.find({
          collection: 'animals',
          limit: EXPORT_LIMIT,
          depth: 0,
          select: exportSelect,
          sort: 'identNumber',
          overrideAccess: true,
        })
        return res.docs.length
      },
    })
  }

  return {
    label: options.label ?? os.hostname(),
    animals: total.totalDocs,
    runs: RUNS,
    server: await serverInfo(payload),
    rows,
  }
}
