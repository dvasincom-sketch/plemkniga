import type { Payload } from 'payload'
import { AFC_PLAUSIBLE } from '@/lib/afc'

/**
 * Возраст первого отёла по стаду хозяйства и в разрезе быков.
 *
 * ## Почему только своё стадо
 *
 * Соблазн очевидный: собрать возраст первого отёла дочерей быка по всем
 * хозяйствам сразу — выборка больше, число надёжнее. Так делать нельзя
 * по двум причинам, и они указывают в одну сторону.
 *
 * Первая — доступ. Возраст отёла чужой коровы такая же её запись, как удой
 * и лечение, и область `production` закрывает её ровно так же
 * (`docs/dostup-i-vidimost.md`). Среднее по чужим животным — это те же
 * чужие данные, только просуммированные.
 *
 * Вторая — существо дела. Curran и соавторы (2013, ~70 000 голштинов США)
 * показали, что оптимальный возраст первого отёла зависит от уровня стада
 * и кратности доения, и единой цифры для всех хозяйств может не быть.
 * Значит среднее по дочерям одного быка в двадцати разных хозяйствах —
 * это среднее по несопоставимым условиям, и сравнивать по нему быков
 * между собой всё равно нельзя. Разбор — `docs/vozrast-pervogo-otela.md`.
 *
 * ## Почему группами, а не по месяцам
 *
 * У Истхэма кривая построена по месяцам, потому что у него 396 534 коровы
 * и в каждом месяце тысячи. У хозяйства их сотни, и помесячная кривая
 * распадётся на строки по две-три головы, где среднее скачет от одного
 * животного. Группы шире — и разница между ними означает разницу,
 * а не шум.
 *
 * ## Один запрос, а не обход
 *
 * Считается целиком в базе. У хозяйства с тремя тысячами животных обход
 * по одному дал бы шесть тысяч запросов (отёл первый, отёл второй) ради
 * страницы, которую открывают раз в месяц.
 */

type SqlPool = {
  query: (q: string, p?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>
}

const poolOf = (payload: Payload): SqlPool | null =>
  (payload.db as unknown as { pool?: SqlPool }).pool ?? null

/**
 * Границы групп.
 *
 * Не нормативы и не цели: до 25 месяцев — то, что в литературе называют
 * ранним отёлом, после 30 — то, что и в британских, и в российских работах
 * связано с худшим дожитием. Середина разбита надвое, потому что именно
 * там лежит медиана большинства стад, и склеивать её в одну группу значило
 * бы спрятать самое интересное.
 */
export const AFC_BANDS = [
  { key: 'early', label: 'до 24 мес.', from: AFC_PLAUSIBLE.min, to: 24 },
  { key: 'target', label: '25–27 мес.', from: 25, to: 27 },
  { key: 'late', label: '28–30 мес.', from: 28, to: 30 },
  { key: 'veryLate', label: 'старше 30 мес.', from: 31, to: AFC_PLAUSIBLE.max },
] as const

export type AfcBandKey = (typeof AFC_BANDS)[number]['key']

export type AfcBandRow = {
  key: AfcBandKey
  label: string
  cows: number
  share: number
  /** Дожили до второго отёла, % — null, когда считать не по чему */
  survived2: number | null
  /** Межотельный период первый → второй, дней */
  interval: number | null
}

export type AfcSireRow = {
  sireId: number
  identNumber: string
  name: string | null
  daughters: number
  meanAfc: number
  medianAfc: number
  minAfc: number
  maxAfc: number
}

export type AfcStats = {
  cows: number
  meanAfc: number | null
  medianAfc: number | null
  /** Доля отелившихся до 24 месяцев включительно, % */
  shareEarly: number | null
  /** Доля отелившихся в 30 месяцев и позже, % */
  shareLate: number | null
  bands: AfcBandRow[]
  sires: AfcSireRow[]
  /**
   * Сколько быков не попало в таблицу из-за малого числа дочерей.
   *
   * Показывается на странице прямо. Молча отбросить их значило бы выдать
   * список из восьми быков за полный, тогда как в стаде их сорок, —
   * и хозяйство сделало бы вывод по обрезанной картине, не зная, что она
   * обрезана.
   */
  siresHidden: number
}

const EMPTY: AfcStats = {
  cows: 0,
  meanAfc: null,
  medianAfc: null,
  shareEarly: null,
  shareLate: null,
  bands: [],
  sires: [],
  siresHidden: 0,
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Общая часть обоих запросов.
 *
 * `age()` в PostgreSQL даёт интервал из полных лет, месяцев и дней —
 * ровно то же, что считает `monthsBetween` в `src/lib/afc.ts`. Разность
 * дат в днях с делением на 30,44 дала бы другое число, и одна и та же
 * корова показывала бы 27 месяцев в карточке и 28 в отчёте.
 *
 * `distinct on` — на случай, когда первым отёлом помечены две записи.
 * Это ошибка данных, её ловит проверка `duplicate-first-calving`,
 * но отчёт из-за неё падать или задваивать корову не должен: берётся
 * самая ранняя.
 *
 * Записи с невозможным возрастом отброшены. Отёл раньше девятнадцатого
 * месяца — ошибка в дате, и если её не отбросить, она утянет среднее
 * по группе вниз молча.
 */
const COWS_CTE = `
  with first_calving as (
    select distinct on (c.animal_id) c.animal_id, c.date
      from calvings c
     where c."number" = 1 and c.date is not null
     order by c.animal_id, c.date
  ),
  second_calving as (
    select distinct on (c.animal_id) c.animal_id, c.date
      from calvings c
     where c."number" = 2 and c.date is not null
     order by c.animal_id, c.date
  ),
  cows as (
    select
      a.id,
      a.father_id,
      (extract(year  from age(f.date, a.birth_date)) * 12
     + extract(month from age(f.date, a.birth_date)))::int   as afc,
      s.date is not null                                     as survived2,
      case when s.date is not null
           then (s.date::date - f.date::date)
      end                                                    as interval_days
    from animals a
    join first_calving  f on f.animal_id = a.id
    left join second_calving s on s.animal_id = a.id
    where a.owner_id = $1
      and a.birth_date is not null
      and a.archived is not true
  ),
  valid as (select * from cows where afc between $2 and $3)
`

export async function afcStats(payload: Payload, organizationId: number): Promise<AfcStats> {
  const pool = poolOf(payload)
  if (!pool) return EMPTY

  const bounds = [organizationId, AFC_PLAUSIBLE.min, AFC_PLAUSIBLE.max]

  /*
   * Три набора считаются тремя запросами, а не одним с группировкой
   * по всему сразу: свод, полосы и быки группируются по-разному,
   * и склеенный запрос пришлось бы разбирать в коде — то есть переносить
   * группировку из базы в приложение, ради чего всё и затевалось.
   */
  const [summary, bands, sires] = await Promise.all([
    pool.query(
      `${COWS_CTE}
       select
         count(*)                                                     as cows,
         round(avg(afc)::numeric, 1)                                  as mean_afc,
         percentile_cont(0.5) within group (order by afc)             as median_afc,
         round(100.0 * count(*) filter (where afc <= 24) / count(*), 1) as share_early,
         round(100.0 * count(*) filter (where afc >= 30) / count(*), 1) as share_late,
         (select count(*) from (
            select father_id from valid
             where father_id is not null
             group by father_id having count(*) < 3
          ) t)                                                         as sires_hidden
       from valid`,
      bounds,
    ),
    pool.query(
      `${COWS_CTE}
       select
         width_bucket(afc, array[25, 28, 31])                         as bucket,
         count(*)                                                     as cows,
         round(100.0 * count(*) filter (where survived2) / count(*), 1) as survived2,
         round(avg(interval_days) filter (
           where interval_days between 250 and 900
         )::numeric, 0)                                               as interval_days
       from valid
       group by 1
       order by 1`,
      bounds,
    ),
    pool.query(
      `${COWS_CTE}
       select
         b.id                                             as sire_id,
         b.ident_number                                   as ident_number,
         b.name                                           as name,
         count(*)                                         as daughters,
         round(avg(v.afc)::numeric, 1)                    as mean_afc,
         percentile_cont(0.5) within group (order by v.afc) as median_afc,
         min(v.afc)                                       as min_afc,
         max(v.afc)                                       as max_afc
       from valid v
       join animals b on b.id = v.father_id
       group by b.id, b.ident_number, b.name
       having count(*) >= 3
       order by count(*) desc, avg(v.afc) asc
       limit 50`,
      bounds,
    ),
  ])

  const s = summary.rows?.[0]
  const cows = num(s?.cows) ?? 0
  if (!cows) return EMPTY

  /*
   * `width_bucket` возвращает 0 для значений левее первой границы, 1 — между
   * первой и второй, и так далее. Порядок совпадает с `AFC_BANDS`, поэтому
   * индекс берётся напрямую; полосы, в которые не попало ни одной коровы,
   * в таблицу не идут — пустая строка ничего не сообщает.
   */
  const byBucket = new Map<number, Record<string, unknown>>()
  for (const r of bands.rows ?? []) byBucket.set(Number(r.bucket), r)

  const bandRows: AfcBandRow[] = AFC_BANDS.map((band, i) => {
    const r = byBucket.get(i)
    const n = num(r?.cows) ?? 0
    return {
      key: band.key,
      label: band.label,
      cows: n,
      share: cows ? Math.round((n / cows) * 1000) / 10 : 0,
      survived2: num(r?.survived2),
      interval: num(r?.interval_days),
    }
  }).filter((b) => b.cows > 0)

  const sireRows: AfcSireRow[] = (sires.rows ?? []).map((r) => ({
    sireId: Number(r.sire_id),
    identNumber: String(r.ident_number ?? ''),
    name: (r.name as string) ?? null,
    daughters: num(r.daughters) ?? 0,
    meanAfc: num(r.mean_afc) ?? 0,
    medianAfc: num(r.median_afc) ?? 0,
    minAfc: num(r.min_afc) ?? 0,
    maxAfc: num(r.max_afc) ?? 0,
  }))

  return {
    cows,
    meanAfc: num(s?.mean_afc),
    medianAfc: num(s?.median_afc),
    shareEarly: num(s?.share_early),
    shareLate: num(s?.share_late),
    bands: bandRows,
    sires: sireRows,
    siresHidden: num(s?.sires_hidden) ?? 0,
  }
}
