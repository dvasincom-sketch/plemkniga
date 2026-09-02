/**
 * ICAR Animal Data Exchange — основа: схемы, перечисления, общие типы.
 *
 * ## Что это и зачем книге
 *
 * ADE — открытая спецификация обмена данными о животных, которую ведёт
 * рабочая группа ICAR. Лицензия Apache 2.0, схемы лежат на GitHub
 * (`adewg/ICAR`), формального соответствия не существует вовсе: никто
 * не выдаёт знака, никто не проверяет. Это язык, а не сертификат.
 *
 * Тем и ценен. Из всего, чем можно подтвердить международную состоятельность
 * книги, ADE — единственное, что не требует ни членства, ни взноса,
 * ни разрешения, ни санкционной проверки. Соответствие проверяется третьей
 * стороной по нашему же ответу: взял схему, взял наш JSON, сверил.
 *
 * ## Почему не под `/api`
 *
 * Адрес `/api/*` целиком занят Payload: там его собственный REST по всем
 * коллекциям, и обработчик стоит на `[...slug]`. Поставить ADE внутрь
 * значило бы соревноваться с ним за пути и однажды проиграть — Payload
 * добавит коллекцию с именем `locations`, и наш обмен молча перестанет
 * отвечать. Поэтому `/ade/v1/…`, отдельным деревом.
 *
 * Версия в адресе — не суеверие: у ADE есть мажорные релизы с ломающими
 * изменениями, и когда выйдет 2.0 (в ней обещают сделать `meta`
 * обязательным), старые потребители должны продолжать получать своё.
 *
 * ## Где смотреть
 *
 * Полная выжимка спецификации с таблицами полей — `docs/ade-spec.md`.
 * Отображение наших записей в ресурсы — `src/lib/ade/resources.ts`.
 */

/* ------------------------------------------------------------------ *
 *  Схемы идентификаторов                                             *
 * ------------------------------------------------------------------ */

/**
 * Схемы именуются обратной доменной нотацией, и в имени не должно быть
 * двоеточий и косых черт: схема попадает в адрес запроса, и её должно
 * быть видно даже в URL-кодированном виде.
 *
 * Своих схем три, и берутся они от домена Ассоциации. Это не формальность:
 * правило ADE требует, чтобы у схемы был опознаваемый владелец, и обратный
 * домен отвечает на этот вопрос сам, без реестра.
 *
 * Чужих схем две, и обе из реестра ADE. `std.iso.11785` — то самое
 * пятнадцатизначное десятичное представление радиометки, первые три цифры
 * которого код страны; для России это 643. `composite.withinherdid` в книге
 * не используется, но оставлен в перечне как ответ на вопрос «а если
 * у животного нет ни одного номера»: тогда по правилам ADE его собирают
 * из номера стада и номера в стаде через точку.
 */
export const SCHEME = {
  /** Племенной номер животного — то, чем его называют вовне. */
  animal: 'ru.holstein-russia.animal',
  /** Идентификатор учётной системы: наш `animals.uuid`. */
  accounting: 'ru.holstein-russia.accountingid',
  /** Хозяйство. Локация в терминах ADE — это место, откуда данные. */
  location: 'ru.holstein-russia.orgid',
  /** Базовый номер ФГИАС ПР. Чужая схема, но именованная нами. */
  fgias: 'ru.mcx.fgias-pr.base',
  /** Радиометка по ISO 11785 — схема из реестра ADE. */
  iso11785: 'std.iso.11785',
  /**
   * Международный номер вида `NLDM000574590532` — схема из реестра ADE,
   * объявленная как «идентификаторы животных, признанные Interbull».
   * Именно этими номерами животных называют публикуемые рейтинги
   * европейских ассоциаций, и именно по ним нас найдут снаружи.
   */
  interbull: 'icar.Interbull',
} as const

/** Источник данных в `meta.source`: обратный домен системы, а не URL. */
/** Коллекции ADE, которые книга отдаёт. Имена — из `url-schemes` спецификации. */
export const ADE_COLLECTIONS = [
  'animals',
  'test-day-results',
  'parturitions',
  'inseminations',
  'type-classifications',
  'weights',
  'breeding-values',
  /*
   * Движение и стельность добавлены позже остальных, и позже намеренно:
   * без них потребитель получал картину продуктивности без картины
   * перемещений — а без неё непонятно, почему у коровы оборвался ряд
   * доений. Ряд обрывается либо потому, что её продали, либо потому,
   * что она пала, и различить это по одним доениям нельзя.
   */
  'arrivals',
  'departures',
  'deaths',
  'pregnancy-checks',
] as const

export type AdeCollectionName = (typeof ADE_COLLECTIONS)[number]

export const isAdeCollection = (v: string): v is AdeCollectionName =>
  (ADE_COLLECTIONS as readonly string[]).includes(v)

export const ADE_SOURCE = 'ru.holstein-russia.plemkniga'

/** Версия спецификации, по которой собран ответ. */
export const ADE_VERSION = '1.5.1'

/* ------------------------------------------------------------------ *
 *  Перечисления                                                       *
 * ------------------------------------------------------------------ */

/*
 * Значения выписаны как в спецификации, латиницей и в её регистре.
 * Переводить их нельзя: это не подписи для человека, а слова языка,
 * на котором с нами будут разговаривать чужие системы.
 *
 * Списки продублированы у нас, а не импортируются из схем ADE, и это
 * осознанная копия. Схемы лежат на GitHub, тянуть их во время сборки
 * значило бы поставить выкладку книги в зависимость от доступности
 * чужого сервиса — того самого, доступ к которому у нас как раз может
 * пропасть. Расхождение с оригиналом ловит `npm run check:ade`.
 */

export const ADE_SPECIE = ['Buffalo', 'Cattle', 'Deer', 'Elk', 'Goat', 'Horse', 'Pig', 'Sheep'] as const

export const ADE_GENDER = [
  'Female', 'FemaleNeuter', 'Freemartin', 'Male', 'MaleCryptorchid', 'MaleNeuter', 'Unknown',
] as const

export const ADE_ANIMAL_STATUS = ['Alive', 'Dead', 'OffFarm', 'Unknown'] as const

export const ADE_PRODUCTION_PURPOSE = [
  'Meat', 'Milk', 'Wool', 'Suckler', 'Breeding', 'Research', 'Pet',
] as const

export const ADE_RELATION = ['Genetic', 'Recipient', 'Adoptive'] as const

export const ADE_BIRTH_STATUS = [
  'Alive', 'Stillborn', 'Aborted', 'DiedBeforeTaggingDate', 'DiedAfterTaggingDate',
  'SlaughteredAtBirth', 'EuthanisedAtBirth',
] as const

export const ADE_CALVING_EASE = [
  'EasyUnassisted', 'EasyAssisted', 'DifficultExtraAssistance',
  'DifficultVeterinaryCare', 'CaesareanOrSurgery',
] as const

export const ADE_INSEMINATION_TYPE = [
  'NaturalService', 'RunWithBull', 'Insemination', 'Implantation',
] as const

/**
 * Показатели молока. Единицы предписаны описанием схемы и переопределять
 * их не следует: жир и белок в процентах, соматика в тысячах клеток на мл.
 *
 * Ловушка: `value` в спецификации объявлено **строкой**, а не числом.
 * Отдать туда число — молча собрать невалидный документ: JSON стерпит,
 * а сверка по схеме на чужой стороне откажет.
 */
export const ADE_MILK_CHARACTERISTIC = [
  'SCC', 'FAT', 'PROTEIN', 'LAC', 'UREA', 'BLOOD', 'ACETONE', 'BHB', 'LDH', 'PRO',
  'AVGCOND', 'MAXCOND', 'AVGFLWR', 'MAXFLWR', 'WEIGHT', 'TEMPERATURE',
] as const

export const ADE_CONFORMATION_GROUP = ['Composite', 'Linear'] as const

export const ADE_SCORING_METHOD = ['Manual', 'Automated'] as const

/**
 * Признаки экстерьера по разделу 5 руководств ICAR. Список приведён
 * целиком: он же служит словарём при отображении наших признаков в чужие,
 * и отсутствующее в нём имя — не опечатка, а признак того, что наш
 * признак в международную номенклатуру не ложится.
 */
export const ADE_CONFORMATION_TRAIT = [
  'Angularity', 'BackLength', 'BackWidth', 'BodyConditionScore', 'BodyDepth', 'BodyLength',
  'BoneStructure', 'CentralLigament', 'ChestDepth', 'ChestWidth', 'ClawAngle', 'DairyStrength',
  'FeetLegs', 'FinalScore', 'FlankDepth', 'FootAngle', 'ForePasternsSideView',
  'ForeUdderAttachment', 'ForeUdderLength', 'Frame', 'FrontFeetOrientation', 'FrontLegsFrontView',
  'FrontTeatPlacement', 'HeightAtRump', 'HeightAtWithers', 'HindPasternsSideView',
  'HockDevelopment', 'LengthOfRump', 'Locomotion', 'LoinStrength', 'Muscularity',
  'MuscularityComposite', 'MuscularityShoulderSideView', 'MuscularityShoulderTopView',
  'MuzzleWidth', 'RearLegsRearView', 'RearLegsSet', 'RearLegsSideView', 'RearTeatPlacement',
  'RearUdderHeight', 'RearUdderWidth', 'RoundingOfRibs', 'RumpAngle', 'RumpLength', 'RumpWidth',
  'SkinThickness', 'Stature', 'TailSet', 'TeatDirection', 'TeatForm', 'TeatLength',
  'TeatPlacementRearView', 'TeatPlacementSideView', 'TeatThickness', 'ThicknessOfBone',
  'ThicknessOfTeat', 'ThicknessOfLoin', 'ThighLength', 'ThighRoundingSideView',
  'ThighWidthRearView', 'ThurlWidth', 'TopLine', 'Type', 'Udder', 'UdderBalance', 'UdderDepth',
  'WidthAtHips', 'WidthAtPins',
] as const

export const ADE_BV_CALCULATION = [
  'BreedingValue', 'ParentAverageBreedingValue', 'GenomicBreedingValue',
  'ConvertedBreedingValue', 'Other',
] as const

export const ADE_DEATH_REASON = [
  'Missing', 'Parturition', 'Disease', 'Accident', 'Consumption', 'Culled', 'Other', 'Unknown',
  'Age', 'Mastitis', 'Production', 'LegOrClaw', 'MilkingAbility', 'Nutrition', 'Fertility',
] as const

export const ADE_DEPARTURE_KIND = [
  'InternalTransfer', 'Export', 'Slaughter', 'Newborn', 'StudService', 'StudServiceReturn',
  'Agistment', 'AgistmentReturn', 'Show', 'ShowReturn', 'Sale', 'SaleReturn', 'Other',
] as const

/**
 * Причина поступления и вид выбытия.
 *
 * Списки взяты целиком, а не урезаны до того, что встречается у нас.
 * Урезанный список выглядит как полный и молча отвергает законное
 * значение, присланное чужой программой: та шлёт `Agistment`,
 * получает отказ и справедливо считает, что мы стандарт не держим.
 */
export const ADE_ARRIVAL_REASON = [
  'Purchase', 'InternalTransfer', 'Imported', 'StudService', 'StudServiceReturn',
  'Slaughter', 'Agistment', 'AgistmentReturn', 'Show', 'ShowReturn', 'Sale',
  'SaleReturn', 'Other',
] as const

export const ADE_DEPARTURE_REASON = [
  'Age', 'Superfluous', 'Slaughter', 'Sale', 'Newborn', 'LegOrClaw', 'Nutrition',
  'Parturition', 'Mastitis', 'Fertility', 'Health', 'Production', 'MilkingAbility',
  'BadType', 'Behaviour', 'Other', 'Unknown',
] as const

export const ADE_PREGNANCY_METHOD = [
  'Echography', 'Palpation', 'Blood', 'Milk', 'Visual', 'Other',
] as const

/**
 * Результат проверки стельности.
 *
 * `Unknown` в списке есть, и это не мусорное значение: проверка,
 * не давшая ответа, — обычный исход на малом сроке, и записать её
 * как «пусто» значило бы утверждать, что корова не стельна.
 */
export const ADE_PREGNANCY_RESULT = ['Empty', 'Pregnant', 'Multiple', 'Unknown'] as const

export const ADE_WEIGHT_METHOD = [
  'LoadCell', 'Girth', 'Assessed', 'WalkOver', 'Predicted', 'Imaged',
  'FrontEndCorrelated', 'GroupAverage',
] as const

export type AdeSpecie = (typeof ADE_SPECIE)[number]
export type AdeGender = (typeof ADE_GENDER)[number]
export type AdeAnimalStatus = (typeof ADE_ANIMAL_STATUS)[number]
export type AdeConformationTrait = (typeof ADE_CONFORMATION_TRAIT)[number]

/* ------------------------------------------------------------------ *
 *  Общие типы                                                         *
 * ------------------------------------------------------------------ */

/** Пара «схема + идентификатор» — фундамент всей системы ADE. */
export type AdeIdentifier = { scheme: string; id: string }

export type AdeMeta = {
  source: string
  sourceId?: string
  modified: string
  created?: string
  isDeleted?: boolean
}

export type AdeResource = {
  resourceType: string
  meta?: AdeMeta
  location?: AdeIdentifier
  '@self'?: string
}

export type AdeEvent = AdeResource & {
  id?: string
  eventDateTime?: string
  animal: AdeIdentifier
  remark?: string
}

/** Страница выдачи. Все поля `view` необязательные — отдаём то, что знаем. */
export type AdeCollection<T> = {
  view?: {
    totalItems?: number
    pageSize?: number
    currentPage?: number
    totalPages?: number
    next?: string
    first?: string
  }
  member: T[]
}

/* ------------------------------------------------------------------ *
 *  Помощники                                                          *
 * ------------------------------------------------------------------ */

/**
 * Время по RFC3339 в UTC, обязательно с суффиксом `Z`.
 *
 * Спецификация требует именно UTC. Отдать местное время со смещением
 * формально допустимо форматом, но означает другую точку на оси:
 * контрольное доение 3 сентября в Самаре и 3 сентября в Утрехте — разные
 * дни, и расхождение вылезет ровно на границе месяца, в отчёте за период.
 *
 * `toISOString` даёт UTC всегда, поэтому обёртка нужна не ради формата,
 * а ради единственного места, где разбирается негодная дата: в базе
 * встречаются пустые строки и подобия дат из старых загрузок,
 * и `new Date('')` тихо даёт `Invalid Date`, чей `toISOString` бросает.
 */
export const adeDateTime = (value?: string | Date | null): string | undefined => {
  if (!value) return undefined
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export const adeIdentifier = (
  scheme: string,
  id?: string | number | null,
): AdeIdentifier | undefined => {
  if (id === null || id === undefined) return undefined
  const s = String(id).trim()
  return s ? { scheme, id: s } : undefined
}

export const adeMeta = (opts: {
  sourceId?: string | number | null
  modified?: string | Date | null
  created?: string | Date | null
}): AdeMeta => ({
  source: ADE_SOURCE,
  ...(opts.sourceId !== null && opts.sourceId !== undefined
    ? { sourceId: String(opts.sourceId) }
    : {}),
  /*
   * `modified` обязательно, а взять его иногда неоткуда: часть записей
   * приехала загрузкой и своей даты правки не имеет. Подставляется
   * текущее время — не потому, что оно верно, а потому, что пустого
   * обязательного поля быть не может, а соврать «эпохой» хуже: потребитель
   * решит, что запись не менялась с 1970 года, и не заберёт её.
   */
  modified: adeDateTime(opts.modified) ?? new Date().toISOString(),
  ...(adeDateTime(opts.created) ? { created: adeDateTime(opts.created) } : {}),
})

/** Убрать необъявленные ключи: `undefined` в JSON превращается в шум. */
export const adeClean = <T extends Record<string, unknown>>(obj: T): T => {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k]
  }
  return obj
}
