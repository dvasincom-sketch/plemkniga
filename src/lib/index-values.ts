import type { Payload, PayloadRequest, Where } from 'payload'
import { BASE_VERSION, BUILTIN_PROFILES, computeIndex, type IndexProfile } from '@/lib/breeding-index'
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

const rowOf = (animal: Animal, profile: IndexProfile) => {
  const r = computeIndex(animal, profile)
  return {
    animal: animal.id as number,
    profileKey: profile.key,
    profileName: profile.name,
    kind: profile.kind,
    // Снимок весов: профиль переименуют и перенастроят, а выпущенный
    // документ с этим числом останется
    weights: profile.weights,
    baseVersion: BASE_VERSION,
    value: Math.round(r.value * 100) / 100,
    reliability: Math.round(r.reliability),
    used: r.used,
    computedAt: new Date().toISOString(),
  }
}

type Row = ReturnType<typeof rowOf>

type SqlPool = { query: (q: string, p?: unknown[]) => Promise<{ rowCount: number | null }> }

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
        )
        return `($${at + 1},$${at + 2},$${at + 3},$${at + 4},$${at + 5}::jsonb,$${at + 6},$${at + 7},$${at + 8},$${at + 9},$${at + 10},now(),now())`
      })
      .join(',')

    await pool.query(
      `insert into index_values
         (animal_id, profile_key, profile_name, kind, weights, base_version,
          value, reliability, used, computed_at, updated_at, created_at)
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
  opts: { profiles?: IndexProfile[]; req?: PayloadRequest } = {},
): Promise<number> {
  const { req } = opts
  const list = opts.profiles ?? (await profilesInUse(payload))
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
      list.map((profile) => rowOf(animal, profile)),
    )
    return list.length
  }

  for (const profile of list) {
    await payload.create({
      collection: 'index-values',
      data: rowOf(animal, profile),
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
export async function recomputeProfile(
  payload: Payload,
  profile: IndexProfile,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  await dropProfileValues(payload, profile.key)

  const PAGE = 200
  let page = 1
  let done = 0
  let total = 0

  for (;;) {
    const batch = await payload.find({
      collection: 'animals',
      limit: PAGE,
      page,
      depth: 0,
      sort: 'id',
      overrideAccess: true,
    })
    total = batch.totalDocs ?? 0
    await insertRows(
      payload,
      (batch.docs as Animal[]).map((a) => rowOf(a, profile)),
    )
    done += batch.docs.length
    onProgress?.(done, total)
    if (!batch.hasNextPage) break
    page += 1
  }

  return done
}

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
  let rows = 0
  for (const profile of profiles) {
    const n = await recomputeProfile(payload, profile)
    rows += n
    log(`${profile.name}: ${n}`)
  }

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

  return { profiles: profiles.length, rows, orphans }
}

/**
 * Признак того, что хранимые значения отстали от книги.
 *
 * Инвариант простой: на каждое животное приходится ровно одна строка
 * по каждому профилю. Расхождение означает, что пересчёт чего-то не застал —
 * например, животных завели при выключенных хуках. Молчать об этом нельзя:
 * список отсортируется, но части записей в нём не окажется.
 */
export async function indexValuesLag(
  payload: Payload,
  profileKey: string,
): Promise<{ animals: number; values: number; missing: number }> {
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
  return { animals: a, values: v, missing: Math.max(0, a - v) }
}
