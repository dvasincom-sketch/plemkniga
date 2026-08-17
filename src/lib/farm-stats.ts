import type { Payload } from 'payload'

/**
 * Сводка по хозяйствам для кабинета Ассоциации.
 *
 * Считается одним запросом на весь список, а не двумя-тремя на каждую
 * строку. Разница не теоретическая: организаций сорок, счётчиков по три —
 * это сто двадцать запросов на открытие страницы, каждый из которых
 * пробегает таблицу животных в триста тысяч строк.
 *
 * Доля верифицированных записей — не отчётность, а рабочий признак:
 * по нему видно, с кем Ассоциация работает, а кто зарегистрировался
 * и пропал. Хозяйство с тысячей животных и нулём подтверждённых — это
 * не «плохое хозяйство», это разговор, который ещё не начинали.
 */

export type FarmStat = {
  organizationId: number
  animals: number
  verified: number
  published: number
  /** Когда пришёл последний пакет данных — признак живого хозяйства */
  lastSubmission: string | null
  /** Сколько пользователей ждут подтверждения */
  unconfirmedUsers: number
}

type SqlPool = {
  query: (q: string, p?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>
}

const poolOf = (payload: Payload): SqlPool | null =>
  (payload.db as unknown as { pool?: SqlPool }).pool ?? null

export async function farmStats(payload: Payload): Promise<Map<number, FarmStat>> {
  const out = new Map<number, FarmStat>()
  const pool = poolOf(payload)
  if (!pool) return out

  /*
   * Три подзапроса вместо трёх проходов: животные группируются один раз,
   * пакеты и пользователи — свои маленькие таблицы. `full outer join`
   * не нужен: организация без единого животного тоже должна попасть
   * в список, поэтому левое соединение идёт от самих организаций.
   */
  const res = await pool.query(`
    select
      o.id                                     as organization_id,
      coalesce(a.total, 0)::int                as animals,
      coalesce(a.verified, 0)::int             as verified,
      coalesce(a.published, 0)::int            as published,
      s.last_submission,
      coalesce(u.unconfirmed, 0)::int          as unconfirmed_users
    from organizations o
    left join (
      select owner_id,
             count(*)                                          as total,
             count(*) filter (where trust_level = 3)           as verified,
             count(*) filter (where public_visible)            as published
        from animals
       where archived is not true
       group by owner_id
    ) a on a.owner_id = o.id
    left join (
      select organization_id, max(submitted_at) as last_submission
        from data_submissions
       group by organization_id
    ) s on s.organization_id = o.id
    left join (
      select organization_id, count(*) filter (where confirmed is not true) as unconfirmed
        from users
       group by organization_id
    ) u on u.organization_id = o.id
  `)

  for (const r of res.rows ?? []) {
    const id = Number(r.organization_id)
    out.set(id, {
      organizationId: id,
      animals: Number(r.animals ?? 0),
      verified: Number(r.verified ?? 0),
      published: Number(r.published ?? 0),
      lastSubmission: r.last_submission ? new Date(String(r.last_submission)).toISOString() : null,
      unconfirmedUsers: Number(r.unconfirmed_users ?? 0),
    })
  }

  return out
}

/** Доля подтверждённых записей, в процентах; null — если записей нет. */
export const verifiedShare = (s?: FarmStat): number | null => {
  if (!s || !s.animals) return null
  return Math.round((s.verified / s.animals) * 100)
}
