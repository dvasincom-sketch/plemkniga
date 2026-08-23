'use server'

import { getClient, getCurrentUser } from '@/lib/payload'

/**
 * Поиск быка по всей книге — для экрана сравнения.
 *
 * ## Почему по всей книге, а не по своему стаду
 *
 * Быка выбирают до покупки, и в стаде покупателя его, по определению,
 * ещё нет. Это отличает поиск здесь от `herd-lookup`, где ограничение
 * своим стадом — не удобство, а право: там животное будут изменять.
 * Здесь его только читают.
 *
 * ## Почему правила доступа не обходятся
 *
 * Запрос идёт через Payload с `overrideAccess: false` и пользователем,
 * то есть через `animalRead`. Закрытый бык чужого хозяйства в подсказках
 * не появится — и это не осторожность ради осторожности: подсказка,
 * показывающая кличку по номеру, превращает форму поиска в способ читать
 * закрытую книгу перебором. Разбор — `lookupAnimalAction`.
 */

export type BullMatch = {
  id: number
  identNumber: string
  name?: string
  title: string
  hint?: string
}

const MIN_QUERY = 2
const LIMIT = 8

export async function searchBullAction(query: string): Promise<BullMatch[]> {
  const q = query.trim()
  if (q.length < MIN_QUERY) return []

  const user = await getCurrentUser()
  const payload = await getClient()

  const found = await payload
    .find({
      collection: 'animals',
      overrideAccess: false,
      ...(user ? { user } : {}),
      depth: 1,
      limit: LIMIT,
      sort: '-ipcRank',
      where: {
        and: [
          { sex: { equals: 'male' } },
          { archived: { not_equals: true } },
          { or: [{ identNumber: { like: q } }, { name: { like: q } }] },
        ],
      },
    })
    .catch(() => null)

  if (!found) return []

  return found.docs.map((a) => {
    const owner =
      a.owner && typeof a.owner === 'object'
        ? ((a.owner as { shortName?: string | null; name?: string | null }).shortName ??
          (a.owner as { name?: string | null }).name ??
          '')
        : ''

    return {
      id: a.id,
      identNumber: a.identNumber,
      name: a.name ?? undefined,
      title: a.name ? `${a.name} · ${a.identNumber}` : a.identNumber,
      /*
       * В подсказке — владелец и год рождения, а не оценка. Оценку человек
       * увидит в таблице, куда быка и добавляет; показывать её дважды
       * значит предлагать выбрать до сравнения, ради которого он пришёл.
       */
      hint: [owner, a.birthDate ? new Date(a.birthDate).getFullYear() : null]
        .filter(Boolean)
        .join(' · '),
    }
  })
}
