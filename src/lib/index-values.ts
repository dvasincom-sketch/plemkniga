import type { Payload, PayloadRequest, Where } from 'payload'
import {
  BUILTIN_PROFILES,
  DEFAULT_BASE,
  computeIndex,
  type Base,
  type IndexProfile,
} from '@/lib/breeding-index'
import { loadActiveBase } from '@/lib/index-base'
import { profileOfDoc } from '@/lib/index-profiles'
import type { Animal, IndexProfile as IndexProfileDoc } from '@/payload-types'

/**
 * Пересчёт хранимых значений индекса.
 *
 * Значение зависит от двух вещей: от оценок животного и от весов профиля.
 * Значит, и пересчитывать нужно по двум поводам — изменилось животное
 * (пересчитать его по всем профилям) или изменился профиль (пересчитать
 * по нему всех животных). Третий повод — смена версии базы сравнения;
 * она меняется вместе с кодом, и на этот случай есть `npm run backfill:index`.
 *
 * Пересчёт по профилю недёшев: он трогает каждое животное книги. Это осознанная
 * цена. Правка весов — редкое действие уровня главного генетика, а расплата
 * за неё — мгновенный и точный порядок в списках для всех остальных, каждый
 * день. Обратный размен (считать на лету при каждом показе) мы уже проходили:
 * он упирался в потолок ранжирования.
 */

/**
 * Отключает пересчёт в хуках.
 *
 * Нужен сиду: он создаёт сотни животных подряд, и пересчёт после каждого
 * растянул бы наполнение базы на десятки минут ради значений, которые всё
 * равно будут перезаписаны в конце. Сид сам вызывает полный пересчёт,
 * когда данные на месте.
 */
export const skipRecompute = () => process.env.INDEX_VALUES_SKIP === '1'

/** Все профили, по которым сейчас имеет смысл держать значения. */
export async function profilesInUse(payload: Payload): Promise<IndexProfile[]> {
  const own = await payload.find({
    collection: 'index-profiles',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  return [...BUILTIN_PROFILES, ...(own.docs as IndexProfileDoc[]).map(profileOfDoc)]
}

const rowOf = (animal: Animal, profile: IndexProfile, base: Base) => {
  const r = computeIndex(animal, profile, base)
  const owner = animal.owner
  return {
    animal: animal.id as number,
    // Копии для отбора без join — разбор в src/collections/IndexValues.ts
    owner: (typeof owner === 'object' && owner ? owner.id : owner) ?? null,
    publicVisible: Boolean(animal.publicVisible),
    archived: Boolean(animal.archived),
    state: animal.state ?? null,
    birthYear: animal.birthDate ? new Date(animal.birthDate).getUTCFullYear() : null,
    profileKey: profile.key,
    profileName: profile.name,
    kind: profile.kind,
    // Снимок весов: профиль переименуют и перенастроят, а выпущенный
    // документ с этим числом останется
    weights: profile.weights,
    baseVersion: r.baseVersion,
    value: Math.round(r.value * 100) / 100,
    reliability: Math.round(r.reliability),
    used: r.used,
    computedAt: new Date().toISOString(),
  }
}

type Row = ReturnType<typeof rowOf>

type SqlPool = {
  query: (
    q: string,
    p?: unknown[],
  ) => Promise<{ rowCount: number | null; rows?: Record<string, unknown>[] }>
}

const poolOf = (payload: Payload): SqlPool => {
  const pool = (payload.db as unknown as { pool?: SqlPool }).pool
  if (!pool) throw new Error('Пересчёт индекса рассчитан на PostgreSQL-адаптер')
  return pool
}

/**
 * Запись строк одним запросом, в обход Payload.
 *
 * `payload.create` на каждую строку — это отдельный запрос, прогон хуков
 * и проверка прав. Для служебной таблицы всё это лишнее: строки пишет только
 * пересчёт, хуков у коллекции нет, права проверяются на чтении. Разница
 * не косметическая: пересчёт книги в шесть профилей занимал около минуты,
 * пакетная вставка укладывается в секунды — а пересчёт по профилю происходит
 * прямо во время сохранения весов, и человек его ждёт.
 *
 * Чтение при этом остаётся полностью на Payload: обход абстракции
 * ограничен одной операцией, у которой есть измеримая причина.
 */
async function insertRows(payload: Payload, rows: Row[]): Promise<void> {
  if (!rows.length) return
  const pool = poolOf(payload)

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const params: unknown[] = []
    const values = chunk
      .map((r) => {
        const at = params.length
        params.push(
          r.animal,
          r.profileKey,
          r.profileName,
          r.kind,
          JSON.stringify(r.weights),
          r.baseVersion,
          r.value,
          r.reliability,
          r.used,
          r.computedAt,
          r.owner,
          r.publicVisible,
          r.archived,
          r.state,
          r.birthYear,
        )
        return `($${at + 1},$${at + 2},$${at + 3},$${at + 4},$${at + 5}::jsonb,$${at + 6},$${at + 7},$${at + 8},$${at + 9},$${at + 10},$${at + 11},$${at + 12},$${at + 13},$${at + 14},$${at + 15},now(),now())`
      })
      .join(',')

    await pool.query(
      `insert into index_values
         (animal_id, profile_key, profile_name, kind, weights, base_version,
          value, reliability, used, computed_at,
          owner_id, public_visible, archived, state, birth_year,
          updated_at, created_at)
       values ${values}`,
      params,
    )
  }
}

/**
 * Пересчитать одно животное по всем профилям.
 *
 * Пишется через Payload, а не пакетной вставкой, и на то есть причина.
 * Вызов приходит из хука сохранения животного, то есть изнутри открытой
 * транзакции. Пакетная вставка идёт по своему подключению, вне этой
 * транзакции, — и упирается в блокировку, которую держит ещё не завершённое
 * сохранение. Запрос повисает до таймаута, а вместе с ним и сохранение
 * животного.
 *
 * Поэтому здесь передаётся `req`: записи попадают в ту же транзакцию
 * и живут по её правилам. Строк на одно животное столько же, сколько
 * профилей, — на этом объёме разница в скорости не имеет значения.
 */
export async function recomputeAnimal(
  payload: Payload,
  animal: Animal,
  opts: { profiles?: IndexProfile[]; base?: Base; req?: PayloadRequest } = {},
): Promise<number> {
  const { req } = opts
  const list = opts.profiles ?? (await profilesInUse(payload))
  const base = opts.base ?? (await loadActiveBase(payload))
  const scope = req ? { req } : {}

  /*
   * Сначала удалить, потом создать. Обновление потребовало бы поиска строки
   * по паре «животное + профиль» перед каждой записью — вдвое больше запросов
   * ради того же результата.
   */
  await payload.delete({
    collection: 'index-values',
    where: { animal: { equals: animal.id } },
    overrideAccess: true,
    ...scope,
  })

  if (!req) {
    await insertRows(
      payload,
      list.map((profile) => rowOf(animal, profile, base)),
    )
    return list.length
  }

  for (const profile of list) {
    await payload.create({
      collection: 'index-values',
      data: rowOf(animal, profile, base),
      overrideAccess: true,
      req,
    })
  }
  return list.length
}

/**
 * Пересчитать один профиль по всем животным.
 *
 * Пакетная вставка по отдельному подключению, вне транзакции сохранения
 * профиля. Так это работает быстро, но означает, что между удалением старых
 * значений и записью новых профиль на секунду выглядит непосчитанным,
 * а откат сохранения оставит значения от несохранённых весов.
 *
 * И то и другое переживаемо: список в этот момент откатывается к расчёту
 * в памяти, а не ломается, следующее сохранение или `npm run backfill:index`
 * приводит всё в порядок. Плата за строгость здесь была бы больше: тысячи
 * строк внутри транзакции сохранения профиля держали бы её открытой всё
 * время пересчёта.
 */

/* --------------------- Быстрое чтение животных пачками -------------------- */

/**
 * Признаки, из которых считается индекс, — плоскими колонками базы.
 *
 * Полный документ животного здесь не нужен: `computeIndex` читает
 * одиннадцать признаков и больше ничего. Тянуть ради них 128 колонок
 * через гидратацию Payload — самая дорогая часть пересчёта.
 */
const TRAIT_COLUMNS: [column: string, path: string][] = [
  // Не признаки, а поля для отбора: их строка значения хранит у себя
  ['owner_id', 'owner'],
  ['public_visible', 'publicVisible'],
  ['archived', 'archived'],
  ['state', 'state'],
  ['birth_date', 'birthDate'],
  ['production_milk_forecast', 'production.milk.forecast'],
  ['production_milk_r', 'production.milk.r'],
  ['production_fat_kg_forecast', 'production.fatKg.forecast'],
  ['production_fat_kg_r', 'production.fatKg.r'],
  ['production_protein_kg_forecast', 'production.proteinKg.forecast'],
  ['production_protein_kg_r', 'production.proteinKg.r'],
  ['health_productive_longevity_forecast', 'health.productiveLongevity.forecast'],
  ['health_productive_longevity_r', 'health.productiveLongevity.r'],
  ['health_udder_health_forecast', 'health.udderHealth.forecast'],
  ['health_udder_health_r', 'health.udderHealth.r'],
  ['health_calving_ease_forecast', 'health.calvingEase.forecast'],
  ['health_calving_ease_r', 'health.calvingEase.r'],
  ['health_calf_mortality_forecast', 'health.calfMortality.forecast'],
  ['health_calf_mortality_r', 'health.calfMortality.r'],
  ['reproduction_fertility_forecast', 'reproduction.fertility.forecast'],
  ['reproduction_fertility_r', 'reproduction.fertility.r'],
  ['exterior_body_composite', 'exterior.bodyComposite'],
  ['exterior_udder_composite', 'exterior.udderComposite'],
  ['exterior_legs_composite', 'exterior.legsComposite'],
]

/** Собрать вложенный объект вида `production.milk.forecast` из плоской строки. */
const shapeAnimal = (row: Record<string, unknown>): Animal => {
  const animal: Record<string, unknown> = { id: Number(row.id) }

  for (const [column, path] of TRAIT_COLUMNS) {
    const raw = row[column]
    if (raw === null || raw === undefined) continue

    // Поля отбора переносятся как есть, без приведения к числу
    if (typeof raw === 'boolean' || (typeof raw === 'string' && !path.includes('.'))) {
      animal[path] = raw
      continue
    }
    // Дата рождения нужна целиком: год из неё возьмёт `rowOf`
    if (raw instanceof Date) {
      animal[path] = raw.toISOString()
      continue
    }

    const value = typeof raw === 'string' ? Number(raw) : raw
    if (typeof value !== 'number' || !Number.isFinite(value)) continue

    const parts = path.split('.')
    let node = animal
    for (const part of parts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== 'object') node[part] = {}
      node = node[part] as Record<string, unknown>
    }
    node[parts[parts.length - 1]!] = value
  }

  return animal as unknown as Animal
}

/**
 * Обойти всю книгу пачками, отдавая каждую в обработчик.
 *
 * Ходим по возрастанию `id` с условием «больше предыдущего», а не через
 * `OFFSET`. Разница на трёхстах тысячах записей принципиальная: с OFFSET
 * база каждый раз пролистывает всё, что уже отдала, и последние страницы
 * обходятся дороже первых. С условием по ключу любая страница стоит одинаково.
 */
async function eachAnimal(
  payload: Payload,
  batchSize: number,
  handle: (batch: Animal[], scanned: number, total: number) => Promise<void>,
): Promise<number> {
  const pool = poolOf(payload)
  const columns = TRAIT_COLUMNS.map(([c]) => `"${c}"`).join(', ')

  const totalRow = await pool.query(`select count(*)::int as n from animals`)
  const total = (totalRow.rows?.[0] as { n: number } | undefined)?.n ?? 0

  let lastId = 0
  let scanned = 0

  for (;;) {
    const res = await pool.query(
      `select id, ${columns} from animals where id > $1 order by id limit $2`,
      [lastId, batchSize],
    )
    const rows = (res.rows ?? []) as Record<string, unknown>[]
    if (!rows.length) break

    lastId = Number(rows[rows.length - 1]!.id)
    scanned += rows.length
    await handle(rows.map(shapeAnimal), scanned, total)

    if (rows.length < batchSize) break
  }

  return scanned
}

export async function recomputeProfile(
  payload: Payload,
  profile: IndexProfile,
  opts: { base?: Base; onProgress?: (done: number, total: number) => void } = {},
): Promise<number> {
  const base = opts.base ?? (await loadActiveBase(payload))
  await dropProfileValues(payload, profile.key)

  const done = await eachAnimal(payload, BATCH, async (batch, scanned, total) => {
    await insertRows(payload, batch.map((a) => rowOf(a, profile, base)))
    opts.onProgress?.(scanned, total)
  })

  /*
   * Место в группе сравнения зависит от всех значений профиля сразу, поэтому
   * пересчитывается после записи, а не вместе с ней. Ограничиваем профилем:
   * правка его весов чужих строк не касается.
   */
  await updatePercentiles(payload, { profileKey: profile.key })

  return done
}

/** Сколько животных читать за раз. Подобрано по памяти на строку, не по вкусу. */
const BATCH = 5_000

/**
 * Убрать значения профиля — тем же прямым запросом, что и запись.
 *
 * `payload.delete` с условием сначала вычитывает все подходящие документы
 * и удаляет их по одному: на книгу это сотни запросов и десятки секунд
 * там, где базе хватает одного.
 */
export async function dropProfileValues(payload: Payload, profileKey: string): Promise<number> {
  const r = await poolOf(payload).query(`delete from index_values where profile_key = $1`, [
    profileKey,
  ])
  return r.rowCount ?? 0
}

/**
 * Пересчитать всё. Используется скриптом заполнения и сидом.
 *
 * Профили обходятся по одному, а не «все профили для каждого животного»:
 * так после сбоя на середине уже посчитанные профили остаются целыми,
 * и видно, на чём именно остановились.
 */
export async function recomputeAll(
  payload: Payload,
  log: (msg: string) => void = () => {},
): Promise<{ profiles: number; rows: number; orphans: number }> {
  const profiles = await profilesInUse(payload)
  const base = await loadActiveBase(payload)
  log(`база сравнения: ${base.version}${base === DEFAULT_BASE ? ' (заимствованная)' : ''}`)
  /*
   * Один проход по книге на все профили сразу.
   *
   * Раньше профили обходились по очереди, и книга прочитывалась столько раз,
   * сколько заведено профилей. На двухстах записях это незаметно, на трёхстах
   * тысячах — семь полных проходов вместо одного. Признаки животного при этом
   * одни и те же: меняются только веса, а они в памяти.
   *
   * Плата — потеря промежуточной точки восстановления: раньше после сбоя
   * уже посчитанные профили оставались целыми. Но пересчёт теперь занимает
   * минуты, а не часы, и проще повторить его целиком, чем разбираться,
   * до какого профиля он дошёл.
   */
  for (const profile of profiles) await dropProfileValues(payload, profile.key)

  let rows = 0
  const scanned = await eachAnimal(payload, BATCH, async (batch, done, total) => {
    for (const profile of profiles) {
      await insertRows(payload, batch.map((a) => rowOf(a, profile, base)))
      rows += batch.length
    }
    log(`посчитано животных: ${done} из ${total}, строк: ${rows}`)
  })
  log(`обойдено животных: ${scanned}, профилей: ${profiles.length}`)

  /*
   * Значения профилей, которых больше нет.
   *
   * Обычно их убирает хук удаления профиля, но он срабатывает не всегда:
   * прерванный процесс, удаление строки в обход приложения. Пересчёт «по всем
   * профилям» такие строки не трогает — он ходит по существующим, — и они
   * остаются в базе навсегда, занимая место и путая счётчики. Полный прогон
   * подходящее место, чтобы прибрать.
   */
  const keys = profiles.map((p) => p.key)
  const cleaned = await poolOf(payload).query(
    `delete from index_values where not (profile_key = any($1::text[]))`,
    [keys],
  )
  const orphans = cleaned.rowCount ?? 0
  if (orphans > 0) log(`убрано значений исчезнувших профилей: ${orphans}`)

  await updatePercentiles(payload, { log })

  forgetIndexValuesLag()
  forgetCohorts()

  return { profiles: profiles.length, rows, orphans }
}

/**
 * Место животного в группе сравнения.
 *
 * В обычном случае это чтение готового: полный пересчёт проставляет
 * процентиль каждой строке, и карточке остаётся забрать его по ключу.
 * Расчёт ниже — запасной путь для животного, сохранённого поодиночке
 * после последнего прогона: его значение пересчитано, а место среди
 * остальных — нет, для этого нужна вся популяция.
 *
 * Считается запросами к базе, а не выгрузкой всей популяции в память:
 * нужны только два числа — сколько значений ниже и сколько равных.
 * Полуцелая поправка на равные — обычная практика: при большом числе
 * одинаковых оценок без неё все они получили бы процентиль нижней границы.
 *
 * Группа сравнения — ровесники: сравнивать первотёлку с быком 2010 года
 * бессмысленно, за пятнадцать лет база сдвинулась. Если ровесников мало,
 * группа расширяется до всей книги — процентиль по десятку животных
 * не значит ничего, и лучше честно сравнить со всеми.
 *
 * Отбор идёт по копиям полей в самой строке значения, а не по связи
 * с животным. Через связь Payload делал по отдельному `left join` на каждое
 * условие — три условия, три копии таблицы животных, и каждый из трёх счётов
 * занимал около секунды. Карточка животного из-за этого открывалась 2,8 с
 * и была самой медленной страницей системы.
 */
/**
 * Пересчитать процентили одним проходом по таблице.
 *
 * Процентиль — не свойство строки, а её место среди остальных, поэтому
 * считать его построчно бессмысленно: нужен весь набор. Оконные функции
 * PostgreSQL делают это ровно за один проход, и на двух миллионах строк
 * он занимает секунды.
 *
 * Формула та же, что была в расчёте на лету: доля тех, кто ниже, плюс
 * половина равных. Полуцелая поправка — обычная практика: при большом числе
 * одинаковых оценок без неё все они получили бы процентиль нижней границы.
 *
 * Группа сравнения — ровесники по году рождения; если их меньше двадцати,
 * группой становится вся книга по этому профилю. Процентиль по десятку
 * животных не значит ничего, и честнее сравнить со всеми, о чём карточка
 * и сообщает подписью.
 *
 * Архивные записи в расчёт не входят и своего процентиля не получают:
 * они не участвуют в сравнении живого поголовья.
 */
export async function updatePercentiles(
  payload: Payload,
  opts: { profileKey?: string; log?: (m: string) => void } = {},
): Promise<number> {
  const log = opts.log ?? (() => {})
  const started = Date.now()

  /*
   * Прогон стоит времени: около трёх минут на два миллиона строк. Дорого
   * не столько считать, сколько отсортировать книгу дважды — по профилю
   * с годом и по профилю целиком. Пробовал выразить то же через `cume_dist`
   * вместо подсчёта равных рамкой: короче на две строки и вдвое медленнее,
   * потому что сортировок всё равно две. Оставлено как было.
   *
   * Отсюда же ограничение по профилю: правка весов одного профиля трогает
   * его строки, и сортировать ради этого всю таблицу незачем.
   */
  const scope = opts.profileKey ? `and profile_key = $1` : ''
  const params = opts.profileKey ? [opts.profileKey] : []

  const res = await poolOf(payload).query(
    `
    with ranked as (
      select
        id,
        count(*)  over (partition by profile_key, birth_year)                   as cohort_year,
        count(*)  over (partition by profile_key)                               as cohort_all,
        rank()    over (partition by profile_key, birth_year order by value)    as rank_year,
        rank()    over (partition by profile_key order by value)                as rank_all,
        count(*)  over (partition by profile_key, birth_year order by value
                        range between unbounded preceding and current row)      as le_year,
        count(*)  over (partition by profile_key order by value
                        range between unbounded preceding and current row)      as le_all
      from index_values
      where archived is not true ${scope}
    ),
    computed as (
      select
        id,
        (cohort_year >= 20) as same_year,
        case when cohort_year >= 20 then cohort_year else cohort_all end as cohort,
        -- Доля тех, кто ниже, плюс половина равных
        case when cohort_year >= 20
             then ((rank_year - 1) + (le_year - (rank_year - 1)) / 2.0) / cohort_year
             else ((rank_all  - 1) + (le_all  - (rank_all  - 1)) / 2.0) / cohort_all
        end as share
      from ranked
    )
    update index_values v
       set percentile = least(99, greatest(0, round(c.share * 100))),
           cohort = c.cohort,
           cohort_same_year = c.same_year
      from computed c
     where c.id = v.id
  `,
    params,
  )

  /*
   * Уборка после себя — не гигиена, а необходимость.
   *
   * Проход переписывает каждую строку таблицы, а PostgreSQL при обновлении
   * не меняет строку на месте, а пишет новую версию рядом. После прогона
   * в таблице вдвое больше строк, чем нужно, и половина из них мёртвые:
   * замеренные два миллиона живых строк превратились в два миллиона живых
   * плюс два миллиона мёртвых, таблица выросла с 900 МБ до 2,7 ГБ, а всякий
   * счёт по ней стал вдвое дороже. Автоочистка добралась бы до этого сама,
   * но не сразу, и всё это время книга работала бы медленнее без видимой
   * причины.
   *
   * `VACUUM` возвращает место под повторное использование, но файл не сжимает
   * — для этого нужен `VACUUM FULL` с блокировкой таблицы, и решение о нём
   * принимает человек в спокойное время, а не скрипт посреди пересчёта.
   */
  await poolOf(payload).query('vacuum analyze index_values')

  log(
    `процентили${opts.profileKey ? ` (${opts.profileKey})` : ''}: ` +
      `${res.rowCount ?? 0} строк за ${((Date.now() - started) / 1000).toFixed(1)} с`,
  )
  forgetCohorts()
  return res.rowCount ?? 0
}

/** Размеры групп сравнения: свойство книги, а не животного. */
const COHORT_TTL_MS = 5 * 60_000
const cohortCache = new Map<string, { at: number; value: number }>()

/** Сбросить размеры групп — после пересчёта книга стала другой. */
export const forgetCohorts = () => cohortCache.clear()

export async function percentileFromStored(
  payload: Payload,
  profileKey: string,
  value: number,
  birthYear?: number | null,
  animalId?: number | null,
): Promise<{ percentile: number; group: number; sameYear: boolean } | null> {
  const MIN_COHORT = 20

  /*
   * Сначала — готовое. Полный пересчёт проставляет процентиль каждой строке,
   * и в обычном случае карточке остаётся его прочитать: один запрос по
   * уникальному ключу вместо трёх счётов по двум миллионам строк.
   *
   * Пусто он бывает у животного, сохранённого поодиночке после последнего
   * прогона: его строка пересчитана, а место среди остальных — нет, для этого
   * нужна вся популяция. Тогда работает расчёт ниже, прежним способом.
   */
  if (animalId) {
    const stored = await payload.find({
      collection: 'index-values',
      where: { and: [{ animal: { equals: animalId } }, { profileKey: { equals: profileKey } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const row = stored.docs[0]
    if (row && typeof row.percentile === 'number' && typeof row.cohort === 'number') {
      return {
        percentile: row.percentile,
        group: row.cohort,
        sameYear: Boolean(row.cohortSameYear),
      }
    }
  }

  /*
   * Запасной путь — прямым запросом, а не через Payload.
   *
   * Причина не в скорости, а в хрупкости. Отбор здесь идёт по колонкам-копиям
   * (`birth_year`, `archived`), и Payload разрешает запрашивать только те пути,
   * которые видит в своей разобранной схеме. Стоило конфигурации разойтись
   * с кодом — например, сервер разработки поднялся до появления поля, —
   * и страница падала с «The following path cannot be queried: birthYear».
   * Для служебного пересчёта, который и так знает про эти колонки всё,
   * посредник только добавляет способ сломаться.
   *
   * Заодно три счёта превратились в один запрос: размер группы, сколько ниже
   * и сколько равных считаются одним проходом.
   */
  const pool = poolOf(payload)

  const measure = async (year: number | null) => {
    const params: unknown[] = [profileKey, value]
    const yearClause = year ? ` and birth_year = $3` : ''
    if (year) params.push(year)

    const res = await pool.query(
      `select
         count(*)::int                                    as total,
         count(*) filter (where value < $2)::int          as below,
         count(*) filter (where value = $2)::int          as equal
       from index_values
      where profile_key = $1 and archived is not true${yearClause}`,
      params,
    )

    const row = (res.rows?.[0] ?? {}) as { total?: number; below?: number; equal?: number }
    return { total: Number(row.total ?? 0), below: Number(row.below ?? 0), equal: Number(row.equal ?? 0) }
  }

  /*
   * Кэшируется только размер группы: он свойство книги, для всех ровесников
   * одного профиля один и тот же и меняется лишь при пополнении. «Ниже»
   * зависит от конкретного значения — кэш пришлось бы держать на каждое
   * животное, то есть никак. Но раз запрос всё равно один, из него берётся
   * и то и другое, а кэш служит только для решения «хватает ли ровесников».
   */
  const cohortSize = async (year: number | null): Promise<number> => {
    const key = `${profileKey}|${year ?? 'all'}`
    const hit = cohortCache.get(key)
    if (hit && Date.now() - hit.at < COHORT_TTL_MS) return hit.value

    const { total } = await measure(year)
    cohortCache.set(key, { at: Date.now(), value: total })
    return total
  }

  const sameYear = Boolean(birthYear) && (await cohortSize(birthYear!)) >= MIN_COHORT
  const { total, below, equal } = await measure(sameYear ? birthYear! : null)
  if (total < 2) return null

  const p = ((below + equal / 2) / total) * 100
  return {
    percentile: Math.max(0, Math.min(99, Math.round(p))),
    group: total,
    sameYear,
  }
}

/**
 * Признак того, что хранимые значения отстали от книги.
 *
 * Инвариант простой: на каждое животное приходится ровно одна строка
 * по каждому профилю. Расхождение означает, что пересчёт чего-то не застал —
 * например, животных завели при выключенных хуках. Молчать об этом нельзя:
 * список отсортируется, но части записей в нём не окажется.
 */
/**
 * Отставание пересчёта: сколько животных остались без значения индекса.
 *
 * Сообщение под таблицей, а не диагностика по расписанию: если хуки были
 * выключены или пересчёт прервали, список молча покажет неполный порядок,
 * и человек об этом не узнает. Лучше сказать прямо.
 *
 * Результат держится в памяти минуту, и вот почему. Оба счёта — полные:
 * PostgreSQL не хранит количество строк и на трёхстах тысячах животных
 * тратит на пару таких запросов около двухсот миллисекунд. Платить их
 * на каждой странице ради строки, которая появляется раз в месяц после
 * сбоя, — плохая сделка. Отставание при этом не та величина, которую надо
 * знать с точностью до секунды: оно возникает не мгновенно и не исчезает
 * само, минутная задержка ничего не меняет.
 *
 * Кэш живёт в процессе: у каждого экземпляра приложения он свой, общего
 * хранилища тут не нужно. Худшее, что бывает, — сообщение задержится
 * на минуту у одного из них.
 */
const LAG_TTL_MS = 60_000
const lagCache = new Map<string, { at: number; value: IndexValuesLag }>()

export type IndexValuesLag = { animals: number; values: number; missing: number }

export async function indexValuesLag(
  payload: Payload,
  profileKey: string,
): Promise<IndexValuesLag> {
  const cached = lagCache.get(profileKey)
  if (cached && Date.now() - cached.at < LAG_TTL_MS) return cached.value

  const [animals, values] = await Promise.all([
    payload.count({ collection: 'animals', overrideAccess: true }),
    payload.count({
      collection: 'index-values',
      where: { profileKey: { equals: profileKey } } as Where,
      overrideAccess: true,
    }),
  ])

  const a = animals.totalDocs ?? 0
  const v = values.totalDocs ?? 0
  const value = { animals: a, values: v, missing: Math.max(0, a - v) }

  lagCache.set(profileKey, { at: Date.now(), value })
  return value
}

/**
 * Сбросить кэш отставания — после пересчёта, чтобы сообщение не висело
 * лишнюю минуту после того, как проблему уже устранили.
 */
export const forgetIndexValuesLag = () => lagCache.clear()
