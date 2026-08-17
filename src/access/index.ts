import type { Access, FieldAccess, Where } from 'payload'

type U = { id: number | string; role?: string; organization?: number | string | { id: number } }

const orgId = (user: U | null | undefined): number | string | undefined => {
  if (!user?.organization) return undefined
  return typeof user.organization === 'object' ? user.organization.id : user.organization
}

/**
 * Сотрудник Ассоциации: администратор или эксперт.
 *
 * Роли две, и это не дублирование. `admin` — технический администратор:
 * справочники, удаление, поля вроде `users.confirmed`. `expert` — тот, кто
 * проверяет чужие данные: видит всё, но не правит ничего чужого. Разница
 * в цене ошибки, поэтому и в правах.
 *
 * Там, где в правиле имелось в виду «Ассоциация видит всё» — берётся эта
 * проверка. Там, где «технический администратор» — остаётся `isAdmin`.
 * Разбор — `docs/kabinet-associacii.md`, раздел 3.
 */
export const isAssociation = (user: unknown): boolean => {
  const role = (user as U | null)?.role
  return role === 'admin' || role === 'expert'
}

export const isAdmin: Access = ({ req: { user } }) => (user as U | null)?.role === 'admin'

/** Проверяющий или администратор — для действий кабинета Ассоциации. */
export const isAssociationAccess: Access = ({ req: { user } }) => isAssociation(user)

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
  if (isAssociation(u)) return true
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
  if (isAssociation(u)) return true
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
  if (isAssociation(u)) return true
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
  if (isAssociation(u)) return true

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

/**
 * Запись, принадлежащая организации: пакеты загрузки, документы хозяйства.
 *
 * Отличается от `animalScopedRead` тем, что публичной видимости здесь нет
 * и быть не может: пакет данных — это внутренняя кухня хозяйства, кто когда
 * что загрузил и сколько строк не прошло проверку. Соседям это не показывают
 * ни при каких настройках.
 *
 * Ассоциация видит всё: разбирать спорные загрузки приходится ей.
 */
export const organizationScopedRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (isAssociation(u)) return true
  const org = orgId(u)
  if (!org) return false
  return { organization: { equals: org } }
}

/**
 * Документ хозяйства: виден своим, а также всем — если привязан к публичной
 * карточке. Племенное свидетельство на открытое животное показывают вместе
 * с карточкой, в этом и смысл публикации.
 */
export const documentRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (isAssociation(u)) return true

  const or: Where[] = [{ 'animal.publicVisible': { equals: true } }]
  const org = orgId(u)
  if (u && org) or.push({ organization: { equals: org } }, { 'animal.owner': { equals: org } })
  return { or }
}

/**
 * Своя учётная запись — или любая, если ты Ассоциация.
 *
 * Только на чтение. Правило намеренно разведено с `selfOrAdmin`: эксперту
 * нужно видеть, кто подал заявку от хозяйства, но не нужно право переписать
 * чужую учётную запись — а одно правило на чтение и запись дало бы ровно это.
 */
export const selfOrAssociation: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (isAssociation(u)) return true
  return { id: { equals: u.id } }
}

/** Своя учётная запись — или любая, если ты администратор. Для записи. */
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
