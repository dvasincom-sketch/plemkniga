'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'

export type SubmissionState = { error?: string; message?: string }

const orgOf = (user: { organization?: unknown }) =>
  typeof user.organization === 'object' && user.organization
    ? (user.organization as { id: number }).id
    : (user.organization as number | undefined)

/**
 * Владелец соглашается с результатом проверки и разрешает публикацию данных.
 *
 * ТЗ, п. 1.6: смена статуса фиксируется в журнале с указанием, кто и когда
 * утвердил. После публикации животные организации получают уровень
 * достоверности 3 — «Верифицировано ассоциацией» (Таблица №4).
 */
export async function publishSubmissionAction(
  _prev: SubmissionState,
  formData: FormData,
): Promise<SubmissionState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Не указан пакет данных' }
  if (formData.get('agreed') !== 'on') {
    return { error: 'Отметьте согласие с результатом проверки' }
  }

  const payload = await getClient()

  const submission = await payload.findByID({
    collection: 'data-submissions',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if (!submission) return { error: 'Пакет данных не найден' }

  const orgId = orgOf(user)
  const subOrg =
    typeof submission.organization === 'object' && submission.organization
      ? submission.organization.id
      : submission.organization

  if (user.role !== 'admin' && subOrg !== orgId) {
    return { error: 'Пакет принадлежит другой организации' }
  }
  if (submission.status !== 'checked') {
    return { error: 'Публикация доступна только после проверки Ассоциацией' }
  }

  const now = new Date().toISOString()

  await payload.update({
    collection: 'data-submissions',
    id,
    overrideAccess: true,
    data: {
      status: 'accepted',
      consent: { agreed: true, agreedAt: now, publishedAt: now },
    },
  })

  // Данные опубликованы — поднимаем уровень достоверности стада до 3
  if (orgId) {
    await payload.update({
      collection: 'animals',
      where: { and: [{ owner: { equals: orgId } }, { trustLevel: { less_than: 3 } }] },
      overrideAccess: true,
      data: { trustLevel: 3, trustCheckedAt: now },
    })
  }

  revalidatePath('/account')
  revalidatePath(`/account/submissions/${id}`)
  return { message: 'Данные опубликованы' }
}
