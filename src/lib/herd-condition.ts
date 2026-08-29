import type { Payload } from 'payload'
import { INBREEDING_THRESHOLD, SCC_THRESHOLD } from '@/lib/herd-analytics'
import type { SignalInput } from '@/lib/herd-signals'
import { numOf, poolOf } from '@/lib/sql'
import {
  ageMonths,
  calvingsCount,
  culledYear,
  isHeifer,
  liveFemale,
  notArchived,
} from '@/lib/sql-herd'

/**
 * Состояние стад — разом по всем хозяйствам, для кабинета Ассоциации.
 *
 * ## Зачем это Ассоциации
 *
 * Ассоциация видела о члене две вещи: сколько у него записей и какая доля
 * подтверждена. И то и другое — про бумагу. Зоотехническое неблагополучие
 * — передержанный молодняк, скрытый мастит, первотёлки в выбытии — она
 * могла узнать, только зайдя в кабинет хозяйства, куда не заходит.
 *
 * Между тем это ровно её работа. Хозяйство видит свою беду и часто с ней
 * живёт; смысл объединения в том, что рядом есть тот, кто видит сорок
 * стад сразу и знает, у кого получилось иначе. Разговор начинается
 * с того, что кто-то заметил.
 *
 * ## Чего здесь нет и не будет: списков животных
 *
 * Ассоциация видит числа и доли, но не открывает чужое стадо поимённо.
 * Соблазн был — те же разборы за числом, что у хозяйства, работают
 * по любому владельцу, и включить их стоило бы одной строки. Граница
 * проведена намеренно: сводное число это повод для разговора, а поимённый
 * список — работа зоотехника хозяйства, и делать её за него Ассоциация
 * не должна и не может. Данные принадлежат хозяйству; надзор за качеством
 * книги не то же самое, что доступ к его стаду.
 *
 * Отсюда же и то, что страница ни на что не ссылается: у чисел здесь нет
 * дверей, и это не недоделка.
 *
 * ## Почему один запрос, а не сорок раз по четыре
 *
 * Хозяйств сорок, отчётов на сигналы четыре — это сто шестьдесят запросов
 * на открытие страницы, каждый проходом по книге в триста тысяч строк.
 * Тот же довод, что у `farm-stats.ts`: сводка по списку считается
 * группировкой, а не повторением поштучного запроса.
 *
 * Дорогое место здесь одно и известно заранее: выбор последнего замера
 * на каждую корову идёт по всей таблице доек, а не по одному хозяйству,
 * — поштучный запрос успевал отсечь чужие строки раньше. Ложится это
 * на индекс `(animal_id, date)`, но проверять надо замером, а не верой:
 * `npm run bench` на боевом объёме.
 *
 * ## Почему числа обязаны сойтись с кабинетом хозяйства
 *
 * Это второе место, где считается одно и то же, и первое расхождение
 * будет стоить дорого не деньгами, а доверием: Ассоциация звонит
 * про передержку у двенадцати тёлок, хозяйство открывает свой кабинет
 * и видит восемь. После такого разговора не верят уже ни одному числу
 * в системе.
 *
 * Защиты две, и обе нужны. Условия берутся из общего объявления
 * (`sql-herd.ts`) — разойтись им не на чем. А сойтись ли они на живых
 * данных, проверяет `npm run check:condition`: он берёт хозяйство,
 * считает его двумя путями и сравнивает. Общее объявление защищает
 * от расхождения правил, прогон — от расхождения запросов, написанных
 * по этим правилам по-разному.
 */

export type HerdCondition = SignalInput & {
  organizationId: number
  /** Живых коров — масштаб, без которого доли не с чем соотнести. */
  cows: number
}

export async function herdConditions(payload: Payload): Promise<Map<number, HerdCondition>> {
  const out = new Map<number, HerdCondition>()
  const pool = poolOf(payload)
  if (!pool) return out

  /*
   * Четыре подзапроса, а не один общий: у отчётов разные основания,
   * и свести их в одну выборку значило бы подменить основание.
   *
   * Тёлки — живые самки без отёла; инбридинг считается по всем записям
   * не в архиве, включая быков; соматика — по последнему замеру живой
   * коровы; выбытие — по всем, кто выбыл за год, включая убранных
   * в архив. Каждое из этих оснований объяснено там, где считается
   * поштучно (`herd-analytics.ts`), и повторено здесь дословно.
   */
  const res = await pool.query(
    `
    select
      o.id::int                             as organization_id,
      coalesce(c.cows, 0)::int              as cows,
      coalesce(h.total, 0)::int             as heifers_total,
      coalesce(h.ready, 0)::int             as heifers_ready,
      coalesce(h.overdue, 0)::int           as heifers_overdue,
      coalesce(i.total, 0)::int             as inbreeding_total,
      coalesce(i.above, 0)::int             as inbreeding_above,
      coalesce(u.measured, 0)::int          as scc_measured,
      coalesce(u.above, 0)::int             as scc_above,
      coalesce(g.total, 0)::int             as culled_total,
      coalesce(g.first_lactation, 0)::int   as culled_first
    from organizations o

    left join (
      select a.owner_id, count(*) as cows
        from animals a
       where ${notArchived()} and ${liveFemale()}
       group by a.owner_id
    ) c on c.owner_id = o.id

    left join (
      select owner_id,
             count(*)                                          as total,
             count(*) filter (where months between 13 and 15)  as ready,
             count(*) filter (where months > 15)               as overdue
        from (
          select a.owner_id, ${ageMonths()} as months
            from animals a
           where ${isHeifer()}
        ) h
       group by owner_id
    ) h on h.owner_id = o.id

    left join (
      select a.owner_id,
             count(*)                                   as total,
             count(*) filter (where a.inbreeding > $1)  as above
        from animals a
       where ${notArchived()} and a.inbreeding is not null
       group by a.owner_id
    ) i on i.owner_id = o.id

    left join (
      select owner_id,
             count(*)                          as measured,
             count(*) filter (where scc > $2)  as above
        from (
          /*
           * По одному — последнему — замеру на корову: взяв все, мы
           * посчитали бы долю по дойкам, а не по стаду, и корова
           * с двенадцатью замерами весила бы вдвенадцатеро больше
           * отелившейся месяц назад.
           */
          select distinct on (t.animal_id)
                 a.owner_id, t.somatic_cells as scc
            from milk_tests t
            join animals a on a.id = t.animal_id
           where ${notArchived()} and ${liveFemale()}
             and t.somatic_cells is not null and t.somatic_cells > 0
           order by t.animal_id, t."date" desc
        ) l
       group by owner_id
    ) u on u.owner_id = o.id

    left join (
      select a.owner_id,
             count(*) as total,
             count(*) filter (where ${calvingsCount()} <= 1) as first_lactation
        from animals a
       where ${culledYear()}
       group by a.owner_id
    ) g on g.owner_id = o.id
    `,
    [INBREEDING_THRESHOLD, SCC_THRESHOLD],
  )

  for (const row of res.rows ?? []) {
    const r = row as Record<string, unknown>
    const id = numOf(r.organization_id)
    out.set(id, {
      organizationId: id,
      cows: numOf(r.cows),
      heifers: {
        total: numOf(r.heifers_total),
        ready: numOf(r.heifers_ready),
        overdue: numOf(r.heifers_overdue),
      },
      trend: {
        withInbreeding: numOf(r.inbreeding_total),
        aboveThreshold: numOf(r.inbreeding_above),
      },
      udder: {
        measured: numOf(r.scc_measured),
        above: numOf(r.scc_above),
      },
      cull: {
        total: numOf(r.culled_total),
        firstLactation: numOf(r.culled_first),
      },
    })
  }

  return out
}
