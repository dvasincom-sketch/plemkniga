import type { Payload, Where } from 'payload'
import type { AccessRequest, DataSubmission, User } from '@/payload-types'
import { SUBMISSION_KINDS, SUBMISSION_STATUSES } from '@/collections/DataSubmissions'
import { ACCESS_REQUEST_PURPOSES } from '@/collections/AccessRequests'
import { relId } from './visibility'

/**
 * Лента уведомлений.
 *
 * Отдельной таблицы уведомлений нет — и не должно быть: она была бы копией
 * того, что и так лежит в запросах доступа и пакетах загрузки, и рано или
 * поздно разошлась бы с оригиналом. Лента собирается из самих записей
 * в момент показа.
 *
 * Отсюда и способ считать непрочитанное: у события не может быть признака
 * «прочитано», потому что у одного события несколько адресатов. Хранится
 * одна отметка на пользователя — когда он в последний раз открывал ленту, —
 * а новым считается всё, что случилось позже.
 */

export type NotificationKind = 'access-in' | 'access-out' | 'submission'

export type Notification = {
  id: string
  kind: NotificationKind
  /** ISO-дата события — по ней лента сортируется и считается непрочитанное. */
  at: string
  title: string
  text: string
  href?: string
  linkLabel?: string
  unread: boolean
  /** Требует решения пользователя, а не просто сообщает. */
  pending?: boolean
  /** Данные для формы решения — только у входящих запросов доступа. */
  request?: {
    id: number
    animalId: number | null
    animalLabel: string
    fromOrg: string
    fromPerson: string
    purpose: string
    /**
     * Цель как значение, а не подпись.
     *
     * Рядом уже лежит `purpose` — готовая строка для показа. Значение нужно
     * отдельно: по нему форма выдачи предлагает области доступа
     * (`SCOPES_BY_PURPOSE`). Разбирать подпись обратно в значение было бы
     * тем же самым, но хрупко: подпись меняют ради формулировки, и в этот
     * день предзаполнение молча перестало бы работать.
     */
    purposeValue: string
    comment?: string | null
  }
}

const label = (list: readonly { value: string; label: string }[], v?: string | null) =>
  list.find((o) => o.value === v)?.label ?? '—'

const nameOf = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const short = o.shortName ?? o.name
    if (typeof short === 'string' && short) return short
    const person = [o.lastName, o.firstName].filter((x) => typeof x === 'string' && x).join(' ')
    if (person) return person
    if (typeof o.email === 'string') return o.email
  }
  return '—'
}

const animalLabelOf = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.name === 'string' && o.name) return o.name
    if (o.identNumber) return `№ ${o.identNumber}`
  }
  return 'животному'
}

/** Подписи состояний запроса — вынесены, чтобы не тянуть коллекцию в клиент. */
const ACCESS_REQUEST_STATUS_LABELS = [
  { value: 'new', label: 'ожидает решения' },
  { value: 'approved', label: 'доступ открыт' },
  { value: 'declined', label: 'отказано' },
] as const

/** Пакеты, о которых есть что сказать: загруженный и «на проверке» — не новость. */
const REPORTABLE_SUBMISSIONS = ['checked', 'accepted', 'rejected']

const isAfter = (at: string, since: string | null): boolean => {
  if (!since) return true
  const a = Date.parse(at)
  const b = Date.parse(since)
  return Number.isFinite(a) && Number.isFinite(b) ? a > b : true
}

export async function loadNotifications(
  payload: Payload,
  user: User,
): Promise<{ items: Notification[]; unread: number }> {
  const orgId = relId(user.organization)
  const since = user.notifySeenAt ?? null

  const incomingWhere: Where = orgId
    ? { owner: { equals: orgId } }
    : { id: { equals: -1 } }

  const [incoming, outgoing, submissions] = await Promise.all([
    payload
      .find({
        collection: 'access-requests',
        where: incomingWhere,
        sort: '-createdAt',
        limit: 50,
        depth: 2,
        overrideAccess: true,
      })
      .catch(() => null),
    payload
      .find({
        collection: 'access-requests',
        where: { requester: { equals: user.id } },
        sort: '-createdAt',
        limit: 50,
        depth: 2,
        overrideAccess: true,
      })
      .catch(() => null),
    orgId
      ? payload
          .find({
            collection: 'data-submissions',
            where: {
              and: [
                { organization: { equals: orgId } },
                { status: { in: REPORTABLE_SUBMISSIONS } },
              ],
            },
            sort: '-updatedAt',
            limit: 50,
            depth: 1,
            overrideAccess: true,
          })
          .catch(() => null)
      : Promise.resolve(null),
  ])

  const items: Notification[] = []

  /* ------------------ Запросы доступа к моим животным ------------------ */
  for (const raw of (incoming?.docs ?? []) as AccessRequest[]) {
    const animalId = relId(raw.animal)
    const animalLabel = animalLabelOf(raw.animal)
    const fromOrg = raw.requesterOrg ? nameOf(raw.requesterOrg) : nameOf(raw.requester)
    const at = (raw.status === 'new' ? raw.createdAt : (raw.decidedAt ?? raw.updatedAt)) as string

    items.push({
      id: `access-in-${raw.id}`,
      kind: 'access-in',
      at,
      unread: isAfter(at, since),
      pending: raw.status === 'new',
      title:
        raw.status === 'new'
          ? `Запрос доступа к записи «${animalLabel}»`
          : `Запрос по «${animalLabel}»: ${label(ACCESS_REQUEST_STATUS_LABELS, raw.status)}`,
      text:
        raw.status === 'new'
          ? `${fromOrg} просит открыть подробности. Цель: ${label(ACCESS_REQUEST_PURPOSES, raw.purpose).toLowerCase()}.`
          : `Решение по запросу от ${fromOrg} принято.`,
      href: animalId ? `/animals/${animalId}` : undefined,
      linkLabel: 'Открыть запись',
      request:
        raw.status === 'new'
          ? {
              id: raw.id,
              animalId,
              animalLabel,
              fromOrg,
              fromPerson: nameOf(raw.requester),
              purpose: label(ACCESS_REQUEST_PURPOSES, raw.purpose),
              purposeValue: String(raw.purpose ?? 'other'),
              comment: raw.comment,
            }
          : undefined,
    })
  }

  /* --------------------- Ответы на мои запросы ------------------------- */
  for (const raw of (outgoing?.docs ?? []) as AccessRequest[]) {
    if (raw.status === 'new') continue
    const animalId = relId(raw.animal)
    const animalLabel = animalLabelOf(raw.animal)
    const at = (raw.decidedAt ?? raw.updatedAt) as string
    const approved = raw.status === 'approved'

    items.push({
      id: `access-out-${raw.id}`,
      kind: 'access-out',
      at,
      unread: isAfter(at, since),
      title: approved
        ? `Доступ к «${animalLabel}» открыт`
        : `Отказ в доступе к «${animalLabel}»`,
      text: approved
        ? `${nameOf(raw.owner)} открыл подробности записи — карточка доступна полностью.`
        : raw.response
          ? `${nameOf(raw.owner)}: ${raw.response}`
          : `${nameOf(raw.owner)} отказал в доступе без комментария.`,
      href: animalId ? `/animals/${animalId}` : undefined,
      linkLabel: approved ? 'Открыть карточку' : 'К записи',
    })
  }

  /* ---------------------- Пакеты загрузки данных ----------------------- */
  for (const raw of (submissions?.docs ?? []) as DataSubmission[]) {
    const at = (raw.review?.checkedAt ?? raw.updatedAt) as string
    const kind = label(SUBMISSION_KINDS, raw.kind)

    items.push({
      id: `submission-${raw.id}`,
      kind: 'submission',
      at,
      unread: isAfter(at, since),
      pending: raw.status === 'checked' && !raw.consent?.agreed,
      title: `Пакет ${raw.number ?? `#${raw.id}`}: ${label(SUBMISSION_STATUSES, raw.status)}`,
      text:
        raw.status === 'checked' && !raw.consent?.agreed
          ? `${kind}. Проверка завершена — данные попадут в книгу после вашего согласия.`
          : raw.review?.comment
            ? `${kind}. ${raw.review.comment}`
            : kind,
      href: '/account?tab=events',
      linkLabel: 'К событиям',
    })
  }

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  return { items, unread: items.filter((i) => i.unread).length }
}

/**
 * Счётчик для колокольчика в шапке.
 *
 * Считается отдельно и дёшево: шапка рисуется на каждой странице, и тянуть
 * ради цифры всю ленту с раскрытыми связями было бы расточительно.
 */
export async function countUnreadNotifications(payload: Payload, user: User): Promise<number> {
  const orgId = relId(user.organization)
  const since = user.notifySeenAt ?? null
  const newer: Where[] = since ? [{ updatedAt: { greater_than: since } }] : []

  try {
    const [incoming, outgoing, submissions] = await Promise.all([
      orgId
        ? payload.count({
            collection: 'access-requests',
            where: { and: [{ owner: { equals: orgId } }, ...newer] },
            overrideAccess: true,
          })
        : Promise.resolve({ totalDocs: 0 }),
      payload.count({
        collection: 'access-requests',
        where: {
          and: [
            { requester: { equals: user.id } },
            { status: { not_equals: 'new' } },
            ...newer,
          ],
        },
        overrideAccess: true,
      }),
      orgId
        ? payload.count({
            collection: 'data-submissions',
            where: {
              and: [
                { organization: { equals: orgId } },
                { status: { in: REPORTABLE_SUBMISSIONS } },
                ...newer,
              ],
            },
            overrideAccess: true,
          })
        : Promise.resolve({ totalDocs: 0 }),
    ])

    return incoming.totalDocs + outgoing.totalDocs + submissions.totalDocs
  } catch {
    // Колокольчик без цифры лучше, чем страница с ошибкой
    return 0
  }
}
