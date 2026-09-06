import type { Access, FieldAccess, Where } from 'payload'
import type { AccessScope } from '@/lib/dictionaries'
import { animalsWithScope, grantsForRequest, ownersWithScope } from '@/lib/grants'

type U = {
  id: number | string
  role?: string
  orgRole?: string | null
  blockedAt?: string | null
  organization?: number | string | { id: number }
}

/**
 * Собрать условие из вариантов.
 *
 * Один вариант отдаётся как есть, а не завёрнутым в `or` из одного элемента:
 * лишняя обёртка ничего не меняет по смыслу, но меняет план запроса, а книга
 * на горячем пути.
 */
const anyOf = (variants: Where[]): Where =>
  variants.length === 1 ? variants[0]! : { or: variants }

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

/**
 * Заблокированный не пишет ничего.
 *
 * `getCurrentUser` уже возвращает для него `null`, и весь интерфейс
 * считает его вошедшим никем. Но правила коллекций защищают другое —
 * прямые обращения к API с ещё действующим токеном, минующие страницы
 * вовсе. Отозвать выданный JWT нечем, поэтому решение принимается
 * на каждом запросе по состоянию записи.
 */
const notBlocked = <T,>(user: T | null | undefined): user is T =>
  Boolean(user) && !(user as { blockedAt?: string | null } | null)?.blockedAt

export const isAuthenticated: Access = ({ req: { user } }) => notBlocked(user)

/**
 * Чтение животных:
 *  - админ видит всё;
 *  - авторизованный видит своих (по организации) + все публичные;
 *  - аноним видит только те, где владелец разрешил публичный показ;
 *  - плюс всё, что открыто точечным доступом.
 *
 * Область здесь не проверяется намеренно: любой действующий грант делает
 * запись видимой целиком в её базовой части — номер, кличка, пол, порода,
 * состояние, владелец. Что показать внутри карточки, решают правила
 * связанных коллекций и сборка страницы.
 *
 * Грант поднимает **обе** ступени публичности: запись с `publicVisible: false`
 * получателю отдаётся. Иначе хозяйство, которое держит стадо вне книги, лишено
 * среднего варианта вовсе — а именно ему он нужнее всех.
 *
 * Оба условия от грантов — по колонкам самой строки животных: `id` — первичный
 * ключ, `owner` — индексированная колонка. Ни одного join. Разбор —
 * `src/lib/grants.ts` и `docs/tochechnyy-dostup.md`, раздел 5.
 */
export const animalRead: Access = async ({ req }) => {
  const u = req.user as U | null
  if (isAssociation(u)) return true

  const org = orgId(u)
  const variants: Where[] = [{ publicVisible: { equals: true } }]
  if (u && org) variants.unshift({ owner: { equals: org } })
  /*
   * Прежний владелец видит карточку проданного животного.
   *
   * Он вносил её пять лет и в день продажи не должен обнаружить, что записи,
   * собранной его руками, для него больше нет. Правки при этом закрыты:
   * `animalMutate` смотрит только на `owner`, и прежний владелец туда
   * не попадает ни при каком условии.
   */
  if (u && org) variants.push({ pastOwners: { in: [org] } })

  const grants = await grantsForRequest(req)
  if (!grants.empty) {
    const animals = animalsWithScope(grants)
    const owners = ownersWithScope(grants)
    if (animals.length) variants.push({ id: { in: animals } })
    if (owners.length) variants.push({ owner: { in: owners } })
  }

  return anyOf(variants)
}

/**
 * Изменять запись, привязанную к животному, может только его хозяйство.
 *
 * Раньше здесь стояло `isAuthenticated` — «любой вошедший», — и это была
 * не оговорка прототипа, а дыра: посторонний мог переписать чужой отёл
 * или чужую дойку через `/api/calvings`. Чтение мы сузили решением №24,
 * запись осталась открытой, и в описании каждой коллекции по отдельности
 * `isAuthenticated` читалось осмысленно: «данные о продуктивности доступны
 * участникам системы».
 *
 * Условие идёт через связь — это join, и здесь он уместен: запись не на
 * горячем пути, страницы книги через него не ходят.
 *
 * На создании условие не работает: Payload ждёт булево и содержимого будущей
 * записи не видит. Там ту же проверку делает хук `requireOwnAnimal`
 * (`src/access/guards.ts`).
 */
export const animalScopedMutate: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!notBlocked(u)) return false
  if (isAssociation(u)) return true
  const org = orgId(u)
  if (!org) return false
  return { 'animal.owner': { equals: org } }
}

/** Стадо правит его хозяйство. Читают стада все — их названия стоят в книге. */
export const herdMutate: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!notBlocked(u)) return false
  if (isAssociation(u)) return true
  const org = orgId(u)
  if (!org) return false
  return { organization: { equals: org } }
}

/**
 * Документ правит тот, чей он: своя организация или своё животное.
 *
 * Ассоциация тоже — она выпускает племенные свидетельства и отзывает их,
 * и это её работа, а не вмешательство в чужие данные.
 */
export const documentMutate: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!notBlocked(u)) return false
  if (isAssociation(u)) return true
  const org = orgId(u)
  if (!org) return false
  const or: Where[] = [{ organization: { equals: org } }, { 'animal.owner': { equals: org } }]
  return { or }
}

/** Изменять животное может админ или пользователь той же организации. */
export const animalMutate: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u || !notBlocked(u)) return false
  if (u.role === 'admin') return true
  // Наблюдатель смотрит, но не правит — разбор ролей в `src/lib/roles.ts`
  if (u.orgRole === 'viewer') return false
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
  /*
   * Блокировка проверяется на каждом пишущем правиле, а не только
   * в `isAuthenticated`. Здесь её не было: с ещё действующим токеном
   * заблокированный решал судьбу запросов к своим животным — то есть
   * раздавал доступ наружу после того, как его самого закрыли.
   */
  if (!notBlocked(u)) return false
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
const scopedRead =
  (scope?: AccessScope): Access =>
  async ({ req }) => {
    const u = req.user as U | null
    if (isAssociation(u)) return true

    const org = orgId(u)
    const variants: Where[] = [{ 'animal.publicVisible': { equals: true } }]
    if (u && org) variants.unshift({ 'animal.owner': { equals: org } })
    /*
     * Прежний владелец видит свой период, и только его.
     *
     * Условие идёт по штампу самой строки (`ownerOrg`), а не по прежнему
     * владению животным. Разница принципиальная: по владению он увидел бы
     * и дойки, записанные покупателем после сделки, — то есть свою бывшую
     * корову в чужом стаде. По штампу он видит ровно то, что собрал сам.
     *
     * Нынешний владелец при этом видит всю историю, включая чужой период:
     * первое условие правила даёт ему все строки его животного. Иначе
     * покупатель остался бы без родословной продуктивности, ради которой
     * корову и покупают.
     */
    if (u && org) variants.push({ ownerOrg: { equals: org } })

    const grants = await grantsForRequest(req)
    if (!grants.empty) {
      const animals = animalsWithScope(grants, scope)
      const owners = ownersWithScope(grants, scope)
      // Условие по колонке `animal_id`, а не по полю связанной записи
      if (animals.length) variants.push({ animal: { in: animals } })
      /*
       * А вот это — join, и он здесь осознан. Владельца в строке события нет,
       * а грант на стадо задан именно владельцем. Хуже не становится: точно
       * такой же join стоит в первом условии этого правила с решения №24.
       * Важнее другое — эти коллекции читаются на карточке, по одному
       * животному, а не на странице книги. Если замер покажет, что и здесь
       * дорого, владельца надо продублировать в строках событий, как уже
       * сделано в `index-values` (решение №22). Заранее денормализовать пять
       * коллекций ради предположения не будем.
       */
      if (owners.length) variants.push({ 'animal.owner': { in: owners } })
    }

    return anyOf(variants)
  }

/**
 * Чтение записи, привязанной к животному, с оглядкой на область гранта.
 *
 * Без аргумента — прежнее поведение плюс любой действующий грант. Так открыт
 * журнал правок: он показывает, кто и когда трогал запись, но не значения
 * полей сверх тех, что и так видны. Скрывать историю изменений от того, кому
 * показали данные, — способ показать данные, умолчав об их надёжности.
 */
export const animalScopedRead: Access = scopedRead()

/**
 * То же, но грант учитывается только с нужной областью.
 *
 * Область — свойство коллекции, а не экрана. Если бы области жили только
 * в интерфейсе, получатель гранта на происхождение прочитал бы надои через
 * `/api/milk-tests`, и обещание «открыто только происхождение» оказалось бы
 * обещанием вёрстки. Ровно эта ошибка разобрана в решении №24: карточку
 * закрыли, а данные, висящие на ней, оставили открытыми.
 */
export const animalScopedReadFor = (scope: AccessScope): Access => scopedRead(scope)

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
export const indexValueRead: Access = async ({ req }) => {
  const u = req.user as U | null
  if (isAssociation(u)) return true

  const org = orgId(u)
  const variants: Where[] = [{ publicVisible: { equals: true } }]
  if (u && org) variants.unshift({ owner: { equals: org } })

  /*
   * Здесь join недопустим ни в каком виде: значения индекса читаются
   * на странице книги при сортировке по профилю. Оба условия от грантов идут
   * по колонкам самой строки: `animal_id` — связь по идентификатору,
   * `owner` — копия поля животного, заведённая решением №22.
   */
  const grants = await grantsForRequest(req)
  if (!grants.empty) {
    const animals = animalsWithScope(grants, 'evaluation')
    const owners = ownersWithScope(grants, 'evaluation')
    if (animals.length) variants.push({ animal: { in: animals } })
    if (owners.length) variants.push({ owner: { in: owners } })
  }

  return anyOf(variants)
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
  if (!notBlocked(u)) return false
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
export const documentRead: Access = async ({ req }) => {
  const u = req.user as U | null
  if (isAssociation(u)) return true

  const or: Where[] = [{ 'animal.publicVisible': { equals: true } }]
  const org = orgId(u)
  if (u && org) or.push({ organization: { equals: org } }, { 'animal.owner': { equals: org } })

  const grants = await grantsForRequest(req)
  if (!grants.empty) {
    const animals = animalsWithScope(grants, 'documents')
    const owners = ownersWithScope(grants, 'documents')
    if (animals.length) or.push({ animal: { in: animals } })
    if (owners.length) or.push({ 'animal.owner': { in: owners } })
  }

  return anyOf(or)
}

/**
 * Точечный доступ виден обеим сторонам: тому, кто открыл, и тому, кому открыли.
 *
 * Ассоциация видит все — спорные случаи разбирать ей, как и с запросами
 * доступа. Выдавать и отзывать чужие гранты она при этом не может: данные
 * принадлежат хозяйству.
 */
export const accessGrantRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (isAssociation(u)) return true
  const org = orgId(u)
  if (!org) return false
  const or: Where[] = [{ owner: { equals: org } }, { grantee: { equals: org } }]
  return { or }
}

/**
 * Выдать и отозвать может только владелец данных.
 *
 * На изменении это правило работает как условие и отсекает чужие гранты.
 * На создании Payload ждёт булево, и содержимое полей правилом не проверить —
 * поэтому владелец подставляется хуком коллекции по животному или по сессии
 * и сверяется с организацией выдающего. Правило пускает к форме, хук решает,
 * что именно записать.
 */
export const accessGrantIssue: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!notBlocked(u)) return false
  if (u.role === 'admin') return true
  const org = orgId(u)
  if (!org) return false
  return { owner: { equals: org } }
}

/**
 * Журнал просмотров: владелец данных, тот, кто смотрел, и Ассоциация.
 *
 * Получателю свои же обращения показываются намеренно. Журнал ведётся ради
 * доверия между хозяйствами, а односторонняя запись — то, о чём одна сторона
 * знает, а другая нет, — доверия не прибавляет. Пусть видят оба одно и то же.
 */
export const accessViewRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (isAssociation(u)) return true
  const org = orgId(u)
  if (!org) return false
  const or: Where[] = [{ owner: { equals: org } }, { viewerOrg: { equals: org } }]
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
  if (!notBlocked(u)) return false
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

/* ------------------------------------------------------------------ */
/*  Сохранённые отборы                                                 */
/* ------------------------------------------------------------------ */

/**
 * Свой отбор виден всегда, чужой — только если открыт хозяйству.
 *
 * Ассоциация сюда не допущена, и это осознанно. Отбор — рабочий черновик
 * зоотехника: «коровы, которых я подозреваю», «то, что надо перемерить».
 * Ничего секретного в нём нет, и всё же это чужая кухня, а видимость
 * без надобности — это видимость, которую однажды используют не по делу.
 * Администратору доступ оставлен: без него не разобрать поломку.
 */
export const savedSearchRead: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!u) return false
  if (u.role === 'admin') return true

  const or: Where[] = [{ author: { equals: u.id } }]
  const org = orgId(u)
  if (org) or.push({ and: [{ organization: { equals: org } }, { scope: { equals: 'organization' } }] })
  return { or }
}

/**
 * Править отбор может только автор.
 *
 * Соблазн был разрешить руководителю править общие: он за хозяйство
 * отвечает. Но правка отбора — это изменение его смысла: сдвинутый порог
 * удоя превращает «кандидатов на выбраковку» в другой список под тем же
 * названием, и тот, кто на него опирался, узнает об этом последним.
 * Удалить общий отбор руководитель может (`savedSearchDelete`) — исчезнувший
 * набор виден сразу, подменённый не виден никогда.
 */
export const savedSearchWrite: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!notBlocked(u)) return false
  if (u.role === 'admin') return true
  return { author: { equals: u.id } }
}

/**
 * Удалять — автор, а общие отборы хозяйства ещё и руководитель.
 *
 * Иначе набор, оставшийся от уволившегося зоотехника, не убрать никем:
 * человека у нас блокируют, а не удаляют (решение №109), значит автор
 * формально жив и правило «только автор» держало бы мусор вечно.
 */
export const savedSearchDelete: Access = ({ req: { user } }) => {
  const u = user as U | null
  if (!notBlocked(u)) return false
  if (u.role === 'admin') return true

  const or: Where[] = [{ author: { equals: u.id } }]
  const org = orgId(u)
  if (org && u.orgRole === 'head')
    or.push({ and: [{ organization: { equals: org } }, { scope: { equals: 'organization' } }] })
  return { or }
}
