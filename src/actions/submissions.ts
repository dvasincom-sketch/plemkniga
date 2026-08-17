'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'

export type SubmissionState = { error?: string; message?: string }

const plural = (n: number, one: string, few: string, many: string) => {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}

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

  /*
   * Уровень достоверности поднимается записям пакета, а не всему стаду.
   *
   * Прежнее поведение выдавало «Верифицировано ассоциацией» каждому животному
   * организации, включая тех, кого в проверенном файле не было. Это ровно тот
   * случай, когда система обещает больше, чем знает: отметка проверки
   * не должна распространяться на непроверенное.
   */
  const ids = (submission.animals ?? [])
    .map((a) => (typeof a === 'object' && a ? a.id : a))
    .filter((v): v is number => typeof v === 'number')

  let raised = 0
  if (ids.length) {
    const res = await payload.update({
      collection: 'animals',
      where: { and: [{ id: { in: ids } }, { trustLevel: { less_than: 3 } }] },
      overrideAccess: true,
      data: { trustLevel: 3, trustCheckedAt: now },
      // Публикация пакета — не правка карточки: её след в самом пакете
      context: { skipJournal: true },
    })
    raised = res.docs?.length ?? 0
  }

  revalidatePath('/account')
  revalidatePath(`/account/submissions/${id}`)

  if (!ids.length) {
    return {
      message:
        'Данные опубликованы. Записи к пакету не привязаны, поэтому уровень достоверности не менялся — так бывает у пакетов, заведённых до появления связи.',
    }
  }
  return {
    message: `Данные опубликованы. Уровень достоверности поднят у ${raised} ${plural(raised, 'записи', 'записей', 'записей')} из ${ids.length}.`,
  }
}
