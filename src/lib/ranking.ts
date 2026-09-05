import type { Payload } from 'payload'
import { numOf, numOrNull, poolOf } from '@/lib/sql'
import { ageMonths, calvingEvent, isHeifer, liveFemale, notArchived } from '@/lib/sql-herd'

/**
 * Рейтинг животных по индексу — поимённо, по всей книге.
 *
 * ## Зачем это книге
 *
 * Страница индекса отвечает хозяйству на вопрос «какая тёлка лучше среди
 * моих». Это полезно, но это не тот вопрос, ради которого заводят племенную
 * книгу. Настоящий вопрос звучит иначе: какая моя тёлка среди двадцати тысяч
 * чужих, — и ответить на него не может никто, кроме Ассоциации, потому что
 * только у неё есть все стада разом.
 *
 * Отсюда же и денежный смысл, которого у книги до сих пор не было.
 * Тёлка на сорок седьмом месте продаётся дороже тёлки на пятнадцатитысячном,
 * и обе стороны сделки видят номер. Членство в Ассоциации перестаёт быть
 * обязанностью сдавать отчётность и становится способом показать своё
 * поголовье рынку.
 *
 * Образец взят прямой: чешская ассоциация публикует TOP-500 тёлок ежемесячно
 * и TOP-50 быков ежеквартально, поимённо и с названием хозяйства-владельца.
 *
 * ## Почему поимённо — и чем за это заплачено
 *
 * В «Состоянии стад» записано обратное решение: Ассоциация видит числа
 * и доли и не открывает чужое стадо поимённо. Здесь оно отменено сознательно,
 * и разбор этому — отдельная запись в `docs/reshenya.md`. Коротко: там речь
 * шла о беде (передержка, соматика, выбытие первотёлок) — о том, что хозяйство
 * не обязано показывать соседям. Здесь речь о достижении, и прятать его
 * незачем: рейтинг работает ровно тем, что он публичен внутри Ассоциации.
 *
 * Граница поэтому проведена не по «видно / не видно», а по смыслу числа.
 * Плохое остаётся сводным, хорошее называется по имени.
 *
 * ## Почему считается по хранимым значениям
 *
 * Индекс уже посчитан и лежит в `index_values` — по строке на пару
 * «животное + профиль», с достоверностью, процентилем и копиями полей
 * для отбора. Пересчитывать его здесь заново значило бы завести второе
 * место, где считается одно и то же, и получить расхождение между
 * рейтингом и карточкой животного — худший вид ошибки в книге.
 *
 * Плата за это одна и её надо знать: рейтинг показывает то, что застал
 * последний пересчёт. Животное, заведённое при выключенных хуках, в порядок
 * не попадёт, и молчать об этом нельзя — отставание меряет `indexValuesLag`,
 * страница о нём сообщает.
 */

/** Разряды рейтинга — те же, что у чехов: быки и тёлки отдельно, по возрасту. */
export const RANKING_CATEGORIES = [
  {
    key: 'bulls',
    label: 'Быки',
    hint: 'Живые быки в работе',
  },
  {
    key: 'heifers-young',
    label: 'Тёлки до года',
    hint: 'Без отёла, младше 12 месяцев: оценка идёт от родителей',
  },
  {
    key: 'heifers-old',
    label: 'Тёлки старше года',
    hint: 'Без отёла, 12 месяцев и старше',
  },
  {
    key: 'cows',
    label: 'Коровы',
    hint: 'Отелившиеся хотя бы раз',
  },
] as const

export type RankingCategory = (typeof RANKING_CATEGORIES)[number]['key']

export const isRankingCategory = (v: unknown): v is RankingCategory =>
  RANKING_CATEGORIES.some((c) => c.key === v)

export type RankingRow = {
  /** Место в разряде. Разделённые места сохраняются: у чехов их не разрывают. */
  position: number
  animalId: number
  identNumber: string | null
  name: string | null
  birthDate: string | null
  ownerId: number | null
  ownerName: string | null
  fatherName: string | null
  fatherIdent: string | null
  /** Отец матери: вторая половина родословной, по которой узнают животное. */
  mgsName: string | null
  mgsIdent: string | null
  value: number
  reliability: number | null
  percentile: number | null
  milk: number | null
  fatKg: number | null
  proteinKg: number | null
}

export type Ranking = {
  rows: RankingRow[]
  /** Сколько всего животных в разряде — знаменатель для «47 из 21 480». */
  total: number
  /** Показано меньше, чем есть: список обрезан потолком. */
  capped: boolean
}

/**
 * Сколько строк отдаём. Пятьсот — не круглое число «на глаз», а чешская мера:
 * столько в их списке тёлок, и столько же оказалось разумным здесь. Ниже
 * пятисотого места рейтинг перестаёт быть новостью для кого бы то ни было,
 * а страница на тысячу строк уже не читается.
 */
export const RANKING_LIMIT = 500

/**
 * Условие разряда.
 *
 * Факт отёла берётся из соединения `k`, а не подзапросом на каждую строку:
 * разбор в `sql-herd.ts`. Определение тёлки при этом остаётся общим —
 * меняется способ узнать, телилась ли она, а не правило.
 */
const conditionOf = (category: RankingCategory): string => {
  const calved = 'k.animal_id is not null'

  switch (category) {
    case 'bulls':
      /*
       * Пол и состояние, но не возраст. У быка нет «тёлки до года»:
       * геномная оценка молодого быка и оценка проверенного по дочерям
       * различаются достоверностью, а не разрядом, и достоверность
       * стоит в самой таблице отдельной колонкой.
       */
      return `${notArchived()} and a.sex = 'male' and a.state = 'alive'`
    case 'heifers-young':
      return `${isHeifer('a', calved)} and ${ageMonths()} < 12`
    case 'heifers-old':
      return `${isHeifer('a', calved)} and ${ageMonths()} >= 12`
    case 'cows':
      return `${notArchived()} and ${liveFemale()} and ${calved}`
  }
}

export async function loadRanking(
  payload: Payload,
  profileKey: string,
  category: RankingCategory,
  opts: { limit?: number; ownerId?: number | null } = {},
): Promise<Ranking> {
  const empty: Ranking = { rows: [], total: 0, capped: false }
  const pool = poolOf(payload)
  if (!pool) return empty

  const limit = opts.limit ?? RANKING_LIMIT

  /*
   * Отбор по хозяйству идёт после присвоения места, а не вместо него.
   *
   * Хозяйству нужно не «его собственный рейтинг» — такой у него уже есть
   * на странице индекса, — а место своих животных среди всех. Значит,
   * `rank()` обязан считаться по всему разряду, и только готовый результат
   * сужается до владельца. Поставить условие в `where` значило бы выдать
   * первое место в стаде за первое место в стране.
   */
  const ownerFilter = opts.ownerId ? `where r.owner_id = $3` : ''
  const params: unknown[] = [profileKey, limit]
  if (opts.ownerId) params.push(opts.ownerId)

  const res = await pool.query(
    `
    with calved as (
      select animal_id, count(*)::int as n
        from calvings k
       where ${calvingEvent()}
       group by animal_id
    ),
    ranked as (
      select
        rank() over (order by v.value desc) as position,
        count(*) over ()                    as total,
        a.id                                as animal_id,
        a.ident_number,
        a.name,
        a.birth_date,
        a.owner_id,
        o.name                              as owner_name,
        o.short_name                        as owner_short,
        f.name                              as father_name,
        f.ident_number                      as father_ident,
        g.name                              as mgs_name,
        g.ident_number                      as mgs_ident,
        v.value,
        v.reliability,
        v.percentile,
        a.production_milk_forecast          as milk,
        a.production_fat_kg_forecast        as fat_kg,
        a.production_protein_kg_forecast    as protein_kg
        from index_values v
        join animals a on a.id = v.animal_id
        left join calved k on k.animal_id = a.id
        left join organizations o on o.id = a.owner_id
        left join animals f on f.id = a.father_id
        left join animals m on m.id = a.mother_id
        left join animals g on g.id = m.father_id
       where v.profile_key = $1
         and v.archived is not true
         and ${conditionOf(category)}
    )
    select r.* from ranked r
    ${ownerFilter}
     order by r.position
     limit $2
    `,
    params,
  )

  const rows = (res.rows ?? []) as Record<string, unknown>[]
  const total = rows.length ? numOf(rows[0]!.total) : 0

  return {
    rows: rows.map((r) => ({
      position: numOf(r.position),
      animalId: numOf(r.animal_id),
      identNumber: (r.ident_number as string | null) ?? null,
      name: (r.name as string | null) ?? null,
      birthDate: r.birth_date instanceof Date ? r.birth_date.toISOString() : (r.birth_date as string | null) ?? null,
      ownerId: numOrNull(r.owner_id),
      ownerName: ((r.owner_short as string | null) || (r.owner_name as string | null)) ?? null,
      fatherName: (r.father_name as string | null) ?? null,
      fatherIdent: (r.father_ident as string | null) ?? null,
      mgsName: (r.mgs_name as string | null) ?? null,
      mgsIdent: (r.mgs_ident as string | null) ?? null,
      value: numOf(r.value),
      reliability: numOrNull(r.reliability),
      percentile: numOrNull(r.percentile),
      milk: numOrNull(r.milk),
      fatKg: numOrNull(r.fat_kg),
      proteinKg: numOrNull(r.protein_kg),
    })),
    total,
    capped: !opts.ownerId && total > limit,
  }
}
