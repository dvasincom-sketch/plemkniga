import { randomUUID } from 'node:crypto'

/**
 * Ошибки в том виде, в каком их описывает стандарт.
 *
 * ## Почему не тот вид, что был
 *
 * Отказы отдавались как `icarResponseMessageResource` — ресурс,
 * существующий в ADE для другого: это сообщение **о результате обработки
 * элемента** внутри пакета, а не ответ на негодный запрос. Различие
 * не педантское: клиент, написанный по стандарту, разбирает тело отказа
 * как `{ errors: [...] }`, не находит `errors` и падает разбором —
 * то есть узнаёт об отказе худшим из способов.
 *
 * ## Почему массив, а не одна ошибка
 *
 * Так задано, и задано верно. При приёме пакета из ста записей негодными
 * бывают три, и вернуть первую значило бы заставить клиента чинить
 * их по одной, гоняя сеть трижды. Массив позволяет назвать все разом.
 *
 * ## Про `id`
 *
 * Стандарт хочет уникальный идентификатор события, «чтобы найти его
 * в журналах». Мы выдаём его и клиенту, и в журнал: без общего
 * идентификатора разговор о сбое сводится к пересказу времени
 * и примерного текста, а на боевом сервере таких минут десятки.
 */

export type AdeError = {
  /** Уникальный идентификатор случая — по нему ищут в журнале. */
  id: string
  /** Код HTTP именно этой ошибки: в пакете они бывают разные. */
  status: number
  /** Машинный код: по нему клиент разбирает случай без чтения текста. */
  code: string
  title: string
  detail?: string
  meta?: Record<string, unknown>
}

export type AdeErrorBody = { errors: AdeError[] }

/**
 * Коды намеренно свои и намеренно устойчивые.
 *
 * Стандарт не задаёт словаря кодов — он говорит лишь, что код нужен
 * для машинного сопоставления. Значит, менять их нельзя: клиент,
 * научившийся отличать `animal-not-found` от `location-forbidden`,
 * сломается от переименования тише, чем от исчезновения поля.
 */
export const ADE_CODE = {
  unauthorized: 'unauthorized',
  locationForbidden: 'location-forbidden',
  collectionUnknown: 'collection-unknown',
  methodNotAllowed: 'method-not-allowed',
  bodyNotJson: 'body-not-json',
  bodyShape: 'body-shape',
  fieldMissing: 'field-missing',
  fieldValue: 'field-value',
  animalNotFound: 'animal-not-found',
  animalForeign: 'animal-foreign',
  conflict: 'conflict',
} as const

export type AdeCode = (typeof ADE_CODE)[keyof typeof ADE_CODE]

export const adeError = (
  status: number,
  code: AdeCode,
  title: string,
  detail?: string,
  meta?: Record<string, unknown>,
): AdeError => ({
  id: randomUUID(),
  status,
  code,
  title,
  ...(detail ? { detail } : {}),
  ...(meta ? { meta } : {}),
})

export const adeErrors = (...errors: AdeError[]): AdeErrorBody => ({ errors })
