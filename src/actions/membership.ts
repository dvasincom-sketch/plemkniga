'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAssociationUser } from '@/lib/association'

/**
 * Членство хозяйства и подтверждение учётных записей.
 *
 * Здесь Ассоциация отвечает на вопрос «кто эти люди». До сих пор ответ
 * существовал, но ни на что не влиял: признак `confirmed` не участвовал
 * ни в одном правиле доступа, а членство было справочной отметкой.
 * Подтверждение без последствий — обряд, и хозяйство быстро понимает,
 * что его можно не ждать.
 *
 * Теперь последствия есть, и они очерчены узко: подтверждение решает,
 * показывать ли животных в общей книге и принимать ли заявки
 * на верификацию. Собственные данные хозяйства не трогаются никогда —
 * оно ведёт их, выгружает и правит независимо от того, что думает
 * о нём Ассоциация. Иначе получилась бы не проверка, а заложничество.
 */

export type MembershipState = { error?: string; message?: string }

type Decision = 'member' | 'none' | 'suspended'

async function guard() {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' as const }
  if (!isAssociationUser(user)) return { error: 'Доступно только сотрудникам Ассоциации' as const }
  return { user, payload: await getClient() }
}

/**
 * Решение по членству хозяйства.
 *
 * Отказ и приостановка требуют основания. Не из бюрократии: хозяйство
 * увидит это решение у себя в кабинете, и «отказано» без причины —
 * это не решение, а молчание, на которое нечего ответить.
 */
export async function decideMembershipAction(
  _prev: MembershipState,
  formData: FormData,
): Promise<MembershipState> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload } = ctx

  const id = Number(formData.get('organization'))
  if (!Number.isFinite(id) || id <= 0) return { error: 'Организация не определена' }

  const decision = String(formData.get('decision') || '') as Decision
  if (!['member', 'none', 'suspended'].includes(decision)) return { error: 'Не выбрано решение' }

  const comment = String(formData.get('comment') || '').trim()
  if (decision !== 'member' && !comment) {
    return { error: 'Укажите основание: хозяйство увидит это решение у себя' }
  }

  const org = await payload.findByID({
    collection: 'organizations',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if (!org) return { error: 'Организация не найдена' }

  const now = new Date().toISOString()

  try {
    await payload.update({
      collection: 'organizations',
      id,
      overrideAccess: true,
      data: {
        membership: decision,
        membershipReview: {
          ...(org.membershipReview ?? {}),
          decidedBy: user.id,
          decidedAt: now,
          // Дата вступления ставится один раз и при повторном приёме не сбивается
          since:
            decision === 'member' ? (org.membershipReview?.since ?? now) : org.membershipReview?.since,
          comment: comment || undefined,
        },
      } as never,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось сохранить решение' }
  }

  revalidatePath('/association/farms')
  revalidatePath('/account')
  revalidatePath('/account/profile')

  return {
    message:
      decision === 'member'
        ? 'Хозяйство принято в члены Ассоциации'
        : decision === 'suspended'
          ? 'Членство приостановлено'
          : 'Хозяйство не является членом Ассоциации',
  }
}

/**
 * Подтверждение учётной записи.
 *
 * Отдельно от членства, потому что это разные вопросы. Членство —
 * про организацию: состоит ли хозяйство в Ассоциации. Подтверждение —
 * про человека: тот ли он, за кого себя выдаёт, и вправе ли действовать
 * от лица этого хозяйства. Одно хозяйство и пятеро сотрудников — обычное
 * дело, и подтверждают их по одному.
 */
export async function confirmUserAction(
  _prev: MembershipState,
  formData: FormData,
): Promise<MembershipState> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  const { payload } = ctx

  const id = Number(formData.get('user'))
  if (!Number.isFinite(id) || id <= 0) return { error: 'Пользователь не определён' }

  const confirmed = formData.get('confirmed') === '1'

  try {
    await payload.update({
      collection: 'users',
      id,
      overrideAccess: true,
      data: { confirmed },
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось сохранить' }
  }

  revalidatePath('/association/farms')
  return { message: confirmed ? 'Учётная запись подтверждена' : 'Подтверждение снято' }
}
