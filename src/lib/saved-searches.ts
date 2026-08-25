import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import type { SavedSearchItem } from '@/components/SavedSearches'
import { FILTER_KEYS, type SearchParams } from '@/lib/animal-query'

/**
 * Сохранённые отборы для текущего человека и текущей страницы.
 *
 * ## Почему список читается правилами доступа, а не своим условием
 *
 * Соблазн был собрать `where` прямо здесь: свои плюс общие своего
 * хозяйства — условие короткое и очевидное. Оно и было бы второй копией
 * правила видимости, которое уже записано в `savedSearchRead`, и первая же
 * правка одного из двух развела бы их молча. Поэтому `overrideAccess: false`
 * и передача пользователя: правило одно, и оно там, где ему положено быть.
 */
export async function loadSavedSearches(
  payload: Payload,
  user: User | null,
  place: 'book' | 'herd',
): Promise<SavedSearchItem[]> {
  if (!user) return []

  const res = await payload
    .find({
      collection: 'saved-searches',
      where: { place: { equals: place } },
      limit: 50,
      depth: 0,
      sort: 'name',
      overrideAccess: false,
      user,
    })
    /*
     * Отказ запроса не роняет страницу — но и не превращается в пустой
     * ряд молча. Пустой список и несработавший запрос выглядят на экране
     * одинаково, а означают разное: во втором случае человек считает,
     * что его отборы пропали.
     */
    .catch((e: unknown) => {
      console.error('[saved-searches] список отборов не прочитался:', e)
      return null
    })

  if (!res) return []

  return res.docs.map((d) => ({
    id: d.id,
    name: String(d.name),
    query: String(d.query ?? ''),
    scope: d.scope === 'organization' ? 'organization' : 'private',
    /*
     * «Мой» — это про право переименовать, а не про авторство как факт.
     * Общий отбор, заведённый коллегой, в списке виден и открывается,
     * но настраивать его нельзя, и кнопки настройки у него нет: кнопка,
     * приводящая к отказу, — это обещание, которое система не исполнит.
     */
    mine: String(relId(d.author)) === String(user.id),
  }))
}

const relId = (v: unknown): number | string | null => {
  if (v === null || v === undefined) return null
  return typeof v === 'object' ? ((v as { id: number }).id ?? null) : (v as number | string)
}

/**
 * Строка запроса текущей страницы — только условия отбора.
 *
 * Собирается из тех же `FILTER_KEYS`, по которым страница рисует фишки
 * условий, и в их порядке. Порядок важен не для вида: одинаковый отбор,
 * собранный двумя путями, обязан давать одинаковую строку — иначе
 * «сохранить поверх прежнего» перестанет узнавать прежний.
 *
 * Номер страницы, порядок строк и профиль индекса сюда не попадают: это
 * не условия, а способ смотреть на результат. Сохранённый вместе с ними
 * отбор открывался бы на семнадцатой странице, потому что на ней его
 * завели.
 */
export function filterQueryOf(sp: SearchParams): string {
  const out = new URLSearchParams()
  for (const key of FILTER_KEYS) {
    const v = sp[key]
    const values = Array.isArray(v) ? v : v === undefined ? [] : [v]
    for (const value of values) if (String(value).trim() !== '') out.append(key, String(value))
  }
  return out.toString()
}
