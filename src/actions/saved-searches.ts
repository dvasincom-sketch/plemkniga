'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { FILTER_KEYS } from '@/lib/animal-query'

/**
 * Именованные отборы: завести, переименовать, открыть хозяйству, убрать.
 *
 * ## Почему строка запроса пересобирается, а не берётся как прислали
 *
 * В форму приходит адрес страницы целиком, и в нём, кроме условий, стоит
 * всё остальное: номер страницы, порядок строк, профиль индекса, сколько
 * записей показано. Сохранив это как есть, мы сохранили бы не отбор,
 * а состояние экрана — и набор «коровы с высоким удоем» открывался бы
 * на семнадцатой странице, потому что на ней его завели.
 *
 * Поэтому берутся только ключи из `FILTER_KEYS` — того же списка, по
 * которому страница показывает фишки условий. Список один, значит
 * сохранённое и показанное не разойдутся.
 */

export type SavedSearchState = { error?: string; ok?: boolean; id?: number | string }

/** Ключи, которые пришли из формы, но условиями отбора не являются. */
const cleanQuery = (raw: string): string => {
  const from = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
  const out = new URLSearchParams()

  /*
   * Порядок ключей задаётся `FILTER_KEYS`, а не порядком в адресе.
   * Иначе один и тот же отбор, собранный двумя путями, дал бы две разные
   * строки — и проверка «такой набор уже есть» перестала бы работать.
   */
  for (const key of FILTER_KEYS) {
    const values = from.getAll(key).filter((v) => v.trim() !== '')
    for (const v of values) out.append(key, v)
  }

  return out.toString()
}

const actorOf = async () => {
  const user = await getCurrentUser()
  if (!user) return null
  const organization =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)
  return { user, organization }
}

export async function saveSearchAction(
  _prev: SavedSearchState,
  formData: FormData,
): Promise<SavedSearchState> {
  const actor = await actorOf()
  if (!actor) return { error: 'Требуется авторизация' }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Назовите отбор — по названию его и будут искать' }
  if (name.length > 80) return { error: 'Название длиннее 80 знаков' }

  const query = cleanQuery(String(formData.get('query') ?? ''))
  /*
   * Пустой отбор сохранить нельзя, и это не придирка: набор без условий —
   * это «все животные», то есть страница, на которую и так ведёт первая
   * же ссылка. Сохранив его, человек заведёт в списке строку, которая
   * ничего не делает, и решит, что сохранение сломано.
   */
  if (!query) return { error: 'Сначала задайте условия отбора — сохранять пока нечего' }

  const place = String(formData.get('place') ?? 'book') === 'herd' ? 'herd' : 'book'
  const scope =
    String(formData.get('scope') ?? 'private') === 'organization' ? 'organization' : 'private'

  const payload = await getClient()

  /*
   * Одинаковых названий в одном месте не заводим. Два «Кандидаты
   * на выбраковку» с разными условиями — это не два отбора, а один,
   * который кто-то пересохранил, забыв про первый; выбирать между ними
   * в списке нечем, они называются одинаково.
   */
  const same = await payload.find({
    collection: 'saved-searches',
    where: {
      and: [
        { author: { equals: actor.user.id } },
        { place: { equals: place } },
        { name: { equals: name } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (same.docs.length) {
    /*
     * Существующий отбор с тем же именем переписывается, а не отвергается.
     * Это осознанный выбор в пользу того, зачем человек нажал кнопку:
     * он подправил пороги и сохраняет «тот же самый» отбор. Отказ заставил
     * бы его сначала идти удалять старый, и обещание, что имя занято,
     * прозвучало бы как поломка.
     */
    const updated = await payload.update({
      collection: 'saved-searches',
      id: same.docs[0]!.id,
      data: { query, scope },
      overrideAccess: false,
      user: actor.user,
    })
    revalidatePath(place === 'herd' ? '/account' : '/')
    return { ok: true, id: updated.id }
  }

  const created = await payload.create({
    collection: 'saved-searches',
    data: {
      name,
      query,
      place,
      scope,
      author: actor.user.id,
      organization: actor.organization,
    },
    overrideAccess: true,
  })

  revalidatePath(place === 'herd' ? '/account' : '/')
  return { ok: true, id: created.id }
}

/**
 * Переименовать отбор или сменить его видимость.
 *
 * Условия не меняются здесь никогда: изменить их можно только пересохранив
 * отбор с той же страницы, где они видны. Правка условий «вслепую», из
 * списка, означала бы менять смысл набора, не глядя на то, что он находит.
 */
export async function updateSearchAction(
  _prev: SavedSearchState,
  formData: FormData,
): Promise<SavedSearchState> {
  const actor = await actorOf()
  if (!actor) return { error: 'Требуется авторизация' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Не указан отбор' }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Название не может быть пустым' }

  const scope =
    String(formData.get('scope') ?? 'private') === 'organization' ? 'organization' : 'private'

  const payload = await getClient()

  try {
    await payload.update({
      collection: 'saved-searches',
      id,
      data: { name, scope },
      overrideAccess: false,
      user: actor.user,
    })
  } catch {
    /*
     * Правило доступа отвечает отказом и на «нет такого», и на «не ваш».
     * Различать их в ответе не надо: сообщение «отбор не найден» на чужой
     * записи и есть верный ответ — для этого человека её действительно нет.
     */
    return { error: 'Отбор не найден или он не ваш' }
  }

  revalidatePath('/account')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteSearchAction(
  _prev: SavedSearchState,
  formData: FormData,
): Promise<SavedSearchState> {
  const actor = await actorOf()
  if (!actor) return { error: 'Требуется авторизация' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Не указан отбор' }

  const payload = await getClient()

  try {
    await payload.delete({
      collection: 'saved-searches',
      id,
      overrideAccess: false,
      user: actor.user,
    })
  } catch {
    return { error: 'Отбор не найден или удалять его вам нельзя' }
  }

  revalidatePath('/account')
  revalidatePath('/')
  return { ok: true }
}
