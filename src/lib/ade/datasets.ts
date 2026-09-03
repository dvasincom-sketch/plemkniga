import { createHmac, timingSafeEqual } from 'node:crypto'
import { ADE_COLLECTIONS, isAdeCollection, type AdeCollectionName } from '@/lib/ade/core'

/**
 * Наборы данных и метка продолжения — обмен без знания о хозяйствах.
 *
 * ## Что это за половина стандарта
 *
 * У ADE два способа обмена, и они не заменяют друг друга. Выборка
 * по локациям отвечает на вопрос «покажи, что есть у этого хозяйства»:
 * клиент обязан знать список хозяйств и обходить их сам. Обмен наборами
 * отвечает на другой — «что изменилось с прошлого раза», и хозяйств
 * клиенту знать не нужно вовсе: сервер сам отдаёт то, к чему у клиента
 * есть доступ.
 *
 * Ради второго и строят постоянную связь. Партнёру, который ведёт свою
 * копию книги, обход хозяйств означает ежедневную полную выгрузку —
 * иначе он не узнает, что вчерашняя запись сегодня исправлена.
 *
 * ## Почему наборы — это наши же разделы, а не «всё сразу»
 *
 * Спецификация допускает набор `everything`, и соблазн его завести
 * велик: одна лента, один токен, клиент забирает всё. Мы этого
 * не делаем, и причина честная — общей ленты у нас нет.
 *
 * Единый поток по одиннадцати таблицам требует общего журнала изменений:
 * без него порядок между таблицами не определён, а метке продолжения
 * пришлось бы нести одиннадцать позиций сразу и обещать то, чего база
 * не гарантирует. Обещание «всё в одном потоке», которое на деле
 * склеено из одиннадцати, хуже честного отсутствия набора: клиент
 * заметит расхождение через месяц и не поймёт, где потерял запись.
 *
 * ## Что лежит в метке продолжения
 *
 * Позиция в ленте: время последней отданной правки и номер записи
 * при равном времени. Второе не мелочь — правки, сделанные в одну
 * секунду, без номера либо потерялись бы, либо повторялись вечно.
 *
 * Меток две, по одной на поток: живые записи и надгробия удалённых
 * лежат в разных таблицах, и общий номер для них не имеет смысла.
 *
 * ## Почему метка подписана
 *
 * Стандарт говорит, что менять содержимое метки клиенту нельзя,
 * а поведение сервера при изменённой метке не определено. «Не определено»
 * на стороне сервера означает «как получится» — а получиться может
 * чтение чужих данных, потому что внутри метки лежит условие выборки.
 *
 * Поэтому метка подписана ключом приложения и подделанная отвергается,
 * а не выполняется. Это ужесточение стандарта, но ужесточение в ту
 * сторону, в которую стандарт и так просит.
 */

/** Ресурсы стандарта, отдаваемые каждым набором. */
export const DATASET_TYPES: Record<AdeCollectionName, string> = {
  animals: 'icarAnimalCoreResource',
  'test-day-results': 'icarTestDayResultEventResource',
  parturitions: 'icarReproParturitionEventResource',
  inseminations: 'icarReproInseminationEventResource',
  'type-classifications': 'icarTypeClassificationEventResource',
  weights: 'icarWeightEventResource',
  'breeding-values': 'icarBreedingValueResource',
  'pregnancy-checks': 'icarReproPregnancyCheckEventResource',
  arrivals: 'icarMovementArrivalEventResource',
  departures: 'icarMovementDepartureEventResource',
  deaths: 'icarMovementDeathEventResource',
}

export const ADE_BASE = '/ade/v1'

export type AdeDataset = {
  name: string
  url: string
  changes: string
  containedTypes: string[]
}

/**
 * Описание набора — ровно теми полями, что объявлены в спецификации.
 *
 * Адреса относительные, как в примерах стандарта: клиент пришёл
 * по какому-то домену и достраивает их сам. Абсолютный адрес пришлось бы
 * собирать из заголовка `Host`, которому нельзя верить, — а ошибка
 * здесь увела бы клиента на чужой сервер за нашими же данными.
 */
export const datasetOf = (name: AdeCollectionName): AdeDataset => ({
  name,
  url: `${ADE_BASE}/datasets/${name}`,
  changes: `${ADE_BASE}/datasets/${name}/changes`,
  containedTypes: [DATASET_TYPES[name]],
})

export const ADE_DATASETS: AdeDataset[] = ADE_COLLECTIONS.map(datasetOf)

export const isDataset = (name: string): name is AdeCollectionName => isAdeCollection(name)

/* ------------------------------------------------------------------ *
 *  Метка продолжения                                                 *
 * ------------------------------------------------------------------ */

/**
 * Версия устройства метки.
 *
 * Меняется, когда меняется смысл полей. Клиент с меткой прежней версии
 * не получает отказ — он получает заголовок `icar-full-sync: true`
 * и начинает сначала. Отказ на этом месте оставил бы партнёра
 * без обмена до вмешательства человека, а полная пересинхронизация —
 * дорогая, но самостоятельная.
 */
export const TOKEN_VERSION = 2

export type Cursor = { t: string; i: number }

export type AdeToken = {
  v: number
  d: string
  /** Позиция в потоке живых записей. */
  r: Cursor
  /** Позиция в потоке надгробий. */
  x: Cursor
}

/** Начало ленты: раньше любой правки и любого удаления. */
export const TOKEN_START: Cursor = { t: '1970-01-01T00:00:00.000Z', i: 0 }

const KEY = () => process.env.PAYLOAD_SECRET || 'dev-secret-change-me'

const b64url = (b: Buffer) => b.toString('base64url')

const sign = (body: string) => b64url(createHmac('sha256', KEY()).update(body).digest())

/**
 * Метка наружу — одна строка base64, как требует стандарт.
 *
 * Подпись лежит внутри той же строки, а не рядом через точку: «opaque
 * string encoded with base64» читается буквально, и клиент, который
 * решит проверить, что метка — правильный base64, не должен спотыкаться
 * о наше устройство.
 */
export const encodeToken = (t: AdeToken): string => {
  const body = JSON.stringify(t)
  return b64url(Buffer.from(JSON.stringify({ p: body, s: sign(body) }), 'utf8'))
}

export type TokenRead =
  | { ok: true; token: AdeToken }
  | { ok: false; reason: 'malformed' | 'forged' | 'version' | 'dataset' }

/**
 * Метка внутрь — с разбором трёх разных бед.
 *
 * Они требуют разного ответа, и слить их в одну значило бы либо
 * отказывать там, где надо пересинхронизировать, либо наоборот.
 * `malformed` — не наша метка вовсе; `forged` — наша по виду, но
 * с тронутым содержимым; `version` — наша прежняя; `dataset` — метка
 * от другого набора, что почти всегда ошибка клиента, склеившего ленты.
 */
export const decodeToken = (raw: string, dataset: string): TokenRead => {
  let outer: { p?: unknown; s?: unknown }

  try {
    outer = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof outer?.p !== 'string' || typeof outer?.s !== 'string') {
    return { ok: false, reason: 'malformed' }
  }

  const want = Buffer.from(sign(outer.p))
  const got = Buffer.from(outer.s)

  /*
   * Сравнение постоянного времени. Обычное `===` на подписи утекает
   * посимвольно: по времени ответа можно подобрать подпись байт
   * за байтом. Дорого и медленно, но это ровно тот случай, когда
   * «никто так не станет» — не довод.
   */
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return { ok: false, reason: 'forged' }
  }

  let token: AdeToken
  try {
    token = JSON.parse(outer.p) as AdeToken
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (token.v !== TOKEN_VERSION) return { ok: false, reason: 'version' }
  if (token.d !== dataset) return { ok: false, reason: 'dataset' }

  const fine = (c: Cursor | undefined) =>
    Boolean(c) && typeof c!.t === 'string' && Number.isFinite(c!.i)

  if (!fine(token.r) || !fine(token.x)) return { ok: false, reason: 'malformed' }

  return { ok: true, token }
}

/** Метка начала ленты для набора. */
export const startToken = (dataset: string): AdeToken => ({
  v: TOKEN_VERSION,
  d: dataset,
  r: { ...TOKEN_START },
  x: { ...TOKEN_START },
})

/* ------------------------------------------------------------------ *
 *  Форма ответа ленты                                                *
 * ------------------------------------------------------------------ */

/**
 * Первый объект ленты — место под будущее.
 *
 * Спецификация оставляет его для JSON-LD и графовых моделей и сегодня
 * не наполняет ничем. Отдаём его всё равно: клиент по стандарту
 * пропускает первый элемент не глядя, и лента без него сдвинулась бы
 * на один ресурс — первый пропал бы у всех сразу.
 */
export const FEED_CONTEXT = {
  id: '@context',
  description: 'application specific / expansion point for rdf, JSON-LD and Entity Graph Data Model',
}

export const feedContinuation = (token: string) => ({ id: '@continuation', token })

/** Сколько правок отдаём за один раз. */
export const FEED_PAGE_DEFAULT = 100
export const FEED_PAGE_MAX = 500
