'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { ACCESS_REQUEST_PURPOSES } from '@/collections/AccessRequests'

export type AccessFormState = { error?: string; message?: string }

type Purpose = (typeof ACCESS_REQUEST_PURPOSES)[number]['value']
const PURPOSES = new Set<string>(ACCESS_REQUEST_PURPOSES.map((p) => p.value))

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
    if (open?.status === 'approved') {
      return { message: 'Хозяйство уже открыло вам доступ к этой записи' }
    }

    await payload.create({
      collection: 'access-requests',
      // status обязателен по схеме; хук всё равно перезапишет его на 'new'
      data: { animal: animalId, purpose, comment, status: 'new' },
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
 * Решение владельца по запросу.
 *
 * Открытие доступа — это не только смена состояния запроса: оно должно
 * что-то менять для заявителя. Пока у системы одна степень свободы —
 * публичность самой записи, поэтому «открыть» снимает замок с животного
 * целиком. Точечный доступ «одному хозяйству» появится вместе с журналом
 * прав; до тех пор честнее показать владельцу, что именно произойдёт.
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
  const payload = await getClient()

  try {
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
      if (animalId) {
        await payload.update({
          collection: 'animals',
          id: animalId,
          data: { publicVisible: true, publicDetails: true },
          overrideAccess: true,
        })
        revalidatePath(`/animals/${animalId}`)
      }
    }
  } catch {
    return { error: 'Не удалось сохранить решение' }
  }

  revalidatePath('/account/notifications')
  return {
    message: decision === 'approved' ? 'Доступ открыт, заявитель уведомлён' : 'Отказ отправлен',
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
