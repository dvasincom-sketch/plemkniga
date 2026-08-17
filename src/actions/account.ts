'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'

export type FormState = { error?: string; message?: string }

const orgOf = (user: { organization?: unknown }) =>
  typeof user.organization === 'object' && user.organization
    ? (user.organization as { id: number }).id
    : (user.organization as number | undefined)

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const get = (k: string) => String(formData.get(k) || '').trim()
  const payload = await getClient()

  /*
   * Обновляем только те поля, которые реально пришли в форме.
   *
   * Профиль разбит на вкладки, и каждая отправляет свою часть. Раньше
   * отсутствующее поле трактовалось как пустое, и сохранение вкладки
   * «Организация» стирало отчество и должность пользователя.
   */
  const pick = (keys: string[]) => {
    const out: Record<string, string | boolean> = {}
    for (const k of keys) if (formData.has(k)) out[k] = get(k)
    return out
  }

  try {
    const userData = pick(['lastName', 'firstName', 'middleName', 'phone', 'position'])

    // Флажки уведомлений приходят только когда включены
    if (formData.has('notificationsForm')) {
      userData.notifySubmissions = formData.has('notifySubmissions')
      userData.notifyTrust = formData.has('notifyTrust')
      userData.notifyNews = formData.has('notifyNews')
    }

    if (Object.keys(userData).length > 0) {
      await payload.update({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
        data: userData,
      })
    }

    const orgId = orgOf(user)
    if (orgId && formData.has('orgName')) {
      await payload.update({
        collection: 'organizations',
        id: orgId,
        overrideAccess: true,
        data: {
          name: get('orgName'),
          inn: get('inn') || undefined,
          address: get('address') || undefined,
          phone: get('orgPhone') || undefined,
        },
      })
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось сохранить' }
  }

  revalidatePath('/account')
  revalidatePath('/account/profile')
  return { message: 'Изменения сохранены' }
}

/** Массовое включение/выключение публичного показа стада. */
export async function setHerdVisibilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }
  const orgId = orgOf(user)
  if (!orgId) return { error: 'У пользователя не заполнена организация' }

  const visible = formData.get('publicVisible') === 'on'
  const details = formData.get('publicDetails') === 'on'

  const payload = await getClient()

  /*
   * Показ в общей книге — то, за что ручается Ассоциация, поэтому он
   * доступен её членам. Скрыть свои записи можно всегда: запрет должен
   * мешать выставлять данные, а не убирать их.
   */
  if (visible) {
    const { membershipGate } = await import('@/lib/membership')
    const gate = await membershipGate(payload, orgId)
    if (!gate.allowed) return { error: gate.reason }
  }
  const res = await payload.update({
    collection: 'animals',
    where: { owner: { equals: orgId } },
    overrideAccess: true,
    data: { publicVisible: visible, publicDetails: visible && details },
  })

  revalidatePath('/account')
  revalidatePath('/')
  return { message: `Обновлено записей: ${res.docs.length}` }
}

/**
 * Публичность одной записи.
 *
 * Переключатель на всё стадо остаётся: заводя хозяйство, публичность решают
 * оптом, и гонять человека по тысяче животных незачем. Но оптом решается
 * не всё — одного быка выставляют на продажу и открывают, пока остальное
 * стадо закрыто, одну корову закрывают перед сделкой.
 *
 * С появлением точечного доступа несоответствие стало заметным: грант
 * выдаётся по одному животному, а публичность — только всему стаду сразу.
 *
 * Запись идёт с правами пользователя: правило `animalMutate` само отсекает
 * чужих животных. Проверять владельца здесь второй раз — значит завести
 * то же правило в двух местах, и однажды они разойдутся.
 */
export async function setAnimalVisibilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const animalId = Number(formData.get('animal'))
  if (!Number.isFinite(animalId) || animalId <= 0) return { error: 'Животное не определено' }

  const visible = formData.get('publicVisible') === 'on'
  const details = formData.get('publicDetails') === 'on'

  const payload = await getClient()

  /*
   * Показ в общей книге — то, за что ручается Ассоциация, поэтому он открыт
   * её членам. Скрыть свою запись можно всегда: запрет должен мешать
   * выставлять данные, а не убирать их. То же правило, что у настройки
   * на всё стадо.
   */
  if (visible) {
    const orgId = orgOf(user)
    if (!orgId) return { error: 'У пользователя не заполнена организация' }
    const { membershipGate } = await import('@/lib/membership')
    const gate = await membershipGate(payload, orgId)
    if (!gate.allowed) return { error: gate.reason }
  }

  try {
    await payload.update({
      collection: 'animals',
      id: animalId,
      // Вторая ступень без первой не значит ничего: карточка записи,
      // которой нет в книге, не откроется всё равно
      data: { publicVisible: visible, publicDetails: visible && details },
      user,
      overrideAccess: false,
    })
  } catch {
    return { error: 'Не удалось сохранить: запись не ваша или недоступна' }
  }

  revalidatePath(`/animals/${animalId}`)
  revalidatePath('/account')
  revalidatePath('/')
  return {
    message: visible
      ? details
        ? 'Запись видна в книге, карточка открыта'
        : 'Запись видна в книге, карточка закрыта'
      : 'Запись убрана из книги',
  }
}
