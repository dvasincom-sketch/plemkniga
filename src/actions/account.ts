'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'

export type FormState = { error?: string; message?: string }

const orgOf = (user: { organization?: unknown }) =>
  typeof user.organization === 'object' && user.organization
    ? (user.organization as { id: number }).id
    : (user.organization as number | undefined)

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const get = (k: string) => String(formData.get(k) || '').trim()
  const payload = await getClient()

  try {
    await payload.update({
      collection: 'users',
      id: user.id,
      overrideAccess: true,
      data: {
        lastName: get('lastName') || user.lastName,
        firstName: get('firstName') || user.firstName,
        middleName: get('middleName') || undefined,
        phone: get('phone') || undefined,
        position: get('position') || undefined,
      },
    })

    const orgId = orgOf(user)
    if (orgId && get('orgName')) {
      await payload.update({
        collection: 'organizations',
        id: orgId,
        overrideAccess: true,
        data: {
          name: get('orgName'),
          inn: get('inn') || undefined,
          address: get('address') || undefined,
          phone: get('orgPhone') || undefined,
        },
      })
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось сохранить' }
  }

  revalidatePath('/account')
  return { message: 'Изменения сохранены' }
}

/** Массовое включение/выключение публичного показа стада. */
export async function setHerdVisibilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }
  const orgId = orgOf(user)
  if (!orgId) return { error: 'У пользователя не заполнена организация' }

  const visible = formData.get('publicVisible') === 'on'
  const details = formData.get('publicDetails') === 'on'

  const payload = await getClient()
  const res = await payload.update({
    collection: 'animals',
    where: { owner: { equals: orgId } },
    overrideAccess: true,
    data: { publicVisible: visible, publicDetails: visible && details },
  })

  revalidatePath('/account')
  revalidatePath('/')
  return { message: `Обновлено записей: ${res.docs.length}` }
}
