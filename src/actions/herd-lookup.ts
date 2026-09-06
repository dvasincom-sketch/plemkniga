'use server'

import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'

/**
 * Поиск животного в своём стаде — для форм, где надо назвать животное.
 *
 * ## Почему поиск, а не список
 *
 * У хозяйства сотни и тысячи голов. Выпадающий список на три тысячи строк
 * бесполезен обеим сторонам: человеку в нём не найти, браузеру не отрисовать.
 * Зоотехник при этом номер знает — он его читает с бирки, — и печатать
 * четыре цифры быстрее, чем листать.
 *
 * ## Почему только своё
 *
 * Формы, которые этим пользуются, записывают события и родство. И то
 * и другое можно делать только со своими животными: отёл чужой коровы
 * записывать некому, а поставить чужую корову матерью своего телёнка —
 * это уже подделка происхождения. Ограничение стоит здесь, а не в форме:
 * форма — это подсказка, а не право.
 *
 * Заведение карточки с предком из чужого стада — другой случай, и у него
 * свой путь: номер переписывается со свидетельства, а связь устанавливается
 * по номеру (`lookupAnimalAction`). Там чужое животное назвать можно,
 * потому что там его не изменяют.
 */

export type HerdMatch = {
  id: number
  identNumber: string
  name?: string
  /** Кличка и номер одной строкой — то, что видит человек в списке. */
  title: string
  hint?: string
}

/** Минимальная длина запроса: по одной цифре искать нечего. */
const MIN_QUERY = 2
const LIMIT = 8

const AGE_HINT: Record<string, string> = {
  calf: 'телёнок',
  heifer: 'тёлка',
  firstCalf: 'первотёлка',
  cow: 'корова',
  bull: 'бык',
}

export type HerdSearch = {
  query: string
  /** Ограничить пол: у отёла корова, у осеменения бык-производитель. */
  sex?: 'male' | 'female'
  /** Исключить животное из выдачи — чтобы корова не стала матерью самой себе. */
  exclude?: number
}

export async function searchHerdAction(input: HerdSearch): Promise<HerdMatch[]> {
  const query = input.query.trim()
  if (query.length < MIN_QUERY) return []

  const user = await getCurrentUser()
  if (!user) return []

  const orgId = relId(user.organization)
  if (!orgId) return []

  const payload = await getClient()

  /*
   * Ищется и по номеру, и по кличке. Номер знают наизусть, кличку помнят —
   * и какой из двух способов человеку ближе, зависит от хозяйства, а не
   * от нас. `contains` вместо `like` с начала строки: номера длинные,
   * и последние четыре цифры человек помнит лучше первых десяти.
   */
  const res = await payload
    .find({
      collection: 'animals',
      where: {
        and: [
          { owner: { equals: orgId } },
          { archived: { not_equals: true } },
          ...(input.sex ? [{ sex: { equals: input.sex } }] : []),
          ...(input.exclude ? [{ id: { not_equals: input.exclude } }] : []),
          {
            or: [{ identNumber: { contains: query } }, { name: { contains: query } }],
          },
        ],
      },
      limit: LIMIT,
      sort: 'identNumber',
      depth: 0,
      overrideAccess: true,
    })
    /*
     * Отказ выборки виден в логе: пустой список подсказки читается как
     * «в стаде никого не нашли», и человек начинает искать причину
     * в собственном номере.
     */
    .catch((e: unknown) => {
      console.error('[plemkniga] подсказка по стаду не выполнилась:', e)
      return null
    })

  if (!res) return []

  return res.docs.map((a) => {
    const name = a.name ?? undefined
    return {
      id: a.id as number,
      identNumber: a.identNumber,
      name,
      title: name ? `${name} · ${a.identNumber}` : a.identNumber,
      hint: a.ageGroup ? AGE_HINT[a.ageGroup] : undefined,
    }
  })
}
