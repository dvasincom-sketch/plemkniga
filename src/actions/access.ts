'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { assertCan } from '@/lib/roles'
import { relId } from '@/lib/visibility'
import { ACCESS_REQUEST_PURPOSES } from '@/collections/AccessRequests'
import { ACCESS_SCOPES, type AccessScope } from '@/lib/dictionaries'
import { forgetGrants } from '@/lib/grants'

export type AccessFormState = { error?: string; message?: string }

type Purpose = (typeof ACCESS_REQUEST_PURPOSES)[number]['value']
const PURPOSES = new Set<string>(ACCESS_REQUEST_PURPOSES.map((p) => p.value))

const SCOPE_VALUES = new Set<string>(ACCESS_SCOPES.map((s) => s.value))
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Запрос доступа к закрытой карточке.
 *
 * Отправитель и владелец не берутся из формы — их подставляет хук коллекции
 * по сессии и по самому животному. Форма отвечает только за цель и текст.
 */
export async function requestAccessAction(
  _prev: AccessFormState,
  formData: FormData,
): Promise<AccessFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Войдите в систему, чтобы отправить запрос' }

  const animalId = Number(formData.get('animal'))
  if (!Number.isFinite(animalId) || animalId <= 0) return { error: 'Животное не определено' }

  const purposeRaw = String(formData.get('purpose') || '')
  const purpose: Purpose = PURPOSES.has(purposeRaw) ? (purposeRaw as Purpose) : 'other'
  const comment = String(formData.get('comment') || '').trim()

  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((s) => SCOPE_VALUES.has(s)) as AccessScope[]

  if (scopes.length === 0) {
    return { error: 'Отметьте хотя бы одну область — иначе непонятно, что открывать' }
  }

  const payload = await getClient()

  try {
    // Второй запрос по тому же животному не нужен: он ничего не добавляет
    // владельцу, а в его ленте выглядит как напоминание, которое он
    // не просил
    const existing = await payload.find({
      collection: 'access-requests',
      where: { and: [{ animal: { equals: animalId } }, { requester: { equals: user.id } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const open = existing.docs[0] as { status?: string } | undefined
    if (open?.status === 'new') {
      return { message: 'Запрос уже отправлен — ждём решения хозяйства' }
    }
    /*
     * Прежде здесь стояла ещё одна остановка: «хозяйство уже открыло вам
     * доступ к этой записи». Она была верна, пока доступ был один на всех
     * и открывался целиком. С областями просить второй раз — обычное дело:
     * дали происхождение, а перед сделкой понадобилась продуктивность.
     * Отказ в такой просьбе выглядел бы поломкой.
     */

    await payload.create({
      collection: 'access-requests',
      // status обязателен по схеме; хук всё равно перезапишет его на 'new'
      data: { animal: animalId, purpose, comment, scopes, status: 'new' },
      user,
      overrideAccess: false,
    })
  } catch {
    return { error: 'Не удалось отправить запрос. Попробуйте ещё раз' }
  }

  revalidatePath(`/animals/${animalId}`)
  revalidatePath('/account/notifications')
  return { message: 'Запрос отправлен хозяйству' }
}

/**
 * Решение владельца по запросу: отказ или выданный грант.
 *
 * Раньше одобрение выставляло животному `publicVisible` и `publicDetails` —
 * то есть открывало карточку целиком, навсегда и всем посетителям книги,
 * а не тому, кто просил. Другой степени свободы у системы не было.
 * Теперь есть: решение создаёт запись в `access-grants` с областями,
 * охватом и сроком, а флаги животного не трогает вовсе.
 *
 * Флаги остаются тем, чем были, — решением владельца о том, что видно
 * **всем**. Грант отвечает на другой вопрос и живёт рядом.
 *
 * Разбор — `docs/tochechnyy-dostup.md`.
 */
export async function decideAccessAction(
  _prev: AccessFormState,
  formData: FormData,
): Promise<AccessFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const id = Number(formData.get('request'))
  const decision = String(formData.get('decision') || '')
  if (!Number.isFinite(id) || (decision !== 'approved' && decision !== 'declined')) {
    return { error: 'Некорректное решение' }
  }

  const response = String(formData.get('response') || '').trim()

  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((s) => SCOPE_VALUES.has(s)) as AccessScope[]

  const wholeHerd = String(formData.get('coverage') || '') === 'herd'

  /*
   * Срок приходит числом дней, а пустая строка означает «бессрочно».
   *
   * Заготовки в форме — это заготовки даты, а не отдельные состояния:
   * в базе лежит одно поле `expiresAt`. «До конца сделки» среди них нет
   * намеренно — система не может узнать, что сделка закончилась, и такое
   * состояние делало бы вид, будто обязанность отозвать выполняется сама.
   */
  const days = Number(formData.get('term'))
  const expiresAt =
    Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * DAY_MS).toISOString() : null

  if (decision === 'approved' && scopes.length === 0) {
    return { error: 'Отметьте хотя бы одну область — без неё грант ничего не открывает' }
  }

  const payload = await getClient()

  /*
   * Открыть данные наружу — право руководителя.
   *
   * Правило `accessRequestDecide` проверяет, что решает владелец
   * животного, но не смотрит на роль внутри хозяйства: наблюдатель,
   * которого позвали «просто посмотреть», мог одобрить запрос
   * и выдать грант на всё стадо. Здесь та же возможность `share`,
   * что и у ссылок на просмотр, — они про одно и то же.
   */
  const deniedShare = await assertCan(payload, user, 'share')
  if (deniedShare) return { error: deniedShare }

  try {
    /*
     * Смена состояния запроса идёт с правами пользователя: правило
     * `accessRequestDecide` пускает сюда только владельца животного
     * (и администратора). Дальше по коду это уже проверено.
     */
    const updated = await payload.update({
      collection: 'access-requests',
      id,
      data: { status: decision, response },
      user,
      overrideAccess: false,
      depth: 0,
    })

    if (decision === 'approved') {
      const animalId = relId((updated as { animal?: unknown }).animal)
      const owner = relId((updated as { owner?: unknown }).owner)
      const grantee = relId((updated as { requesterOrg?: unknown }).requesterOrg)

      if (!owner || !grantee) {
        return {
          error:
            'Не удалось определить, кому выдать доступ: у заявителя нет организации. Решение сохранено',
        }
      }

      await payload.create({
        collection: 'access-grants',
        data: {
          owner,
          grantee,
          // Пусто — открыто всё стадо владельца
          animal: wholeHerd ? null : animalId,
          scopes,
          expiresAt,
          request: id,
        },
        /*
         * С `overrideAccess: true`, но с пользователем: правило создания
         * у Payload ждёт булево и содержимое полей проверить не может,
         * а хук коллекции сверяет владельца с организацией выдающего
         * и не пустит открыть чужое. Пользователь передан именно затем,
         * чтобы хуку было с чем сверять и кого записать в `issuedBy`.
         */
        user,
        overrideAccess: true,
      })

      // Отзыв и выдача должны действовать сразу, а не через срок кэша
      forgetGrants(grantee)
      if (animalId) revalidatePath(`/animals/${animalId}`)
    }
  } catch {
    return { error: 'Не удалось сохранить решение' }
  }

  revalidatePath('/account/notifications')
  return {
    message:
      decision === 'approved'
        ? 'Доступ выдан заявителю. Запись осталась закрытой для остальных'
        : 'Отказ отправлен',
  }
}

/**
 * Отметка «ленту посмотрели».
 *
 * Непрочитанное считается по времени: всё, что случилось позже этой отметки.
 * Признака «прочитано» у самих записей нет и быть не должно — одно и то же
 * событие прочитано одним сотрудником хозяйства и не прочитано другим.
 *
 * Запись идёт в обход правил доступа: пользователь не имеет права править
 * себя целиком, но отметку о прочтении ставит только себе.
 */
export async function markNotificationsSeenAction(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return

  const payload = await getClient()
  const now = new Date().toISOString()

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { notifySeenAt: now },
      overrideAccess: true,
    })
  } catch {
    // Отметка о прочтении не стоит того, чтобы ронять страницу
  }
}
