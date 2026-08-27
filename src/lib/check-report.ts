import type { Payload } from 'payload'
import type { ProbeResult } from '@/lib/probes'

/**
 * Чтение прогонов для страницы «Статус».
 *
 * ## Главное правило: устаревший результат — не зелёный
 *
 * Доска, показывающая «всё сошлось» по прогону трёхнедельной давности,
 * хуже отсутствующей. Она отвечает на вопрос «как было», притворяясь
 * ответом на вопрос «как сейчас», и человек перестаёт проверять сам.
 *
 * Поэтому возраст здесь — не подпись мелким шрифтом, а часть исхода:
 * после {@link FRESH_HOURS} часов результат становится «неизвестно»
 * независимо от того, что в нём записано. Зелёное должно означать
 * «проверено недавно и сошлось», и ничего другого.
 */

/**
 * Сколько часов результат считается свежим.
 *
 * Тридцать шесть — ночной прогон плюс запас в половину суток: пропуск
 * одной ночи не должен красить доску в «неизвестно», пропуск двух —
 * должен. Час-два запаса не хватило бы: действие может задержаться,
 * и доска мигала бы серым каждое утро, приучая не обращать внимания.
 */
export const FRESH_HOURS = 36

export type RunOutcome = 'ok' | 'failed' | 'stale' | 'never'

export type CheckRunView = {
  label: string
  ranAt: string
  version: string | null
  ok: boolean
  failed: number
  total: number
  ms: number
  results: ProbeResult[]
  /** Часов прошло с прогона. */
  ageHours: number
  /** Исход с учётом возраста: свежий и сошлось — только `ok`. */
  outcome: Exclude<RunOutcome, 'never'>
}

export async function loadCheckRuns(payload: Payload): Promise<CheckRunView[]> {
  const res = await payload
    .find({
      collection: 'check-runs',
      limit: 20,
      depth: 0,
      sort: 'label',
      overrideAccess: true,
    })
    /*
     * Отказ запроса не роняет страницу: она про состояние системы,
     * и «не смог прочитать прогоны» — тоже состояние. Пустой список
     * покажется как «прогонов не было», и это ближе к правде, чем
     * страница с ошибкой.
     */
    .catch((e) => {
      console.error('[checks] прогоны не прочитаны:', e instanceof Error ? e.message : e)
      return { docs: [] as Record<string, unknown>[] }
    })

  const now = Date.now()

  return (res.docs as Record<string, unknown>[]).map((d) => {
    const ranAt = String(d.ranAt ?? '')
    const ageHours = ranAt ? (now - new Date(ranAt).getTime()) / 3_600_000 : Number.POSITIVE_INFINITY
    const ok = Boolean(d.ok)

    return {
      label: String(d.label ?? '—'),
      ranAt,
      version: d.version ? String(d.version) : null,
      ok,
      failed: Number(d.failed ?? 0),
      total: Number(d.total ?? 0),
      ms: Number(d.ms ?? 0),
      results: ((d.results ?? []) as ProbeResult[]) ?? [],
      ageHours,
      /*
       * Находки важнее возраста: старый прогон, нашедший расхождение,
       * остаётся красным. Расхождение не рассасывается само, и красить
       * его в «неизвестно» значило бы прятать известную беду за
       * незнанием.
       */
      outcome: !ok ? 'failed' : ageHours > FRESH_HOURS ? 'stale' : 'ok',
    }
  })
}
