import type { Payload } from 'payload'
import { BULL_COMPARISON_MIN } from '@/lib/bull-proof'
import { numOf, poolOf } from '@/lib/sql'
import { liveFemale, notArchived } from '@/lib/sql-herd'

/**
 * Сравнение быков между собой (ТЗ, требование №5).
 *
 * ## Почему это отдельный экран, а не карточка, открытая дважды
 *
 * Оценка одного быка у нас есть с самого начала (`bull-proof.ts`), и она
 * подробная. Но покупатель семени решает не «хорош ли этот бык» —
 * он решает «кого из этих пяти». Открыть пять карточек в пяти вкладках
 * и сличать числа глазами можно, и именно так это и делали; ошибка
 * при этом стоит стоимости партии семени.
 *
 * ## Что здесь главная колонка и почему не средний удой дочерей
 *
 * Средний удой дочерей сравнивает не быков, а хозяйства: дочери разных
 * быков стоят в разных условиях, и разница между хозяйствами больше
 * разницы между быками. Бык, чьи дочери попали к хорошему кормленцу,
 * обгонит лучшего быка с дочерьми в среднем хозяйстве. Разбор — решение
 * №52 и шапка `bull-proof.ts`.
 *
 * Поэтому главная колонка — **разница со сверстницами**: у каждой дочери
 * берётся средний удой других коров её же стада (не дочерей этого быка)
 * и считается разница. Эффект хозяйства сравнение со сверстницами
 * снимает; средний удой оставлен рядом как факт, без притязаний.
 *
 * ## Почему рядом с каждым числом стоит, на скольких дочерях оно посчитано
 *
 * Это не педантизм, а единственная защита от главной ошибки сравнения.
 * Бык с тремя дочерьми и бык с пятьюстами в таблице выглядят одинаково
 * убедительно, а означают разное: у первого «+900 кг» — случайность
 * трёх коров, у второго «+300 кг» — установленный факт. Каталоги прячут
 * это за одной цифрой надёжности, которую никто не читает; здесь число
 * дочерей стоит в той же ячейке, что и значение.
 *
 * ## Почему есть родство с вашим стадом
 *
 * Этого не даёт ни один каталог, и дать не может: для этого нужны разом
 * родословная быка и родословная покупателя. У нас есть и то и другое.
 * Вопрос «сколько моих коров ему родня» решает выбор не реже удоя:
 * лучший по всем признакам бык, у которого в вашем стаде уже сорок
 * дочерей, — это инбридинг, а не улучшение.
 */

const maybe = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/**
 * Сколько быков помещается в сравнение.
 *
 * Не «сколько выдержит запрос» — запрос выдержит и сотню. Шесть колонок
 * читаются глазами без прокрутки вбок, а таблица, которую надо листать
 * горизонтально, перестаёт быть сравнением: соседние числа больше
 * не стоят рядом.
 */
export const MAX_BULLS = 6

/** На сколько колен вглубь ищем родство с вашим стадом. */
export const KINSHIP_DEPTH = 3

export type BullRow = {
  id: number
  identNumber: string
  name: string | null
  birthDate: string | null
  /** ИПЦ из карточки — по основному профилю книги. */
  ipc: number | null

  daughters: number
  withMilk: number
  herds: number
  farms: number

  milkMean: number | null
  fatMean: number | null
  proteinMean: number | null

  /** Разница «дочь минус сверстницы её стада», кг. Главная колонка. */
  vsMates: number | null
  /** На скольких дочерях посчитана разница. */
  compared: number

  afcMean: number | null
  afcCows: number

  /** Коров вашего стада, у которых бык в родословной до KINSHIP_DEPTH колена. */
  kinInHerd: number | null
  /** Из них дочерей — самое близкое родство. */
  daughtersInHerd: number | null
}

export async function compareBulls(
  payload: Payload,
  bullIds: number[],
  viewerOrg: number | null,
): Promise<BullRow[]> {
  const pool = poolOf(payload)
  const ids = [...new Set(bullIds)].filter((n) => Number.isFinite(n) && n > 0).slice(0, MAX_BULLS)
  if (!pool || ids.length === 0) return []

  /*
   * Отказ запроса пишется в лог, а не глотается молча.
   *
   * Первая версия возвращала на ошибке пустой массив, и сломанный запрос
   * родства превратился в колонку с нулями — то есть в утверждение
   * «этот бык вашему стаду не родня», которое система не проверяла.
   * Пустая колонка из-за ошибки и пустая колонка по существу выглядят
   * одинаково; отличить их можно только по логу.
   */
  const ask = (q: string, p: unknown[]) =>
    pool
      .query(q, p)
      .then((r) => r.rows ?? [])
      .catch((e: unknown) => {
        console.error(
          `[plemkniga] Сравнение быков: запрос не выполнен — ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
        return [] as Record<string, unknown>[]
      })

  const [identity, head, comparison, afc, kinship] = await Promise.all([
    ask(
      `select b.id, b.ident_number, b.name, b.birth_date, b.ipc
         from animals b
        where b.id = any($1)`,
      [ids],
    ),
    ask(
      `select
         a.father_id                                                   as bull,
         count(*)::int                                                 as daughters,
         count(*) filter (where a.summary_milk_yield is not null)::int  as with_milk,
         count(distinct a.herd_id)::int                                 as herds,
         count(distinct a.owner_id)::int                                as farms,
         avg(a.summary_milk_yield)                                      as milk_mean,
         avg(a.summary_fat_percent)                                     as fat_mean,
         avg(a.summary_protein_percent)                                 as protein_mean
       from animals a
      where a.father_id = any($1)
        and a.archived is not true
        and a.sex = 'female'
      group by a.father_id`,
      [ids],
    ),
    /*
     * Сверстницы считаются здесь заново, а не берутся из `bullProof`
     * по одному быку. Причина не в экономии запросов: у нескольких быков
     * дочери стоят в одних и тех же стадах, и разбор одного и того же
     * стада по разу на быка — это одна и та же работа, выполненная N раз.
     *
     * Дочери **сравниваемых** быков из сверстниц не исключаются: они
     * исключаются только у своего быка. Иначе сравнение зависело бы
     * от того, кого ещё положили в таблицу, — и одна и та же пара быков
     * давала бы разные числа в разных сочетаниях.
     */
    ask(
      `with d as (
         select a.id, a.father_id as bull, a.herd_id,
                a.summary_milk_yield::double precision as milk
           from animals a
          where a.father_id = any($1)
            and a.archived is not true
            and a.sex = 'female'
            and a.herd_id is not null
            and a.summary_milk_yield is not null
       ),
       mate as (
         select d.id, d.bull, d.milk,
                avg(m.summary_milk_yield::double precision) as mate_milk
           from d
           join animals m
             on m.herd_id = d.herd_id
            and m.id <> d.id
            and m.sex = 'female'
            and m.archived is not true
            and m.summary_milk_yield is not null
            and (m.father_id is null or m.father_id <> d.bull)
          group by d.id, d.bull, d.milk
       )
       select bull,
              count(*)::int              as compared,
              avg(milk - mate_milk)      as vs_mates
         from mate
        group by bull`,
      [ids],
    ),
    ask(
      `select
         a.father_id                                        as bull,
         count(*)::int                                      as afc_cows,
         avg((extract(year  from age(c.date, a.birth_date)) * 12
            + extract(month from age(c.date, a.birth_date))))  as afc_mean
       from animals a
       join calvings c on c.animal_id = a.id and c.number = 1
      where a.father_id = any($1)
        and a.archived is not true
        and a.birth_date is not null
        -- Отёл раньше рождения — перепутанная дата. В карточке быка эта
        -- отсечка стояла, здесь её не было, и один и тот же бык показывал
        -- в карточке и в сравнении разный возраст первого отёла дочерей
        and c."date" > a.birth_date
      group by a.father_id`,
      [ids],
    ),
    /*
     * Родство с вашим стадом — рекурсивный обход вверх от каждой коровы
     * на три колена. Глубже не идём намеренно: вклад предка в родство
     * падает вдвое с каждым коленом, и на четвёртом «родня» означает
     * шесть процентов общей крови — то есть почти всё голштинское
     * поголовье мира. Такая колонка показывала бы одинаковое число
     * у всех быков и не помогала бы выбирать.
     */
    /*
     * Отец и мать перебираются через `lateral (values ...)`, а не двумя
     * ветвями `union all`. Причина не в красоте: PostgreSQL допускает
     * в рекурсивном CTE ровно одну ссылку на сам CTE, и вариант с четырьмя
     * ветвями (два начальных запроса и два рекурсивных) он отвергает целиком.
     *
     * `$3::int` — по той же части: в рекурсивной ветви тип параметра
     * не выводится сам.
     */
    viewerOrg
      ? ask(
          `with recursive up as (
             select a.id as cow, p.anc, 1 as gen
               from animals a
               cross join lateral (values (a.father_id), (a.mother_id)) as p(anc)
              where a.owner_id = $2
                and ${notArchived()}
                -- Живые: «родня в вашем стаде» должна считать то же стадо,
                -- что и подбор пар рядом, иначе выходит «родня у 40 коров»
                -- при 32 в подборе
                and ${liveFemale()}
                and p.anc is not null
             union all
             select u.cow, q.anc, u.gen + 1
               from up u
               join animals p on p.id = u.anc
               cross join lateral (values (p.father_id), (p.mother_id)) as q(anc)
              where u.gen < $3::int
                and q.anc is not null
           )
           select anc                                            as bull,
                  count(distinct cow)::int                       as kin,
                  count(distinct cow) filter (where gen = 1)::int as daughters
             from up
            where anc = any($1)
            group by anc`,
          [ids, viewerOrg, KINSHIP_DEPTH],
        )
      : Promise.resolve([]),
  ])

  const by = (rows: Record<string, unknown>[]) =>
    new Map(rows.map((r) => [numOf(r.bull), r] as const))

  const headBy = by(head)
  const cmpBy = by(comparison)
  const afcBy = by(afc)
  const kinBy = by(kinship)

  /*
   * Порядок строк — тот, в котором быков назвали, а не тот, в котором
   * их вернула база. Человек перечислил их сам и ждёт увидеть в своём
   * порядке; сортировка «по лучшему» здесь была бы подсказкой, а какой
   * признак лучший — решает он.
   */
  const identityBy = new Map(identity.map((r) => [numOf(r.id), r] as const))

  const out: BullRow[] = []
  for (const id of ids) {
    const b = identityBy.get(id)
    if (!b) continue

    const h = headBy.get(id)
    const c = cmpBy.get(id)
    const a = afcBy.get(id)
    const k = kinBy.get(id)

    const compared = numOf(c?.compared)

    out.push({
      id,
      identNumber: String(b.ident_number ?? ''),
      name: (b.name as string) ?? null,
      birthDate: (b.birth_date as string) ?? null,
      ipc: maybe(b.ipc),

      daughters: numOf(h?.daughters),
      withMilk: numOf(h?.with_milk),
      herds: numOf(h?.herds),
      farms: numOf(h?.farms),

      milkMean: h?.milk_mean != null ? Math.round(Number(h.milk_mean)) : null,
      fatMean: h?.fat_mean != null ? Number(Number(h.fat_mean).toFixed(2)) : null,
      proteinMean: h?.protein_mean != null ? Number(Number(h.protein_mean).toFixed(2)) : null,

      /*
       * Ниже порога разница не показывается вовсе, а не показывается
       * с оговоркой. Число, набранное на трёх коровах, читают как число;
       * приписка мелким шрифтом этого не меняет — она объясняет
       * то, что человек уже запомнил.
       */
      vsMates:
        compared >= BULL_COMPARISON_MIN && c?.vs_mates != null
          ? Math.round(Number(c.vs_mates))
          : null,
      compared,

      afcMean: a?.afc_mean != null ? Number(Number(a.afc_mean).toFixed(1)) : null,
      afcCows: numOf(a?.afc_cows),

      kinInHerd: viewerOrg ? numOf(k?.kin) : null,
      daughtersInHerd: viewerOrg ? numOf(k?.daughters) : null,
    })
  }

  return out
}
