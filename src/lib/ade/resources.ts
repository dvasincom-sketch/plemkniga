import {
  ADE_SOURCE,
  SCHEME,
  adeClean,
  adeDateTime,
  adeIdentifier,
  adeMeta,
  type AdeConformationTrait,
  type AdeEvent,
  type AdeIdentifier,
  type AdeResource,
} from '@/lib/ade/core'

/**
 * Отображение записей книги в ресурсы ICAR ADE.
 *
 * ## Почему чистые функции над простыми объектами
 *
 * Ни одна из этих функций не знает про Payload и не ходит в базу: на вход
 * приходит плоский объект с нужными полями, на выход — готовый ресурс.
 * Это не эстетика, а единственный способ проверить отображение вообще:
 * прогон `npm run check:ade` собирает ресурсы из выдуманных записей
 * и сверяет их с требованиями спецификации, не поднимая ни базы,
 * ни сервера. Отображение, которое можно проверить только на живых
 * данных, на практике не проверяется никогда.
 *
 * ## Где здесь врут молча
 *
 * Три места, и все три отмечены в коде.
 *
 * Единицы. Жир и белок в ADE идут в процентах, соматика — в тысячах
 * клеток на миллилитр. У нас так же, и это совпадение, а не гарантия:
 * стоит кому-то завести соматику в клетках, и число уедет в тысячу раз,
 * оставшись правдоподобным.
 *
 * Тип значения. Поле `value` у показателя молока объявлено **строкой**,
 * а не числом. Отдать число — собрать документ, который наш JSON стерпит,
 * а сверка по схеме на чужой стороне отвергнет.
 *
 * Выбытие. `culled` в книге означает «выбраковано», а не «пало»,
 * и в ADE это `OffFarm`, а не `Dead`. Разница не косметическая: по этому
 * полю считают падёж.
 */

/* ------------------------------------------------------------------ *
 *  Животное                                                          *
 * ------------------------------------------------------------------ */

export type AnimalInput = {
  id: number
  identNumber?: string | null
  uuid?: string | null
  fgiasBaseUuid?: string | null
  rfid?: string | null
  /** Международный номер вида NLDM000574590532, если он собран. */
  internationalId?: string | null
  name?: string | null
  nameLatin?: string | null
  sex?: 'female' | 'male' | null
  state?: 'alive' | 'sold' | 'culled' | 'dead' | null
  birthDate?: string | null
  breedCode?: string | null
  ageGroup?: string | null
  ownerId?: number | null
  updatedAt?: string | null
  createdAt?: string | null
  fatherIdentNumber?: string | null
  fatherName?: string | null
  motherIdentNumber?: string | null
  motherName?: string | null
}

/**
 * Основной идентификатор животного — племенной номер, а не наш `uuid`.
 *
 * Наружу животное известно тем номером, которым его называют в документах
 * и в разговоре; учётный идентификатор нужен нам самим и уходит
 * вторым, в `alternativeIdentifiers`. Поставить первым `uuid` значило бы
 * потребовать от чужой системы знать наши внутренности, чтобы сослаться
 * на корову.
 *
 * Когда племенного номера нет — берётся учётный: пустого обязательного
 * идентификатора быть не может.
 */
export const animalIdentifier = (a: AnimalInput): AdeIdentifier =>
  adeIdentifier(SCHEME.animal, a.identNumber) ??
  adeIdentifier(SCHEME.accounting, a.uuid) ?? { scheme: SCHEME.accounting, id: String(a.id) }

const locationOf = (ownerId?: number | null): AdeIdentifier | undefined =>
  adeIdentifier(SCHEME.location, ownerId)

/**
 * Состояние животного.
 *
 * `sold` и `culled` — оба `OffFarm`: животное ушло из стада, но живо
 * настолько, насколько нам известно. `Dead` остаётся только за падежом.
 * Смешать их значило бы завысить падёж на всю выбраковку, а по этому
 * числу судят о благополучии стада.
 */
const statusOf = (state?: string | null): string | undefined => {
  switch (state) {
    case 'alive':
      return 'Alive'
    case 'dead':
      return 'Dead'
    case 'sold':
    case 'culled':
      return 'OffFarm'
    default:
      return undefined
  }
}

export function adeAnimal(a: AnimalInput): AdeResource & Record<string, unknown> {
  const alternatives: AdeIdentifier[] = []
  /*
   * Порядок здесь по убыванию внешней ценности, а не по удобству:
   * первым международный номер — по нему нас найдут чужие системы,
   * — потом наш учётный, потом ключ государственного реестра, потом
   * радиометка. Список читают сверху, и сверху должно стоять то,
   * что понятно снаружи.
   */
  for (const alt of [
    adeIdentifier(SCHEME.interbull, a.internationalId),
    adeIdentifier(SCHEME.accounting, a.uuid),
    adeIdentifier(SCHEME.fgias, a.fgiasBaseUuid),
    adeIdentifier(SCHEME.iso11785, a.rfid),
  ]) {
    if (alt && alt.id !== animalIdentifier(a).id) alternatives.push(alt)
  }

  /*
   * Родословная передаётся массивом внутри самого животного — отдельного
   * ресурса на родство в ADE нет. `parentOf` обязательно и указывает
   * на потомка: массив рассчитан на несколько поколений сразу, и без этой
   * ссылки было бы непонятно, чей это родитель.
   */
  const parentage: Record<string, unknown>[] = []
  const self = animalIdentifier(a)

  if (a.fatherIdentNumber) {
    parentage.push(
      adeClean({
        parentOf: self,
        gender: 'Male',
        relation: 'Genetic',
        identifier: { scheme: SCHEME.animal, id: a.fatherIdentNumber },
        officialName: a.fatherName ?? undefined,
      }),
    )
  }
  if (a.motherIdentNumber) {
    parentage.push(
      adeClean({
        parentOf: self,
        gender: 'Female',
        relation: 'Genetic',
        identifier: { scheme: SCHEME.animal, id: a.motherIdentNumber },
        officialName: a.motherName ?? undefined,
      }),
    )
  }

  return adeClean({
    resourceType: 'icarAnimalCoreResource',
    meta: adeMeta({ sourceId: a.uuid ?? a.id, modified: a.updatedAt, created: a.createdAt }),
    location: locationOf(a.ownerId),
    identifier: self,
    alternativeIdentifiers: alternatives.length ? alternatives : undefined,
    specie: 'Cattle',
    gender: a.sex === 'male' ? 'Male' : a.sex === 'female' ? 'Female' : 'Unknown',
    birthDate: adeDateTime(a.birthDate),
    /*
     * Порода уходит парой «схема + код». Схема `icar.breed-3` — это
     * трёхсимвольные коды ICAR, которые ведёт Interbull; голштинская
     * чёрно-пёстрая в них `HOL`. Своего кода не подставляем: если в книге
     * стоит порода без кода ICAR, поле просто не уезжает — пустая
     * ссылка на несуществующий код хуже её отсутствия.
     */
    primaryBreed: a.breedCode ? { scheme: 'icar.breed-3', id: a.breedCode } : undefined,
    name: a.name ?? undefined,
    officialName: a.nameLatin ?? a.name ?? undefined,
    /*
     * Быки-производители идут как `Breeding` — в ADE это прямо про быков
     * для получения семени. Остальное молочное стадо — `Milk`.
     */
    productionPurpose: a.ageGroup === 'bull' ? 'Breeding' : a.sex === 'female' ? 'Milk' : undefined,
    status: statusOf(a.state),
    parentage: parentage.length ? parentage : undefined,
  })
}

/* ------------------------------------------------------------------ *
 *  Контрольное доение                                                *
 * ------------------------------------------------------------------ */

export type MilkTestInput = {
  id: number
  animal: AnimalInput
  date: string
  milk?: number | null
  fat?: number | null
  protein?: number | null
  somaticCells?: number | null
  updatedAt?: string | null
}

export function adeTestDayResult(t: MilkTestInput): AdeEvent & Record<string, unknown> {
  /*
   * Единицы предписаны описанием схемы и здесь не переопределяются:
   * `unit` ставят только тогда, когда единицы отличаются от принятых
   * по умолчанию. У нас они совпадают — жир и белок в процентах,
   * соматика в тысячах клеток на миллилитр, — и объявлять это ещё раз
   * значило бы завести второе место, где единица может разойтись.
   *
   * `value` — строка. Это не описка спецификации и не наша вольность:
   * так объявлено в схеме, и число туда класть нельзя.
   */
  const characteristics: Record<string, unknown>[] = []
  const push = (code: string, value?: number | null) => {
    if (value === null || value === undefined) return
    characteristics.push({ characteristic: code, value: String(value) })
  }

  push('FAT', t.fat)
  push('PROTEIN', t.protein)
  push('SCC', t.somaticCells)

  return adeClean({
    resourceType: 'icarTestDayResultEventResource',
    meta: adeMeta({ sourceId: t.id, modified: t.updatedAt ?? t.date }),
    location: locationOf(t.animal.ownerId),
    id: String(t.id),
    animal: animalIdentifier(t.animal),
    eventDateTime: adeDateTime(t.date),
    milkWeight24Hours:
      t.milk === null || t.milk === undefined ? undefined : { unitCode: 'KGM', value: t.milk },
    milkCharacteristics: characteristics.length ? characteristics : undefined,
  })
}

/* ------------------------------------------------------------------ *
 *  Отёл                                                              *
 * ------------------------------------------------------------------ */

export type CalvingInput = {
  id: number
  animal: AnimalInput
  date: string
  number?: number | null
  eventType?: 'calving' | 'abortion' | 'dryOff' | null
  ease?: 'easy' | 'assisted' | 'hard' | null
  liveHeifers?: number | null
  liveBulls?: number | null
  stillborn?: number | null
  updatedAt?: string | null
}

/**
 * Лёгкость отёла: наши три степени в пять степеней ADE.
 *
 * Обратное отображение неоднозначно, и это надо помнить при обратной
 * загрузке: `DifficultVeterinaryCare` и `CaesareanOrSurgery` придут
 * в наш `hard`, и различие потеряется. Расширять наш список ради этого
 * пока незачем — но заметить потерю здесь дешевле, чем удивиться ей потом.
 */
const easeOf = (ease?: string | null): string | undefined => {
  switch (ease) {
    case 'easy':
      return 'EasyUnassisted'
    case 'assisted':
      return 'EasyAssisted'
    case 'hard':
      return 'DifficultExtraAssistance'
    default:
      return undefined
  }
}

export function adeParturition(c: CalvingInput): AdeEvent & Record<string, unknown> {
  const live = (c.liveHeifers ?? 0) + (c.liveBulls ?? 0)
  const still = c.stillborn ?? 0

  /*
   * `!= null` здесь нарочно нестрогое: оно ловит и `null`, и `undefined`
   * одним сравнением. Первая редакция стояла со строгим `!== null`
   * и считала записанным всё, где поля попросту нет, — то есть отёл без
   * чисел приплода уезжал с `liveProgeny: 0`, сообщая о мертворождении,
   * которого не было. Поймал это `check:ade` на первом же прогоне.
   */
  const known = c.liveHeifers != null || c.liveBulls != null || c.stillborn != null

  return adeClean({
    resourceType: 'icarReproParturitionEventResource',
    meta: adeMeta({ sourceId: c.id, modified: c.updatedAt ?? c.date }),
    location: locationOf(c.animal.ownerId),
    id: String(c.id),
    animal: animalIdentifier(c.animal),
    eventDateTime: adeDateTime(c.date),
    damParity: c.number ?? undefined,
    calvingEase: easeOf(c.ease),
    /*
     * Числа приплода уходят только тогда, когда они действительно
     * записаны. Ноль вместо «неизвестно» здесь худший из возможных
     * ответов: он утверждает, что живых телят не было, — а это уже
     * не пробел в данных, а сообщение о мертворождении.
     */
    liveProgeny: known ? live : undefined,
    totalProgeny: known ? live + still : undefined,
    /*
     * Перечень приплода — вдобавок к числам, а не вместо них.
     *
     * Числа отвечают на вопрос «сколько», и стандарт держит их именно
     * для случая, когда телята не идентифицированы, — наш случай.
     * Но пол в числах не виден: `liveProgeny: 2` не говорит, тёлочки
     * это или бычки, и приняв такой отёл обратно, мы не смогли бы
     * восстановить то, что сами же знали.
     *
     * Поймал это круговой прогон `check:ade-accept`: своя выгрузка
     * не прошла свой приём, потому что пола в ней попросту не было.
     *
     * Поле называется `progenyDetails`. Соседнее `progeny` в 1.5
     * помечено устаревшим, и писать в него — закладывать поломку
     * на версию вперёд.
     */
    progenyDetails: known ? progenyDetails(c) : undefined,
  })
}

/**
 * Перечень приплода из наших трёх чисел.
 *
 * Записи безымянные: идентификаторов телят у нас на этот момент нет,
 * и выдумывать их нельзя. Стандарт этого и не требует — он просит
 * «как минимум пол и статус», а это ровно то, что мы знаем.
 *
 * Мертворождённые идут без пола: в книге он не записан, и подставлять
 * его значило бы сообщить пол, которого мы не знаем, ради красоты
 * перечня.
 */
function progenyDetails(c: CalvingInput): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []

  for (let i = 0; i < (c.liveHeifers ?? 0); i += 1) {
    out.push({ gender: 'Female', birthStatus: 'Alive' })
  }
  for (let i = 0; i < (c.liveBulls ?? 0); i += 1) {
    out.push({ gender: 'Male', birthStatus: 'Alive' })
  }
  for (let i = 0; i < (c.stillborn ?? 0); i += 1) {
    out.push({ birthStatus: 'Stillborn' })
  }

  return out
}

/* ------------------------------------------------------------------ *
 *  Осеменение                                                        *
 * ------------------------------------------------------------------ */

export type InseminationInput = {
  id: number
  animal: AnimalInput
  date: string
  attemptNumber?: number | null
  method?: string | null
  bullIdentNumber?: string | null
  bullName?: string | null
  technician?: string | null
  updatedAt?: string | null
}

export function adeInsemination(i: InseminationInput): AdeEvent & Record<string, unknown> {
  /*
   * `inseminationType` — единственное обязательное поле события, и взять
   * его иногда неоткуда: в книге способ осеменения не всегда заполнен.
   * Подставляется `Insemination` — искусственное осеменение, то есть
   * подавляющее большинство записей. Догадка, и она названа: молча
   * пропустить обязательное поле нельзя, а выдумывать вольную случку
   * там, где её почти не бывает, было бы хуже.
   */
  const type =
    i.method === 'natural' ? 'NaturalService' : i.method === 'embryo' ? 'Implantation' : 'Insemination'

  return adeClean({
    resourceType: 'icarReproInseminationEventResource',
    meta: adeMeta({ sourceId: i.id, modified: i.updatedAt ?? i.date }),
    location: locationOf(i.animal.ownerId),
    id: String(i.id),
    animal: animalIdentifier(i.animal),
    eventDateTime: adeDateTime(i.date),
    inseminationType: type,
    rank: i.attemptNumber ?? undefined,
    sireIdentifiers: i.bullIdentNumber
      ? [{ scheme: SCHEME.animal, id: i.bullIdentNumber }]
      : undefined,
    sireOfficialName: i.bullName ?? undefined,
    responsible: i.technician ?? undefined,
  })
}

/* ------------------------------------------------------------------ *
 *  Экстерьер                                                         *
 * ------------------------------------------------------------------ */

/**
 * Наши признаки в номенклатуру ICAR.
 *
 * `null` означает не «забыли», а «в международной номенклатуре такого
 * признака нет». Их два, и оба из сводной оценки: «объём туловища»
 * и «задняя треть туловища» — наши составные показатели, которым
 * в списке ICAR соответствия не нашлось. Выдать их за соседние
 * по смыслу значило бы отправить чужой системе число под чужим именем;
 * промолчать честнее, и прогон это молчание пересчитывает.
 */
export const LINEAR_TO_ADE: Record<string, AdeConformationTrait | null> = {
  bodyType: 'Type',
  centralLigament: 'CentralLigament',
  rumpWidth: 'RumpWidth',
  rearUdder: 'RearUdderHeight',
  teatLength: 'TeatLength',
  chestWidth: 'ChestWidth',
  frontTeatPlacement: 'FrontTeatPlacement',
  rumpAngle: 'RumpAngle',
  hoofAngle: 'FootAngle',
  rearLegsSide: 'RearLegsSideView',
  rearLegsRear: 'RearLegsRearView',
  rearTeatPlacement: 'RearTeatPlacement',
  udderDepth: 'UdderDepth',
  bodyDepth: 'BodyDepth',
  foreUdder: 'ForeUdderAttachment',
  height: 'Stature',
}

export const COMPOSITE_TO_ADE: Record<string, AdeConformationTrait | null> = {
  generalView: 'Frame',
  dairyCharacter: 'DairyStrength',
  legQuality: 'FeetLegs',
  udderQuality: 'Udder',
  bodyVolume: null,
  rearBody: null,
}

export type ExteriorInput = {
  id: number
  animal: AnimalInput
  assessedAt: string
  assessor?: string | null
  /** Линейные признаки по шкале 1–9, ключами книги. */
  linear?: Record<string, number | null | undefined>
  /** Сводная оценка по шкале 50–100, ключами книги. */
  composite?: Record<string, number | null | undefined>
  updatedAt?: string | null
}

/**
 * Один осмотр — одно событие с набором оценок.
 *
 * В ADE есть два способа: `icarConformationScoreEventResource` — событие
 * на каждую отдельную оценку, и `icarTypeClassificationEventResource` —
 * событие с массивом оценок. Взят второй, потому что он соответствует
 * тому, как это происходит: бонитёр приезжает один раз и ставит сразу
 * весь набор. Разложить осмотр на восемнадцать событий значило бы
 * потерять сам факт, что это один осмотр одного дня.
 */
export function adeTypeClassification(e: ExteriorInput): AdeEvent & Record<string, unknown> {
  const scores: Record<string, unknown>[] = []

  const add = (
    map: Record<string, AdeConformationTrait | null>,
    values: Record<string, number | null | undefined> | undefined,
    group: 'Linear' | 'Composite',
  ) => {
    if (!values) return
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined) continue
      const trait = map[key]
      if (!trait) continue
      scores.push({ traitGroup: group, traitScored: trait, score: value, method: 'Manual' })
    }
  }

  add(LINEAR_TO_ADE, e.linear, 'Linear')
  add(COMPOSITE_TO_ADE, e.composite, 'Composite')

  return adeClean({
    resourceType: 'icarTypeClassificationEventResource',
    meta: adeMeta({ sourceId: e.id, modified: e.updatedAt ?? e.assessedAt }),
    location: locationOf(e.animal.ownerId),
    id: String(e.id),
    animal: animalIdentifier(e.animal),
    eventDateTime: adeDateTime(e.assessedAt),
    responsible: e.assessor ?? undefined,
    conformationScores: scores.length ? scores : undefined,
  })
}

/* ------------------------------------------------------------------ *
 *  Взвешивание                                                       *
 * ------------------------------------------------------------------ */

export type WeightInput = {
  id: number
  animal: AnimalInput
  date: string
  weight: number
  updatedAt?: string | null
}

export function adeWeight(w: WeightInput): AdeEvent & Record<string, unknown> {
  return adeClean({
    resourceType: 'icarWeightEventResource',
    meta: adeMeta({ sourceId: w.id, modified: w.updatedAt ?? w.date }),
    location: locationOf(w.animal.ownerId),
    id: String(w.id),
    animal: animalIdentifier(w.animal),
    eventDateTime: adeDateTime(w.date),
    /*
     * Метод взвешивания в книге не записан, и подставлять `LoadCell`
     * по умолчанию схемы мы не станем: это утверждение о том, как мерили,
     * а мы не знаем. Незаполненное поле честнее правдоподобного.
     */
    weight: { measurement: w.weight, units: 'KGM' },
  })
}

/* ------------------------------------------------------------------ *
 *  Племенная ценность                                                *
 * ------------------------------------------------------------------ */

export type BreedingValueInput = {
  animal: AnimalInput
  profileKey: string
  profileName: string
  baseVersion: string
  value: number
  reliability?: number | null
  computedAt?: string | null
}

/**
 * Индекс книги как ресурс племенной ценности.
 *
 * ## Почему `Other`, а не `BreedingValue`
 *
 * `BreedingValue` в ADE означает племенную ценность по признаку —
 * прогноз для удоя, для жира. Наш индекс не признак, а взвешенная сумма
 * признаков по выбранному профилю, и объявить его племенной ценностью
 * значило бы предложить чужой системе сложить его с чужим индексом
 * или сравнить с ним. `Other` — единственное честное значение.
 *
 * ## Почему схема базы своя
 *
 * Реестр схем баз племенной ценности в ADE существует, но **пуст**:
 * ни одна база пока не зарегистрирована. Своя схема здесь не самоволие,
 * а единственный доступный способ сказать, относительно чего посчитано;
 * без базы число не значит ничего, а `CDCB-2025-metric` хотя бы называет
 * заимствование прямо.
 */
export function adeBreedingValue(v: BreedingValueInput): AdeResource & Record<string, unknown> {
  const animal = animalIdentifier(v.animal)

  return adeClean({
    resourceType: 'icarBreedingValueResource',
    meta: adeMeta({ sourceId: `${v.animal.id}:${v.profileKey}`, modified: v.computedAt }),
    location: locationOf(v.animal.ownerId),
    id: `${animal.id}:${v.profileKey}`,
    animal,
    base: { scheme: 'ru.holstein-russia.bvbase', id: v.baseVersion },
    version: v.profileName,
    breedingValues: [
      adeClean({
        traitLabel: { scheme: 'ru.holstein-russia.trait', id: v.profileKey },
        calculationType: 'Other',
        value: v.value,
        reliability: v.reliability ?? undefined,
      }),
    ],
  })
}

/* ------------------------------------------------------------------ *
 *  Локации                                                           *
 * ------------------------------------------------------------------ */

export type LocationInput = { id: number; name: string; shortName?: string | null }

export function adeLocation(o: LocationInput): AdeResource & Record<string, unknown> {
  return adeClean({
    resourceType: 'icarLocationResource',
    meta: { source: ADE_SOURCE, modified: new Date().toISOString() },
    identifier: { scheme: SCHEME.location, id: String(o.id) },
    name: o.shortName || o.name,
  })
}

/* ------------------------------------------------------------------ *
 *  Движение: поступление, выбытие, падёж                             *
 * ------------------------------------------------------------------ */

export type MovementInput = {
  id: number
  animal: AnimalInput
  date: string
  /** Вид из нашего справочника: sale, lease, transfer, import, cull, death. */
  kind: string
  /** Организация, отдавшая животное; `null` — поступило извне книги. */
  fromId: number | null
  /** Организация, принявшая животное; `null` — выбраковка или падёж. */
  toId: number | null
  updatedAt: string | null
}

/**
 * Одна запись перемещения — два разных события в ADE.
 *
 * У нас продажа записана одной строкой: от кого, кому, когда. В стандарте
 * это два события у двух локаций: у продавца выбытие, у покупателя
 * поступление. И это не избыточность стандарта, а верное описание мира:
 * хозяйство видит только свою сторону сделки, и «продажа» без указания
 * стороны не отвечает на вопрос «уехало или приехало».
 *
 * Поэтому одна строка отдаётся дважды — в `departures` той локации,
 * от которой ушло, и в `arrivals` той, куда пришло, — и это не дубль.
 * `meta.sourceId` у них разный: к нашему номеру приписывается сторона,
 * иначе потребитель, забравший обе коллекции, склеил бы два события
 * в одно и потерял бы половину движения.
 */
const ARRIVAL_REASON: Record<string, string> = {
  sale: 'Purchase',
  import: 'Imported',
  transfer: 'InternalTransfer',
  lease: 'Agistment',
}

const DEPARTURE_KIND: Record<string, string> = {
  sale: 'Sale',
  transfer: 'InternalTransfer',
  lease: 'Agistment',
  cull: 'Slaughter',
}

export function adeArrival(m: MovementInput): AdeEvent & Record<string, unknown> {
  return adeClean({
    resourceType: 'icarMovementArrivalEventResource',
    /*
     * Сторона приписана к номеру записи. Без неё поступление и выбытие
     * из одной строки пришли бы к потребителю с одинаковым `sourceId`,
     * и добросовестный клиент, различающий записи по нему, счёл бы
     * второе событие повтором первого — и потерял бы половину движения.
     */
    meta: adeMeta({ sourceId: `${m.id}-in`, modified: m.updatedAt ?? m.date }),
    location: locationOf(m.toId),
    id: `${m.id}-in`,
    animal: animalIdentifier(m.animal),
    eventDateTime: adeDateTime(m.date),
    arrivalReason: ARRIVAL_REASON[m.kind] ?? 'Other',
  })
}

export function adeDeparture(m: MovementInput): AdeEvent & Record<string, unknown> {
  return adeClean({
    resourceType: 'icarMovementDepartureEventResource',
    meta: adeMeta({ sourceId: `${m.id}-out`, modified: m.updatedAt ?? m.date }),
    location: locationOf(m.fromId),
    id: `${m.id}-out`,
    animal: animalIdentifier(m.animal),
    eventDateTime: adeDateTime(m.date),
    departureKind: DEPARTURE_KIND[m.kind] ?? 'Other',
    /*
     * Причина выбытия у нас не записана отдельным полем: справочник
     * причин ведёт ФГИАС и лежит у животного, а не у перемещения.
     * Подставлять `Sale` в качестве причины нельзя — это вид выбытия,
     * а не причина; корову продают по разным причинам, и выдуманная
     * причина уедет в чужую систему как факт.
     */
  })
}

export function adeDeath(m: MovementInput): AdeEvent & Record<string, unknown> {
  return adeClean({
    resourceType: 'icarMovementDeathEventResource',
    meta: adeMeta({ sourceId: `${m.id}-death`, modified: m.updatedAt ?? m.date }),
    location: locationOf(m.fromId),
    id: `${m.id}-death`,
    animal: animalIdentifier(m.animal),
    eventDateTime: adeDateTime(m.date),
    /*
     * Причина гибели тоже не записана. `Unknown` здесь честнее пропуска:
     * поле необязательное, но потребитель, увидев событие падежа без
     * причины, не знает, не записали её или не смогли определить.
     * `Unknown` — это «не определено», и ровно так дело и обстоит.
     */
    deathReason: 'Unknown',
  })
}

/* ------------------------------------------------------------------ *
 *  Проверка стельности                                               *
 * ------------------------------------------------------------------ */

export type PregnancyCheckInput = {
  /** Номер осеменения: проверка живёт при нём, своей записи у неё нет. */
  id: number
  animal: AnimalInput
  date: string
  /** Название результата из справочника — разбирается по смыслу. */
  result: string | null
  updatedAt: string | null
}

/**
 * Результат из нашего справочника в перечисление стандарта.
 *
 * Справочник результатов осеменения ведётся строками и пополняется
 * зоотехниками, поэтому разбор идёт по вхождению слова, а не по коду.
 * Это грубо, и грубость здесь допустима ровно потому, что неузнанное
 * даёт `Unknown` — то есть «не разобрали», а не выдуманный ответ.
 *
 * Обратное было бы хуже: сопоставление по порядку строк в справочнике
 * молча поехало бы при первой же вставке новой строки в середину.
 */
const pregnancyResult = (name: string | null): string => {
  const t = (name ?? '').toLowerCase()
  if (/двойн|многоплод/.test(t)) return 'Multiple'
  if (/стель|жерёб|положит/.test(t)) return 'Pregnant'
  if (/яловая|не стель|пуст|отрицат|прохолост/.test(t)) return 'Empty'
  return 'Unknown'
}

export function adePregnancyCheck(p: PregnancyCheckInput): AdeEvent & Record<string, unknown> {
  return adeClean({
    resourceType: 'icarReproPregnancyCheckEventResource',
    meta: adeMeta({ sourceId: `${p.id}-pc`, modified: p.updatedAt ?? p.date }),
    location: locationOf(p.animal.ownerId),
    id: `${p.id}-pc`,
    animal: animalIdentifier(p.animal),
    eventDateTime: adeDateTime(p.date),
    result: pregnancyResult(p.result),
    /*
     * Метод диагностики не записан. Не подставляем `Palpation`: он
     * распространён, но это утверждение о том, как проверяли, а мы
     * не знаем. Незаполненное необязательное поле честнее правдоподобного.
     */
  })
}
