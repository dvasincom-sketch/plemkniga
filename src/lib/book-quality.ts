import type { Payload } from 'payload'
import { checkSpecByCode } from '@/lib/checks-registry'
import { numOf, poolOf, type SqlPool } from '@/lib/sql'

/**
 * Качество книги — сводка по всей базе, а не по выборке.
 *
 * Те же вопросы, что задают автоматические проверки при разборе пакета,
 * но заданные разом обо всех трёхстах тысячах записей. Разница
 * принципиальная: там проверка помогает эксперту смотреть конкретный файл,
 * здесь — показывает, куда вообще смотреть.
 *
 * Всё считается SQL-агрегатами. Прогнать `checkAnimals` по всей книге —
 * это триста тысяч объектов в памяти и минуты ожидания; те же вопросы,
 * заданные базе, укладываются в секунды, потому что база для этого
 * и сделана. Проверки в `data-checks.ts` и запросы здесь намеренно
 * повторяют друг друга по смыслу и не пытаются использовать общий код:
 * одно работает над готовыми документами, другое — над таблицей,
 * и попытка свести их дала бы медленный вариант обоих.
 */

export type QualityRow = {
  key: string
  label: string
  /** Сколько записей затронуто */
  count: number
  /** Насколько это существенно */
  severity: 'fix' | 'note'
  /** Куда идти разбираться */
  hint?: string
}

export type BookQuality = {
  animals: number
  /** Части сводки, которые не удалось посчитать */
  missing: ('issues' | 'trust' | 'queues')[]
  trust: { level: number; label: string; count: number }[]
  issues: QualityRow[]
  queues: { label: string; count: number; late: number }[]
}

/**
 * Потолок времени на запрос.
 *
 * Сводка — не то, ради чего стоит держать страницу открытой минуту.
 * Если запрос не уложился, честнее показать остальное и сказать, что этой
 * части нет, чем заставлять человека смотреть на пустой экран и гадать,
 * загрузилось или повисло.
 */
const TIMEOUT_MS = 15_000

/**
 * Запрос с потолком по времени и без падения всей страницы.
 *
 * Каждый из трёх запросов сводки самостоятелен, и неудача одного не должна
 * отменять два других. Отдельная причина беречься: таблица `verification_requests`
 * молодая, и на базе, где миграции ещё не применены, её просто нет —
 * страница из-за этого падать не должна.
 */
async function safeQuery(
  pool: SqlPool,
  sql: string,
): Promise<Record<string, unknown>[] | null> {
  if (!pool.connect) {
    return await pool
      .query(sql)
      .then((r) => r.rows ?? [])
      .catch(() => null)
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`set local statement_timeout = ${TIMEOUT_MS}`)
    const res = await client.query(sql)
    return res.rows ?? []
  } catch {
    return null
  } finally {
    await client.query('rollback').catch(() => {})
    client.release()
  }
}

const TRUST_LABEL: Record<number, string> = {
  [-1]: 'Отклонено',
  0: 'Черновик',
  1: 'Проверено собственником',
  2: 'Подтверждено лабораторией',
  3: 'Верифицировано ассоциацией',
}

export async function bookQuality(payload: Payload): Promise<BookQuality | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  /*
   * Один запрос на все противоречия. Соединение с родителями идёт дважды —
   * по отцу и по матери, — и это те же два соединения, которые сделала бы
   * каждая отдельная проверка; собранные вместе, они читают таблицу один раз.
   */
  const [issues, trust, queues] = await Promise.all([
    safeQuery(
      pool,
      `
      select
        count(*)                                                       as animals,
        count(*) filter (where a.birth_date is null)                   as no_birth_date,
        count(*) filter (where a.breed_id is null)                     as no_breed,
        count(*) filter (
          where a.father_id is null and a.mother_id is null
            and coalesce(a.pedigree_text_father_id, '') = ''
            and coalesce(a.pedigree_text_mother_id, '') = ''
        )                                                              as no_parents,
        count(*) filter (where f.id is not null and f.sex <> 'male')   as father_wrong_sex,
        count(*) filter (where m.id is not null and m.sex <> 'female') as mother_wrong_sex,
        count(*) filter (
          where f.birth_date is not null and a.birth_date is not null
            and f.birth_date >= a.birth_date
        )                                                              as father_younger,
        count(*) filter (
          where m.birth_date is not null and a.birth_date is not null
            and m.birth_date >= a.birth_date
        )                                                              as mother_younger,
        count(*) filter (where a.id = a.father_id or a.id = a.mother_id) as self_parent,
        count(*) filter (
          where a.summary_milk_yield is not null
            and (a.summary_milk_yield < 500 or a.summary_milk_yield > 25000)
        )                                                              as milk_implausible,
        count(*) filter (
          where a.blood_percent is not null
            and (a.blood_percent < 0 or a.blood_percent > 100)
        )                                                              as blood_out_of_range,
        count(*) filter (where a.disposal_reason_id is not null and a.state = 'alive')
                                                                       as disposal_vs_state,
        count(*) filter (where a.inbreeding is not null and a.inbreeding > 25)
                                                                       as high_inbreeding,
        count(*) filter (where a.birth_date > now())                   as birth_in_future
      from animals a
      left join animals f on f.id = a.father_id
      left join animals m on m.id = a.mother_id
      where a.archived is not true
    `,
    ),
    safeQuery(
      pool,
      `
      select coalesce(trust_level, 0)::int as level, count(*) as total
        from animals
       where archived is not true
       group by 1
       order by 1
    `,
    ),
    safeQuery(
      pool,
      `
      select 'submissions' as kind,
             count(*)                                                        as total,
             count(*) filter (where submitted_at < now() - interval '7 days') as late
        from data_submissions
       where status in ('uploaded', 'checking')
      union all
      select 'verifications',
             count(*),
             count(*) filter (where requested_at < now() - interval '7 days')
        from verification_requests
       where status in ('new', 'checking')
      union all
      select 'membership',
             count(*),
             0
        from organizations
       where membership = 'pending'
    `,
    ),
  ])

  const r = issues?.[0] ?? {}

  const row = (
    key: string,
    label: string,
    value: unknown,
    severity: QualityRow['severity'],
    hint?: string,
  ): QualityRow => {
    /*
     * Название и существенность берутся из реестра проверок, а не отсюда.
     *
     * Коды здесь и там совпадали всегда, а тексты писались отдельно —
     * и уже разошлись: в сводке стояло «Удой вне правдоподобных границ
     * (500…25 000 кг)» с числами, вписанными руками. Пороги с тех пор
     * стали настраиваемыми, и эта строка начала врать в тот день, когда
     * Ассоциация впервые изменила границу: правило одно, а чисел два.
     *
     * Местный текст остаётся запасным — для четырёх кодов, которых
     * в реестре нет: сводка разделяет отца и мать (`father-younger`,
     * `mother-younger` и пара про пол), а реестр держит их одним правилом
     * на обоих родителей. Разница осмысленная: проверке всё равно, кто
     * из двоих, а Ассоциации при разборе книги — нет.
     */
    const spec = checkSpecByCode(key)
    return {
      key,
      label: spec?.label ?? label,
      count: numOf(value),
      severity: spec?.severity ?? severity,
      hint: spec?.why ?? hint,
    }
  }

  const rows: QualityRow[] = [
    row('self-parent', 'Животное записано собственным родителем', r.self_parent, 'fix'),
    row('father-younger', 'Отец родился позже потомка или в тот же день', r.father_younger, 'fix'),
    row('mother-younger', 'Мать родилась позже потомка или в тот же день', r.mother_younger, 'fix'),
    row('father-wrong-sex', 'Отцом записана самка', r.father_wrong_sex, 'fix'),
    row('mother-wrong-sex', 'Матерью записан самец', r.mother_wrong_sex, 'fix'),
    row('birth-in-future', 'Дата рождения в будущем', r.birth_in_future, 'fix'),
    row('no-birth-date', 'Нет даты рождения', r.no_birth_date, 'fix'),
    row(
      'milk-implausible',
      'Удой вне правдоподобных границ',
      r.milk_implausible,
      'fix',
    ),
    row('blood-out-of-range', 'Кровность вне диапазона 0…100 %', r.blood_out_of_range, 'fix'),
    row(
      'disposal-vs-state',
      'Указана причина выбытия, но животное числится в стаде',
      r.disposal_vs_state,
      'fix',
    ),
    row(
      'high-inbreeding',
      'Инбридинг выше 25 % — требуется подтверждение происхождения',
      r.high_inbreeding,
      'note',
    ),
    row('no-parents', 'Не указан ни один родитель — ни ссылкой, ни по документам', r.no_parents, 'note'),
    row('no-breed', 'Не указана порода', r.no_breed, 'note'),
  ].filter((x) => x.count > 0)

  const QUEUE_LABEL: Record<string, string> = {
    submissions: 'Пакеты, ждущие проверки',
    verifications: 'Заявки на верификацию',
    membership: 'Заявки на членство',
  }

  return {
    animals: numOf(r.animals),
    /** Какие части сводки не сошлись — о них честно сказано на странице */
    missing: [
      issues === null ? ('issues' as const) : null,
      trust === null ? ('trust' as const) : null,
      queues === null ? ('queues' as const) : null,
    ].filter((x): x is 'issues' | 'trust' | 'queues' => x !== null),
    trust: (trust ?? []).map((t) => ({
      level: numOf(t.level),
      label: TRUST_LABEL[numOf(t.level)] ?? String(t.level),
      count: numOf(t.total),
    })),
    issues: rows,
    queues: (queues ?? []).map((q) => ({
      label: QUEUE_LABEL[String(q.kind)] ?? String(q.kind),
      count: numOf(q.total),
      late: numOf(q.late),
    })),
  }
}
