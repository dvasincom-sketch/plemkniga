import type { Payload } from 'payload'
import {
  CHECKS,
  type CheckCode,
  type CheckSeverity,
  type CheckSpec,
} from '@/lib/checks-registry'

/**
 * Действующие настройки проверок: реестр плюс правки Ассоциации.
 *
 * ## Почему отдельный файл, а не функция в реестре
 *
 * Реестр читают и страницы, и разбор; он не должен знать про базу.
 * Здесь — единственное место, где настройки достаются, и единственное,
 * которое от базы зависит.
 *
 * ## Почему отсутствие таблицы — не ошибка
 *
 * Таблица `check_settings` молодая. На базе, где миграция ещё не применена,
 * запрос упадёт — и упасть должен запрос, а не разбор заявки: без настроек
 * проверки работают по реестру, то есть ровно так, как работали до их
 * появления. Молчаливое падение здесь безопаснее шумного: худшее, что
 * случится, — Ассоциация увидит умолчания вместо своих правок и поймёт
 * это по первой же настройке, которая не применилась.
 *
 * Обратный порядок — уронить разбор из-за ненайденной таблицы настроек —
 * означал бы, что необязательная возможность выключает обязательную.
 */

export type ResolvedCheck = CheckSpec & {
  enabled: boolean
  /** Существенность с учётом правки Ассоциации. */
  severity: CheckSeverity
  /** Отличается ли действующее значение от заложенного в реестре. */
  overridden: boolean
  /** Чем Ассоциация объяснила правку. */
  note?: string
}

export type CheckSettingsMap = Map<CheckCode, ResolvedCheck>

/** Реестр как есть — когда настройки недоступны или не нужны. */
export const defaultCheckSettings = (): CheckSettingsMap =>
  new Map(
    CHECKS.map((c) => [
      c.code as CheckCode,
      { ...c, enabled: true, severity: c.severity, overridden: false },
    ]),
  )

export async function resolveCheckSettings(payload: Payload): Promise<CheckSettingsMap> {
  const map = defaultCheckSettings()

  const rows = await payload
    .find({
      collection: 'check-settings',
      limit: CHECKS.length,
      depth: 0,
      overrideAccess: true,
    })
    .then((r) => r.docs)
    .catch(() => null)

  if (!rows) return map

  for (const row of rows) {
    const code = String(row.code) as CheckCode
    const base = map.get(code)
    // Настройка проверки, которой больше нет в реестре: правило удалили,
    // строка осталась. Применять её не к чему, и это не ошибка.
    if (!base) continue

    const enabled = row.enabled !== false
    const severity = (row.severity as CheckSeverity | null) ?? base.severity

    map.set(code, {
      ...base,
      enabled,
      severity,
      overridden: !enabled || severity !== base.severity,
      note: (row.note as string | null) ?? undefined,
    })
  }

  return map
}

/** Настройки, отличающиеся от реестра, — для показа в каталоге. */
export const overriddenChecks = (map: CheckSettingsMap): ResolvedCheck[] =>
  [...map.values()].filter((c) => c.overridden)
