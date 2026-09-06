import type { Payload } from 'payload'
import { resolveThresholds } from '@/lib/check-thresholds'
import { poolOf } from '@/lib/sql'
import { afcMonths, nthCalvingCte } from '@/lib/sql-lactation'

/**
 * Возраст первого отёла по быкам — по всей книге, а не по одному стаду.
 *
 * ## Почему это отдельный расчёт, а не тот же с другим отбором
 *
 * Отчёт хозяйства (`afc-stats.ts`) считает среднее по дочерям внутри
 * одного стада и прямо говорит, что смешивать стада нельзя: у них разное
 * выращивание, и среднее по несопоставимым условиям сравнивает не быков,
 * а хозяйства.
 *
 * Ассоциации нужно ровно то, что запрещено хозяйству: сравнить быков между
 * хозяйствами. Снять запрет нельзя — он верен. Можно убрать то, из-за чего
 * он поставлен.
 *
 * ## Отклонение от сверстниц
 *
 * У каждой дочери берётся средний возраст первого отёла её сверстниц —
 * коров того же стада, **не** дочерей этого быка, — и считается разность.
 * Разница между хозяйствами уходит: она одинаково входит и в возраст
 * дочери, и в возраст сверстниц. Остаётся то, чем дочери этого быка
 * отличаются от соседок по стаду.
 *
 * Дочери исключаются из сверстниц не из педантизма. Если половина стада —
 * дочери одного быка, сравнение с «остальным стадом», куда они входят,
 * сравнивает быка с самим собой, и тем сильнее, чем шире он использован.
 *
 * ## Чего это не даёт, и здесь это важнее обычного
 *
 * Возраст первого отёла — в первую очередь решение хозяйства: когда
 * осеменить тёлку. Наследуется скорость роста и возраст полового
 * созревания, но управление перевешивает генетику с большим запасом.
 * Сравнение со сверстницами снимает разницу между хозяйствами, но не
 * снимает выбор внутри хозяйства: если тёлок покрупнее осеменяют раньше,
 * а покрупнее они у одного быка, отклонение это и покажет — и покажет
 * верно, но объяснит неправильно.
 *
 * Поэтому таблица отвечает на вопрос «чем отличаются дочери» и молчит
 * о том, «какой бык лучше». Разбор — `docs/vozrast-pervogo-otela.md`
 * и решение №52: сырые исходы уже один раз оказались перепутаны
 * с качеством хозяйства.
 *
 * ## Почему без самосоединения
 *
 * Средний возраст сверстниц можно взять подзапросом на каждую дочь —
 * и получить квадрат от размера стада. Вместо этого считаются две суммы:
 * по стаду целиком и по паре «стадо + бык». Вычитание второй из первой
 * даёт сверстниц без единого лишнего прохода.
 */

/** Меньше этого числа дочерей бык в сводку по книге не попадает. */
export const AFC_SIRE_MIN_DAUGHTERS = 10

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export type AfcSireBookRow = {
  sireId: number
  identNumber: string
  name: string | null
  daughters: number
  /** Сколько дочерей удалось сравнить со сверстницами. */
  compared: number
  herds: number
  farms: number
  meanAfc: number
  /** Отклонение от сверстниц, месяцев: минус — телятся раньше соседок. */
  meanDev: number | null
  minAfc: number
  maxAfc: number
}

export type AfcSireBook = {
  rows: AfcSireBookRow[]
  /** Быки с дочерьми, но их меньше порога. */
  hidden: number
  /** Всего дочерей с известным возрастом первого отёла по книге. */
  cows: number
}

const EMPTY: AfcSireBook = { rows: [], hidden: 0, cows: 0 }

export async function afcSireBook(payload: Payload): Promise<AfcSireBook> {
  const pool = poolOf(payload)
  if (!pool) return EMPTY

  /*
   * `distinct on` — на случай, когда первым отёлом помечены две записи.
   * Это ошибка данных, её ловит `duplicate-first-calving`; отчёт из-за неё
   * задваивать корову не должен и берёт самую раннюю.
   *
   * `age()`, а не разность дат делённая на 30,44 — то же соглашение, что
   * в `monthsBetween` и в отчёте хозяйства. Иначе одна корова показывала бы
   * 27 месяцев в одном отчёте и 28 в другом.
   */
  const sql = `
    with ${nthCalvingCte('first_calving', 1)},
    valid as (
      select
        a.id,
        a.father_id,
        a.herd_id,
        a.owner_id,
        ${afcMonths()}::numeric as afc
      from animals a
      join first_calving f on f.animal_id = a.id
      where a.birth_date is not null
        and a.archived is not true
        and a.sex = 'female'
    ),
    ok as (select * from valid where afc between $1 and $2),
    per_herd as (
      select herd_id, sum(afc) as s, count(*) as n from ok group by herd_id
    ),
    per_herd_sire as (
      select herd_id, father_id, sum(afc) as s, count(*) as n
        from ok group by herd_id, father_id
    ),
    dev as (
      select
        o.father_id as sire,
        o.herd_id,
        o.owner_id,
        o.afc,
        case when (h.n - hs.n) > 0
             then o.afc - (h.s - hs.s) / (h.n - hs.n)
        end as dev
      from ok o
      join per_herd h  on h.herd_id = o.herd_id
      join per_herd_sire hs on hs.herd_id = o.herd_id and hs.father_id = o.father_id
      where o.father_id is not null and o.herd_id is not null
    )
    select
      d.sire                                        as sire_id,
      b.ident_number,
      b.name,
      count(*)::int                                 as daughters,
      count(d.dev)::int                             as compared,
      count(distinct d.herd_id)::int                as herds,
      count(distinct d.owner_id)::int               as farms,
      round(avg(d.afc), 1)                          as mean_afc,
      round(avg(d.dev), 1)                          as mean_dev,
      min(d.afc)::int                               as min_afc,
      max(d.afc)::int                               as max_afc
    from dev d
    join animals b on b.id = d.sire
    group by d.sire, b.ident_number, b.name
    having count(*) >= $3
    order by avg(d.dev) nulls last`

  /*
   * Границы — настроенные Ассоциацией: сводка по быкам смотрит на те же
   * записи, что и проверки, и расходиться с ними не должна. Разбор —
   * в `afc-stats.ts`.
   */
  const t = await resolveThresholds(payload)
  const bounds = [t.afcMin, t.afcMax, AFC_SIRE_MIN_DAUGHTERS]

  /*
   * Отказ запроса пишется в лог, а не растворяется.
   *
   * Ниже `null` означает «показывать нечего», и это верно для страницы:
   * пустая таблица честнее выдуманных чисел. Но причина у пустоты бывает
   * двух родов — «быков с тремя дочерьми нет» и «запрос упал», — и вторую
   * до сих пор не видел никто, включая того, кто пришёл разбираться,
   * почему отчёт пуст.
   */
  const fail = (what: string) => (e: unknown) => {
    console.error(`[plemkniga] отчёт по быкам: ${what} не выполнился:`, e)
    return null
  }

  const [main, totals] = await Promise.all([
    pool.query(sql, bounds).catch(fail('основной запрос')),
    pool
      .query(
        `with ${nthCalvingCte('first_calving', 1)},
         ok as (
           select a.id, a.father_id
             from animals a
             join first_calving f on f.animal_id = a.id
            where a.birth_date is not null
              and a.archived is not true
              and a.sex = 'female'
              and ${afcMonths()} between $1 and $2
         )
         select
           count(*)::int as cows,
           (select count(*)::int from (
              select father_id from ok
               where father_id is not null
               group by father_id having count(*) < $3
            ) t) as hidden
         from ok`,
        bounds,
      )
      .catch(fail('подсчёт итогов')),
  ])

  if (!main) return EMPTY

  return {
    rows: (main.rows ?? []).map((r) => ({
      sireId: Number(r.sire_id),
      identNumber: String(r.ident_number ?? ''),
      name: (r.name as string) ?? null,
      daughters: num(r.daughters) ?? 0,
      compared: num(r.compared) ?? 0,
      herds: num(r.herds) ?? 0,
      farms: num(r.farms) ?? 0,
      meanAfc: num(r.mean_afc) ?? 0,
      meanDev: num(r.mean_dev),
      minAfc: num(r.min_afc) ?? 0,
      maxAfc: num(r.max_afc) ?? 0,
    })),
    hidden: num(totals?.rows?.[0]?.hidden) ?? 0,
    cows: num(totals?.rows?.[0]?.cows) ?? 0,
  }
}
