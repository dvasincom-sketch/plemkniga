import type { Payload } from 'payload'
import { INBREEDING_THRESHOLD } from '@/lib/herd-analytics'
import {
  ageMonths,
  calvingsCount,
  hasCalved,
  lastCalvingDate,
  liveFemale,
  notArchived,
} from '@/lib/sql-herd'
import { poolOf } from '@/lib/sql'

/**
 * Подбор: инбридинг потомка для каждой пары «корова × бык».
 *
 * ## Почему это может только книга
 *
 * Инбридинг потомка есть коэффициент родства его родителей. Чтобы его
 * посчитать, нужны обе родословные разом — и коровы, и быка. У системы
 * управления стадом есть первая, у каталога быков вторая, и ни у кого
 * нет обеих. У племенной книги есть.
 *
 * Наполовину это уже сделано в сравнении быков: колонка «родство
 * с вашим стадом» отвечает, много ли у быка родни в хозяйстве. Но она
 * не отвечает на вопрос, который задают на самом деле: **этого быка
 * к этой корове — можно?**
 *
 * ## Математика
 *
 * Коэффициент родства двух животных по Райту:
 *
 *     f(S, D) = Σ (1/2)^(gS + gD + 1) · (1 + F_A)
 *
 * — сумма по всем общим предкам A и по всем путям к ним, где `gS` и `gD`
 * — число поколений от быка и от коровы до предка (родитель — первое),
 * а `F_A` — собственный инбридинг предка. Инбридинг потомка равен этому
 * коэффициенту.
 *
 * Формула проверяется на известных случаях, и проверка эта не формальная:
 * — полные сибсы: два общих предка на первом колене → 0,125 + 0,125 = 25 %;
 * — полусибсы: один общий предок на первом колене → 12,5 %;
 * — отец и дочь: общий предок — сам бык, gS = 0, gD = 1 → 25 %.
 *
 * Ради третьего случая животное считается собственным предком нулевого
 * колена. Без этого спаривание отца с дочерью дало бы ноль: у них нет
 * общего предка **выше** быка, а сам бык в свой список предков
 * не попадает. Ошибка была бы тихой и ровно в том случае, ради которого
 * отчёт и заводят.
 *
 * ## Почему шесть колен, а не девять
 *
 * Расчёт для одного животного (`ancestry.ts`) идёт на девять колен: там
 * одна родословная и время не жалко. Здесь пар — сотни: каждое колено
 * удваивает число предков, и девятое стоит в восемь раз дороже шестого,
 * добавляя к коэффициенту доли процента. Шесть колен — общепринятая
 * глубина расчёта родства в племенном деле.
 *
 * Из-за этого числа могут слегка расходиться с коэффициентом в карточке
 * животного, и об этом сказано на странице: молчаливое расхождение
 * подрывает доверие сильнее, чем названное.
 *
 * ## Чего расчёт не знает
 *
 * Собственный инбридинг предка берётся из поля `inbreeding` карточки.
 * Где он не заполнен, принимается нулём — то есть коэффициент выходит
 * заниженным, а не завышенным. Направление ошибки названо намеренно:
 * порог здесь предупреждающий, и ошибаться он должен в сторону
 * «покажем меньше, чем есть», а не наоборот.
 */

/** Глубина обхода родословной, колен. */
export const MATING_DEPTH = 6

/** Быков в одном подборе. Столько же, сколько в сравнении быков. */
export const MATING_BULLS_MAX = 6

/**
 * Коров в одном подборе.
 *
 * Не про скорость: план на триста голов уже не читают, а печатают
 * и раздают по группам. Ограничение честнее бесконечной таблицы,
 * которую никто не досмотрит.
 */
export const MATING_COWS_MAX = 300

export type MatingCell = {
  bullId: number
  /** Инбридинг потомка, %. */
  coi: number
}

export type MatingRow = {
  id: number
  identNumber: string
  name: string | null
  lactation: number
  cells: MatingCell[]
  /** Наибольший коэффициент по строке — по нему и порядок. */
  worst: number
}

export type MatingBull = {
  id: number
  identNumber: string
  name: string | null
  ipc: number | null
}

export type MatingPlan = {
  bulls: MatingBull[]
  rows: MatingRow[]
  /** Коров, подходящих под подбор, всего. */
  cows: number
  /** Пар выше порога. */
  risky: number
}

/**
 * Кого подбирают.
 *
 * Стельные исключены: им бык сейчас не нужен, и строка про них была бы
 * работой, которой нет. Тёлки моложе тринадцати месяцев тоже: до этого
 * возраста голштинку не осеменяют.
 *
 * Порядок — по дням после отёла, от самых засидевшихся: план читают
 * сверху, и наверху должны стоять те, с кем решать раньше.
 */
const COWS = `
  cows as (
    select a.id, a.ident_number, a.name,
           ${calvingsCount()}::int as lactation,
           ${lastCalvingDate()} as last_calving
      from animals a
     where a.owner_id = $1
       and ${notArchived()}
       and ${liveFemale()}
       and (
         ${hasCalved()}
         or (a.birth_date is not null and ${ageMonths()} >= 13)
       )
       and not exists (
         select 1
           from inseminations i
           left join insemination_results r on r.id = i.result_id
          where i.animal_id = a.id
            and r.code = '1'
            and i."date" > coalesce(${lastCalvingDate()}, '-infinity'::timestamptz)
       )
  )
`

export async function matingPlan(
  payload: Payload,
  organizationId: number,
  bullIds: number[],
): Promise<MatingPlan | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const bulls = bullIds.slice(0, MATING_BULLS_MAX)
  if (bulls.length === 0) return { bulls: [], rows: [], cows: 0, risky: 0 }

  const bullRows = await pool.query(
    `select id, ident_number, name, ipc from animals where id = any($1::int[]) order by ipc desc nulls last`,
    [bulls],
  )

  /*
   * Порядок колонок задаёт этот список, а не тот, в котором быков
   * отметили. Лучший по индексу стоит слева — с него и читают строку.
   * Раскладка ячеек ниже идёт по нему же: колонки и ячейки, собранные
   * в разном порядке, разошлись бы молча.
   */
  const bullList = ((bullRows.rows ?? []) as Record<string, unknown>[]).map((b) => ({
    id: Number(b.id),
    identNumber: String(b.ident_number ?? ''),
    name: b.name ? String(b.name) : null,
    ipc: b.ipc === null || b.ipc === undefined ? null : Number(b.ipc),
  }))
  const order = bullList.map((b) => b.id)

  const total = await pool.query(`with ${COWS} select count(*)::int as n from cows`, [
    organizationId,
  ])

  const res = await pool.query(
    `
    with recursive
    ${COWS},
    /*
     * Отобранные коровы — те, с кем решать раньше всего. Отбор идёт
     * до обхода родословных: обойти всё стадо, чтобы показать триста
     * строк, значит заплатить за то, чего никто не увидит.
     */
    picked as (
      select * from cows order by last_calving nulls first limit $3::int
    ),
    roots as (
      select id, 'c'::text as side from picked
      union all
      select id, 'b'::text from unnest($2::int[]) as t(id)
    ),
    /*
     * Обход вверх по родословной. Ссылка на рекурсивную часть здесь одна
     * — PostgreSQL больше и не позволяет, — поэтому оба родителя берутся
     * боковым соединением из пары значений, а не двумя ветками union.
     * Тот же приём в расчёте родства со стадом.
     */
    /*
     * Вместе с предком хранится сам путь — список животных, через которых
     * к нему пришли, начиная с корня. Формула Райта суммирует только пути,
     * в которых ни одно животное не встречается дважды, а счётчик
     * «столько-то путей длиной столько-то» не помнит, через кого путь
     * прошёл: с ним вклад общего предка складывался со вкладами всех его
     * предков, и коэффициент выходил завышенным тем сильнее, чем полнее
     * родословная. То же исправление — в lib/ancestry.ts, и оба расчёта
     * сверяет check:mating на животных с дедами.
     *
     * Путь, упирающийся в уже пройденное животное, обрывается: в правильной
     * родословной такого не бывает, в испорченной это защита от круга.
     */
    up as (
      select r.id as root, p.pid as anc, 1 as gen, array[r.id] as via
        from roots r
        join animals a on a.id = r.id
        cross join lateral (values (a.father_id), (a.mother_id)) as p(pid)
       where p.pid is not null and p.pid <> r.id
      union all
      select u.root, p.pid, u.gen + 1, u.via || u.anc
        from up u
        join animals x on x.id = u.anc
        cross join lateral (values (x.father_id), (x.mother_id)) as p(pid)
       where p.pid is not null
         and u.gen < $4::int
         and p.pid <> u.anc
         and not (p.pid = any(u.via))
    ),
    /*
     * Само животное — свой предок нулевого колена с пустым путём. Без этой
     * строки спаривание отца с дочерью дало бы ноль: общего предка выше
     * быка у них нет, а сам бык в свой список не попадает.
     */
    paths as (
      select r.side, u.root, u.anc, u.gen, u.via
        from up u
        join roots r on r.id = u.root
      union all
      select side, id, id, 0, '{}'::int[] from roots
    ),
    pairs as (
      /*
       * Всё считается в numeric: power отдаёт double precision, а его
       * нельзя умножить на numeric без приведения — база откажет.
       * Приводить в одну сторону надёжнее, чем полагаться на то, какой
       * тип победит.
       *
       * Пара путей входит в сумму, только если их списки не пересекаются.
       * Корни лежат в списках, поэтому путь «корова → бык → дед быка»
       * в паре с путём «бык → дед быка» отбрасывается той же проверкой,
       * что и общий дед, — отдельного правила для отца и дочери не нужно.
       */
      select c.root as cow, b.root as bull,
             sum(
               power(0.5::numeric, (c.gen + b.gen + 1)::numeric)
               * (1 + coalesce(a.inbreeding, 0)::numeric / 100)
             ) as coi
        from paths c
        join paths b on b.anc = c.anc and b.side = 'b'
        join animals a on a.id = c.anc
       where c.side = 'c'
         and not (c.via && b.via)
       group by 1, 2
    )
    select p.id, p.ident_number, p.name, p.lactation,
           r.bull, round((r.coi * 100)::numeric, 2) as pct
      from picked p
      left join pairs r on r.cow = p.id
     order by p.last_calving nulls first, p.ident_number`,
    [organizationId, bulls, MATING_COWS_MAX, MATING_DEPTH],
  )

  /*
   * Сборка строк в памяти: запрос отдаёт по строке на пару, а таблице
   * нужна строка на корову. Делать это в SQL сводным столбцом пришлось бы
   * динамически — число быков заранее неизвестно, — и запрос стал бы
   * склейкой текста, которую не проверить глазами.
   */
  const byCow = new Map<number, MatingRow>()

  for (const raw of (res.rows ?? []) as Record<string, unknown>[]) {
    const id = Number(raw.id)
    let row = byCow.get(id)
    if (!row) {
      row = {
        id,
        identNumber: String(raw.ident_number ?? ''),
        name: raw.name ? String(raw.name) : null,
        lactation: Number(raw.lactation ?? 0),
        cells: [],
        worst: 0,
      }
      byCow.set(id, row)
    }
    if (raw.bull !== null && raw.bull !== undefined) {
      const coi = Number(raw.pct ?? 0)
      row.cells.push({ bullId: Number(raw.bull), coi })
      if (coi > row.worst) row.worst = coi
    }
  }

  /*
   * Пары без общего предка в запрос не попадают вовсе: соединение
   * по предку их не находит. Нулём они дополняются здесь — «родства
   * не нашли» и есть ноль, и показывать вместо него пустоту значило бы
   * намекать, что расчёт не удался.
   */
  const rows = [...byCow.values()].map((r) => {
    const known = new Set(r.cells.map((c) => c.bullId))
    for (const b of order) if (!known.has(b)) r.cells.push({ bullId: b, coi: 0 })
    r.cells.sort((a, b) => order.indexOf(a.bullId) - order.indexOf(b.bullId))
    return r
  })

  const risky = rows.reduce(
    (sum, r) => sum + r.cells.filter((c) => c.coi > INBREEDING_THRESHOLD).length,
    0,
  )

  return {
    bulls: bullList,
    rows,
    cows: Number(total.rows?.[0]?.n ?? 0),
    risky,
  }
}
