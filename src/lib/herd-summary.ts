import type { Payload } from 'payload'
import { numOf, numOrNull, poolOf } from '@/lib/sql'
import { liveFemale, notArchived } from '@/lib/sql-herd'

/**
 * Числа по стаду для «Обзора».
 *
 * ## Зачем понадобился отдельный расчёт
 *
 * Их считали дважды. Список животных брал `payload.count` с условием
 * «не в архиве», страница «Аналитика» — `payload.find` без такого условия,
 * и оба называли результат стадом. На живом хозяйстве это выглядело так:
 * в кабинете «Животных в хозяйстве: 74, в архиве 12», в аналитике
 * «Животных в стаде 86». Восемьдесят шесть — это 74 плюс архив.
 *
 * Ошибка не в запросе. Никто не писал «покажи вместе с архивом» — просто
 * два места считали одно понятие, и согласовывать их было нечем: они лежали
 * в разных разделах и писались как разные вещи. Пока счёт живёт в двух
 * местах, он будет расходиться и дальше, и следующее расхождение окажется
 * уже не в счётчике на видном месте, а в среднем удое, по которому кто-то
 * примет решение.
 *
 * Поэтому счёт здесь один, и «Обзор» с списком стада берут его отсюда оба.
 *
 * ## Почему архив не считается
 *
 * Архив — это то, что хозяйство убрало из работы. Средний удой по стаду
 * вместе с архивом отвечает на вопрос, которого никто не задаёт: не «как
 * доит моё стадо», а «как доило бы, если бы я ничего не выбраковывал».
 * Число животных вместе с архивом хуже вдвойне: по нему сверяют
 * с бумажным учётом, а в бумаге выбывших нет.
 *
 * ## Почему SQL, а не выборки
 *
 * Прежняя «Аналитика» тянула из базы две тысячи документов и считала
 * средние в памяти — на стаде в пятьдесят тысяч это и не поместится,
 * и соврёт молча: `limit` отрежет хвост, а средние посчитаются по началу
 * списка. Здесь одно обращение, и считает база, для чего она и есть.
 * Тот же приём, что в `todo.ts` и `farm-stats.ts`.
 *
 * ## Почему отказ не превращается в нули
 *
 * Пустая сводка и сводка из нулей выглядят одинаково, а означают разное:
 * «стадо пустое» против «спросить не удалось». Второе — утверждение,
 * которого система не проверяла, и на видном месте оно опаснее пустоты.
 * Поэтому запрос не оборачивается в `catch`, гасящий ошибку: отказ идёт
 * наверх и попадает в лог.
 */

export type HerdSummary = {
  /** Животных в работе — без архива. То же число, что в шапке списка стада. */
  total: number
  /** Из них коров: женский пол, состояние «в стаде». */
  cows: number
  /** Быков-производителей. */
  bulls: number
  /** В архиве. Показывается рядом, чтобы разница чисел была объяснена. */
  archived: number
  /** Средние по коровам; null означает «считать не по чему», а не ноль. */
  milkYield: number | null
  fatPercent: number | null
  proteinPercent: number | null
  ipc: number | null
  /** По скольким коровам посчитан средний удой. */
  milkBasis: number
}

/** Среднее приходит из базы строкой (numeric) либо null — и null означает null. */

export async function herdSummary(
  payload: Payload,
  organizationId: number,
): Promise<HerdSummary | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  /*
   * Средние считаются только по коровам, и это не придирка к выборке.
   * У быка собственной продуктивности не бывает — доить его нечем, —
   * а число в его карточке означает ошибку переноса, которую ловит
   * отдельная проверка. Взяв быков в среднее, «Обзор» показывал бы это
   * число как продуктивность стада.
   *
   * Пол берётся вместе с состоянием: корова, выбывшая полгода назад,
   * в среднем удое сегодняшнего стада не участвует.
   */
  const res = await pool.query(
    `
    with mine as (
      select sex, state, archived,
             summary_milk_yield, summary_fat_percent, summary_protein_percent, ipc
        from animals
       where owner_id = $1
    ),
    live as (select * from mine a where ${notArchived()}),
    cows as (select * from live a where ${liveFemale()})
    select
      (select count(*) from live)                                  as total,
      (select count(*) from cows)                                  as cows,
      (select count(*) from live where sex = 'male')               as bulls,
      (select count(*) from mine where archived is true)           as archived,
      (select avg(summary_milk_yield) from cows
         where summary_milk_yield is not null)                     as milk_yield,
      (select count(*) from cows where summary_milk_yield is not null) as milk_basis,
      (select avg(summary_fat_percent) from cows
         where summary_fat_percent is not null)                    as fat_percent,
      (select avg(summary_protein_percent) from cows
         where summary_protein_percent is not null)                as protein_percent,
      (select avg(ipc) from live where ipc is not null)            as ipc
    `,
    [organizationId],
  )

  const r = res?.rows?.[0]
  if (!r) return null

  return {
    total: numOf(r.total),
    cows: numOf(r.cows),
    bulls: numOf(r.bulls),
    archived: numOf(r.archived),
    milkYield: numOrNull(r.milk_yield),
    fatPercent: numOrNull(r.fat_percent),
    proteinPercent: numOrNull(r.protein_percent),
    ipc: numOrNull(r.ipc),
    milkBasis: numOf(r.milk_basis),
  }
}
