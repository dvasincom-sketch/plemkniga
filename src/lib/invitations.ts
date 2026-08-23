import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { relId } from '@/lib/visibility'
import type { OrgRole } from '@/lib/roles'

/**
 * Приглашение: выпуск токена и его разбор.
 *
 * Логика отдельно от страниц по той же причине, что у ссылок на просмотр:
 * токен разбирают двое — страница приглашения и действие, которое заводит
 * учётную запись. Разойдись они, и по ссылке откроется одно хозяйство,
 * а человек попадёт в другое.
 */

/**
 * Токен — 32 случайных байта.
 *
 * Он одновременно адрес и пропуск: кто открыл ссылку, тот и заводит
 * учётную запись в чужом стаде. Короткий читаемый код здесь означал бы,
 * что вход подбирается перебором.
 */
export const newInviteToken = (): string => randomBytes(32).toString('hex')

/**
 * Срок приглашения — две недели.
 *
 * Не «месяц» и не «год»: за две недели человек успевает завести запись,
 * а забытая ссылка перестаёт работать раньше, чем о ней забудут
 * окончательно. Приглашение годичной давности, найденное в старом
 * письме, — это вход в стадо для того, кто давно уволился.
 */
export const INVITE_DAYS = 14

export type ResolvedInvite = {
  id: number
  email: string
  orgRole: OrgRole
  organization: number
  organizationName: string
  note: string | null
}

/**
 * Найти приглашение по токену — или ничего.
 *
 * Просроченное, отозванное и уже принятое отвечают так же, как
 * несуществующее. Разные ответы дали бы перебором выяснить, что
 * приглашение когда-то было, — а вместе с ним и то, что такая почта
 * связана с этим хозяйством.
 */
export async function resolveInvite(
  payload: Payload,
  token: string,
): Promise<ResolvedInvite | null> {
  const clean = token.trim()
  if (clean.length < 16) return null

  const found = await payload.find({
    collection: 'invitations',
    where: { token: { equals: clean } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })

  const invite = found.docs[0]
  if (!invite) return null
  if (invite.acceptedAt || invite.revokedAt) return null
  if (new Date(invite.expiresAt).getTime() < Date.now()) return null

  const org = invite.organization
  const orgId = relId(org)
  if (!orgId) return null

  return {
    id: invite.id,
    email: invite.email,
    orgRole: invite.orgRole as OrgRole,
    organization: orgId,
    organizationName:
      org && typeof org === 'object' ? ((org as { name?: string }).name ?? '') : '',
    note: invite.note ?? null,
  }
}

/** Что показывать в списке приглашений: одно состояние, а не три поля. */
export type InviteState = 'active' | 'accepted' | 'revoked' | 'expired'

export const inviteState = (invite: {
  acceptedAt?: string | null
  revokedAt?: string | null
  expiresAt: string
}): InviteState => {
  if (invite.acceptedAt) return 'accepted'
  if (invite.revokedAt) return 'revoked'
  if (new Date(invite.expiresAt).getTime() < Date.now()) return 'expired'
  return 'active'
}

export const INVITE_STATE_LABEL: Record<InviteState, string> = {
  active: 'ждёт',
  accepted: 'принято',
  revoked: 'отозвано',
  expired: 'просрочено',
}
