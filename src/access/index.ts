import type { Access, FieldAccess, Where } from 'payload'

type U = { id: number | string; role?: string; organization?: number | string | { id: number } }

const orgId = (user: U | null | undefined): number | string | undefined => {
  if (!user?.organization) return undefined
  return typeof user.organization === 'object' ? user.organization.id : user.organization
}

export const isAdmin: Access = ({ req: { user } }) => (user as U | null)?.role === 'admin'

export const isAdminField: FieldAccess = ({ req: { user } }) => (user as U | null)?.role === 'admin'

export const anyone: Access = () => true

export const isAuthenticated: Access = ({ req: { user } }) => Boolean(user)

/**
 * Чтение животных:
 *  - админ видит всё;
 *  - авторизованный видит своих (по организации) + все публичные;
 *  - аноним видит только те, где владелец разрешил публичный показ.
 */
export const animalRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (u?.role === 'admin') return true
  const org = orgId(u)
  if (u && org) {
    const w: Where = { or: [{ owner: { equals: org } }, { publicVisible: { equals: true } }] }
    return w
  }
  const w: Where = { publicVisible: { equals: true } }
  return w
}

/** Изменять животное может админ или пользователь той же организации. */
export const animalMutate: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (u.role === 'admin') return true
  const org = orgId(u)
  if (!org) return false
  return { owner: { equals: org } }
}

/**
 * Запрос доступа виден обеим сторонам: тому, кто просил, и хозяйству,
 * у которого просят. Ассоциация видит все — разбирать спорные случаи
 * приходится ей.
 */
export const accessRequestRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (u.role === 'admin') return true
  const org = orgId(u)
  const or: Where[] = [{ requester: { equals: u.id } }]
  if (org) or.push({ owner: { equals: org } })
  return { or }
}

/**
 * Решение по запросу принимает только владелец животного.
 *
 * Заявителю править запись нечего: даже отметка «ответ прочитан» ставится
 * служебно, в обход правил доступа, — иначе пришлось бы разрешить ему
 * запись в ту же строку, где лежит решение.
 */
export const accessRequestDecide: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (u.role === 'admin') return true
  const org = orgId(u)
  if (!org) return false
  return { owner: { equals: org } }
}

export const selfOrAdmin: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (u.role === 'admin') return true
  return { id: { equals: u.id } }
}

export const ownOrganization: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (u.role === 'admin') return true
  const org = orgId(u)
  if (!org) return false
  return { id: { equals: org } }
}
