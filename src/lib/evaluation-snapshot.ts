import type { Payload, PayloadRequest } from 'payload'
import type { AnimalEvaluation, AnimalExterior } from '@/payload-types'
import { EXTERIOR_COMPOSITES, EXTERIOR_TRAITS, HEALTH_TRAITS, PRODUCTION_TRAITS } from '@/lib/dictionaries'

/**
 * Снимок действующей оценки в карточке животного.
 *
 * История живёт в `animal-evaluations` и `animal-exteriors`, а `animals`
 * держит копию последней записи. Копия нужна ради чтения: оценку показывает
 * карточка, таблица книги, сертификат и расчёт индекса — то есть почти
 * каждая страница системы. Тянуть ради этого «самую свежую строку истории»
 * джойном на трёхстах тысячах животных дороже, чем хранить готовое.
 *
 * Правило одностороннее и нарушать его нельзя: **главная — строка истории**,
 * снимок только пишется. Ни один код не должен читать `animals.ipc`
 * и на основании этого что-то записывать обратно в историю — иначе через
 * год станет невозможно сказать, какая из копий правда.
 *
 * Снимок обновляется хуком после записи оценки. Если история и снимок
 * разошлись (ручной UPDATE, сбой посреди переноса), их приводит в согласие
 * `npm run backfill:evaluations -- --resync` — он перечитывает действующие
 * строки истории и переписывает карточки заново.
 */

/** Плоские поля карточки, собранные из строки истории оценок. */
export const snapshotOfEvaluation = (e: AnimalEvaluation) => {
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  const rec = e as unknown as Record<string, unknown>

  return {
    ipc: num(e.ipc),
    ipcDetails: {
      forecast: num(e.ipc),
      r: num(e.ipcR),
      percentile: num(e.ipcPercentile),
    },
    evaluationDate: e.evaluatedAt ?? null,
    production: {
      reliabilityLevel: num(e.productionReliabilityLevel),
      ...Object.fromEntries(
        PRODUCTION_TRAITS.map((t) => [
          t.key,
          { forecast: num(rec[`${t.key}Forecast`]), r: num(rec[`${t.key}R`]) },
        ]),
      ),
    },
    reproduction: {
      fertility: { forecast: num(e.fertilityForecast), r: num(e.fertilityR) },
    },
    health: {
      reliabilityLevel: num(e.healthReliabilityLevel),
      ...Object.fromEntries(
        HEALTH_TRAITS.map((t) => [
          t.key,
          { forecast: num(rec[`${t.key}Forecast`]), r: num(rec[`${t.key}R`]) },
        ]),
      ),
    },
  }
}

/** Плоские поля карточки, собранные из строки истории экстерьера. */
export const snapshotOfExterior = (x: AnimalExterior) => {
  const rec = x as unknown as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' ? v : null)

  return {
    exterior: Object.fromEntries(
      [...EXTERIOR_TRAITS, ...EXTERIOR_COMPOSITES].map((t) => [t.key, num(rec[t.key])]),
    ),
  }
}

type Writer = { payload: Payload; req?: PayloadRequest }

/**
 * Перенести действующую оценку в карточку.
 *
 * Пишется через Payload с передачей `req`: хук работает внутри транзакции
 * записи оценки, и обновление животного должно попасть в неё же. Отдельное
 * подключение здесь однажды уже давало не ошибку, а зависание до таймаута
 * (решение №20 в `docs/reshenya.md`).
 */
export const applyEvaluationSnapshot = async (
  { payload, req }: Writer,
  animalId: number,
  evaluation: AnimalEvaluation,
) => {
  await payload.update({
    collection: 'animals',
    id: animalId,
    data: snapshotOfEvaluation(evaluation) as never,
    overrideAccess: true,
    req,
    // Снимок — следствие записи в истории, а не правка карточки
    context: { skipJournal: true },
  })
}

export const applyExteriorSnapshot = async (
  { payload, req }: Writer,
  animalId: number,
  exterior: AnimalExterior,
) => {
  await payload.update({
    collection: 'animals',
    id: animalId,
    data: snapshotOfExterior(exterior) as never,
    overrideAccess: true,
    req,
    // Снимок — следствие записи в истории, а не правка карточки
    context: { skipJournal: true },
  })
}

export const idOf = (v: unknown): number | null =>
  typeof v === 'number' ? v : typeof v === 'object' && v && 'id' in v ? ((v as { id: number }).id ?? null) : null
