import type { AdeCollectionName } from '@/lib/ade/core'

/**
 * Разбор строки запроса обмена — без базы и без Payload.
 *
 * ## Почему отдельным файлом
 *
 * Тот же довод, что у перечня коллекций, и та же однажды собранная
 * грабля. `serve.ts` ходит в базу и тянет за собой весь Payload;
 * всякий, кому нужен только разбор адреса — прогон, описание
 * интерфейса, страница обмена, — поднимал вместе с ним подключение
 * к базе. Дешёвая проверка становилась дорогой и переставала
 * запускаться.
 *
 * Здесь только превращение текста в условия. Применение условий
 * к данным живёт в `serve.ts`, где ему и место.
 */

/**
 * Сколько отдаём за раз.
 *
 * Двести — не «сколько влезет», а величина, при которой страница ответа
 * остаётся в разумных мегабайтах даже у животного с полной родословной
 * и двумя десятками альтернативных идентификаторов. Потолок жёсткий:
 * `pageSize=100000` в запросе не должен превращаться в выгрузку всей книги
 * одним ответом — для этого есть постраничный обход.
 */
export const ADE_PAGE_DEFAULT = 100
export const ADE_PAGE_MAX = 200

export type AdeQuery = {
  page: number
  pageSize: number
  /** `meta-modified-from`: отдать изменённое начиная с этого момента. */
  modifiedFrom?: string
  /** `meta-modified-to`: и до этого. Конец не включается. */
  modifiedTo?: string
  /** `date-from` и `date-to` по дате самого события. */
  dateFrom?: string
  dateTo?: string
  /** `animal-id` + `animal-scheme`: события одного животного. */
  animal?: { scheme: string; id: string }
  /** Имена фильтров, которых мы не знаем, — для честного ответа клиенту. */
  unknown: string[]
}

/**
 * Разбор фильтров выборки.
 *
 * ## Почему имена не наши
 *
 * Стандарт разрешает серверу не поддерживать фильтр, но если тот
 * поддержан — **обязывает называть его именем из стандарта**. Здесь
 * долго стоял `modifiedSince`, придуманный нами: фильтр работал,
 * и ни один клиент по стандарту им воспользоваться не мог, потому что
 * искал `meta-modified-from`. Своё имя у поддержанного фильтра —
 * такое же отклонение, как отсутствующий адрес, только незаметнее.
 *
 * Имена взяты не из пересказа спецификации, а из объявлений
 * `components/parameters` в самих схемах адресов ICAR
 * (`vendor/icar-ade/url-schemes/`).
 *
 * ## Границы диапазона
 *
 * `from` включается, `to` — нет. Так задано, и это удобно: сутки
 * задаются как `date-from=2026-04-01&date-to=2026-04-02` без возни
 * с последней миллисекундой, а соседние отрезки не перекрываются.
 *
 * ## Почему пара «идентификатор + схема» неразрывна
 *
 * Стандарт не советует присылать половину пары. Мы отказываем прямо:
 * `animal-id` без `animal-scheme` — это «найди по номеру, а в какой
 * системе, догадайся сам». Догадка здесь означает выбор между
 * племенным номером, учётным и номером радиометки, и ошибка вернёт
 * события чужого животного.
 *
 * ## Про незнакомые фильтры
 *
 * Стандарт разрешает их игнорировать и предупреждает клиента, что
 * данных может прийти больше, чем он просил. Мы игнорируем, но
 * собираем имена и называем их в заголовке ответа: молча отдать лишнее
 * — значит оставить интегратора гадать, работает фильтр или нет.
 */

const KNOWN_FILTERS = new Set([
  'page',
  'pageSize',
  'meta-modified-from',
  'meta-modified-to',
  'date-from',
  'date-to',
  'animal-id',
  'animal-scheme',
])

const asMoment = (v: string | null): string | undefined => {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export const parseAdeQuery = (url: URL): AdeQuery => {
  const q = url.searchParams

  const page = Math.max(1, Number.parseInt(q.get('page') ?? '1', 10) || 1)
  const raw = Number.parseInt(q.get('pageSize') ?? '', 10)
  const pageSize = Math.min(ADE_PAGE_MAX, raw > 0 ? raw : ADE_PAGE_DEFAULT)

  const animalId = q.get('animal-id')?.trim()
  const animalScheme = q.get('animal-scheme')?.trim()

  return {
    page,
    pageSize,
    modifiedFrom: asMoment(q.get('meta-modified-from')),
    modifiedTo: asMoment(q.get('meta-modified-to')),
    dateFrom: asMoment(q.get('date-from')),
    dateTo: asMoment(q.get('date-to')),
    animal: animalId && animalScheme ? { scheme: animalScheme, id: animalId } : undefined,
    unknown: [...q.keys()].filter((k) => !KNOWN_FILTERS.has(k)),
  }
}

/**
 * Половина пары «идентификатор + схема» — отказ, а не догадка.
 *
 * Вынесено отдельно от разбора: разбор не знает про ответы, а решение
 * «это ошибка клиента» принимает обработчик.
 */
export const halfAnimalPair = (url: URL): boolean => {
  const id = url.searchParams.get('animal-id')?.trim()
  const scheme = url.searchParams.get('animal-scheme')?.trim()
  return Boolean(id) !== Boolean(scheme)
}

/**
 * Поле даты события у каждой коллекции.
 *
 * У разных событий дата зовётся по-разному, и `date-from` обязан
 * ложиться на ту, которая у события настоящая: у оценки экстерьера это
 * дата оценки, у проверки стельности — дата теста, а не дата осеменения,
 * при котором она записана.
 *
 * Пустое значение означает «по дате не отбираем»: у животного нет даты
 * события вовсе, а у племенной ценности дата расчёта — свойство расчёта,
 * а не наблюдения.
 */
export const DATE_FIELD: Record<AdeCollectionName, string | null> = {
  animals: null,
  'breeding-values': null,
  'test-day-results': 'date',
  parturitions: 'date',
  inseminations: 'date',
  weights: 'date',
  'type-classifications': 'assessedAt',
  'pregnancy-checks': 'pregnancyCheckDate',
  arrivals: 'date',
  departures: 'date',
  deaths: 'date',
}

