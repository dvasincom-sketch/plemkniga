import type { Payload } from 'payload'

/**
 * Отчёты по стаду для «Обзора»: структура, тренд, выбытие, воспроизводство.
 *
 * ## Зачем это отдельно от `herd-summary`
 *
 * Сводка отвечает на вопрос «сколько у меня чего»: животных, коров, средний
 * удой. Здесь — вопросы управления: какое у меня стадо, почему я его теряю,
 * двигаюсь ли я вперёд. Это разные вопросы, и объединять их в один запрос
 * значило бы считать восемь агрегатов там, где странице нужен один.
 *
 * ## Почему всё считается в базе
 *
 * Каждый отчёт — агрегат по всему стаду, а стада бывают в десять тысяч
 * голов. Вытащить их в память и посчитать средние — способ соврать молча:
 * `limit` отрежет хвост, а среднее посчитается по началу списка. Тот же
 * разбор в `herd-summary.ts`.
 *
 * ## Почему отказ не превращается в нули
 *
 * Пустой отчёт и отчёт из нулей выглядят одинаково, а значат разное:
 * «в стаде никого» против «спросить не удалось». Второе — утверждение,
 * которого система не проверяла. Поэтому запросы не глушатся `catch`,
 * возвращающим нули: отказ идёт наверх и попадает в лог.
 */

type SqlPool = {
  query: (q: string, p?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>
}

const poolOf = (payload: Payload): SqlPool | null =>
  (payload.db as unknown as { pool?: SqlPool }).pool ?? null

const n = (v: unknown): number => Number(v ?? 0)

const f = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/* ------------------------------------------------------------------ *
 *                    1. Структура стада по лактациям                  *
 * ------------------------------------------------------------------ */

/**
 * Сколько коров какой лактации и сколько ремонтного молодняка.
 *
 * ## Почему «коров 320» не значит ничего
 *
 * Сорок процентов первотёлок — это не молодое стадо, а высокая вынужденная
 * выбраковка: коровы не доживают до третьей лактации, и хозяйство каждый
 * год покупает или выращивает замену. Стадо с ровным распределением
 * по лактациям и стадо, где каждая вторая корова первого отёла, выглядят
 * одинаково в строке «коров 320» и означают противоположное.
 *
 * В канадских и голландских отчётах эта разбивка стоит первой, до всякой
 * продуктивности. Причина простая: продуктивность объясняется структурой
 * чаще, чем генетикой.
 *
 * ## Откуда берётся номер лактации
 *
 * Из отёлов, а не из возрастной группы в карточке. Возрастная группа —
 * поле, которое заполняет человек и забывает обновить после отёла;
 * отёл — событие с датой, и посчитать их можно.
 */
export type LactationStructure = {
  /** Коров по номеру лактации: 1, 2, 3, 4+. */
  byLactation: { lactation: number; label: string; cows: number }[]
  /** Коров, у которых отёлов в книге нет вовсе. */
  withoutCalvings: number
  /** Средняя лактация по стаду — показатель долголетия. */
  meanLactation: number | null
  cows: number
}

export async function lactationStructure(
  payload: Payload,
  organizationId: number,
): Promise<LactationStructure | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const res = await pool.query(
    `
    with cows as (
      select a.id
        from animals a
       where a.owner_id = $1
         and a.archived is not true
         and a.sex = 'female'
         and a.state = 'alive'
    ),
    /*
     * Номер лактации — число отёлов, а не максимальный номер из записи.
     * Номер в отёле ставит человек и иногда ошибается; счёт строк
     * ошибиться не может.
     */
    counted as (
      select c.id, (select count(*) from calvings k where k.animal_id = c.id) as calvings
        from cows c
    )
    select
      least(calvings, 4) as bucket,
      count(*)::int      as cows
      from counted
     group by least(calvings, 4)
     order by bucket`,
    [organizationId],
  )

  const rows = (res.rows ?? []) as { bucket: unknown; cows: unknown }[]
  const byBucket = new Map(rows.map((r) => [n(r.bucket), n(r.cows)]))

  const LABELS: Record<number, string> = {
    1: 'Первотёлки',
    2: 'Вторая лактация',
    3: 'Третья лактация',
    4: 'Четвёртая и старше',
  }

  const byLactation = [1, 2, 3, 4].map((k) => ({
    lactation: k,
    label: LABELS[k]!,
    cows: byBucket.get(k) ?? 0,
  }))

  const cows = [...byBucket.values()].reduce((a, b) => a + b, 0)
  const withCalvings = cows - (byBucket.get(0) ?? 0)

  /*
   * Средняя лактация считается только по коровам с отёлами. Включив тех,
   * у кого отёлов в книге нет, мы получили бы не «стадо молодое»,
   * а «данные неполные» — и выдали бы второе за первое.
   */
  const meanLactation =
    withCalvings > 0
      ? byLactation.reduce((sum, r) => sum + r.lactation * r.cows, 0) / withCalvings
      : null

  return {
    byLactation,
    withoutCalvings: byBucket.get(0) ?? 0,
    meanLactation,
    cows,
  }
}

/* ------------------------------------------------------------------ *
 *                        2. Ремонтный молодняк                        *
 * ------------------------------------------------------------------ */

/**
 * Тёлки по возрасту: сколько растёт и сколько готово к осеменению.
 *
 * ## Зачем отдельный отчёт
 *
 * Ремонтный молодняк — половина управления стадом и весь его завтрашний
 * день. В строке «животных в работе» он растворён, и хозяйство не видит
 * ни того, хватит ли замены выбывающим коровам, ни того, не передерживает
 * ли оно тёлок.
 *
 * ## Границы возраста
 *
 * Тринадцать месяцев — возраст, с которого голштинскую тёлку в мировой
 * практике осеменяют: к этому времени она набирает нужную массу, а отёл
 * приходится на 22–24 месяца. Пятнадцать — верхняя граница разумного:
 * дальше каждый лишний месяц это корм без отдачи, и передержка съедает
 * больше, чем ранний отёл.
 *
 * Границы не строгие правила, а рамка разговора: хозяйство решает само,
 * но должно видеть, сколько тёлок стоит за каждой границей.
 */
export type HeiferAges = {
  /** Младше года — растут. */
  young: number
  /** 13–15 месяцев — пора осеменять. */
  ready: number
  /** Старше 15 месяцев и без отёла — передержка. */
  overdue: number
  total: number
  /** Средний возраст готовых, месяцев. */
  meanReadyAge: number | null
}

export async function heiferAges(
  payload: Payload,
  organizationId: number,
): Promise<HeiferAges | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const res = await pool.query(
    `
    with heifers as (
      select a.id,
             extract(year from age(now(), a.birth_date)) * 12
             + extract(month from age(now(), a.birth_date)) as months
        from animals a
       where a.owner_id = $1
         and a.archived is not true
         and a.sex = 'female'
         and a.state = 'alive'
         and a.birth_date is not null
         /* Отёлов нет — значит ещё не корова, чем бы ни была заполнена
            возрастная группа в карточке */
         and not exists (select 1 from calvings k where k.animal_id = a.id)
    )
    select
      count(*) filter (where months < 13)::int                  as young,
      count(*) filter (where months between 13 and 15)::int      as ready,
      count(*) filter (where months > 15)::int                   as overdue,
      count(*)::int                                              as total,
      round(avg(months) filter (where months between 13 and 15), 1) as mean_ready
      from heifers`,
    [organizationId],
  )

  const r = (res.rows?.[0] ?? {}) as Record<string, unknown>
  return {
    young: n(r.young),
    ready: n(r.ready),
    overdue: n(r.overdue),
    total: n(r.total),
    meanReadyAge: f(r.mean_ready),
  }
}

/* ------------------------------------------------------------------ *
 *                    3. Генетический тренд и инбридинг                *
 * ------------------------------------------------------------------ */

/**
 * Средний индекс и инбридинг по году рождения.
 *
 * ## Почему рядом, а не порознь
 *
 * Это две стороны одного решения. Индекс говорит, куда стадо движется;
 * инбридинг — какой ценой. Голштинская популяция узкая, и генетический
 * прогресс в ней покупается родством: подбор по лучшим быкам мира
 * неизбежно сужает круг предков. Смотреть одно без другого значит
 * радоваться росту индекса, не замечая, что стадо становится роднёй
 * самому себе.
 *
 * ## Почему по году рождения, а не по дате оценки
 *
 * Год рождения — момент, когда генетика животного окончательно сложилась;
 * оценка может пересчитываться сколько угодно раз и меняться от смены базы
 * сравнения. Ряд по году рождения показывает работу подбора, ряд по дате
 * оценки — работу расчётного центра.
 *
 * ## Порог инбридинга
 *
 * Шесть с четвертью процента — эквивалент спаривания двоюродных; выше
 * начинается заметная инбредная депрессия по продуктивности
 * и воспроизводству. Это общепринятая граница внимания, а не запрет.
 */
export const INBREEDING_THRESHOLD = 6.25

export type TrendPoint = {
  year: number
  animals: number
  /** Средний ИПЦ; null — считать не по чему. */
  ipc: number | null
  /** Средний коэффициент инбридинга, %. */
  inbreeding: number | null
}

export type GeneticTrend = {
  points: TrendPoint[]
  /** Доля животных с F выше порога, среди тех, у кого он посчитан. */
  aboveThreshold: number
  withInbreeding: number
  meanInbreeding: number | null
}

export async function geneticTrend(
  payload: Payload,
  organizationId: number,
): Promise<GeneticTrend | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const res = await pool.query(
    `
    with mine as (
      select extract(year from birth_date)::int as year, ipc, inbreeding
        from animals
       where owner_id = $1
         and archived is not true
         and birth_date is not null
         /*
          * Последние десять лет: раньше в книге обычно единичные записи,
          * и точка из двух животных на графике выглядит так же весомо,
          * как точка из двухсот.
          */
         and birth_date > now() - interval '10 years'
    )
    select year,
           count(*)::int             as animals,
           round(avg(ipc), 1)        as ipc,
           round(avg(inbreeding), 2) as inbreeding
      from mine
     group by year
     order by year`,
    [organizationId],
  )

  const points = ((res.rows ?? []) as Record<string, unknown>[]).map((r) => ({
    year: n(r.year),
    animals: n(r.animals),
    ipc: f(r.ipc),
    inbreeding: f(r.inbreeding),
  }))

  const share = await pool.query(
    `
    select
      count(*) filter (where inbreeding > $2)::int as above,
      count(*)::int                                as total,
      round(avg(inbreeding), 2)                    as mean
      from animals
     where owner_id = $1
       and archived is not true
       and inbreeding is not null`,
    [organizationId, INBREEDING_THRESHOLD],
  )

  const s = (share.rows?.[0] ?? {}) as Record<string, unknown>

  return {
    points,
    aboveThreshold: n(s.above),
    withInbreeding: n(s.total),
    meanInbreeding: f(s.mean),
  }
}

/* ------------------------------------------------------------------ *
 *                          4. Выбытие за год                          *
 * ------------------------------------------------------------------ */

/**
 * Кто выбыл, по какой причине и на какой лактации.
 *
 * ## Почему это главный отчёт хозяйства, а не служебная справка
 *
 * Молочное хозяйство теряет деньги не на низком удое, а на вынужденной
 * выбраковке. Корова окупает выращивание примерно ко второй лактации;
 * выбывшая первотёлка — это чистый убыток, сколько бы она ни дала молока.
 * Поэтому в канадских и голландских отчётах доля выбытия и его причины
 * стоят рядом с продуктивностью, а не в конце.
 *
 * ## Почему в разрезе лактации
 *
 * Причина без лактации не даёт решения. «Выбыло по болезни конечностей
 * сорок голов» — это либо содержание, либо подбор, и различает их возраст:
 * если это в основном первотёлки, дело в полах и обрезке, а не в генетике
 * ног, потому что генетика ног успевает проявиться позже.
 *
 * ## Почему за год, а не за всё время
 *
 * Выбытие — скорость, а не запас. За всё время оно накапливается и растёт
 * само по себе, ничего не сообщая; за год его можно сравнить с прошлым
 * годом и с соседом.
 */
export type CullingReason = { reason: string; count: number; meanLactation: number | null }

export type Culling = {
  /** Выбыло за последние 12 месяцев. */
  total: number
  /** Из них первотёлок — самая дорогая потеря. */
  firstLactation: number
  /** Средняя лактация выбытия: показатель продуктивного долголетия. */
  meanLactation: number | null
  /** Доля от размера стада, %. */
  rate: number | null
  reasons: CullingReason[]
}

export async function culling(
  payload: Payload,
  organizationId: number,
): Promise<Culling | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const res = await pool.query(
    `
    with gone as (
      select a.id,
             coalesce(r.name, 'Причина не указана') as reason,
             (select count(*) from calvings k where k.animal_id = a.id) as lactations
        from animals a
        left join disposal_reasons r on r.id = a.disposal_reason_id
       where a.owner_id = $1
         and a.disposal_date is not null
         and a.disposal_date > now() - interval '12 months'
    ),
    /*
     * Знаменатель — нынешнее стадо плюс выбывшие за год. Взять только
     * нынешнее значило бы делить на то, что осталось после потерь,
     * и занижать долю тем сильнее, чем хуже дела.
     */
    live as (
      select count(*)::int as cows
        from animals
       where owner_id = $1 and archived is not true
         and sex = 'female' and state = 'alive'
    )
    select
      (select count(*) from gone)::int                                   as total,
      (select count(*) from gone where lactations <= 1)::int             as first_lactation,
      (select round(avg(lactations), 1) from gone where lactations > 0)  as mean_lactation,
      (select cows from live)::int                                       as live_cows`,
    [organizationId],
  )

  const r = (res.rows?.[0] ?? {}) as Record<string, unknown>
  const total = n(r.total)
  const liveCows = n(r.live_cows)

  const byReason = await pool.query(
    `
    select coalesce(r.name, 'Причина не указана') as reason,
           count(*)::int                          as count,
           round(avg(nullif((select count(*) from calvings k where k.animal_id = a.id), 0)), 1) as mean_lactation
      from animals a
      left join disposal_reasons r on r.id = a.disposal_reason_id
     where a.owner_id = $1
       and a.disposal_date is not null
       and a.disposal_date > now() - interval '12 months'
     group by 1
     order by count desc`,
    [organizationId],
  )

  return {
    total,
    firstLactation: n(r.first_lactation),
    meanLactation: f(r.mean_lactation),
    rate: total + liveCows > 0 ? (total / (total + liveCows)) * 100 : null,
    reasons: ((byReason.rows ?? []) as Record<string, unknown>[]).map((x) => ({
      reason: String(x.reason ?? 'Причина не указана'),
      count: n(x.count),
      meanLactation: f(x.mean_lactation),
    })),
  }
}

/* ------------------------------------------------------------------ *
 *                       5. Воспроизводство стада                      *
 * ------------------------------------------------------------------ */

/**
 * Фактические показатели воспроизводства — не племенные оценки.
 *
 * ## Чем это отличается от «Фертильности» в карточке
 *
 * Там племенная ценность: что животное передаёт потомству. Здесь работа
 * хозяйства за последний год: как быстро коров осеменяют после отёла,
 * со скольких попыток они становятся стельными, сколько проходит между
 * отёлами. Первое меняется поколениями, второе — решением зоотехника,
 * и путать их нельзя.
 *
 * ## Что означают числа
 *
 * **Сервис-период** — от отёла до плодотворного осеменения. Мировой
 * ориентир для голштина 85–110 дней; больше означает потерянные дни
 * лактации, меньше — риск для восстановления матки.
 *
 * **Индекс осеменения** — сколько доз ушло на одну стельность. Полтора-два
 * — обычное дело, три и выше означают проблему: с выявлением охоты,
 * с хранением семени или со здоровьем стада.
 *
 * **Межотельный период** — 380–400 дней у благополучного стада.
 */
export type Reproduction = {
  /** Средний сервис-период, дней. */
  serviceperiod: number | null
  /** Осеменений на плодотворное. */
  perConception: number | null
  /** Средний межотельный период, дней. */
  calvingInterval: number | null
  /** Сколько отёлов за год легло в основу расчёта. */
  calvings: number
  inseminations: number
}

export async function reproduction(
  payload: Payload,
  organizationId: number,
): Promise<Reproduction | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const res = await pool.query(
    `
    with mine as (
      select id from animals
       where owner_id = $1 and archived is not true and sex = 'female'
    ),
    /*
     * Межотельный период — разница между соседними отёлами одной коровы.
     * Оконная функция берёт предыдущий отёл, а не «первый и последний,
     * делённые на число»: второе даёт среднее за всю жизнь и прячет
     * ухудшение последнего года.
     */
    intervals as (
      select k.animal_id,
             k."date"::date - lag(k."date"::date) over (
               partition by k.animal_id order by k."date"
             ) as days,
             k."date" as at
        from calvings k
        join mine m on m.id = k.animal_id
    ),
    /*
     * Осеменения за год: всего и плодотворных.
     *
     * Результат — не строка в самой записи, а ссылка на справочник:
     * «Стельная», «Яловая», «Выкидыш», «Ожидает проверки». Ведёт его
     * Ассоциация, и названия она вправе поменять — поэтому сверяемся
     * с кодом, а не с текстом. Первая редакция сравнивала с несуществующим
     * полем i.result и падала на живой базе: колонка называется result_id,
     * а значения «pregnant» не бывает вовсе — там ссылка на справочник.
     *
     * Обратные кавычки в этом пояснении стоять не могут: комментарий
     * лежит внутри шаблонной строки, и первая же из них закрыла бы её
     * посреди SQL. Ловушка известная и записана в правилах проекта —
     * и всё равно сработала.
     */
    ins as (
      select count(*)::int                             as total,
             count(*) filter (where r.code = '1')::int  as ok
        from inseminations i
        join mine m on m.id = i.animal_id
        left join insemination_results r on r.id = i.result_id
       where i."date" > now() - interval '12 months'
    ),
    /*
     * Сервис-период: от отёла до первого следующего осеменения. Берётся
     * ближайшее осеменение после отёла, а не первое в году, — иначе
     * у коровы, отелившейся в декабре, период считался бы от январского
     * осеменения прошлой лактации.
     */
    service as (
      select k.animal_id,
             (select min(i."date"::date) - k."date"::date
                from inseminations i
               where i.animal_id = k.animal_id and i."date" > k."date") as days
        from calvings k
        join mine m on m.id = k.animal_id
       where k."date" > now() - interval '18 months'
    )
    select
      (select round(avg(days), 0) from service where days between 20 and 250) as service_period,
      /*
       * Только промежутки, закрывшиеся за последний год.
       *
       * Считалось по всем отёлам за всю историю, а подпись под числом
       * обещала «за последний год» — то есть страница утверждала одно,
       * а показывала другое. Средний межотельный за всю жизнь стада
       * к тому же прячет ухудшение: он тем инертнее, чем дольше стадо
       * ведётся.
       */
      (select round(avg(days), 0) from intervals
        where days between 300 and 600 and at > now() - interval '12 months') as calving_interval,
      (select total from ins)                                    as ins_total,
      (select ok from ins)                                       as ins_ok,
      (select count(*)::int from calvings k join mine m on m.id = k.animal_id
        where k."date" > now() - interval '12 months')           as calvings_year`,
    [organizationId],
  )

  const r = (res.rows?.[0] ?? {}) as Record<string, unknown>
  const insTotal = n(r.ins_total)
  const insOk = n(r.ins_ok)

  return {
    serviceperiod: f(r.service_period),
    /*
     * Индекс осеменения считается только когда стельности отмечены.
     * Делить на ноль нельзя, а показать «0 доз на стельность» —
     * значит соврать: это не отличная работа, это незаполненный результат.
     */
    perConception: insOk > 0 ? Math.round((insTotal / insOk) * 100) / 100 : null,
    calvingInterval: f(r.calving_interval),
    calvings: n(r.calvings_year),
    inseminations: insTotal,
  }
}

/* ------------------------------------------------------------------ *
 *                        6. Здоровье вымени                           *
 * ------------------------------------------------------------------ */

/**
 * Соматические клетки по стаду.
 *
 * ## Почему это на первом экране
 *
 * Мастит — самая дорогая болезнь молочного стада: он бьёт по надою,
 * по сортности молока и по выбраковке одновременно. Уровень соматических
 * клеток — единственный показатель, который меряется у каждой коровы
 * при каждой контрольной дойке и не требует ни осмотра, ни лаборатории
 * сверх обычной.
 *
 * ## Двести тысяч
 *
 * Общепринятая граница здорового вымени. Ниже — доля коров без скрытого
 * мастита, выше — те, кого надо смотреть. Порог одинаков в Канаде,
 * Европе и России, и это тот редкий случай, когда переводить ничего
 * не нужно.
 *
 * ## Почему среднее геометрическое, а не обычное
 *
 * Клетки распределены логнормально: одна корова с миллионом сдвигает
 * обычное среднее так, что оно перестаёт описывать стадо. Мировая практика
 * — среднее взвешенное по надою либо геометрическое; здесь взято
 * геометрическое как более простое и устойчивое.
 */
export type UdderHealth = {
  /** Геометрическое среднее по последним замерам, тыс./мл. */
  meanScc: number | null
  /** Коров выше 200 тыс. */
  above: number
  /** Коров с замером вообще. */
  measured: number
  /** Доля выше порога, %. */
  share: number | null
  /** Дата самого свежего замера — чтобы было видно, насколько отчёт свежий. */
  lastTest: string | null
}

export const SCC_THRESHOLD = 200

export async function udderHealth(
  payload: Payload,
  organizationId: number,
): Promise<UdderHealth | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const res = await pool.query(
    `
    with mine as (
      select id from animals
       where owner_id = $1 and archived is not true
         and sex = 'female' and state = 'alive'
    ),
    /*
     * По одному — последнему — замеру на корову. Взяв все замеры,
     * мы посчитали бы среднее по дойкам, а не по стаду: корова
     * с двенадцатью замерами весила бы вдвенадцатеро больше той,
     * что отелилась месяц назад.
     */
    latest as (
      select distinct on (t.animal_id)
             t.animal_id, t.somatic_cells as scc, t."date"
        from milk_tests t
        join mine m on m.id = t.animal_id
       where t.somatic_cells is not null and t.somatic_cells > 0
       order by t.animal_id, t."date" desc
    )
    select
      round(exp(avg(ln(scc))))::int                        as mean_scc,
      count(*) filter (where scc > $2)::int                 as above,
      count(*)::int                                         as measured,
      max("date")                                           as last_test
      from latest`,
    [organizationId, SCC_THRESHOLD],
  )

  const r = (res.rows?.[0] ?? {}) as Record<string, unknown>
  const measured = n(r.measured)

  return {
    meanScc: f(r.mean_scc),
    above: n(r.above),
    measured,
    share: measured > 0 ? (n(r.above) / measured) * 100 : null,
    lastTest: r.last_test ? new Date(String(r.last_test)).toISOString() : null,
  }
}

/* ------------------------------------------------------------------ *
 *              7. Удой по группам лактаций, за 305 дней               *
 * ------------------------------------------------------------------ */

/**
 * Средний удой раздельно: первотёлки, вторая, третья и старше.
 *
 * ## Почему одно среднее по стаду вводит в заблуждение
 *
 * Первотёлка даёт примерно четыре пятых от того, что даст она же
 * на третьей лактации. Стадо, где сорок процентов коров первого отёла,
 * по общему среднему выглядит хуже соседнего, будучи не хуже: разница
 * не в генетике и не в кормлении, а в возрастном составе. Сравнивать
 * такие стада общим средним — всё равно что сравнивать школы по среднему
 * росту учеников.
 *
 * ## Российская особенность: 305 дней, а не приведение к взрослой
 *
 * В Канаде и США общий показатель приводят к взрослому эквиваленту (ME):
 * удой первотёлки умножают на коэффициент и получают «сколько бы она дала
 * взрослой». Коэффициенты там опубликованы по породе, региону и сезону
 * отёла и пересматриваются.
 *
 * У нас таких таблиц нет, и выдумывать их нельзя: коэффициент, взятый
 * с потолка, превращает измерение в оценку, а оценку — в чужую, никем
 * не подтверждённую. Поэтому здесь принят отечественный порядок —
 * удой за 305 дней, показанный **раздельно по группам**. Он отвечает
 * на тот же вопрос, ничего не выдумывая: сравнивать надо первотёлок
 * с первотёлками.
 *
 * ## Законченные и текущие лактации не смешиваются
 *
 * Лактация в ходу — это не «мало надоила», это «ещё доит». Смешав их
 * со законченными, среднее занижается тем сильнее, чем больше в стаде
 * недавних отёлов, то есть наказывает хозяйство за пополнение.
 * Незаконченные считаются отдельно и только числом.
 */
export type MilkByLactation = {
  groups: {
    key: 'first' | 'second' | 'mature'
    label: string
    cows: number
    /** Средний удой за 305 дней по законченным лактациям. */
    milk305: number | null
    fatPercent: number | null
    proteinPercent: number | null
  }[]
  /** Лактаций в ходу — в средние они не входят. */
  inProgress: number
}

export async function milkByLactation(
  payload: Payload,
  organizationId: number,
): Promise<MilkByLactation | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const res = await pool.query(
    `
    with mine as (
      select id from animals
       where owner_id = $1 and archived is not true and sex = 'female'
    ),
    /*
     * Законченной считается лактация с проставленной датой окончания
     * либо с числом дойных дней не меньше 305. Второе условие нужно
     * потому, что дату окончания заполняют не все, а лактация в 320 дней
     * заведомо не в ходу.
     */
    rows as (
      select l."number"           as lactation,
             l.milk305,
             l.fat305,
             l.protein305,
             (l.end_date is not null or coalesce(l.dd, 0) >= 305) as finished
        from animals_lactations l
        join mine m on m.id = l._parent_id
       where l.milk305 is not null and l.milk305 > 0
    )
    select
      case when lactation <= 1 then 'first'
           when lactation = 2 then 'second'
           else 'mature' end                         as grp,
      count(*)::int                                   as cows,
      round(avg(milk305))::int                        as milk305,
      round(avg(fat305), 2)                           as fat,
      round(avg(protein305), 2)                       as protein
      from rows
     where finished
     group by 1`,
    [organizationId],
  )

  const byKey = new Map(
    ((res.rows ?? []) as Record<string, unknown>[]).map((r) => [String(r.grp), r]),
  )

  const LABELS = {
    first: 'Первотёлки',
    second: 'Вторая лактация',
    mature: 'Третья и старше',
  } as const

  const progress = await pool.query(
    `
    select count(*)::int as n
      from animals_lactations l
      join animals a on a.id = l._parent_id
     where a.owner_id = $1 and a.archived is not true
       and l.milk305 is not null and l.milk305 > 0
       and l.end_date is null and coalesce(l.dd, 0) < 305`,
    [organizationId],
  )

  return {
    groups: (['first', 'second', 'mature'] as const).map((key) => {
      const r = byKey.get(key) ?? {}
      return {
        key,
        label: LABELS[key],
        cows: n(r.cows),
        milk305: f(r.milk305),
        fatPercent: f(r.fat),
        proteinPercent: f(r.protein),
      }
    }),
    inProgress: n((progress.rows?.[0] ?? {}).n),
  }
}
