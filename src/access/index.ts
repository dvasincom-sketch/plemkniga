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

/**
 * Запись, привязанная к животному, видна ровно тем, кому видно животное.
 *
 * Правило повторяет `animalRead` через связь: держать в каждой такой
 * коллекции собственную логику видимости значило бы завести несколько мест,
 * где решается один и тот же вопрос, и рано или поздно они разойдутся.
 * Отсюда читают значения индекса, история оценок и линейные оценки
 * экстерьера — всё это части карточки, а не самостоятельные сущности.
 */
export const animalScopedRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (u?.role === 'admin') return true
  const org = orgId(u)
  if (u && org) {
    const w: Where = {
      or: [{ 'animal.owner': { equals: org } }, { 'animal.publicVisible': { equals: true } }],
    }
    return w
  }
  const w: Where = { 'animal.publicVisible': { equals: true } }
  return w
}

/**
 * Профиль индекса виден своей организации и всем — если он без владельца.
 *
 * Профиль без организации заводит Ассоциация: это стандартный ИПЦ и
 * национальные индексы, на них ссылаются как на общую точку отсчёта.
 * Чужие профили не видны никому: набор весов выдаёт экономику хозяйства
 * (что оно доплачивает за белок, где у него выбытие), а это коммерческая
 * information, которую хозяйство не обязано открывать соседям.
 */
/**
 * Значения индекса — по своим копиям полей животного, а не по связи.
 *
 * Правило то же самое: своё стадо плюс публичные записи. Но проверяется оно
 * по колонкам самой строки, а не через `animal.*`, и это не оптимизация
 * ради оптимизации. Условие на связь Payload превращает в `left join`
 * таблицы животных — на трёхстах тысячах записей один только подсчёт итога
 * страницы занимал 1,2 секунды. Копии полей живут в строке значения
 * и обновляются вместе с ним (`src/collections/IndexValues.ts`).
 */
export const indexValueRead: Access = ({ req: { user } }) => {
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

export const indexProfileRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (u?.role === 'admin') return true
  const org = orgId(u)
  const or: Where[] = [{ organization: { exists: false } }]
  if (org) or.push({ organization: { equals: org } })
  return { or }
}

/**
 * Менять профили может только своя организация; стандартные — только админ.
 *
 * Профиль настраивает главный генетик холдинга, а зоотехники отделений
 * работают с готовым — разделения прав внутри организации здесь нет
 * намеренно: оно потребовало бы отдельной роли, которой в системе пока нет.
 */
export const indexProfileMutate: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (u.role === 'admin') return true
  const org = orgId(u)
  if (!org) return false
  return { organization: { equals: org } }
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
