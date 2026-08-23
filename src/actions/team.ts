'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getClient, getCurrentUser, AUTH_COOKIE } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { isAssociation } from '@/access'
import { assertCan, type OrgRole } from '@/lib/roles'
import { INVITE_DAYS, newInviteToken, resolveInvite } from '@/lib/invitations'

/**
 * Сотрудники хозяйства: пригласить, сменить роль, заблокировать.
 *
 * Все три действия объединяет одно: они меняют не данные, а то, кто вправе
 * их менять. Поэтому у каждого своя проверка возможности, а не общая
 * «пользователь авторизован», и каждое отказывает вслух, объясняя, к кому
 * идти.
 */

export type TeamFormState = {
  error?: string
  message?: string
  /** Ссылка приглашения: почты система не отправляет, адрес показывается. */
  url?: string
}

const num = (form: FormData, key: string): number | null => {
  const raw = String(form.get(key) ?? '').trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

const ROLE_VALUES: OrgRole[] = ['head', 'operator', 'viewer']

const siteUrl = (path: string): string => {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

/**
 * Пригласить сотрудника.
 *
 * Почта не отправляется: почтового адаптера в системе нет, и притворяться,
 * что письмо ушло, хуже, чем честно отдать адрес. Хозяйство перешлёт его
 * тем способом, которым уже общается с этим человеком, — тот же выбор,
 * что у ссылок на просмотр.
 */
export async function inviteMemberAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const user = await getCurrentUser()
  const payload = await getClient()

  const denied = await assertCan(payload, user, 'team')
  if (denied) return { error: denied }

  const org = relId(user!.organization)
  if (!org) return { error: 'У вашей учётной записи нет хозяйства' }

  const email = String(formData.get('email') || '')
    .trim()
    .toLowerCase()
  if (!email || !email.includes('@')) return { error: 'Укажите почту приглашаемого' }

  const orgRole = String(formData.get('orgRole') || 'operator') as OrgRole
  if (!ROLE_VALUES.includes(orgRole)) return { error: 'Неизвестная роль' }

  /*
   * Приглашать того, кто уже в системе, нельзя — и молчать об этом тоже.
   * Человек с учётной записью в другом хозяйстве не должен попадать
   * в это по ссылке: переход между хозяйствами — не приглашение,
   * а перевод, и решать его должна Ассоциация.
   */
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.totalDocs > 0) {
    const already = relId(existing.docs[0]!.organization) === org
    return {
      error: already
        ? 'Этот человек уже работает в вашем хозяйстве'
        : 'У этой почты уже есть учётная запись. Перевод между хозяйствами оформляет Ассоциация.',
    }
  }

  const live = await payload.find({
    collection: 'invitations',
    where: {
      and: [
        { email: { equals: email } },
        { organization: { equals: org } },
        { acceptedAt: { exists: false } },
        { revokedAt: { exists: false } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (live.totalDocs > 0) {
    return { error: 'Приглашение на эту почту уже выпущено. Отзовите старое или дождитесь срока.' }
  }

  const token = newInviteToken()

  try {
    await payload.create({
      collection: 'invitations',
      overrideAccess: true,
      user: user!,
      data: {
        email,
        orgRole,
        organization: org,
        token,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
        invitedBy: user!.id,
        note: String(formData.get('note') || '').trim() || undefined,
      },
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось выпустить приглашение' }
  }

  revalidatePath('/account/team')
  return {
    message: `Приглашение выпущено, срок — ${INVITE_DAYS} дней`,
    url: siteUrl(`/invite/${token}`),
  }
}

export async function revokeInviteAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const user = await getCurrentUser()
  const payload = await getClient()

  const denied = await assertCan(payload, user, 'team')
  if (denied) return { error: denied }

  const id = num(formData, 'id')
  if (!id) return { error: 'Приглашение не выбрано' }

  const invite = await payload
    .findByID({ collection: 'invitations', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!invite) return { error: 'Приглашение не найдено' }
  if (relId(invite.organization) !== relId(user!.organization) && !isAssociation(user)) {
    return { error: 'Это приглашение выпустило другое хозяйство' }
  }

  await payload.update({
    collection: 'invitations',
    id,
    overrideAccess: true,
    user: user!,
    data: { revokedAt: new Date().toISOString() },
  })

  revalidatePath('/account/team')
  return { message: 'Приглашение отозвано' }
}

/**
 * Принять приглашение: завести учётную запись и войти.
 *
 * Пароль человек задаёт сам и никому не сообщает — в этом весь смысл
 * приглашения. Почта берётся из приглашения, а не из формы: иначе ссылку
 * можно было бы переслать кому угодно и войти под своей почтой в чужое
 * хозяйство.
 */
export async function acceptInviteAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const token = String(formData.get('token') || '')
  const payload = await getClient()

  const invite = await resolveInvite(payload, token)
  if (!invite) {
    return { error: 'Приглашение недействительно: оно отозвано, просрочено или уже принято' }
  }

  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('passwordConfirm') || '')
  if (password.length < 8) return { error: 'Пароль должен быть не короче 8 символов' }
  if (password !== confirm) return { error: 'Пароли не совпадают' }
  if (formData.get('acceptedPolicy') !== 'on') {
    return { error: 'Необходимо согласие на обработку персональных данных' }
  }

  const lastName = String(formData.get('lastName') || '').trim()
  const firstName = String(formData.get('firstName') || '').trim()
  if (!lastName || !firstName) return { error: 'Укажите фамилию и имя' }

  try {
    const created = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: invite.email,
        password,
        role: 'farmer',
        orgRole: invite.orgRole,
        lastName,
        firstName,
        middleName: String(formData.get('middleName') || '').trim() || undefined,
        phone: String(formData.get('phone') || '').trim() || undefined,
        position: String(formData.get('position') || '').trim() || undefined,
        organization: invite.organization,
        acceptedPolicy: true,
        /*
         * Подтверждён приглашением. Ассоциация проверяет хозяйства,
         * хозяйство отвечает за своих людей — второго круга проверки
         * здесь не нужно, он только заставил бы эксперта разбирать,
         * кто у кого работает зоотехником.
         */
        confirmed: true,
      } as never,
    })

    await payload.update({
      collection: 'invitations',
      id: invite.id,
      overrideAccess: true,
      data: { acceptedAt: new Date().toISOString(), acceptedBy: created.id },
    })

    const result = await payload.login({
      collection: 'users',
      data: { email: invite.email, password },
    })
    if (result.token) {
      const jar = await cookies()
      jar.set(AUTH_COOKIE, result.token, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        expires: result.exp ? new Date(result.exp * 1000) : undefined,
      })
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось завести учётную запись' }
  }

  redirect('/account')
}

/**
 * Смена роли сотрудника.
 *
 * Себе роль не меняют — иначе руководитель, разжаловав себя по ошибке,
 * остаётся хозяйством без руководителя, и вернуть роль будет некому.
 * Последнего руководителя разжаловать тоже нельзя по той же причине.
 */
export async function changeOrgRoleAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const user = await getCurrentUser()
  const payload = await getClient()

  const denied = await assertCan(payload, user, 'team')
  if (denied) return { error: denied }

  const id = num(formData, 'user')
  const orgRole = String(formData.get('orgRole') || '') as OrgRole
  if (!id || !ROLE_VALUES.includes(orgRole)) return { error: 'Не выбраны сотрудник и роль' }

  const target = await payload
    .findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!target) return { error: 'Сотрудник не найден' }

  const org = relId(user!.organization)
  if (!isAssociation(user) && relId(target.organization) !== org) {
    return { error: 'Этот человек работает в другом хозяйстве' }
  }
  if (String(target.id) === String(user!.id)) {
    return { error: 'Свою роль сменить нельзя — попросите другого руководителя' }
  }

  if (target.orgRole === 'head' && orgRole !== 'head') {
    const heads = await payload.count({
      collection: 'users',
      overrideAccess: true,
      where: {
        and: [
          { organization: { equals: relId(target.organization) } },
          { orgRole: { equals: 'head' } },
          { blockedAt: { exists: false } },
        ],
      },
    })
    if (heads.totalDocs <= 1) {
      return { error: 'Это последний руководитель хозяйства. Сначала назначьте другого.' }
    }
  }

  await payload.update({
    collection: 'users',
    id,
    overrideAccess: true,
    user: user!,
    data: { orgRole } as never,
  })

  revalidatePath('/account/team')
  return { message: 'Роль изменена' }
}

/**
 * Блокировка человека.
 *
 * Не удаление: за учётной записью стоит авторство записей и решений,
 * и стереть её значило бы стереть ответ на вопрос «кто это внёс».
 * Заблокированный не входит и ничего не меняет, а сделанное им остаётся
 * подписанным его именем.
 *
 * Блокировать может руководитель своего хозяйства и Ассоциация — любого.
 * Себя — никто: хозяйство, оставшееся без единого руководителя, чинится
 * только через Ассоциацию.
 */
export async function blockUserAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const user = await getCurrentUser()
  const payload = await getClient()

  const id = num(formData, 'user')
  if (!id) return { error: 'Сотрудник не выбран' }

  const unblock = formData.get('unblock') === '1'

  const target = await payload
    .findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!target) return { error: 'Сотрудник не найден' }

  if (!isAssociation(user)) {
    const denied = await assertCan(payload, user, 'team')
    if (denied) return { error: denied }
    if (relId(target.organization) !== relId(user!.organization)) {
      return { error: 'Этот человек работает в другом хозяйстве' }
    }
  }

  if (String(target.id) === String(user!.id)) {
    return { error: 'Себя заблокировать нельзя' }
  }

  if (!unblock) {
    const reason = String(formData.get('reason') || '').trim()
    if (reason.length < 3) {
      return { error: 'Назовите причину: заблокированный увидит её и поймёт, что делать' }
    }

    if (target.orgRole === 'head' && !isAssociation(user)) {
      const heads = await payload.count({
        collection: 'users',
        overrideAccess: true,
        where: {
          and: [
            { organization: { equals: relId(target.organization) } },
            { orgRole: { equals: 'head' } },
            { blockedAt: { exists: false } },
          ],
        },
      })
      if (heads.totalDocs <= 1) {
        return { error: 'Это последний руководитель хозяйства. Сначала назначьте другого.' }
      }
    }

    await payload.update({
      collection: 'users',
      id,
      overrideAccess: true,
      user: user!,
      data: {
        blockedAt: new Date().toISOString(),
        blockedBy: user!.id,
        blockReason: reason,
      } as never,
    })
  } else {
    await payload.update({
      collection: 'users',
      id,
      overrideAccess: true,
      user: user!,
      data: { blockedAt: null, blockedBy: null, blockReason: null } as never,
    })
  }

  revalidatePath('/account/team')
  revalidatePath('/association/farms')
  return { message: unblock ? 'Блокировка снята' : 'Учётная запись заблокирована' }
}
