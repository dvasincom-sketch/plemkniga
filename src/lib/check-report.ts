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

export type CheckRuns = {
  runs: CheckRunView[]
  /**
   * Почему прогонов нет — если дело не в том, что их не запускали.
   *
   * Пустой список и недоступное хранилище выглядят одинаково, а значат
   * разное: «ещё не проверяли» против «проверяли, но прочитать не могу».
   * Второе — не то же самое, что первое, и подсовывать вместо него
   * «прогонов ещё не было» значит соврать ровно на той странице,
   * которая заведена ради честности.
   */
  error: string | null
}

export async function loadCheckRuns(payload: Payload): Promise<CheckRuns> {
  let docs: Record<string, unknown>[] = []
  let error: string | null = null

  /*
   * Отказ запроса не роняет страницу: она про состояние системы,
   * и «не смог прочитать прогоны» — тоже состояние, которое надо
   * показать, а не спрятать.
   */
  try {
    const res = await payload.find({
      collection: 'check-runs',
      limit: 20,
      depth: 0,
      sort: 'label',
      overrideAccess: true,
    })
    /*
     * Через `unknown`: у сгенерированного типа записи нет строкового
     * индекса, и прямое приведение к «мешку полей» типизация не пускает.
     * Мешок здесь нужен потому, что снимок результатов лежит json —
     * его форму знает не схема, а `probes.ts`.
     */
    docs = res.docs as unknown as Record<string, unknown>[]
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    /*
     * Самый частый случай — коллекция ещё не подхвачена: код выложен,
     * а сервер работает со старой сборкой конфигурации, либо таблицы
     * нет вовсе. Сообщение Payload про «slug can't be found» человеку
     * ничего не говорит; здесь оно переводится в то, что надо сделать.
     */
    error = /can'?t be found/i.test(raw)
      ? 'Хранилище прогонов ещё не подхвачено: перезапустите сервер, а на проде — ' +
        'дождитесь применения миграции при старте контейнера.'
      : `Прогоны не прочитались: ${raw}`
    console.error('[checks] прогоны не прочитаны:', raw)
  }

  const now = Date.now()

  const runs: CheckRunView[] = docs.map((d) => {
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

  return { runs, error }
}
