/**
 * Справочники предметной области.
 * Единый источник правды для Payload-коллекций и для фронтенда.
 */

export const ROLES = [
  { value: 'farmer', label: 'Фермер/Заводчик', hint: 'для владельцев животных' },
  { value: 'service', label: 'Сервисная организация', hint: 'поставщики услуг' },
  { value: 'individual', label: 'Физическое лицо', hint: '' },
  /*
   * Эксперт — сотрудник Ассоциации, который проверяет чужие данные.
   *
   * Отдельно от администратора, потому что это разные работы с разной ценой
   * ошибки. Эксперт видит закрытые карточки и пакеты любого хозяйства,
   * ставит статус проверки, подтверждает членство и выпускает документы —
   * но не правит чужие данные и не имеет доступа к админке. Проверяющий,
   * который может молча поправить проверяемое, обесценивает проверку.
   *
   * Разбор — docs/kabinet-associacii.md, раздел 3.
   */
  { value: 'expert', label: 'Эксперт Ассоциации', hint: 'проверяет данные хозяйств' },
  { value: 'admin', label: 'Администратор', hint: 'технический администратор системы' },
] as const

/** Роли, которые работают в кабинете Ассоциации. */
export const ASSOCIATION_ROLES = ['expert', 'admin'] as const

export const ID_FORMATS = [
  { value: 'rf', label: 'РФ (15 знаков)' },
  { value: 'icar', label: 'ICAR / ISO-11784' },
  { value: 'usa', label: 'USA (HOUSA)' },
  { value: 'can', label: 'CAN (HOCAN)' },
  { value: 'deu', label: 'DEU (HODEU)' },
  { value: 'internal', label: 'Внутрихозяйственный' },
] as const

export const SEXES = [
  { value: 'female', label: 'Ж', full: 'Женский' },
  { value: 'male', label: 'М', full: 'Мужской' },
] as const

export const STATES = [
  { value: 'alive', label: 'Ж', full: 'В стаде' },
  { value: 'sold', label: 'В', full: 'Выбыло (продажа)' },
  { value: 'culled', label: 'Б', full: 'Выбраковано' },
  { value: 'dead', label: 'П', full: 'Пало' },
] as const

export const AGE_GROUPS = [
  { value: 'calf', label: 'Телёнок', short: 'Телёнок' },
  { value: 'heifer', label: 'Тёлка', short: 'Тёлка' },
  { value: 'firstCalf', label: 'Первотёлка', short: 'Первот…' },
  { value: 'cow2', label: 'Корова 2 лакт.', short: '2 лакт.' },
  { value: 'cow3', label: 'Корова 3+ лакт.', short: '3+ лакт.' },
  { value: 'bull', label: 'Бык-производитель', short: 'Бык' },
] as const

export const ANIMAL_KINDS = [
  { value: 'cow', label: 'Корова' },
  { value: 'bull', label: 'Бык' },
  { value: 'heifer', label: 'Тёлка' },
  { value: 'calf', label: 'Телёнок' },
] as const

export const RELATIONS = [
  { value: 'any', label: 'Любая' },
  { value: 'father', label: 'Отец известен' },
  { value: 'mother', label: 'Мать известна' },
  { value: 'bothParents', label: 'Оба родителя известны' },
  { value: 'hasOffspring', label: 'Есть потомство' },
] as const

/** 17 линейных признаков экстерьера + 3 композита (шкала −2…+2) */
export const EXTERIOR_TRAITS = [
  { key: 'height', label: 'Рост' },
  { key: 'chestWidth', label: 'Ширина груди' },
  { key: 'bodyDepth', label: 'Глубина туловища' },
  { key: 'bodyType', label: 'Тип телосложения' },
  { key: 'rumpAngle', label: 'Положение таза' },
  { key: 'rumpWidth', label: 'Ширина таза' },
  { key: 'rearLegsRear', label: 'Постановка задних ног (вид сзади)' },
  { key: 'rearLegsSide', label: 'Постановка задних ног (вид сбоку)' },
  { key: 'hoofAngle', label: 'Угол копыта' },
  { key: 'frontLegs', label: 'Ориентация передних ног' },
  { key: 'movement', label: 'Гармоничность движения' },
  { key: 'foreUdder', label: 'Прикрепление передних долей вымени' },
  { key: 'frontTeatPlacement', label: 'Расположение передних сосков' },
  { key: 'teatLength', label: 'Длина сосков' },
  { key: 'udderDepth', label: 'Глубина вымени' },
  { key: 'rearUdder', label: 'Прикрепление задних долей вымени' },
  { key: 'centralLigament', label: 'Центральная связка' },
  { key: 'rearTeatPlacement', label: 'Расположение задних сосков' },
] as const

export const EXTERIOR_COMPOSITES = [
  { key: 'bodyComposite', label: 'Композит тела' },
  { key: 'udderComposite', label: 'Композит вымени' },
  { key: 'legsComposite', label: 'Композит ног' },
] as const

/** Продуктивные признаки племенной оценки */
export const PRODUCTION_TRAITS = [
  { key: 'milk', label: 'Удой', unit: 'кг' },
  { key: 'fatPercent', label: 'Жир', unit: '%' },
  { key: 'proteinPercent', label: 'Белок', unit: '%' },
  { key: 'fatKg', label: 'Жир', unit: 'кг' },
  { key: 'proteinKg', label: 'Белок', unit: 'кг' },
  { key: 'productionIndex', label: 'ПИ-Продуктивный индекс*', unit: '' },
] as const

export const HEALTH_TRAITS = [
  { key: 'productiveLongevity', label: 'Продуктивное долголетие', unit: '' },
  { key: 'udderHealth', label: 'Здоровье вымени', unit: 'балл' },
  { key: 'calfMortality', label: 'Смертность приплода', unit: '%' },
  { key: 'calvingEase', label: 'Лёгкость отёла', unit: 'балл' },
] as const

/** Уровни достоверности данных (ТЗ, Таблица №4, поле NTRUTH). */
export const TRUST_LEVELS = [
  { value: '-1', label: 'Отклонено', hint: 'Ошибки или противоречия, в аналитике не учитывается' },
  { value: '0', label: 'Черновик', hint: 'Внесено собственником, не проверено' },
  { value: '1', label: 'Проверено собственником', hint: 'Требует внешней верификации' },
  { value: '2', label: 'Подтверждено лабораторией', hint: 'Проверены ДНК и продуктивность' },
  { value: '3', label: 'Верифицировано ассоциацией', hint: 'Можно выпускать сертификат' },
] as const

export const trustLabel = (v?: number | null): string =>
  TRUST_LEVELS.find((t) => t.value === String(v ?? 0))?.label ?? '—'

/**
 * Типы записей ленты событий.
 *
 * `events` — журнал того, для чего нет своей таблицы. Отёл, осеменение,
 * контрольная дойка и ветеринарная обработка отсюда убраны: у каждого есть
 * собственная коллекция со своим набором полей, и запись о том же факте
 * в двух местах рано или поздно разойдётся — а какая из них правда,
 * будет неизвестно.
 *
 * Правило: **источник истины — специализированная таблица.** Лента карточки
 * собирается объединением на чтении (`src/components/AnimalHistory.tsx`),
 * поэтому в глазах пользователя всё осталось на месте.
 */
export const EVENT_TYPES = [
  { value: 'dryOff', label: 'Запуск' },
  { value: 'move', label: 'Перемещение' },
  { value: 'disposal', label: 'Выбытие' },
] as const

/**
 * Типы, выведенные из обращения.
 *
 * Новые записи с ними не создаются — это проверяет хук коллекции. Но из базы
 * они не убраны, и это осознанно: значения остались в enum, старые строки
 * читаются по-человечески, ничего не потеряно. Сузить enum значило бы решить
 * за хозяйство, что его запись об отёле в ленте — лишняя копия. Обычно так
 * и есть, но «обычно» — не основание стирать чужие данные миграцией.
 *
 * Сколько таких строк осталось, показывает `npm run db:precheck`. Когда
 * Ассоциация подтвердит, что все они дублируют специализированные таблицы,
 * их можно будет убрать отдельным скриптом, а enum сузить.
 *
 * `instead` — куда записывать вместо; попадает в текст ошибки.
 */
export const RETIRED_EVENT_TYPES = [
  /*
   * Оценка экстерьера переехала сюда позже прочих. В ленте она была
   * отметкой с датой и без единой цифры — это лучше, чем ничего, пока
   * цифры хранить негде. Теперь есть `animal_exteriors` с восемнадцатью
   * линейными признаками, композитами, бонитёром и номером лактации,
   * и отметка в ленте стала худшей из двух записей об одном факте.
   */
  { value: 'exteriorScore', label: 'Оценка экстерьера', instead: 'Экстерьер' },
  { value: 'calving', label: 'Отёл', instead: 'Отёлы' },
  { value: 'insemination', label: 'Осеменение', instead: 'Осеменения' },
  { value: 'milkTest', label: 'Контрольная дойка', instead: 'Контрольные дойки' },
  { value: 'vetTreatment', label: 'Ветеринарная обработка', instead: 'Здоровье' },
] as const

/** Подпись типа события с учётом выведенных из обращения. */
export const eventTypeLabel = (v?: string | null): string =>
  EVENT_TYPES.find((t) => t.value === v)?.label ??
  RETIRED_EVENT_TYPES.find((t) => t.value === v)?.label ??
  '—'

export const DOCUMENT_TYPES = [
  { value: 'pedigreeCertificate', label: 'Племенное свидетельство' },
  { value: 'genotypeReport', label: 'Отчёт о генотипировании' },
  { value: 'vetCertificate', label: 'Ветеринарная справка' },
  { value: 'saleContract', label: 'Договор купли-продажи' },
  { value: 'other', label: 'Прочее' },
] as const

export const REGIONS = [
  'Самарская область',
  'Московская область',
  'Ленинградская область',
  'Краснодарский край',
  'Красноярский край',
  'Республика Татарстан',
  'Свердловская область',
  'Воронежская область',
  'Кировская область',
  'Удмуртская Республика',
]

type Opt = { value: string; label: string }
export const toOptions = (arr: readonly { value: string; label: string }[]): Opt[] =>
  arr.map(({ value, label }) => ({ value, label }))

export const labelOf = (
  arr: readonly { value: string; label: string }[],
  value?: string | null,
): string => arr.find((o) => o.value === value)?.label ?? '—'

/** Подпись, когда животное ещё в стаде и причины выбытия нет. */
export const DISPOSAL_HINT = 'Животное в стаде'
