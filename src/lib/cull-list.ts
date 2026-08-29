import type { Payload } from 'payload'
import { SCC_LABEL, SCC_THRESHOLD } from '@/lib/herd-analytics'
import { calvingsCount, lastCalvingDate, liveFemale, notArchived } from '@/lib/sql-herd'
import { numOrNull, poolOf } from '@/lib/sql'
import { finishedLactation, hasMilk305 } from '@/lib/sql-lactation'

/**
 * Кандидаты на выбраковку — одной таблицей.
 *
 * ## Чем это отличается от отчёта «Выбытие за год»
 *
 * Тот смотрит назад: кого хозяйство уже потеряло и почему. Этот смотрит
 * вперёд: с кем решение принимать сейчас. Первый — итог, второй — работа,
 * и путать их нельзя.
 *
 * ## Почему нет единого рейтинга выбраковки
 *
 * Соблазн большой: сложить продуктивность, соматику, воспроизводство
 * и племенную ценность в одно число и отсортировать стадо по нему.
 * Так устроены платные программы управления стадом, и выглядит это
 * убедительно.
 *
 * Но веса такого числа мы бы выдумали. Сколько стоит одна лишняя тысяча
 * соматики против ста килограммов удоя — зависит от цены молока, от того,
 * сдаёт ли хозяйство сортом, от наличия замены в собственном молодняке.
 * Ничего этого в книге нет. Коэффициент с потолка превращает измерение
 * в чужую, никем не подтверждённую оценку — тот же довод, по которому
 * мы не приводим удой к взрослому эквиваленту (`milkByLactation`).
 *
 * Поэтому здесь не рейтинг, а **поводы**: у каждой коровы перечислено,
 * чем именно она попала в список. Порядок — по числу поводов, а внутри
 * по племенной ценности снизу. Это не оценка, а счёт: «на эту корову
 * есть три претензии, на ту одна». Решает всё равно зоотехник, но он
 * видит, из чего решать.
 *
 * ## Пороги и откуда они
 *
 * **Двести дней после отёла без стельности.** К этому дню прошли и период
 * ожидания, и три-четыре половых цикла. Межотельный период у такой коровы
 * уже перевалит за 480 дней при норме 380–400. В североамериканской
 * практике «open at 200+ DIM» — типовой повод к выбраковке.
 *
 * **Четыре осеменения без результата.** Индекс осеменения 1,5–2 — обычное
 * дело; три уже означает проблему. Четыре — это не невезение, а вопрос
 * к самой корове.
 *
 * **Соматика выше двухсот тысяч** — та же граница, что в отчёте
 * о здоровье вымени, и по той же причине.
 *
 * **Нижняя четверть по племенной ценности и по удою.** Единственные
 * относительные пороги, и это намеренно: абсолютной границы «плохого
 * удоя» не существует — она разная у хозяйства с семью тысячами
 * и у хозяйства с одиннадцатью. Планку задаёт само стадо.
 *
 * Удой сравнивается внутри своей группы лактаций: первотёлка даёт около
 * четырёх пятых от того, что даст она же на третьей. Сравнив её со всем
 * стадом, мы записали бы в кандидаты половину первотёлок за то, что они
 * первотёлки.
 *
 * ## Почему всё считается в базе
 *
 * Поводы можно было бы разложить в памяти — код читался бы легче. Но тогда
 * пришлось бы вытащить всё стадо, а стада бывают в десять тысяч голов,
 * и потолок выборки отрезал бы хвост молча. Пороги при этом остаются
 * здесь и уходят в запрос параметрами: одно место на весь расчёт.
 */

/** Двести дней после отёла без стельности. */
export const DIM_OPEN = 200

/** Осеменений после последнего отёла, после которых это вопрос к корове. */
export const SERVICES_MAX = 4

/** Нижняя четверть — доля, а не число: планку задаёт само стадо. */
export const BOTTOM_QUARTER = 0.25

/**
 * Претензии — только те, что относятся к самой корове.
 *
 * ## Почему «не осеменялась» сюда не входит
 *
 * Первая редакция ставила претензию «не стельная» всякой корове,
 * у которой прошло больше двухсот дней после отёла и стельность
 * не подтверждена. На живом стаде в список попало двадцать семь коров
 * из двадцати восьми — и не потому, что стадо плохое, а потому,
 * что осеменения в нём не записаны вовсе.
 *
 * Разница принципиальная. «Осеменяли четыре раза, стельности нет» —
 * претензия к корове. «Записей об осеменении нет» — это либо её
 * не осеменяли, либо осеменяли и не записали, и различить одно
 * от другого книга не может. Ставить в вину неизвестное — тот же
 * приём, что показывать ноль вместо «нет данных».
 *
 * Поэтому «не осеменялась» осталась пометкой рядом со строкой, но
 * в счёт претензий не входит и сама по себе в список не приводит.
 * Список, куда попадает всё стадо, бесполезен ровно так же, как пустой.
 */
export type CullReason = 'open' | 'services' | 'scc' | 'ipc' | 'milk'

export const CULL_REASONS: Record<CullReason, { label: string; hint: string }> = {
  open: {
    label: 'Не стельная',
    hint: `осеменяли, но больше ${DIM_OPEN} дней после отёла стельность не подтверждена`,
  },
  services: {
    label: 'Много осеменений',
    hint: `${SERVICES_MAX} и больше попыток после последнего отёла без результата`,
  },
  scc: {
    label: 'Соматика',
    hint: `последний замер выше ${SCC_LABEL}/мл`,
  },
  ipc: {
    label: 'Низкий индекс',
    hint: 'нижняя четверть стада по племенной ценности',
  },
  milk: {
    label: 'Низкий удой',
    hint: 'нижняя четверть своей группы лактаций по удою за 305 дней',
  },
}

export type CullRow = {
  id: number
  identNumber: string
  name: string | null
  /** Отёлов в книге. */
  lactation: number
  /** Дней после последнего отёла; null — отёлов нет. */
  dim: number | null
  /** Осеменений после последнего отёла. */
  services: number
  /** Подтверждена ли стельность после последнего отёла. */
  pregnant: boolean
  scc: number | null
  milk305: number | null
  ipc: number | null
  reasons: CullReason[]
  /**
   * Больше {@link DIM_OPEN} дней после отёла и ни одной записи
   * об осеменении. Не претензия, а вопрос к записям: либо не осеменяли,
   * либо не записали.
   */
  notBred: boolean
}

export type CullList = {
  /** Коров в стаде — знаменатель для доли. */
  cows: number
  /** Коров хотя бы с одним поводом. */
  flagged: number
  rows: CullRow[]
}

/**
 * Тело запроса — цепочка CTE, заканчивающаяся `flagged`.
 *
 * Вынесено, потому что по нему идут два обращения: счёт помеченных коров
 * и сама выборка. Считать длину выборки нельзя — она обрезана потолком,
 * и «двести из двухсот» означало бы, что больше никого нет, когда
 * их шестьсот.
 *
 * Число претензий считается отдельным CTE, а не выражением в итоговом
 * `select`. Первая редакция дописывала `where score > 0` к запросу,
 * где `score` был псевдонимом колонки этого же `select`, — PostgreSQL
 * такого не позволяет и отвечает «column score does not exist».
 * Ошибку нашёл лог отказа базы: он печатает текст запроса, иначе
 * пришлось бы гадать, какой из трёх запросов упал.
 */
const BODY = `
  with mine as (
    select a.id, a.ident_number, a.name, a.ipc
      from animals a
     where a.owner_id = $1
       and ${notArchived()}
       and ${liveFemale()}
  ),
  /*
   * Лактация и дата последнего отёла — счётом событий, а не из возрастной
   * группы карточки: группу заполняет человек и забывает обновить,
   * отёл есть событие с датой. Так же считает lactationStructure.
   */
  calv as (
    select m.id,
           ${calvingsCount('m')}::int as lactation,
           ${lastCalvingDate('m')} as last_calving
      from mine m
  ),
  /*
   * Осеменения и стельность — только после последнего отёла. Взяв все,
   * мы посчитали бы попытки прошлых лактаций, а вопрос стоит про нынешнюю.
   *
   * Стельность узнаётся по коду справочника, а не по названию: справочник
   * ведёт Ассоциация и вправе переименовать значение. Код 1 — «Стельная»,
   * так же сверяется отчёт о воспроизводстве.
   */
  serv as (
    select c.id,
           c.lactation,
           c.last_calving,
           (select count(*) from inseminations i
             where i.animal_id = c.id
               and (c.last_calving is null or i."date" > c.last_calving))::int as services,
           exists (
             select 1 from inseminations i
               left join insemination_results r on r.id = i.result_id
              where i.animal_id = c.id
                and (c.last_calving is null or i."date" > c.last_calving)
                and r.code = '1'
           ) as pregnant
      from calv c
  ),
  latest_scc as (
    select m.id,
           (select t.somatic_cells
              from milk_tests t
             where t.animal_id = m.id
               and t.somatic_cells is not null and t.somatic_cells > 0
             order by t."date" desc
             limit 1) as scc
      from mine m
  ),
  /*
   * Последняя законченная лактация: с датой окончания либо не меньше
   * 305 дойных дней. То же условие, что в milkByLactation, и по той же
   * причине — дату окончания заполняют не все.
   */
  last_milk as (
    select m.id, l.milk305, l.lact
      from mine m
      left join lateral (
        select l.milk305, l."number" as lact
          from animals_lactations l
         where l._parent_id = m.id
           and ${hasMilk305('l')}
           and ${finishedLactation('l')}
         order by l."number" desc
         limit 1
      ) l on true
  ),
  /*
   * Положение в стаде. Считается только по тем, у кого показатель есть:
   * корова без индекса не «худшая», она неизмеренная, и ставить её
   * в нижнюю четверть значило бы наказать за пробел в данных.
   */
  ipc_rank as (
    select id, percent_rank() over (order by ipc) as pct
      from mine
     where ipc is not null
  ),
  milk_rank as (
    select id,
           percent_rank() over (
             partition by case when lact <= 1 then 1 when lact = 2 then 2 else 3 end
             order by milk305
           ) as pct
      from last_milk
     where milk305 is not null
  ),
  scored as (
    select m.id, m.ident_number, m.name, m.ipc,
           s.lactation, s.services, s.pregnant,
           case when s.last_calving is null then null
                else (now()::date - s.last_calving::date) end as dim,
           c.scc,
           lm.milk305,
           /*
            * «Не стельная» требует хотя бы одной попытки: без неё
            * это не претензия к корове, а пробел в записях. Такая
            * строка получает отдельную пометку not_bred, которая
            * в счёт претензий не идёт. Обратные кавычки вокруг имени
            * колонки поставить нельзя: комментарий лежит внутри
            * шаблонной строки, и первая же из них закроет её посреди
            * SQL. Ловушка записана в правилах проекта и сработала снова.
            */
           (s.last_calving is not null
             and s.services > 0
             and not s.pregnant
             and (now()::date - s.last_calving::date) > $2)          as r_open,
           (s.last_calving is not null
             and s.services = 0
             and not s.pregnant
             and (now()::date - s.last_calving::date) > $2)          as not_bred,
           (s.services >= $3 and not s.pregnant)                     as r_services,
           (c.scc is not null and c.scc > $4)                        as r_scc,
           (ir.pct is not null and ir.pct < $5)                      as r_ipc,
           (mr.pct is not null and mr.pct < $5)                      as r_milk
      from mine m
      join serv s on s.id = m.id
      join latest_scc c on c.id = m.id
      join last_milk lm on lm.id = m.id
      left join ipc_rank ir on ir.id = m.id
      left join milk_rank mr on mr.id = m.id
  ),
  flagged as (
    select *,
           (r_open::int + r_services::int + r_scc::int + r_ipc::int + r_milk::int) as score
      from scored
  )
`

export async function cullList(
  payload: Payload,
  organizationId: number,
  limit = 200,
): Promise<CullList | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const params = [organizationId, DIM_OPEN, SERVICES_MAX, SCC_THRESHOLD, BOTTOM_QUARTER]

  const [cows, flagged, rows] = await Promise.all([
    pool.query(
      `select count(*)::int as n from animals a
        where a.owner_id = $1 and ${notArchived()} and ${liveFemale()}`,
      [organizationId],
    ),
    pool.query(`${BODY} select count(*)::int as n from flagged where score > 0`, params),
    pool.query(
      /*
       * Порядок: сперва число поводов, потом племенная ценность снизу.
       * Второй ключ нужен именно такой — при равном числе претензий
       * первой выбраковывают ту, что хуже передаёт потомству: остальные
       * поводы поправимы кормлением и лечением, а генетика нет.
       *
       * Корова без индекса уходит в конец: неизвестно не значит плохо.
       */
      `${BODY} select * from flagged where score > 0
        order by score desc, ipc asc nulls last
        limit ${Number(limit)}`,
      params,
    ),
  ])

  const reasonsOf = (r: Record<string, unknown>): CullReason[] => {
    const out: CullReason[] = []
    if (r.r_open) out.push('open')
    if (r.r_services) out.push('services')
    if (r.r_scc) out.push('scc')
    if (r.r_ipc) out.push('ipc')
    if (r.r_milk) out.push('milk')
    return out
  }

  return {
    cows: Number(cows.rows?.[0]?.n ?? 0),
    flagged: Number(flagged.rows?.[0]?.n ?? 0),
    rows: ((rows.rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      identNumber: String(r.ident_number ?? ''),
      name: r.name ? String(r.name) : null,
      lactation: Number(r.lactation ?? 0),
      dim: numOrNull(r.dim),
      services: Number(r.services ?? 0),
      pregnant: Boolean(r.pregnant),
      scc: numOrNull(r.scc),
      milk305: numOrNull(r.milk305),
      ipc: numOrNull(r.ipc),
      reasons: reasonsOf(r),
      notBred: Boolean(r.not_bred),
    })),
  }
}
