import type { Payload } from 'payload'
import { numOf, poolOf } from '@/lib/sql'
import { AFC_PLAUSIBLE } from '@/lib/afc'
import { afcMonths, nthCalvingCte } from '@/lib/sql-lactation'

/**
 * Что известно о быке по его дочерям.
 *
 * ## Зачем отдельный модуль и отдельный блок в карточке
 *
 * У быка нет собственного удоя. Ни лактаций, ни жира, ни белка — и это
 * не пробел в данных, а свойство животного. Карточка при этом показывала
 * ему те же таблицы, что корове: «Фенотип по лактациям» с прочерками
 * и «Продуктивные признаки», где прогноз есть, а фактических значений
 * взяться неоткуда.
 *
 * Ценность быка измеряется в другом месте — в его дочерях. Так устроены
 * все национальные системы оценки: у быка публикуют не то, что он дал,
 * а то, что дали коровы, которых он оставил. Отсюда и содержание блока:
 * сколько дочерей, в скольких хозяйствах, что они доят и в каком возрасте
 * телятся впервые.
 *
 * ## Главная ловушка: среднее по дочерям — не племенная ценность
 *
 * Соблазн очевидный: сложить удои дочерей, поделить и объявить это оценкой
 * быка. Число получится, и оно будет вводить в заблуждение. Дочери разных
 * быков стоят в разных хозяйствах, а разница между хозяйствами больше
 * разницы между быками: бык, чьи дочери попали к хорошему кормленцу,
 * обгонит лучшего быка с дочерьми в среднем хозяйстве.
 *
 * Эту ошибку мы уже разбирали на возрасте первого отёла (решение №52):
 * сырые кривые исходов оказались перепутаны с качеством хозяйства, и мы
 * отказались показывать их как цель.
 *
 * Поэтому здесь два числа, а не одно. Среднее по дочерям — как факт,
 * без притязаний. И **сравнение со сверстницами**: у каждой дочери берётся
 * средний удой других коров её же стада, не дочерей этого быка, и считается
 * разница. Так делали задолго до появления смешанных моделей, и это
 * по-прежнему честнее среднего: разницу между хозяйствами сравнение
 * со сверстницами убирает.
 *
 * ## Чего это всё равно не даёт
 *
 * Настоящей племенной ценности. Она требует одновременного учёта
 * происхождения самих дочерей, года и сезона отёла, и решается уравнением
 * по всей популяции, а не запросом по одному быку. Блок про это говорит
 * прямо, а не намекает мелким шрифтом: число со звёздочкой, о которой
 * не сказано вслух, читают без звёздочки.
 */

const maybe = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** Меньше этого числа дочерей со сверстницами сравнение не показываем. */
const MIN_FOR_COMPARISON = 5

export type BullProof = {
  /** Всего дочерей в книге. */
  daughters: number
  /** Из них с законченной лактацией. */
  withMilk: number
  herds: number
  farms: number
  sons: number

  milkMean: number | null
  fatMean: number | null
  proteinMean: number | null

  /** Средняя разница «дочь минус сверстницы её стада», кг. */
  vsMates: number | null
  /** Сколько дочерей удалось сравнить со сверстницами. */
  compared: number
  /** Сколько дочерей дали жир и белок — числа свои у каждого показателя. */
  withFat: number
  withProtein: number

  /** Возраст первого отёла дочерей, месяцев. */
  afcMean: number | null
  afcCows: number

  /** По годам рождения дочерей — видно, работает бык сейчас или отработал. */
  byYear: { year: number; daughters: number; milk: number | null }[]
}

export async function bullProof(payload: Payload, bullId: number): Promise<BullProof | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const ask = (q: string, p: unknown[]) =>
    pool.query(q, p).then((r) => r.rows ?? []).catch(() => null)

  /*
   * Сверстницы — коровы того же стада, не дочери этого быка.
   *
   * Исключение дочерей не придирка: если половина стада — дочери одного
   * быка, то сравнение с «остальным стадом», куда они включены, сравнивает
   * быка с самим собой и занижает разницу тем сильнее, чем шире он
   * использован. Ровно у хороших быков она и занижалась бы больше всего.
   */
  const [head, comparison, afc, years] = await Promise.all([
    ask(
      `select
         count(*)::int                                              as daughters,
         /*
          * Счётчики по каждому показателю отдельно. Прежде считался один —
          * по удою, — и колонка «Записей» показывала его во всех трёх
          * строках: «жир 3,9 % по 55 записям», когда жир заполнен у двенадцати.
          */
         count(*) filter (where a.summary_milk_yield is not null)::int as with_milk,
         count(*) filter (where a.summary_fat_percent is not null)::int as with_fat,
         count(*) filter (where a.summary_protein_percent is not null)::int as with_protein,
         count(distinct a.herd_id)::int                             as herds,
         count(distinct a.owner_id)::int                            as farms,
         avg(a.summary_milk_yield)                                  as milk_mean,
         avg(a.summary_fat_percent)                                 as fat_mean,
         avg(a.summary_protein_percent)                             as protein_mean
       from animals a
      where a.father_id = $1
        and a.archived is not true
        and a.sex = 'female'`,
      [bullId],
    ),
    ask(
      `with d as (
         select a.id, a.herd_id, a.summary_milk_yield::double precision as milk
           from animals a
          where a.father_id = $1
            and a.archived is not true
            and a.sex = 'female'
            and a.herd_id is not null
            and a.summary_milk_yield is not null
       ),
       mate as (
         select d.id,
                avg(m.summary_milk_yield::double precision) as mate_milk
           from d
           join animals m
             on m.herd_id = d.herd_id
            and m.id <> d.id
            and m.sex = 'female'
            and m.archived is not true
            and m.summary_milk_yield is not null
            and (m.father_id is null or m.father_id <> $1)
          group by d.id
       )
       select count(*)::int as compared, avg(d.milk - mate.mate_milk) as diff
         from d join mate on mate.id = d.id`,
      [bullId],
    ),
    /*
     * Возраст первого отёла дочерей — тем же куском, что в отчёте
     * хозяйства и в сводке Ассоциации (`sql-lactation.ts`). Здесь стоял
     * свой запрос: без `distinct on` (корова с двумя записями «первого
     * отёла» считалась дважды), без рамки правдоподобия (отёл на 60-м
     * месяце тянул среднее вверх) и без пола. Один бык показывал
     * на четырёх страницах четыре разных возраста.
     */
    ask(
      `with ${nthCalvingCte('first_calving', 1)}
       select count(*)::int as cows, avg(${afcMonths()}) as months
         from animals a
         join first_calving f on f.animal_id = a.id
        where a.father_id = $1
          and a.archived is not true
          and a.sex = 'female'
          and a.birth_date is not null
          and ${afcMonths()} between $2 and $3`,
      [bullId, AFC_PLAUSIBLE.min, AFC_PLAUSIBLE.max],
    ),
    ask(
      `select extract(year from a.birth_date at time zone 'UTC')::int as year,
              count(*)::int as daughters,
              avg(a.summary_milk_yield) as milk
         from animals a
        where a.father_id = $1
          and a.archived is not true
          and a.sex = 'female'
          and a.birth_date is not null
        group by 1
        order by 1`,
      [bullId],
    ),
  ])

  const h = head?.[0]
  if (!h) return null

  const daughters = numOf(h.daughters)
  if (!daughters) {
    return {
      daughters: 0,
      withMilk: 0,
      withFat: 0,
      withProtein: 0,
      herds: 0,
      farms: 0,
      sons: 0,
      milkMean: null,
      fatMean: null,
      proteinMean: null,
      vsMates: null,
      compared: 0,
      afcMean: null,
      afcCows: 0,
      byYear: [],
    }
  }

  const sons = await ask(
    `select count(*)::int as n from animals
      where father_id = $1 and archived is not true and sex = 'male'`,
    [bullId],
  ).then((r) => numOf(r?.[0]?.n))

  const compared = numOf(comparison?.[0]?.compared)

  return {
    daughters,
    withMilk: numOf(h.with_milk),
    withFat: numOf(h.with_fat),
    withProtein: numOf(h.with_protein),
    herds: numOf(h.herds),
    farms: numOf(h.farms),
    sons,
    milkMean: maybe(h.milk_mean),
    fatMean: maybe(h.fat_mean),
    proteinMean: maybe(h.protein_mean),
    /*
     * Разница со сверстницами скрывается на малом числе дочерей.
     * У быка с двумя дочерьми она измеряет не быка, а этих двух коров,
     * и показывать её значило бы предложить сравнивать по ней быков.
     */
    vsMates: compared >= MIN_FOR_COMPARISON ? maybe(comparison?.[0]?.diff) : null,
    compared,
    afcMean: maybe(afc?.[0]?.months),
    afcCows: numOf(afc?.[0]?.cows),
    byYear: (years ?? []).map((r) => ({
      year: numOf(r.year),
      daughters: numOf(r.daughters),
      milk: maybe(r.milk),
    })),
  }
}

/** Порог показа сравнения — нужен и странице, чтобы объяснить его отсутствие. */
export const BULL_COMPARISON_MIN = MIN_FOR_COMPARISON
