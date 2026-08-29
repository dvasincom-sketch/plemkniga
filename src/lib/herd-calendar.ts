import type { Payload } from 'payload'
import { poolOf } from '@/lib/sql'

/**
 * Календарь стада: запуск, отёл, проверка стельности.
 *
 * ## Зачем это книге
 *
 * Это единственный отчёт здесь, который смотрят не раз в месяц, а каждое
 * утро. Он не про то, каким стадо получилось, а про то, что с ним делать
 * сегодня: кого перевести в сухостой, кто телится на этой неделе, кого
 * пора проверять после осеменения.
 *
 * Ничего нового для него не вводится: все три списка складываются из отёла
 * и осеменения, которые хозяйство и так записывает.
 *
 * ## Главная условность: ожидаемый отёл считается, а не хранится
 *
 * Поля «ожидаемая дата отёла» в книге нет и заводить его не стоит: оно
 * повторяло бы то, что выводится из даты плодотворного осеменения,
 * и первым же расходилось бы с ней при правке. Ожидаемый отёл здесь —
 * плодотворное осеменение плюс {@link GESTATION_DAYS} дней.
 *
 * Отсюда и граница доверия: если рассчитанный отёл давно прошёл, а записи
 * о нём нет, это не «корова перехаживает», а вопрос к данным — либо
 * стельность не подтвердилась, либо отёл не записали. Поэтому давно
 * просроченные из списков уходят: список дел не должен превращаться
 * в свалку неубранных записей.
 *
 * ## Почему стельность берётся по коду справочника
 *
 * Результат осеменения — ссылка на справочник, который ведёт Ассоциация
 * и вправе переименовать значения. Код 1 — «Стельная»; так же сверяются
 * отчёт о воспроизводстве и список выбраковки.
 */

/**
 * Длина стельности голштинской коровы, дней.
 *
 * В среднем 279; разброс по литературе 275–283, зависит от пола телёнка
 * и двойни. Это не порог, а множитель для срока: ошибка в два-три дня
 * на календаре запуска ничего не решает, а ошибка в две недели решает,
 * и именно её такой расчёт исключает.
 *
 * Рядом в `checks-registry.ts` стоит `GESTATION_MIN_DAYS = 270` — это
 * другое: граница правдоподобия для проверки данных, взятая с запасом
 * вниз. Одно число вместо двух здесь навредило бы: проверка стала бы
 * ловить нормальные ранние отёлы.
 */
export const GESTATION_DAYS = 279

/**
 * За сколько дней до отёла запускают.
 *
 * Шестьдесят дней — общепринятая длина сухостоя. Короче сорока пяти
 * заметно снижает удой следующей лактации: вымя не успевает обновить
 * секреторную ткань. Длиннее семидесяти — лишний корм без молока
 * и риск ожирения, а за ним кетоза после отёла.
 */
export const DRY_OFF_BEFORE = 60

/** Горизонт списка отёлов: месяц вперёд — то, к чему готовят родильное. */
export const CALVING_HORIZON = 30

/**
 * Через сколько дней после осеменения проверяют стельность.
 *
 * Ультразвуком стельность видно с 28–32 дней, ректально — с 35–40.
 * Тридцать взято как самая ранняя разумная граница: раньше проверять
 * нечего, а позже — терять дни, если корова осталась яловой.
 */
export const PREG_CHECK_FROM = 30

/**
 * Докуда список проверки имеет смысл.
 *
 * Осеменение трёхмесячной давности без отметки о результате — это уже
 * не «пора проверить», а пробел в записях, и место ему в разборе стада,
 * а не в списке сегодняшних дел.
 */
export const PREG_CHECK_TO = 120

/**
 * Длина полового цикла коровы, дней.
 *
 * Двадцать один день — стандарт для крупного рогатого скота, разброс
 * 18–24. Через столько яловая корова снова придёт в охоту; звать
 * осеменять раньше значит звать впустую.
 */
export const CYCLE_DAYS = 21

export type CalendarRow = {
  id: number
  identNumber: string
  name: string | null
  /** Отёлов в книге: тёлка перед первым отёлом — это 0. */
  lactation: number
  /**
   * Дата события — ожидаемый отёл либо день осеменения, строкой
   * `YYYY-MM-DD`. Не момент времени: у неё нет часов, и переводить
   * её в пояс читателя нечего.
   */
  at: string
  /** Дней до события; отрицательное — срок прошёл. */
  days: number
  /** Пояснение к строке: от чего считали. */
  detail: string
}

export type HerdCalendar = {
  /** Кому запускать: стельные, до отёла не больше шестидесяти дней. */
  dryOff: CalendarRow[]
  /** Кто телится в ближайший месяц. */
  calving: CalendarRow[]
  /** Кого проверять на стельность: результат осеменения неизвестен. */
  pregCheck: CalendarRow[]
  /** Кого осеменять заново: яловая, цикл прошёл. */
  rebreed: CalendarRow[]
}

/**
 * Общая часть трёх запросов: живые самки хозяйства, их последний отёл
 * и последнее осеменение после него.
 *
 * Тёлки не исключаются. Первый отёл — тоже отёл, и запускать перед ним
 * нечего, а вот телится нетель ровно так же, как корова; список отёлов
 * без нетелей соврал бы родильному отделению.
 */
const BASE = `
  with mine as (
    select a.id, a.ident_number, a.name
      from animals a
     where a.owner_id = $1
       and a.archived is not true
       and a.sex = 'female'
       and a.state = 'alive'
  ),
  calv as (
    select m.id,
           (select count(*) from calvings k where k.animal_id = m.id)::int as lactation,
           (select max(k."date") from calvings k where k.animal_id = m.id) as last_calving
      from mine m
  ),
  /*
   * Последнее осеменение после последнего отёла — и его результат.
   * Берётся именно последнее: у коровы, осеменённой трижды, вопрос
   * стоит про третью попытку, а не про первую.
   */
  last_ins as (
    select c.id, c.lactation, c.last_calving, i.at, i.result_code, i.checked
      from calv c
      left join lateral (
        select i."date" as at,
               r.code   as result_code,
               i.pregnancy_check_date is not null as checked
          from inseminations i
          left join insemination_results r on r.id = i.result_id
         where i.animal_id = c.id
           and (c.last_calving is null or i."date" > c.last_calving)
         order by i."date" desc
         limit 1
      ) i on true
  ),
  /*
   * Плодотворным считается последнее осеменение после отёла с кодом 1.
   * Если после него было ещё одно — значит стельность не подтвердилась
   * или корова перегуляла, и брать старое было бы неверно.
   */
  bred as (
    select l.*,
           case when l.result_code = '1'
                then (l.at::date + $2::int) end as due
      from last_ins l
  )
`

/**
 * Дата не проходит через `Date` по дороге из базы.
 *
 * Первая редакция делала `new Date(значение).toISOString()`, и на экране
 * получалось «25.09.2026» там, где в пояснении из того же поля стояло
 * «26.09.2026». Причина известная: колонку типа `date` драйвер разбирает
 * в полночь **местного** пояса, `toISOString` переводит её в UTC
 * и в поясе восточнее Гринвича отнимает сутки, а показ идёт в UTC.
 *
 * Дата отёла — не момент времени, у неё нет часов, и пропускать её через
 * пояс нельзя вовсе. Поэтому запрос отдаёт её строкой `YYYY-MM-DD`,
 * и дальше она идёт как есть. Та же ловушка разобрана над `dateRu`
 * и в разборе книг Excel.
 */
const rowsOf = (rows: Record<string, unknown>[] | undefined): CalendarRow[] =>
  (rows ?? []).map((r) => ({
    id: Number(r.id),
    identNumber: String(r.ident_number ?? ''),
    name: r.name ? String(r.name) : null,
    lactation: Number(r.lactation ?? 0),
    at: String(r.at ?? ''),
    days: Number(r.days ?? 0),
    detail: String(r.detail ?? ''),
  }))

export async function herdCalendar(
  payload: Payload,
  organizationId: number,
): Promise<HerdCalendar | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const p = [organizationId, GESTATION_DAYS]

  const [dry, calving, check, rebreed] = await Promise.all([
    /*
     * Запуск. Сюда попадает только корова с отёлом: у нетели запускать
     * нечего. Просроченные больше чем на месяц отсекаются — это уже
     * не «пора запускать», а неубранная запись.
     */
    pool.query(
      `${BASE}
       select b.id, m.ident_number, m.name, b.lactation,
              to_char(b.due, 'YYYY-MM-DD')                     as at,
              (b.due - now()::date)                            as days,
              'осеменение ' || to_char(b.at, 'DD.MM.YYYY')
                || ', отёл ожидается ' || to_char(b.due, 'DD.MM.YYYY') as detail
         from bred b
         join mine m on m.id = b.id
        where b.due is not null
          and b.last_calving is not null
          and (b.due - now()::date) between -30 and $3::int
          and not exists (
            select 1 from calvings k
             where k.animal_id = b.id
               and k."date" = b.last_calving
               and k.dry_off_date is not null
          )
        order by b.due`,
      [...p, DRY_OFF_BEFORE],
    ),

    /*
     * Отёл. Нетели включены наравне с коровами. Просроченный больше
     * чем на две недели уходит: это уже вопрос к данным, а не план.
     */
    pool.query(
      `${BASE}
       select b.id, m.ident_number, m.name, b.lactation,
              to_char(b.due, 'YYYY-MM-DD')                     as at,
              (b.due - now()::date)                            as days,
              case when b.lactation = 0 then 'первый отёл' else 'отёл № ' || (b.lactation + 1)::text end
                || ', по осеменению ' || to_char(b.at, 'DD.MM.YYYY') as detail
         from bred b
         join mine m on m.id = b.id
        where b.due is not null
          and (b.due - now()::date) between -15 and $3::int
        order by b.due`,
      [...p, CALVING_HORIZON],
    ),

    /*
     * Проверка стельности. Только те, у кого результат неизвестен вовсе.
     *
     * Первая редакция брала «результат не стельная», то есть заодно всех
     * яловых, — и список смешивал две разные работы. Проверять стельность
     * у коровы, про которую уже известно, что она яловая, незачем: ей
     * нужно новое осеменение, а это другой день, другой человек и другой
     * список. Он идёт следующим.
     *
     * Проверенные вручную (дата проверки заполнена) уходят: работа
     * сделана, даже если результат ещё вносят.
     */
    pool.query(
      `${BASE}
       select b.id, m.ident_number, m.name, b.lactation,
              to_char(b.at, 'YYYY-MM-DD')                      as at,
              (now()::date - b.at::date)                       as days,
              'осеменено ' || to_char(b.at, 'DD.MM.YYYY')
                || ', прошло ' || (now()::date - b.at::date)::text || ' дн.' as detail
         from bred b
         join mine m on m.id = b.id
        where b.at is not null
          and b.checked is not true
          and b.result_code is null
          and (now()::date - b.at::date) between $3::int and $4::int
        order by b.at`,
      [...p, PREG_CHECK_FROM, PREG_CHECK_TO],
    ),

    /*
     * Осеменить заново: последняя попытка окончилась яловостью, и с тех
     * пор прошёл хотя бы один половой цикл.
     *
     * Двадцать один день — длина цикла коровы. Раньше охоты не будет,
     * а список, зовущий осеменять сегодня ту, что пришла в охоту через
     * неделю, приучает себе не верить.
     */
    pool.query(
      `${BASE}
       select b.id, m.ident_number, m.name, b.lactation,
              to_char(b.at, 'YYYY-MM-DD')                      as at,
              (now()::date - b.at::date)                       as days,
              'яловая по осеменению ' || to_char(b.at, 'DD.MM.YYYY')
                || ', прошло ' || (now()::date - b.at::date)::text || ' дн.' as detail
         from bred b
         join mine m on m.id = b.id
        where b.at is not null
          and b.result_code = '2'
          and (now()::date - b.at::date) >= $3::int
        order by b.at`,
      [...p, CYCLE_DAYS],
    ),
  ])

  /*
   * У проверки стельности «дней» означает «прошло», у остальных двух —
   * «осталось». Знак разный, и уравнивать его нельзя: на странице это
   * два разных вопроса — «когда наступит» и «сколько уже тянется».
   */
  return {
    dryOff: rowsOf(dry.rows),
    calving: rowsOf(calving.rows),
    pregCheck: rowsOf(check.rows),
    rebreed: rowsOf(rebreed.rows),
  }
}
