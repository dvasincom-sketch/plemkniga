import type { Payload, Where } from 'payload'
import { isAssociationUser } from '@/lib/association'
import { checkRfid } from '@/lib/aiid'
import { SCHEME, type AdeCollection } from '@/lib/ade/core'
import {
  adeAnimal,
  adeArrival,
  adeBreedingValue,
  adeDeath,
  adeDeparture,
  adeInsemination,
  adeParturition,
  adePregnancyCheck,
  adeTestDayResult,
  adeTypeClassification,
  adeWeight,
  type AnimalInput,
  type MovementInput,
} from '@/lib/ade/resources'
import type { User } from '@/payload-types'

/**
 * Выдача ресурсов ADE: чтение книги и сборка страницы ответа.
 *
 * ## Почему только чтение
 *
 * В спецификации у большинства коллекций есть и POST. Приём чужих данных —
 * отдельная работа с другой ценой ошибки: запись, пришедшая снаружи,
 * должна пройти те же полсотни проверок, что и введённая руками, иначе
 * обмен станет дырой, через которую в книгу попадёт то, чего в неё
 * не пускают через форму. Открыть POST раньше, чем это сделано, значило бы
 * обменять достоверность книги на галочку в списке возможностей.
 *
 * Отдача при этом полезна сама по себе и уже сегодня: по ней чужая система
 * может сверить наш ответ со схемой и убедиться, что мы говорим на общем
 * языке.
 *
 * ## Почему выдача идёт от лица пользователя
 *
 * Каждая коллекция сужается по владельцу, и сужение берётся не из адреса,
 * а из того, кто спрашивает. Локация в адресе задаёт, о каком хозяйстве
 * речь; право её открыть проверяется отдельно. Иначе достаточно было бы
 * подставить чужой номер в адрес, чтобы прочитать чужое стадо.
 */

/*
 * Список коллекций переехал в `core.ts` и отсюда только переизлучается.
 *
 * Причина не в опрятности. Этот файл ходит в базу и тянет за собой
 * весь Payload; всякий, кому нужен просто перечень имён — проверка
 * разбора, описание интерфейса, страница соответствия, — поднимал вместе
 * с ним подключение к базе. Дешёвая проверка становилась дорогой
 * и переставала запускаться.
 *
 * Переизлучение оставлено ради тех, кто уже берёт список отсюда:
 * менять десяток мест ради переезда одной константы дороже, чем
 * оставить одну строку.
 */
export { ADE_COLLECTIONS, isAdeCollection, type AdeCollectionName } from '@/lib/ade/core'

/* Для собственного употребления в этом файле — переизлучение типа не вводит имя. */
import type { AdeCollectionName } from '@/lib/ade/core'


/*
 * Разбор строки запроса переехал в `query.ts` и отсюда переизлучается.
 *
 * Причина не в опрятности, а та же, что у списка коллекций: этот файл
 * тянет весь Payload, а разбор адреса нужен и прогону, и описанию
 * интерфейса, которым база незачем.
 */
export {
  ADE_PAGE_DEFAULT,
  ADE_PAGE_MAX,
  DATE_FIELD,
  halfAnimalPair,
  parseAdeQuery,
  type AdeQuery,
} from '@/lib/ade/query'

import { DATE_FIELD, type AdeQuery } from '@/lib/ade/query'

/** Плоское животное из документа Payload — вход для отображения. */
type Rel = { id?: number; identNumber?: string | null; name?: string | null } | number | null | undefined

const relOf = (v: Rel) => (v && typeof v === 'object' ? v : null)

export function animalInput(doc: Record<string, unknown>): AnimalInput {
  const fgias = doc.fgias as { baseUuid?: string | null } | undefined
  const alt = doc.altIds as
    | { chipNumber?: string | null; internationalId?: string | null }
    | undefined
  /*
   * Код породы лежит в справочнике под именем `whffCode`, и это тот же
   * трёхбуквенный код, который ведёт Interbull для ICAR: HOL, JER, AYR.
   * Два имени у одного кода — наследство того, что первым его спросил
   * WHFF; переименовывать поле ради ясности значило бы тронуть загрузки
   * и выгрузки ради подписи.
   *
   * До этой правки порода не уезжала в обмен **никогда**: отображение
   * ждало `breedCode`, а собиравший вход его не заполнял. Ошибка тихая —
   * необязательное поле, которого просто нет, выглядит как животное
   * без указанной породы.
   */
  const breed = doc.breed as { whffCode?: string | null } | number | null | undefined
  const owner = doc.owner as { id?: number } | number | null | undefined
  const father = relOf(doc.father as Rel)
  const mother = relOf(doc.mother as Rel)

  return {
    id: Number(doc.id),
    identNumber: (doc.identNumber as string | null) ?? null,
    uuid: (doc.uuid as string | null) ?? null,
    fgiasBaseUuid: fgias?.baseUuid ?? null,
    /*
     * Радиометка уезжает только если она похожа на метку: пятнадцать
     * цифр с правдоподобным кодом страны или изготовителя. В поле
     * `chipNumber` за годы попадало всякое — инвентарные номера,
     * обрывки, пометки, — и отдать это под схемой `std.iso.11785`
     * значило бы объявить чужой системе, что у нас есть метка,
     * которой нет.
     */
    rfid: checkRfid(alt?.chipNumber).ok ? (alt?.chipNumber ?? null) : null,
    internationalId: alt?.internationalId ?? null,
    breedCode:
      breed && typeof breed === 'object' ? (breed.whffCode?.trim().toUpperCase() ?? null) : null,
    name: (doc.name as string | null) ?? null,
    nameLatin: (doc.nameLatin as string | null) ?? null,
    sex: (doc.sex as AnimalInput['sex']) ?? null,
    state: (doc.state as AnimalInput['state']) ?? null,
    birthDate: (doc.birthDate as string | null) ?? null,
    ageGroup: (doc.ageGroup as string | null) ?? null,
    ownerId: typeof owner === 'object' && owner ? (owner.id ?? null) : ((owner as number) ?? null),
    updatedAt: (doc.updatedAt as string | null) ?? null,
    createdAt: (doc.createdAt as string | null) ?? null,
    fatherIdentNumber: father?.identNumber ?? null,
    fatherName: father?.name ?? null,
    motherIdentNumber: mother?.identNumber ?? null,
    motherName: mother?.name ?? null,
  }
}

/**
 * Отбор по владельцу.
 *
 * У событий владелец лежит не в самой записи, а у животного, поэтому
 * условие идёт по связи. Дороже прямого поля, но заводить у каждого
 * события копию владельца ради обмена значило бы завести шестую копию
 * того же факта — и шестое место, где он может разойтись.
 */
const ownerWhere = (collection: string, orgId: number): Where =>
  collection === 'animals'
    ? { owner: { equals: orgId } }
    : collection === 'index-values'
      ? { owner: { equals: orgId } }
      : { 'animal.owner': { equals: orgId } }

type Loaded = { docs: Record<string, unknown>[]; total: number }

/**
 * Условия отбора, общие для всех коллекций.
 *
 * Одна функция на все коллекции, а не по условию в каждой ветке: фильтр,
 * забытый в одной из одиннадцати, — это молча отданные лишние данные,
 * и заметит это не тот, кто писал, а партнёр, у которого выборка
 * не сходится.
 *
 * `from` включается, `to` — нет: так задано стандартом, и на границе
 * суток соседние отрезки не перекрываются.
 */
function filters(name: AdeCollectionName, q: AdeQuery, animalId: number | null): Where[] {
  const and: Where[] = []

  if (q.modifiedFrom) and.push({ updatedAt: { greater_than_equal: q.modifiedFrom } })
  if (q.modifiedTo) and.push({ updatedAt: { less_than: q.modifiedTo } })

  const dateField = DATE_FIELD[name]
  if (dateField) {
    if (q.dateFrom) and.push({ [dateField]: { greater_than_equal: q.dateFrom } })
    if (q.dateTo) and.push({ [dateField]: { less_than: q.dateTo } })
  }

  /*
   * Отбор по животному ложится на разные поля: у самого животного это
   * его собственный ключ, у события — связь. Промах здесь означал бы
   * пустую выдачу вместо событий, и клиент решил бы, что записей нет.
   */
  if (animalId !== null) {
    and.push(name === 'animals' ? { id: { equals: animalId } } : { animal: { equals: animalId } })
  }

  return and
}

/**
 * Наш номер животного по паре «схема + идентификатор».
 *
 * Схемы ровно те, под которыми мы животных отдаём: иначе получилось бы,
 * что забрать данные можно, а отобрать по тому же номеру нельзя.
 * Две находки — отказ, а не «возьмём первую»: одинаковый номер у двух
 * животных одного хозяйства значит, что книга уже противоречива,
 * и выбирать за человека здесь нельзя.
 */
export async function findAnimalId(
  payload: Payload,
  ident: { scheme: string; id: string },
  orgId: number,
): Promise<number | null> {
  const field =
    ident.scheme === SCHEME.animal
      ? 'identNumber'
      : ident.scheme === SCHEME.accounting
        ? 'accountingNumber'
        : ident.scheme === SCHEME.iso11785
          ? 'altIds.chipNumber'
          : ident.scheme === SCHEME.fgias
            ? 'fgias.baseUuid'
            : null

  if (!field) return null

  const { docs } = await payload.find({
    collection: 'animals',
    where: { and: [{ [field]: { equals: ident.id } }, { owner: { equals: orgId } }] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })

  return docs.length === 1 ? Number(docs[0]!.id) : null
}


async function load(
  payload: Payload,
  name: AdeCollectionName,
  collection: string,
  orgId: number,
  q: AdeQuery,
  depth: number,
  animalId: number | null = null,
): Promise<Loaded> {
  const and: Where[] = [ownerWhere(collection, orgId), ...filters(name, q, animalId)]

  const res = await payload.find({
    collection: collection as never,
    where: { and },
    limit: q.pageSize,
    page: q.page,
    depth,
    sort: 'id',
    overrideAccess: true,
  })

  return { docs: res.docs as Record<string, unknown>[], total: res.totalDocs ?? 0 }
}

/** Достать животное из связи события; при `depth: 1` оно приходит объектом. */
const animalOf = (doc: Record<string, unknown>): AnimalInput | null => {
  const a = doc.animal
  return a && typeof a === 'object' ? animalInput(a as Record<string, unknown>) : null
}

/**
 * Перемещения нужной стороны.
 *
 * `in` — то, что пришло в хозяйство; `out` — то, что ушло; `death` —
 * падёж. Падёж выделен отдельно, потому что в стандарте это отдельный
 * ресурс, а не разновидность выбытия: у гибели свои поля — причина,
 * способ, утилизация, — и складывать её с продажей значило бы
 * потерять их все.
 *
 * Выбраковка при этом остаётся выбытием со `Slaughter`: животное ушло
 * на убой живым, и это перемещение, а не гибель на ферме.
 */
async function loadMovements(
  payload: Payload,
  orgId: number,
  q: AdeQuery,
  side: 'in' | 'out' | 'death',
  animalId: number | null = null,
): Promise<Loaded> {
  const and: Where[] = [
    side === 'in'
      ? { and: [{ to: { equals: orgId } }, { kind: { not_equals: 'death' } }] }
      : side === 'out'
        ? { and: [{ from: { equals: orgId } }, { kind: { not_equals: 'death' } }] }
        : { and: [{ from: { equals: orgId } }, { kind: { equals: 'death' } }] },
  ]

  /*
   * Коллекция перемещений одна на три вида событий, и `collection`
   * в фильтрах поэтому подставляется по стороне: у поступления,
   * выбытия и падежа поле даты одно и то же, но пусть это будет видно
   * из вызова, а не подразумевается.
   */
  and.push(...filters(side === 'death' ? 'deaths' : side === 'in' ? 'arrivals' : 'departures', q, animalId))

  const res = await payload.find({
    collection: 'movements',
    where: { and },
    limit: q.pageSize,
    page: q.page,
    depth: 1,
    sort: 'id',
    overrideAccess: true,
  })

  return { docs: res.docs as unknown as Record<string, unknown>[], total: res.totalDocs ?? 0 }
}

/** Собрать вход перемещения и отдать его нужному отображению. */
const movementOf = (
  d: Record<string, unknown>,
  make: (m: MovementInput) => Record<string, unknown>,
): Record<string, unknown>[] => {
  const animal = animalOf(d)
  if (!animal) return []

  const side = (v: unknown): number | null => {
    if (v && typeof v === 'object') return Number((v as { id?: number }).id) || null
    return typeof v === 'number' ? v : null
  }

  return [
    make({
      id: Number(d.id),
      animal,
      date: String(d.date),
      kind: String(d.kind ?? ''),
      fromId: side(d.from),
      toId: side(d.to),
      updatedAt: (d.updatedAt as string | null) ?? null,
    }),
  ]
}

export async function serveAdeCollection(
  payload: Payload,
  name: AdeCollectionName,
  orgId: number,
  q: AdeQuery,
): Promise<AdeCollection<Record<string, unknown>>> {
  /*
   * Животное разрешается один раз на запрос, а не в каждой ветке.
   *
   * `animal-id` приходит номером в чужой системе счисления, и превратить
   * его в наш ключ — отдельный запрос к базе. Сделать это внутри ветки
   * значило бы повторить его одиннадцать раз в коде и один раз
   * в каждом ответе.
   *
   * `null` при заданном фильтре означает «такого животного здесь нет»,
   * и выдача будет пустой — это верно: спросили о животном, которого
   * в этой локации не существует.
   */
  const animalId = q.animal ? await findAnimalId(payload, q.animal, orgId) : null

  const page = <T>(items: T[], total: number): AdeCollection<T> => ({
    view: {
      totalItems: total,
      pageSize: q.pageSize,
      currentPage: q.page,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
    member: items,
  })

  /*
   * Спросили о животном, которого здесь нет, — отдаём пусто.
   *
   * Раньше это подразумевалось: `animalId` оставался `null`, а `null`
   * ниже означает «фильтра по животному нет». Два разных обстоятельства
   * — «не спрашивали» и «спрашивали, не нашли» — сходились в одно
   * значение, и второе молча превращалось в первое: на вопрос о единственном
   * животном отдавалось всё стадо.
   *
   * Живой прогон это и показал: отбор по выдуманному номеру вернул
   * 8947 записей вместо нуля. Ошибки не было ни у кого — ответ верный
   * по форме, просто не о том, о чём спросили; клиент, доверившийся ему,
   * приписал бы чужие удои своей корове.
   */
  if (q.animal && animalId === null) return page([], 0)

  switch (name) {
    case 'animals': {
      const { docs, total } = await load(payload, 'animals', 'animals', orgId, q, 1, animalId)
      return page(docs.map((d) => adeAnimal(animalInput(d))), total)
    }

    case 'test-day-results': {
      const { docs, total } = await load(payload, 'test-day-results', 'milk-tests', orgId, q, 1, animalId)
      const out = docs.flatMap((d) => {
        const animal = animalOf(d)
        if (!animal) return []
        return [
          adeTestDayResult({
            id: Number(d.id),
            animal,
            date: String(d.date),
            milk: (d.dailyYield as number | null) ?? null,
            fat: (d.fatPercent as number | null) ?? null,
            protein: (d.proteinPercent as number | null) ?? null,
            somaticCells: (d.somaticCells as number | null) ?? null,
            updatedAt: (d.updatedAt as string | null) ?? null,
          }),
        ]
      })
      return page(out, total)
    }

    case 'parturitions': {
      const { docs, total } = await load(payload, 'parturitions', 'calvings', orgId, q, 1, animalId)
      const out = docs.flatMap((d) => {
        const animal = animalOf(d)
        /*
         * Аборты и запуски в этой коллекции не место: `parturitions` —
         * это отёлы. У ADE для аборта свой ресурс, и подменять одно
         * другим значило бы завысить число отёлов у каждого потребителя.
         */
        if (!animal || (d.eventType && d.eventType !== 'calving')) return []
        return [
          adeParturition({
            id: Number(d.id),
            animal,
            date: String(d.date),
            number: (d.number as number | null) ?? null,
            ease: (d.ease as 'easy' | 'assisted' | 'hard' | null) ?? null,
            liveHeifers: (d.liveHeifers as number | null) ?? null,
            liveBulls: (d.liveBulls as number | null) ?? null,
            stillborn: (d.stillborn as number | null) ?? null,
            updatedAt: (d.updatedAt as string | null) ?? null,
          }),
        ]
      })
      return page(out, total)
    }

    case 'inseminations': {
      const { docs, total } = await load(payload, 'inseminations', 'inseminations', orgId, q, 1, animalId)
      const out = docs.flatMap((d) => {
        const animal = animalOf(d)
        if (!animal) return []
        const bull = relOf(d.bull as Rel)
        return [
          adeInsemination({
            id: Number(d.id),
            animal,
            date: String(d.date),
            attemptNumber: (d.attemptNumber as number | null) ?? null,
            method: (d.method as string | null) ?? null,
            bullIdentNumber: bull?.identNumber ?? null,
            bullName: bull?.name ?? null,
            technician: (d.technician as string | null) ?? null,
            updatedAt: (d.updatedAt as string | null) ?? null,
          }),
        ]
      })
      return page(out, total)
    }

    case 'type-classifications': {
      const { docs, total } = await load(payload, 'type-classifications', 'animal-exteriors', orgId, q, 1, animalId)
      const out = docs.flatMap((d) => {
        const animal = animalOf(d)
        if (!animal) return []
        return [
          adeTypeClassification({
            id: Number(d.id),
            animal,
            assessedAt: String(d.assessedAt ?? d.date),
            assessor: (d.assessor as string | null) ?? null,
            linear: d as Record<string, number | null | undefined>,
            composite: d as Record<string, number | null | undefined>,
            updatedAt: (d.updatedAt as string | null) ?? null,
          }),
        ]
      })
      return page(out, total)
    }

    case 'weights': {
      const { docs, total } = await load(payload, 'weights', 'weighings', orgId, q, 1, animalId)
      const out = docs.flatMap((d) => {
        const animal = animalOf(d)
        if (!animal || typeof d.weight !== 'number') return []
        return [
          adeWeight({
            id: Number(d.id),
            animal,
            date: String(d.date),
            weight: d.weight,
            updatedAt: (d.updatedAt as string | null) ?? null,
          }),
        ]
      })
      return page(out, total)
    }

    case 'breeding-values': {
      const { docs, total } = await load(payload, 'breeding-values', 'index-values', orgId, q, 1, animalId)
      const out = docs.flatMap((d) => {
        const animal = animalOf(d)
        if (!animal) return []
        return [
          adeBreedingValue({
            animal,
            profileKey: String(d.profileKey),
            profileName: String(d.profileName ?? d.profileKey),
            baseVersion: String(d.baseVersion ?? ''),
            value: Number(d.value ?? 0),
            reliability: (d.reliability as number | null) ?? null,
            computedAt: (d.computedAt as string | null) ?? null,
          }),
        ]
      })
      return page(out, total)
    }
    /* ---------------------------------------------------------- *
     *  Движение                                                  *
     * ---------------------------------------------------------- */

    /*
     * У перемещений владелец берётся не от животного, а от самой записи,
     * и это единственное место, где так.
     *
     * Причина в том, что перемещение — событие про смену владельца.
     * Спросив «чьё животное», мы получили бы нового владельца и отдали
     * бы продажу только покупателю: у продавца в книге не осталось бы
     * следа, что корова у него была. Спрашивать надо стороны сделки,
     * а их две, и каждая видит свою.
     */
    case 'arrivals': {
      const { docs, total } = await loadMovements(payload, orgId, q, 'in', animalId)
      return page(docs.flatMap((d) => movementOf(d, (m) => adeArrival(m))), total)
    }

    case 'departures': {
      const { docs, total } = await loadMovements(payload, orgId, q, 'out', animalId)
      return page(docs.flatMap((d) => movementOf(d, (m) => adeDeparture(m))), total)
    }

    case 'deaths': {
      const { docs, total } = await loadMovements(payload, orgId, q, 'death', animalId)
      return page(docs.flatMap((d) => movementOf(d, (m) => adeDeath(m))), total)
    }

    /* ---------------------------------------------------------- *
     *  Проверка стельности                                       *
     * ---------------------------------------------------------- */

    /*
     * Своей записи у проверки нет: она живёт при осеменении двумя полями —
     * дата теста и результат. Отдаются только те осеменения, у которых
     * дата теста проставлена: осеменение без теста — это не проверка
     * с неизвестным исходом, а проверка, которой не было.
     */
    case 'pregnancy-checks': {
      const { docs, total } = await load(payload, 'pregnancy-checks', 'inseminations', orgId, q, 2, animalId)
      const out = docs.flatMap((d) => {
        const animal = animalOf(d)
        if (!animal || !d.pregnancyCheckDate) return []
        const result = d.result as { name?: string | null } | number | null | undefined
        return [
          adePregnancyCheck({
            id: Number(d.id),
            animal,
            date: String(d.pregnancyCheckDate),
            result: result && typeof result === 'object' ? (result.name ?? null) : null,
            updatedAt: (d.updatedAt as string | null) ?? null,
          }),
        ]
      })
      return page(out, total)
    }

  }
}

/**
 * Какие хозяйства волен открыть этот пользователь.
 *
 * Сотрудник Ассоциации — все; хозяйство — только своё. Список возвращается
 * идентификаторами, а не признаком «можно всё»: вызывающему проще
 * проверить вхождение, чем помнить про две ветки, и забыть про вторую
 * ветку в новом обработчике невозможно.
 */
export async function allowedLocations(payload: Payload, user: User): Promise<number[]> {
  /*
   * Кто такой «сотрудник Ассоциации», решает `isAssociationUser`, а не
   * сравнение с ролью здесь. Роль называется `expert`, а не `association`,
   * и первая редакция этого места сравнивала с несуществующим значением —
   * поймал только компилятор. Общее объявление снимает вопрос вовсе.
   */
  if (isAssociationUser(user)) {
    const orgs = await payload.find({
      collection: 'organizations',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    return orgs.docs.map((o) => Number(o.id))
  }

  const org = user.organization
  const id = typeof org === 'object' && org ? Number(org.id) : Number(org)
  return Number.isFinite(id) ? [id] : []
}

/** Локация из адреса. Схема обязана быть нашей: чужую мы не обслуживаем. */
export const parseLocation = (scheme: string, id: string): number | null => {
  if (scheme !== SCHEME.location) return null
  const n = Number.parseInt(id, 10)
  return Number.isFinite(n) ? n : null
}
