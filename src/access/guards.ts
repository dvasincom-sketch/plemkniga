import type { CollectionBeforeChangeHook } from 'payload'
import { isAssociation } from '@/access'
import { relId } from '@/lib/visibility'

/**
 * Проверки принадлежности на записи — то, чего не выражает правило доступа.
 *
 * Правило `create` у Payload отдаёт булево: оно решает, пускать ли к операции
 * вообще, но содержимого будущей записи не видит. Для `update` можно вернуть
 * условие — и оно работает, — а для `create` условия нет по устройству.
 * Отсюда хуки: правило пускает к форме, хук решает, что именно записать.
 *
 * Почему это понадобилось. У отёлов, доек, осеменений, случаев болезни,
 * событий, документов и стад изменение стояло `isAuthenticated` — «любой
 * вошедший». Чтение мы сузили решением №24, а запись осталась: посторонний
 * мог не только прочитать чужой отёл, но и переписать его, а заодно
 * переименовать чужое стадо. Интерфейс так никогда не делал, но API работает
 * в обход интерфейса.
 *
 * ## Почему затягивание не ломает существующее
 *
 * Все законные записи идут через серверные действия с `overrideAccess: true`
 * и собственной проверкой владельца (`guard` в `src/actions/events.ts`,
 * публикация пакета, выпуск документа). Правила коллекций там не участвуют
 * вовсе — они защищают только прямые обращения к API.
 *
 * Хуки при этом выполняются всегда, в том числе при `overrideAccess`.
 * Поэтому проверка молчит, когда пользователя нет вовсе: так ходят сид,
 * пересчёты и ревизии. Ошибиться она может только в одну сторону —
 * пропустить серверный скрипт, — и это безопасно: у скрипта и так есть
 * прямой доступ к базе.
 */

type U = { id: number | string; role?: string; organization?: unknown }

/** Организация пользователя запроса; `null` — пользователя нет. */
const orgOf = (user: unknown): number | null => relId((user as U | null)?.organization)

/**
 * Запись, привязанная к животному, принадлежит хозяйству-владельцу.
 *
 * Применяется к отёлам, дойкам, осеменениям, случаям болезни и событиям.
 * Проверяется и на создании, и на изменении: при изменении можно было бы
 * положиться на условие правила, но тогда защита у пяти коллекций жила бы
 * в двух разных местах, и однажды они разошлись бы.
 */
export const requireOwnAnimal: CollectionBeforeChangeHook = async ({ data, req, originalDoc }) => {
  const user = req.user as U | null

  // Серверный скрипт: пользователя нет, проверять не от чьего лица
  if (!user) return data
  // Ассоциация ведёт чужие данные по долгу службы
  if (isAssociation(user)) return data

  const org = orgOf(user)
  if (!org) throw new Error('У вашей учётной записи нет организации')

  const animalId = relId(data?.animal) ?? relId((originalDoc as { animal?: unknown })?.animal)
  if (!animalId) throw new Error('Запись не привязана к животному')

  const animal = await req.payload.findByID({
    collection: 'animals',
    id: animalId,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (relId((animal as { owner?: unknown })?.owner) !== org) {
    throw new Error('Изменять можно только записи своего стада')
  }

  return data
}

/**
 * Запись принадлежит организации напрямую: стадо, документ хозяйства.
 *
 * Документ может висеть и на животном, и на организации, поэтому подходит
 * любое совпадение: моя организация в поле `organization` либо моё животное
 * в поле `animal`. Свидетельство на чужое животное, лежащее в моей папке, —
 * состояние не описуемое, и разрешать его незачем.
 */
export const requireOwnOrganization: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
}) => {
  const user = req.user as U | null
  if (!user) return data
  if (isAssociation(user)) return data

  const org = orgOf(user)
  if (!org) throw new Error('У вашей учётной записи нет организации')

  const stated =
    relId(data?.organization) ?? relId((originalDoc as { organization?: unknown })?.organization)

  if (stated !== null) {
    if (stated !== org) throw new Error('Записывать можно только в свою организацию')
    return data
  }

  // Организация не указана — судим по животному, если оно есть
  const animalId = relId(data?.animal) ?? relId((originalDoc as { animal?: unknown })?.animal)
  if (animalId !== null) {
    const animal = await req.payload.findByID({
      collection: 'animals',
      id: animalId,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (relId((animal as { owner?: unknown })?.owner) !== org) {
      throw new Error('Изменять можно только записи своего стада')
    }
    return data
  }

  throw new Error('Не указано, к какой организации относится запись')
}
