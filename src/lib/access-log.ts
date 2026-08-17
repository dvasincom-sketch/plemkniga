import type { BasePayload } from 'payload'
import type { AccessScope } from '@/lib/dictionaries'

/**
 * Запись просмотра карточки и счёт уникальных.
 *
 * Уникальным считается хозяйство, а не человек и не заход: на одну пару
 * «животное + организация» приходится одна строка, и число уникальных
 * просмотров равно числу строк. Разбор — `src/collections/AccessViews.ts`.
 *
 * Запись идёт **после** отдачи страницы (`after()` в карточке): одно
 * обращение не должно стоить посетителю миллисекунд на горячем пути,
 * а сбой записи не должен ронять карточку. Тот же принцип, что у отметки
 * «ленту посмотрели».
 */

/**
 * Через сколько возвращение считается новым заходом.
 *
 * Полчаса выбраны из того, что переключение вкладок карточки — это один
 * взгляд на одно животное, а не четыре обращения: каждая вкладка
 * отдельный GET, и без окна счётчик заходов считал бы клики по вкладкам.
 * Возвращение назавтра — уже другой разговор, и оно считается.
 */
const SESSION_WINDOW_MS = 30 * 60 * 1000

export type ViewContext = {
  animalId: number
  ownerId: number | null
  viewerOrgId: number | null
  viewerUserId: number | string | null
  /** Есть ли грант, по которому открылось. Пусто — обычный просмотр. */
  grantId?: number | null
  scopes?: AccessScope[]
  /** Смотрит сотрудник Ассоциации. */
  isAssociation?: boolean
}

/**
 * Кого не считаем — и почему именно этих.
 *
 * Себя: «моё хозяйство смотрело мою корову» не сведение, а шум.
 * Анонимов: их не по чему опознать, а опознавать по cookie или адресу —
 * слежка за посетителем, на которую мы не подписывались; лучше меньшее
 * число, которое означает ровно то, что написано.
 * Ассоциацию: она смотрит по долгу службы, и её визиты в счётчике
 * «сколько хозяйств заинтересовалось» сбивают ответ.
 */
const shouldSkip = (c: ViewContext): boolean =>
  !c.ownerId ||
  !c.viewerOrgId ||
  c.viewerOrgId === c.ownerId ||
  Boolean(c.isAssociation)

export async function recordAnimalView(payload: BasePayload, c: ViewContext): Promise<void> {
  if (shouldSkip(c)) return

  const now = new Date()

  try {
    const existing = await payload.find({
      collection: 'access-views',
      where: {
        and: [{ animal: { equals: c.animalId } }, { viewerOrg: { equals: c.viewerOrgId } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const row = existing.docs[0] as
      | { id: number; at?: string | null; sessions?: number | null }
      | undefined

    if (!row) {
      await payload.create({
        collection: 'access-views',
        data: {
          animal: c.animalId,
          viewerOrg: c.viewerOrgId,
          owner: c.ownerId,
          grant: c.grantId ?? null,
          viewer: c.viewerUserId ?? null,
          scopes: c.scopes ?? [],
          firstAt: now.toISOString(),
          at: now.toISOString(),
          sessions: 1,
        } as never,
        overrideAccess: true,
      })
    } else {
      const last = row.at ? Date.parse(row.at) : 0
      const isNewSession = !Number.isFinite(last) || now.getTime() - last > SESSION_WINDOW_MS

      await payload.update({
        collection: 'access-views',
        id: row.id,
        data: {
          at: now.toISOString(),
          sessions: (row.sessions ?? 1) + (isNewSession ? 1 : 0),
          grant: c.grantId ?? null,
          viewer: c.viewerUserId ?? null,
          scopes: c.scopes ?? [],
        } as never,
        overrideAccess: true,
      })
    }

    /*
     * `lastSeenAt` у гранта — копия ради списка выданного.
     *
     * Вкладка «Доступы» показывает «последний просмотр» в каждой строке.
     * Без копии на каждую строку списка пришёлся бы запрос в журнал —
     * запрос на запрос, ровно то, чего избегают денормализацией.
     */
    if (c.grantId) {
      await payload.update({
        collection: 'access-grants',
        id: c.grantId,
        data: { lastSeenAt: now.toISOString() },
        overrideAccess: true,
      })
    }
  } catch {
    /*
     * Молча. Запись о просмотре не стоит того, чтобы ронять карточку
     * или оставлять в логе строку на каждое открытие: она делается после
     * отдачи страницы, и человек к этому моменту уже всё видит.
     */
  }
}

/** Сколько хозяйств смотрело эту карточку за всё время. */
export async function uniqueViews(payload: BasePayload, animalId: number): Promise<number> {
  try {
    const res = await payload.count({
      collection: 'access-views',
      where: { animal: { equals: animalId } },
      overrideAccess: true,
    })
    return res.totalDocs ?? 0
  } catch {
    return 0
  }
}
