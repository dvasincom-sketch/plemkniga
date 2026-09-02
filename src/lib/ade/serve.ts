import type { Payload, Where } from 'payload'
import { isAssociationUser } from '@/lib/association'
import { checkRfid } from '@/lib/aiid'
import { SCHEME, type AdeCollection } from '@/lib/ade/core'
import {
  adeAnimal,
  adeBreedingValue,
  adeInsemination,
  adeParturition,
  adeTestDayResult,
  adeTypeClassification,
  adeWeight,
  type AnimalInput,
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
  /** Синхронизация: отдать только изменённое после указанного момента. */
  modifiedSince?: string
}

export const parseAdeQuery = (url: URL): AdeQuery => {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const raw = Number.parseInt(url.searchParams.get('pageSize') ?? '', 10)
  const pageSize = Math.min(ADE_PAGE_MAX, raw > 0 ? raw : ADE_PAGE_DEFAULT)

  const since = url.searchParams.get('modifiedSince')
  const parsed = since ? new Date(since) : null

  return {
    page,
    pageSize,
    modifiedSince: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined,
  }
}

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

async function load(
  payload: Payload,
  collection: string,
  orgId: number,
  q: AdeQuery,
  depth: number,
): Promise<Loaded> {
  const and: Where[] = [ownerWhere(collection, orgId)]
  if (q.modifiedSince) and.push({ updatedAt: { greater_than: q.modifiedSince } })

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

export async function serveAdeCollection(
  payload: Payload,
  name: AdeCollectionName,
  orgId: number,
  q: AdeQuery,
): Promise<AdeCollection<Record<string, unknown>>> {
  const page = <T>(items: T[], total: number): AdeCollection<T> => ({
    view: {
      totalItems: total,
      pageSize: q.pageSize,
      currentPage: q.page,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
    member: items,
  })

  switch (name) {
    case 'animals': {
      const { docs, total } = await load(payload, 'animals', orgId, q, 1)
      return page(docs.map((d) => adeAnimal(animalInput(d))), total)
    }

    case 'test-day-results': {
      const { docs, total } = await load(payload, 'milk-tests', orgId, q, 1)
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
      const { docs, total } = await load(payload, 'calvings', orgId, q, 1)
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
      const { docs, total } = await load(payload, 'inseminations', orgId, q, 1)
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
      const { docs, total } = await load(payload, 'animal-exteriors', orgId, q, 1)
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
      const { docs, total } = await load(payload, 'weighings', orgId, q, 1)
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
      const { docs, total } = await load(payload, 'index-values', orgId, q, 1)
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
