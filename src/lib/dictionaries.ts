/**
 * Справочники предметной области.
 * Единый источник правды для Payload-коллекций и для фронтенда.
 */

export const ROLES = [
  { value: 'farmer', label: 'Фермер/Заводчик', hint: 'для владельцев животных' },
  { value: 'service', label: 'Сервисная организация', hint: 'поставщики услуг' },
  { value: 'individual', label: 'Физическое лицо', hint: '' },
  { value: 'admin', label: 'Администратор', hint: 'сотрудник Ассоциации' },
] as const

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

export const EVENT_TYPES = [
  { value: 'calving', label: 'Отёл' },
  { value: 'insemination', label: 'Осеменение' },
  { value: 'dryOff', label: 'Запуск' },
  { value: 'milkTest', label: 'Контрольная дойка' },
  { value: 'exteriorScore', label: 'Оценка экстерьера' },
  { value: 'vetTreatment', label: 'Ветеринарная обработка' },
  { value: 'move', label: 'Перемещение' },
  { value: 'disposal', label: 'Выбытие' },
] as const

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
