'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { collectFromForm } from '@/lib/animal-edit'

/**
 * Ручной ввод и правка карточки животного (ТЗ, п. 1.4 и 1.6).
 *
 * Загрузка файлом остаётся основным способом — ей вводят стадо. Руками
 * заводят то, что файлом не приходит: одно купленное животное, исправление
 * опечатки в номере, уточнение происхождения по бумажному свидетельству.
 *
 * Правки поблочные, а не «форма на всю карточку». Причина простая:
 * в карточке под две сотни полей, и форма, отправляющая их все, при каждом
 * сохранении переписывает то, чего человек не трогал, — а журнал правок
 * честно записывает это как изменения. Поэтому каждая форма присылает
 * только свои поля, а действие обновляет ровно пришедшее.
 */

export type AnimalFormState = {
  error?: string
  message?: string
  /** Найденный дубль по индивидуальному номеру — показать вместо создания второго */
  duplicate?: { id: number; identNumber: string; owner: string; mine: boolean }
  /** Куда идти после успешного создания */
  createdId?: number
}

const orgOf = (user: { organization?: unknown }) => relId(user.organization)

/*
 * Кто вправе править карточку.
 *
 * Право на правку — не то же, что право видеть. Видеть запись может любой,
 * кому её открыли; менять — только хозяйство-владелец и администратор.
 * Иначе открытый доступ к карточке означал бы разрешение её переписать.
 */
type Actor = { id: number; role?: string | null; organization?: unknown }

const mayEdit = (user: Actor, ownerId: number | null): boolean =>
  user.role === 'admin' || (ownerId !== null && orgOf(user) === ownerId)

/** Ищет животное по индивидуальному номеру — мимо прав, иначе дубль не увидеть */
async function findByIdent(identNumber: string) {
  const payload = await getClient()
  const { docs } = await payload.find({
    collection: 'animals',
    where: { identNumber: { equals: identNumber } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  return docs[0]
}

/**
 * Создание карточки вручную.
 *
 * Дубль по индивидуальному номеру — не ошибка ввода, а обычная жизненная
 * ситуация: животное купили, и у прежнего хозяйства карточка уже есть.
 * Поэтому вместо «номер занят» показывается сама запись и предлагается
 * запросить к ней доступ: одно животное — одна карточка, у неё меняется
 * владелец, а не заводится вторая с той же биркой.
 */
export async function createAnimalAction(
  _prev: AnimalFormState,
  formData: FormData,
): Promise<AnimalFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const orgId = orgOf(user)
  if (!orgId) return { error: 'У пользователя не заполнена организация' }

  const identNumber = String(formData.get('identNumber') || '').trim()
  if (!identNumber) return { error: 'Индивидуальный номер обязателен' }

  const existing = await findByIdent(identNumber)
  if (existing) {
    const ownerId = relId(existing.owner)
    const ownerName =
      typeof existing.owner === 'object' && existing.owner
        ? ((existing.owner as { name?: string }).name ?? 'другое хозяйство')
        : 'другое хозяйство'
    return {
      duplicate: {
        id: existing.id as number,
        identNumber: existing.identNumber,
        owner: ownerName,
        mine: ownerId === orgId,
      },
    }
  }

  const data = collectFromForm(formData)
  data.identNumber = identNumber
  data.owner = orgId
  data.author = user.id
  /*
   * Уровень достоверности вручную заведённой записи — «черновик».
   * Это не недоверие к человеку: ассоциация подтверждает данные по
   * документам и лабораторным отчётам, а не по факту ввода. Поднимают
   * уровень проверкой пакета или решением ассоциации.
   */
  data.trustLevel = 0

  const payload = await getClient()
  let created: { id: number } | null = null
  try {
    created = (await payload.create({
      collection: 'animals',
      data: data as never,
      overrideAccess: true,
      user,
      // Создание — не правка: журналу нечего сравнивать, вся карточка новая
      context: { skipJournal: true },
    })) as { id: number }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось создать запись' }
  }

  revalidatePath('/account')
  revalidatePath('/animals')
  return { message: 'Карточка создана', createdId: created.id }
}

/**
 * Правка одного блока карточки.
 *
 * Обновляются только пришедшие поля: остальные не трогаются вовсе, поэтому
 * в журнале не появляется ни одной выдуманной строки. Смена владельца
 * и уровня достоверности через эту форму невозможна — это не правка данных,
 * а передача животного и решение ассоциации, у них свои пути.
 */
export async function updateAnimalAction(
  _prev: AnimalFormState,
  formData: FormData,
): Promise<AnimalFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) return { error: 'Животное не определено' }

  const payload = await getClient()
  const animal = await payload.findByID({
    collection: 'animals',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if (!animal) return { error: 'Запись не найдена' }

  if (!mayEdit(user as Actor, relId(animal.owner))) {
    return { error: 'Править карточку может только хозяйство-владелец' }
  }

  const data = collectFromForm(formData)
  delete data.owner
  delete data.trustLevel
  delete data.trustCheckedAt

  if (!Object.keys(data).length) return { message: 'Изменений нет' }

  try {
    await payload.update({
      collection: 'animals',
      id,
      data: data as never,
      overrideAccess: true,
      user,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось сохранить' }
  }

  revalidatePath(`/animals/${id}`)
  revalidatePath('/account')
  return { message: 'Сохранено' }
}
