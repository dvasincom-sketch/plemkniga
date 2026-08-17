'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { forgetGrants } from '@/lib/grants'

export type GrantFormState = { error?: string; message?: string }

const orgOf = (user: unknown): number | null =>
  relId((user as { organization?: unknown } | null)?.organization)

/**
 * Отозвать выданный доступ.
 *
 * Отзыв — отметка, а не удаление: на удалённый грант ссылались бы записи
 * журнала просмотров, которые нечем объяснить (тот же довод, что у отзыва
 * документа, решение №37). Строка остаётся и показывается в списке серым.
 *
 * Действует со следующего запроса: `forgetGrants` сбрасывает память
 * загрузчика в этом же процессе, а хук коллекции делает то же самое ещё раз.
 * Двойная работа здесь дешевле, чем разбираться, почему отозванный доступ
 * прожил лишние две секунды.
 */
export async function revokeGrantAction(
  _prev: GrantFormState,
  formData: FormData,
): Promise<GrantFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const id = Number(formData.get('grant'))
  if (!Number.isFinite(id) || id <= 0) return { error: 'Доступ не определён' }

  const payload = await getClient()

  try {
    /*
     * С правами пользователя: правило `accessGrantIssue` отдаёт условие
     * «владелец — моя организация», и чужой грант просто не найдётся.
     * Проверять принадлежность в коде отдельно не нужно — это то же самое
     * правило в двух местах, и однажды они разойдутся.
     */
    const updated = await payload.update({
      collection: 'access-grants',
      id,
      data: { revokedAt: new Date().toISOString() },
      user,
      overrideAccess: false,
      depth: 0,
    })

    forgetGrants(relId((updated as { grantee?: unknown }).grantee))
  } catch {
    return { error: 'Не удалось отозвать доступ' }
  }

  revalidatePath('/account/access')
  return { message: 'Доступ отозван' }
}

/**
 * Закрыть запись, открытую прежними одобрениями, и выдать точечный доступ.
 *
 * До появления грантов одобрение запроса выставляло животному `publicVisible`
 * и `publicDetails`, то есть открывало карточку всему свету. Такие записи
 * остались публичными и остаются: владелец нажимал кнопку, зная последствие,
 * и молча вернуть замок значило бы изменить видимость чужих данных без
 * спроса — та же ошибка с другого конца.
 *
 * Здесь решение принимает владелец, и оно устроено так, чтобы никто ничего
 * не потерял неожиданно:
 *
 *  - закрывается только `publicDetails`. `publicVisible` не трогается:
 *    запись остаётся в книге строкой с замком — обычное «закрыто», а не
 *    исчезновение из книги. Каким флаг был до одобрения, система не помнит,
 *    и угадывать не станет;
 *  - тем, чьи запросы когда-то одобрили, выдаётся бессрочный грант на все
 *    четыре области. Это ровно то, что у них было: полная карточка без срока.
 *    Меньше — значит отобрать данные у того, кому их дали.
 */
export async function replacePublicWithGrantsAction(
  _prev: GrantFormState,
  formData: FormData,
): Promise<GrantFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const org = orgOf(user)
  if (!org) return { error: 'У вас нет организации' }

  const animalId = Number(formData.get('animal'))
  if (!Number.isFinite(animalId) || animalId <= 0) return { error: 'Запись не определена' }

  const payload = await getClient()

  try {
    const animal = await payload.findByID({
      collection: 'animals',
      id: animalId,
      depth: 0,
      overrideAccess: true,
    })

    if (relId((animal as { owner?: unknown })?.owner) !== org) {
      return { error: 'Это не ваша запись' }
    }

    // Кому когда-то открыли — тем и выдаём
    const approved = await payload.find({
      collection: 'access-requests',
      where: {
        and: [{ animal: { equals: animalId } }, { status: { equals: 'approved' } }],
      },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })

    const grantees = new Set<number>()
    for (const doc of approved.docs) {
      const grantee = relId((doc as { requesterOrg?: unknown }).requesterOrg)
      if (grantee && grantee !== org) grantees.add(grantee)
    }

    for (const grantee of grantees) {
      // Второй грант тому же хозяйству по тому же животному не нужен
      const existing = await payload.find({
        collection: 'access-grants',
        where: {
          and: [
            { grantee: { equals: grantee } },
            { animal: { equals: animalId } },
            { revokedAt: { exists: false } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (existing.docs.length) continue

      await payload.create({
        collection: 'access-grants',
        data: {
          owner: org,
          grantee,
          animal: animalId,
          scopes: ['origin', 'production', 'evaluation', 'documents'],
          note: 'Взамен публичной карточки, открытой по прежнему запросу',
        },
        user,
        overrideAccess: true,
      })
      forgetGrants(grantee)
    }

    await payload.update({
      collection: 'animals',
      id: animalId,
      data: { publicDetails: false },
      user,
      overrideAccess: false,
    })
  } catch {
    return { error: 'Не удалось закрыть запись' }
  }

  revalidatePath('/account/access')
  revalidatePath(`/animals/${animalId}`)
  return {
    message: 'Карточка закрыта, доступ выдан тем, кому её открывали',
  }
}
