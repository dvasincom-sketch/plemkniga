'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { EXTERIOR_COMPOSITES, EXTERIOR_TRAITS } from '@/lib/dictionaries'

/**
 * Ввод событий с карточки животного.
 *
 * События заводят руками чаще, чем правят паспорт: запуск, перемещение
 * и выбытие — это то, что происходит со стадом каждую неделю, а файлом
 * приходит редко.
 *
 * Событие здесь не только запись в ленте. Выбытие меняет состояние
 * животного, перемещение — стадо. Иначе получалась бы система, где
 * в ленте написано «выбыло», а в карточке животное по-прежнему в стаде,
 * и оба утверждения одинаково официальны.
 */

export type EventFormState = { error?: string; message?: string }

type Actor = { id: number; role?: string | null; organization?: unknown }

const mayEdit = (user: Actor, ownerId: number | null): boolean =>
  user.role === 'admin' || (ownerId !== null && relId(user.organization) === ownerId)

const num = (form: FormData, key: string): number | null => {
  const raw = String(form.get(key) ?? '').trim()
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const iso = (form: FormData, key: string): string | null => {
  const raw = String(form.get(key) ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Общая часть: кто, к какому животному, вправе ли */
async function guard(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' as const }

  const animalId = Number(formData.get('animal'))
  if (!Number.isFinite(animalId) || animalId <= 0) return { error: 'Животное не определено' as const }

  const payload = await getClient()
  const animal = await payload.findByID({
    collection: 'animals',
    id: animalId,
    depth: 0,
    overrideAccess: true,
  })
  if (!animal) return { error: 'Запись не найдена' as const }

  if (!mayEdit(user as Actor, relId(animal.owner))) {
    return { error: 'Добавлять события может только хозяйство-владелец' as const }
  }

  return { user, payload, animal, animalId }
}

/**
 * Запуск, перемещение, выбытие.
 *
 * Отёл, осеменение, дойка и лечение сюда не входят: у каждого своя таблица,
 * и запись о том же факте в двух местах рано или поздно разойдётся. Оценка
 * экстерьера — тоже отдельно, у неё своя история со всеми линейными
 * признаками; ниже своё действие.
 */
export async function addEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animalId } = ctx

  const type = String(formData.get('type') || '')
  if (!['dryOff', 'move', 'disposal'].includes(type)) return { error: 'Неизвестный тип события' }

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата обязательна' }

  const comment = String(formData.get('comment') || '').trim()

  try {
    await payload.create({
      collection: 'events',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        type: type as 'dryOff' | 'move' | 'disposal',
        date,
        title: String(formData.get('title') || '').trim() || undefined,
        comment: comment || undefined,
        status: 'accepted',
      },
    })

    /*
     * Последствия события в карточке.
     *
     * Это не удобство, а условие непротиворечивости: лента и карточка
     * описывают одно животное, и «выбыло» в ленте при «в стаде» в карточке —
     * не два мнения, а поломка. Правки идут обычным путём, поэтому попадают
     * в журнал: видно, что состояние изменилось не вручную, а событием.
     */
    if (type === 'disposal') {
      const state = String(formData.get('state') || 'sold')
      const reason = num(formData, 'disposalReason')
      await payload.update({
        collection: 'animals',
        id: animalId,
        overrideAccess: true,
        user,
        data: {
          state: (['sold', 'culled', 'dead'].includes(state) ? state : 'sold') as
            | 'sold'
            | 'culled'
            | 'dead',
          ...(reason ? { disposalReason: reason } : {}),
        },
      })
    }

    if (type === 'move') {
      const herd = num(formData, 'herd')
      if (herd) {
        await payload.update({
          collection: 'animals',
          id: animalId,
          overrideAccess: true,
          user,
          data: { herd },
        })
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать событие' }
  }

  revalidatePath(`/animals/${animalId}`)
  revalidatePath('/account')
  return { message: 'Событие записано' }
}

/**
 * Оценка экстерьера.
 *
 * Пишется не в ленту событий, а в собственную таблицу истории: у оценки
 * восемнадцать линейных признаков, три композита, дата, бонитёр и номер
 * лактации — в поле «числовое значение» это не помещается, а главное,
 * помещаться и не должно. Лента карточки соберёт эту запись при показе,
 * поэтому в глазах пользователя событие всё равно окажется на месте.
 *
 * Хук коллекции сам снимет отметку «действующая» с прежней оценки
 * и перепишет снимок в карточке — здесь об этом заботиться не нужно.
 */
export async function addExteriorAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animalId } = ctx

  const assessedAt = iso(formData, 'assessedAt')
  if (!assessedAt) return { error: 'Дата оценки обязательна' }

  const scores: Record<string, number> = {}
  for (const t of [...EXTERIOR_TRAITS, ...EXTERIOR_COMPOSITES]) {
    const v = num(formData, t.key)
    if (v !== null) scores[t.key] = v
  }

  if (!Object.keys(scores).length) {
    return { error: 'Не заполнен ни один признак — записывать нечего' }
  }

  const assessor = num(formData, 'assessor')
  const lactation = num(formData, 'lactation')

  try {
    await payload.create({
      collection: 'animal-exteriors',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        assessedAt,
        isCurrent: true,
        ...(assessor ? { assessor } : {}),
        ...(lactation !== null ? { lactation } : {}),
        note: String(formData.get('note') || '').trim() || undefined,
        ...scores,
      } as never,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать оценку' }
  }

  revalidatePath(`/animals/${animalId}`)
  return { message: 'Оценка экстерьера записана' }
}
