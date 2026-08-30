import type { Animal, User } from '@/payload-types'

/**
 * Кто и что видит в книге.
 *
 * У видимости два независимых переключателя, и путать их нельзя:
 *
 *   publicVisible — запись вообще присутствует в книге;
 *   publicDetails — карточку можно открыть.
 *
 * Запись с `publicVisible: true, publicDetails: false` видна в списке
 * (номер, кличка, владелец, основные показатели), но подробности закрыты.
 * Замок означает именно это — решение владельца, а не то, что посетитель
 * не авторизован.
 *
 * Раньше замок снимался у любого вошедшего в систему. Это обещало больше,
 * чем система делала: пользователь входил и видел ту же закрытую карточку.
 * Теперь замок снимает только владелец записи и Ассоциация.
 */

/** id связанной записи независимо от глубины выборки. */
export const relId = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object') {
    const id = (v as { id?: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

export type Viewer = {
  /** Организация посетителя — по ней определяются «свои» животные. */
  orgId: number | null
  isAdmin: boolean
  signedIn: boolean
}

export const viewerOf = (user: User | null | undefined): Viewer => ({
  orgId: relId(user?.organization),
  isAdmin: user?.role === 'admin',
  signedIn: Boolean(user),
})

export const ANONYMOUS: Viewer = { orgId: null, isAdmin: false, signedIn: false }

/** Животное принадлежит организации посетителя. */
export const isOwnAnimal = (animal: Pick<Animal, 'owner'>, viewer: Viewer): boolean => {
  const owner = relId(animal.owner)
  return owner !== null && viewer.orgId !== null && owner === viewer.orgId
}

/** Карточка закрыта: владелец не открыл подробности, и смотрит не он. */
export const isAnimalLocked = (
  animal: Pick<Animal, 'owner' | 'publicDetails'>,
  viewer: Viewer,
): boolean => {
  if (animal.publicDetails) return false
  if (viewer.isAdmin) return false
  return !isOwnAnimal(animal, viewer)
}

export const LOCK_HINT =
  'Хозяйство закрыло публичный доступ к данным этого животного. ' +
  'Откройте запись — там можно запросить доступ у владельца.'

/**
 * Состояние публичности записи словами — одно на обе стороны.
 *
 * Показывается и в шапке карточки знаком, и в полосе владельца
 * над меню разделов. Живёт в общем модуле, а не рядом с полосой:
 * полоса — клиентский компонент, а шапку рисует сервер, и вызов
 * функции из клиентского модуля на сервере падает в бою, а не при
 * сборке. Разные слова об одном состоянии в двух местах — вторая
 * причина, и она дороже первой.
 */
export function publicityLabel(visible: boolean, details: boolean): string {
  if (!visible) return 'Нет в общей книге'
  return details ? 'В книге: карточка открыта' : 'В книге: только строка списка'
}
