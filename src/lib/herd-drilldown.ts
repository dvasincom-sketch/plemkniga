import type { Payload } from 'payload'
import {
  INBREEDING_LABEL,
  INBREEDING_THRESHOLD,
  SCC_LABEL,
  SCC_THRESHOLD,
} from '@/lib/herd-analytics'
import { NBSP } from '@/lib/format'
import {
  ageMonths,
  calvingsCount,
  culledYear,
  isHeifer,
  lastCalvingDate,
  liveFemale,
  notArchived,
} from '@/lib/sql-herd'
import { poolOf } from '@/lib/sql'

/**
 * Число отчёта → животные, которые за ним стоят.
 *
 * ## Зачем это вообще
 *
 * «Инбридинг выше 6,25 % — двенадцать животных» само по себе бесполезно:
 * с числом ничего сделать нельзя, а с двенадцатью коровами можно. Отчёты
 * в `herd-analytics.ts` считают агрегаты и на этом останавливаются, и до
 * сих пор в кабинете хозяйства не было ни одного перехода от числа
 * к списку — единственный такой разбор был у Ассоциации
 * (`quality-drilldown.ts`), и своих данных хозяйству он не показывал.
 *
 * ## Главное правило: условие повторяется дословно
 *
 * Каждое условие здесь списано с того запроса, который считает число.
 * Иначе человек увидит «двенадцать» и одиннадцать строк — и перестанет
 * верить обоим сразу. Расхождение тут дороже ошибки: ошибку видно,
 * а несходящееся число подрывает доверие ко всему отчёту.
 *
 * Отсюда же неочевидные повторы: выбытие не отсекает архив (так считает
 * `culling`), а группы лактаций считают строки лактаций, а не коров
 * (так считает `milkByLactation`). Приводить их «к порядку» здесь нельзя:
 * список разойдётся с числом.
 *
 * ## Почему список, а не фильтр в общем поиске
 *
 * Соблазн был: отправлять на `/account?tab=herd&…` с готовыми условиями.
 * Но половина условий поиском не выражается — «последний замер ССК выше
 * двухсот» требует выборки последнего замера на корову, а «выбыло за год»
 * относится к тем, кого в списке стада нет вовсе. Пришлось бы либо
 * заводить в поиске десяток условий, нужных одному отчёту, либо молча
 * показывать не то, что обещано.
 *
 * ## Ограничение списка
 *
 * Двести строк. Сводка отвечает на вопрос о масштабе, список — о разборе,
 * и разбирают глазами не больше сотни. Сколько записей осталось за краем,
 * страница говорит вслух: обрезанный список, молчащий об обрезке, — это
 * ложь про размер беды.
 */

export type HerdRow = {
  id: number
  identNumber: string
  name: string | null
  /**
   * Дата рождения строкой `YYYY-MM-DD`, без перевода в пояс.
   *
   * Через `Date` её пропускать нельзя: колонку типа `date` драйвер
   * разбирает в полночь местного пояса, `toISOString` переводит в UTC
   * и восточнее Гринвича отнимает сутки. На календаре стада это дало
   * «25.09» там, где в соседней ячейке из того же поля стояло «26.09».
   */
  birthDate: string | null
  /** Пояснение, относящееся именно к этой строке: почему она здесь. */
  detail: string | null
}

export type HerdDrilldown = {
  code: string
  /** Заголовок страницы. */
  label: string
  /** Одна строка: из чего собран список и с каким числом он должен сойтись. */
  note: string
  /** Подпись колонки пояснений — у каждого списка она про своё. */
  detailLabel: string
  total: number
  rows: HerdRow[]
}

/*
 * Возраст, отёлы и тёлки берутся из общего объявления (`sql-herd.ts`),
 * а не переписываются здесь.
 *
 * До этого над каждым из них стоял комментарий «тем же выражением, что
 * в `heiferAges`» — обещание, которое ничто не проверяло. Расхождение
 * стоило бы дорого и заметили бы его поздно: число в отчёте и длина
 * списка за ним считались бы по-разному, а сойтись они обязаны, иначе
 * человек перестанет верить обоим сразу.
 */
const MONTHS = ageMonths()
const CALVINGS = calvingsCount()
const HEIFERS = `
  from animals a
 where a.owner_id = $1
   and ${isHeifer()}
`

/**
 * Число из запроса — русской записью.
 *
 * Пояснения к строкам собирает сама база: `round(a.inbreeding, 2)::text`.
 * PostgreSQL пишет дробную часть через точку, и в таблице стояло «8.75 %»
 * под заголовком «Животные с инбридингом выше 6,25 %» — одно и то же
 * число двумя способами на одном экране, причём порог по-русски,
 * а значение по-английски.
 *
 * Приводить это в `nf` на стороне приложения было бы правильнее,
 * но пояснение — свободный текст, склеенный в запросе из числа, единицы
 * и даты, и разбирать его обратно на части ради одной запятой значило бы
 * усложнить куда больше, чем исправить.
 */
const ruNum = (expr: string) => `replace(${expr}::text, '.', ',')`

type Rule = {
  label: string
  note: string
  detailLabel: string
  /** `from` и `where` с `$1` — хозяйством. Порядок задаётся отдельно. */
  body: string
  /** Выражение, объясняющее строку. */
  detail: string
  order: string
  /** Дополнительные параметры, начиная с `$2`. */
  params?: (number | string)[]
}

const RULES: Record<string, Rule> = {
  /* ------------------------- Ремонтный молодняк ------------------------ */

  'heifers-ready': {
    label: 'Тёлки, готовые к осеменению',
    note: '13–15 месяцев, отёлов в книге нет',
    detailLabel: 'Возраст',
    body: `${HEIFERS} and (${MONTHS}) between 13 and 15`,
    detail: `(${MONTHS})::text || '${NBSP}мес.'`,
    order: `${MONTHS} desc`,
  },

  'heifers-overdue': {
    label: 'Тёлки в передержке',
    note: 'Старше 15 месяцев и ни одного отёла',
    detailLabel: 'Возраст',
    body: `${HEIFERS} and (${MONTHS}) > 15`,
    detail: `(${MONTHS})::text || '${NBSP}мес.'`,
    order: `${MONTHS} desc`,
  },

  'heifers-young': {
    label: 'Тёлки в выращивании',
    note: 'Младше 13 месяцев',
    detailLabel: 'Возраст',
    body: `${HEIFERS} and (${MONTHS}) < 13`,
    detail: `(${MONTHS})::text || '${NBSP}мес.'`,
    order: `${MONTHS} desc`,
  },

  /* --------------------------- Инбридинг ------------------------------- */

  'inbreeding-above': {
    label: `Животные с инбридингом выше ${INBREEDING_LABEL}`,
    note: 'По коэффициенту, записанному в карточке',
    detailLabel: 'Коэффициент',
    body: `
      from animals a
     where a.owner_id = $1
       and ${notArchived()}
       and a.inbreeding is not null
       and a.inbreeding > $2`,
    detail: `${ruNum('round(a.inbreeding, 2)')} || '${NBSP}%'`,
    order: 'a.inbreeding desc',
    params: [INBREEDING_THRESHOLD],
  },

  /* ------------------------- Здоровье вымени --------------------------- */

  /*
   * Последний замер на корову выбирается боковым соединением, а не
   * `distinct on` из отчёта. Результат тот же, но здесь нужны и число,
   * и дата в пояснении, а `distinct on` пришлось бы оборачивать ещё
   * одним уровнем ради соединения с карточкой.
   */
  'scc-above': {
    label: `Коровы с соматикой выше ${SCC_LABEL}`,
    note: 'По последнему замеру каждой коровы',
    detailLabel: 'Последний замер',
    body: `
      from animals a
      join lateral (
        select t.somatic_cells as scc, t."date" as at
          from milk_tests t
         where t.animal_id = a.id
           and t.somatic_cells is not null
           and t.somatic_cells > 0
         order by t."date" desc
         limit 1
      ) t on true
     where a.owner_id = $1
       and ${notArchived()}
       and ${liveFemale()}
       and t.scc > $2`,
    detail: `t.scc::text || '${NBSP}тыс./мл · ' || to_char(t.at, 'DD.MM.YYYY')`,
    order: 't.scc desc',
    params: [SCC_THRESHOLD],
  },

  /* ---------------------------- Выбытие -------------------------------- */

  /*
   * Архив здесь не отсекается — так считает `culling`, и на то есть
   * причина: выбывшее животное часто и убирают в архив, а отчёт про то,
   * скольких хозяйство потеряло, а не скольких оно показывает.
   */
  'culled-year': {
    label: 'Выбыло за год',
    note: 'Все выбытия за последние 12 месяцев',
    detailLabel: 'Причина и лактация',
    body: `
      from animals a
      left join disposal_reasons r on r.id = a.disposal_reason_id
     where a.owner_id = $1
       and ${notArchived()}
       and a.sex = 'female'
       and ${culledYear()}`,
    detail: `
      coalesce(r.name, 'Причина не указана')
      || ' · лактация ' || ${CALVINGS}::text
      || ' · ' || to_char(a.disposal_date, 'DD.MM.YYYY')`,
    order: 'a.disposal_date desc',
  },

  /*
   * Первотёлки отдельным правилом, а не отбором внутри общего списка.
   *
   * Сигнал «12 первотёлок выбыло за год» вёл на `culled-year` — список
   * всех сорока выбывших. Число и список отвечали на разные вопросы,
   * и понять это можно было только пересчитав строки руками.
   *
   * Условие списано с `culling` дословно, включая `lactations <= 1`:
   * ноль отёлов тоже сюда — животное, выбывшее до первого отёла, это
   * та же непокрытая стоимость выращивания, только полная.
   */
  'culled-first': {
    label: 'Первотёлки, выбывшие за год',
    note: 'Выбыли до второго отёла: выращивание не окупилось',
    detailLabel: 'Причина и лактация',
    body: `
      from animals a
      left join disposal_reasons r on r.id = a.disposal_reason_id
     where a.owner_id = $1
       and ${notArchived()}
       and a.sex = 'female'
       and ${culledYear()}
       and ${CALVINGS} <= 1`,
    detail: `
      coalesce(r.name, 'Причина не указана')
      || ' · лактация ' || ${CALVINGS}::text
      || ' · ' || to_char(a.disposal_date, 'DD.MM.YYYY')`,
    order: 'a.disposal_date desc',
  },

  /* ----------------------- Структура по лактациям ---------------------- */

  'lactation-1': lactationRule(1, 'Первотёлки'),
  'lactation-2': lactationRule(2, 'Коровы второй лактации'),
  'lactation-3': lactationRule(3, 'Коровы третьей лактации'),
  'lactation-4': lactationRule(4, 'Коровы четвёртой лактации и старше'),

  'no-calvings': {
    label: 'Коровы без отёлов в книге',
    note: 'Числятся коровами, но ни одного отёла не записано — пробел в данных, а не молодость стада',
    detailLabel: 'Возраст',
    body: `
      from animals a
     where a.owner_id = $1
       and ${notArchived()}
       and ${liveFemale()}
       and (a.age_group is null or a.age_group not in ('calf', 'heifer'))
       and ${CALVINGS} = 0`,
    detail: `case when a.birth_date is null then 'дата рождения не указана'
                  else (${MONTHS})::text || '${NBSP}мес.' end`,
    order: 'a.ident_number',
  },

  /* ------------------------ Лактации в ходу ---------------------------- */

  'milk-in-progress': {
    label: 'Коровы с незаконченной лактацией',
    note: 'Есть удой за 305 дней, но лактация не закрыта: в средние она не входит',
    detailLabel: 'Лактация',
    body: `
      from animals a
      join lateral (
        select l."number" as num, l.milk305, l.dd
          from animals_lactations l
         where l._parent_id = a.id
           and l.milk305 is not null and l.milk305 > 0
           and l.end_date is null and coalesce(l.dd, 0) < 305
         order by l."number" desc
         limit 1
      ) l on true
     where a.owner_id = $1
       and ${notArchived()}`,
    detail: `
      '№ ' || coalesce(l.num, 0)::text
      || ' · ' || round(l.milk305)::text || '${NBSP}кг'
      || ' · ' || coalesce(l.dd, 0)::text || '${NBSP}дн.'`,
    order: 'l.milk305 desc',
  },
}

/**
 * Правило «коровы такой-то лактации».
 *
 * Четвёртая объединяет всё старше — так же, как `lactationStructure`
 * сводит их через `least(…, 4)`. Отдельные строки для пятой и шестой
 * лактации в стаде голштинов почти всегда единичны, и разносить их
 * значило бы показывать шум с видом закономерности.
 */
function lactationRule(k: number, label: string): Rule {
  return {
    label,
    note:
      k === 4
        ? 'Живые коровы с четырьмя и более отёлами в книге'
        : `Живые коровы с ${k} отёлами в книге`,
    detailLabel: 'Отёлов · последний',
    body: `
      from animals a
     where a.owner_id = $1
       and ${notArchived()}
       and ${liveFemale()}
       and least(${CALVINGS}, 4) = $2`,
    detail: `
      ${CALVINGS}::text
      || coalesce(' · ' || to_char(${lastCalvingDate()}, 'DD.MM.YYYY'), '')`,
    order: `${CALVINGS} desc, a.ident_number`,
    params: [k],
  }
}

export async function herdDrilldown(
  payload: Payload,
  organizationId: number,
  code: string,
  limit = 200,
): Promise<HerdDrilldown | null> {
  const rule = RULES[code]
  if (!rule) return null

  const pool = poolOf(payload)
  if (!pool) return null

  const params = [organizationId, ...(rule.params ?? [])]

  /*
   * Счёт и выборка — двумя запросами по одному и тому же телу. Считать
   * длину выборки нельзя: она обрезана потолком, и «показано 200 из 200»
   * означало бы, что больше никого нет, когда их шестьсот.
   */
  const [count, rows] = await Promise.all([
    pool.query(`select count(*) as total ${rule.body}`, params),
    pool.query(
      `select a.id, a.ident_number, a.name,
              to_char(a.birth_date, 'YYYY-MM-DD') as birth_date,
              ${rule.detail} as detail
       ${rule.body}
       order by ${rule.order}
       limit ${Number(limit)}`,
      params,
    ),
  ])

  return {
    code,
    label: rule.label,
    note: rule.note,
    detailLabel: rule.detailLabel,
    total: Number(count.rows?.[0]?.total ?? 0),
    rows: ((rows.rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      identNumber: String(r.ident_number ?? ''),
      name: r.name ? String(r.name) : null,
      birthDate: r.birth_date ? String(r.birth_date) : null,
      detail: r.detail ? String(r.detail) : null,
    })),
  }
}
