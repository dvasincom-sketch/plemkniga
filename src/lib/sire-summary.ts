import type { Payload } from 'payload'
import { numOrNull, poolOf } from '@/lib/sql'
import {
  afcMonths,
  finishedLactation,
  hasMilk305,
  lactationGroup,
  nthCalvingCte,
} from '@/lib/sql-lactation'
import { AFC_PLAUSIBLE } from '@/lib/afc'
import { liveFemale, notArchived } from '@/lib/sql-herd'

/**
 * Что каждый бык дал именно в этом стаде.
 *
 * ## Чем это отличается от каталога и от сравнения быков
 *
 * Каталожная оценка быка посчитана по всей популяции: по дочерям
 * в десятках хозяйств, с разным кормлением, разным содержанием и разным
 * климатом. Это её сила — она сравнима между быками — и её слабость: она
 * не отвечает на вопрос «а у меня он что дал».
 *
 * Вопрос не праздный. Бык с высоким индексом может у конкретного
 * хозяйства дать дочерей, которые не выдерживают его кормления; бык
 * средний по каталогу — оказаться лучшим на этом рационе. Никакой каталог
 * этого не покажет, потому что у каталога нет вашего стада. У книги —
 * есть.
 *
 * ## Главное правило: сверстницы того же стада
 *
 * Дочери сравниваются не с каталожным средним и не со всей книгой,
 * а с ровесницами из этого же стада — коровами той же группы лактаций.
 * Иначе «дочери Титана дают на 400 кг больше» означало бы только то,
 * что они моложе или старше остальных.
 *
 * Это тот же приём, что в оценке быка по дочерям (`bull-proof.ts`),
 * но с другой границей выборки: там сверстницы по всей книге, здесь —
 * по одному хозяйству. Числа поэтому разойдутся, и это не ошибка:
 * они отвечают на разные вопросы.
 *
 * ## Почему число дочерей стоит рядом с каждой разницей
 *
 * Разница по двум дочерям — не результат, а совпадение. Показать её без
 * числа значило бы выдать шум за закономерность; именно так каталоги
 * и вводят в заблуждение, когда печатают оценку без достоверности.
 * Порядок в отчёте — по числу дочерей, а не по разнице: сперва то,
 * на что можно опереться.
 */

/** Меньше этого числа дочерей разницу считать бессмысленно. */
export const MIN_DAUGHTERS = 3

export type SireRow = {
  id: number
  identNumber: string
  name: string | null
  /** Индекс племенной ценности быка — для сравнения с тем, что вышло. */
  ipc: number | null
  /** Дочерей в стаде: живых и не в архиве. */
  daughters: number
  /** Из них с законченной лактацией — на них и посчитан удой. */
  withMilk: number
  /** Средний удой дочерей за 305 дней. */
  milk305: number | null
  /** Разница со сверстницами того же стада и той же группы лактаций. */
  vsMates: number | null
  fatPercent: number | null
  proteinPercent: number | null
  /** Средний возраст первого отёла дочерей, месяцев. */
  afc: number | null
  /** Средний последний замер соматики у дочерей, тыс./мл. */
  scc: number | null
}

export type SireSummary = {
  rows: SireRow[]
  /** Дочерей, у которых отец в книге не указан вовсе. */
  withoutSire: number
  cows: number
}

export async function sireSummary(
  payload: Payload,
  organizationId: number,
): Promise<SireSummary | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const res = await pool.query(
    `
    with mine as (
      select a.id, a.father_id
        from animals a
       where a.owner_id = $1
         and ${notArchived()}
         and ${liveFemale()}
    ),
    /*
     * Последняя законченная лактация коровы. То же условие, что
     * в milkByLactation: дата окончания либо не меньше 305 дойных дней,
     * потому что дату окончания заполняют не все.
     */
    milk as (
      select m.id, m.father_id, l.milk305, l.fat305, l.protein305,
             ${lactationGroup('l.lact')} as grp
        from mine m
        join lateral (
          select l.milk305, l.fat305, l.protein305, l."number" as lact
            from animals_lactations l
           where l._parent_id = m.id
             and ${hasMilk305('l')}
             and ${finishedLactation('l')}
           order by l."number" desc
           limit 1
        ) l on true
    ),
    /*
     * Среднее по стаду внутри группы лактаций — то, с чем сравниваются
     * дочери. Считается по всем коровам хозяйства, включая самих дочерей:
     * исключать их значило бы сравнивать группу с остатком, который тем
     * меньше, чем больше в стаде дочерей этого быка. У быка с половиной
     * стада в дочерях «сверстницами» осталась бы вторая половина,
     * и разница удвоилась бы на ровном месте.
     */
    herd_mean as (
      select grp, avg(milk305) as mean
        from milk
       group by grp
    ),
    /*
     * Возраст первого отёла дочерей — в месяцах. Отбор коров свой:
     * отчёт AFC группирует по быку всю книгу, а вопрос здесь про это
     * стадо. Само определение первого отёла и способ счёта месяцев —
     * общие (sql-lactation.ts), иначе тот же бык показывал бы в отчёте
     * по производителям одно число, а в своей карточке другое.
     */
    ${nthCalvingCte('first_calving', 1)},
    afc as (
      select m.id, m.father_id, ${afcMonths('f', 'a')} as months
        from mine m
        join animals a on a.id = m.id
        join first_calving f on f.animal_id = m.id
       where a.birth_date is not null
         and ${afcMonths('f', 'a')} between ${AFC_PLAUSIBLE.min} and ${AFC_PLAUSIBLE.max}
    ),
    scc as (
      select m.id, m.father_id,
             (select t.somatic_cells
                from milk_tests t
               where t.animal_id = m.id
                 and t.somatic_cells is not null and t.somatic_cells > 0
               order by t."date" desc
               limit 1) as scc
        from mine m
    )
    select
      b.id, b.ident_number, b.name, b.ipc,
      (select count(*) from mine m where m.father_id = b.id)::int          as daughters,
      (select count(*) from milk k where k.father_id = b.id)::int          as with_milk,
      (select round(avg(k.milk305)) from milk k where k.father_id = b.id)  as milk305,
      (select round(avg(k.milk305 - h.mean))
         from milk k join herd_mean h on h.grp = k.grp
        where k.father_id = b.id)                                          as vs_mates,
      (select round(avg(k.fat305), 2) from milk k where k.father_id = b.id)     as fat,
      (select round(avg(k.protein305), 2) from milk k where k.father_id = b.id) as protein,
      (select round(avg(x.months), 1) from afc x where x.father_id = b.id)      as afc,
      (select round(exp(avg(ln(s.scc))))::int from scc s
        where s.father_id = b.id and s.scc is not null)                    as scc
      from animals b
     where b.id in (select distinct father_id from mine where father_id is not null)
     order by daughters desc, b.ipc desc nulls last`,
    [organizationId],
  )

  const totals = await pool.query(
    `select count(*)::int                                   as cows,
            count(*) filter (where father_id is null)::int   as without_sire
       from animals a
      where a.owner_id = $1 and ${notArchived()} and ${liveFemale()}`,
    [organizationId],
  )

  const t = (totals.rows?.[0] ?? {}) as Record<string, unknown>

  return {
    rows: ((res.rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      identNumber: String(r.ident_number ?? ''),
      name: r.name ? String(r.name) : null,
      ipc: numOrNull(r.ipc),
      daughters: Number(r.daughters ?? 0),
      withMilk: Number(r.with_milk ?? 0),
      milk305: numOrNull(r.milk305),
      vsMates: numOrNull(r.vs_mates),
      fatPercent: numOrNull(r.fat),
      proteinPercent: numOrNull(r.protein),
      afc: numOrNull(r.afc),
      scc: numOrNull(r.scc),
    })),
    withoutSire: Number(t.without_sire ?? 0),
    cows: Number(t.cows ?? 0),
  }
}
