'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'

/**
 * Ввод отёлов, осеменений и контрольных доек по одному.
 *
 * ## Почему это появилось
 *
 * До сих пор эти три вида записей приходили **только файлом**. Логика была
 * такая: их много, их выгружают из доильного зала и из программы техника,
 * руками их никто вводить не станет.
 *
 * Логика верна для тысячи записей и неверна для пяти. «Отелилось пять коров
 * за неделю» — самый частый случай в хозяйстве, и для него не годился
 * ни один из двух путей: файл ради пяти строк никто делать не будет,
 * а карточки этих записей вообще не принимали. В результате пять отёлов
 * ждали ближайшей общей выгрузки, то есть месяц, и всё это время книга
 * знала о стаде меньше, чем сам зоотехник.
 *
 * ## Что здесь считается за человека
 *
 * Номер отёла и номер лактации не спрашиваются. Их знает система: номер
 * отёла — следующий за последним записанным, номер лактации — столько же.
 * Спрашивать у человека число, которое можно посчитать, — верный способ
 * получить его неверным: именно так появляются два отёла с номером один
 * и дыры в нумерации, которые потом ловят проверки.
 *
 * Если отёлы записаны не подряд (учёт начали с середины жизни коровы),
 * следующий номер всё равно окажется верным относительно уже имеющихся —
 * а несовпадение с настоящим номером отёла поймает проверка
 * `calving-number-gap` и покажет эксперту.
 */

export type RecordState = { error?: string; message?: string; created?: number }

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

const text = (form: FormData, key: string): string | undefined =>
  String(form.get(key) ?? '').trim() || undefined

/**
 * Кто вводит и вправе ли.
 *
 * Тот же смысл, что у `guard` в `actions/events.ts`, и намеренно не общий
 * с ним код: там проверка привязана к ленте событий, здесь к таблицам
 * воспроизводства, и объединение свело бы два разных набора последствий
 * в одну функцию с флагами.
 */
async function guard(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' as const }

  const animalId = Number(formData.get('animal'))
  if (!Number.isFinite(animalId) || animalId <= 0) {
    return { error: 'Не выбрано животное' as const }
  }

  const payload = await getClient()
  const animal = await payload
    .findByID({ collection: 'animals', id: animalId, depth: 0, overrideAccess: true })
    .catch(() => null)

  if (!animal) return { error: 'Запись не найдена' as const }

  if (!mayEdit(user as Actor, relId(animal.owner))) {
    return { error: 'Записывать можно только по животным своего хозяйства' as const }
  }

  return { user, payload, animal, animalId }
}

/** Сколько отёлов у коровы уже записано — по нему считается следующий номер. */
async function calvingCount(
  payload: Awaited<ReturnType<typeof getClient>>,
  animalId: number,
): Promise<number> {
  const { docs } = await payload.find({
    collection: 'calvings',
    where: { animal: { equals: animalId } },
    limit: 50,
    sort: '-number',
    depth: 0,
    overrideAccess: true,
  })

  const top = docs.reduce((max, c) => (typeof c.number === 'number' && c.number > max ? c.number : max), 0)
  // Отёлы могли быть записаны без номеров вовсе — тогда считаем по их числу
  return Math.max(top, docs.length)
}

/* ------------------------------------------------------------------ */
/*  Отёл                                                               */
/* ------------------------------------------------------------------ */

export async function addCalvingAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animal, animalId } = ctx

  if (animal.sex === 'male') return { error: 'Отёл записывается корове, а не быку' }

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата отёла обязательна' }
  if (new Date(date).getTime() > Date.now()) return { error: 'Дата отёла не может быть в будущем' }

  const nextNumber = (await calvingCount(payload, animalId)) + 1

  try {
    const created = (await payload.create({
      collection: 'calvings',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        number: nextNumber,
        date,
        result: (text(formData, 'result') ?? undefined) as never,
        ease: (text(formData, 'ease') ?? undefined) as never,
        calfWeight: num(formData, 'calfWeight') ?? undefined,
        dryOffDate: iso(formData, 'dryOffDate') ?? undefined,
        comment: text(formData, 'comment'),
      } as never,
    })) as { id: number }

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: `Записан отёл № ${nextNumber}`, created: created.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать отёл' }
  }
}

/* ------------------------------------------------------------------ */
/*  Осеменение                                                         */
/* ------------------------------------------------------------------ */

export async function addInseminationAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animal, animalId } = ctx

  if (animal.sex === 'male') return { error: 'Осеменяют корову или тёлку, а не быка' }

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата осеменения обязательна' }
  if (new Date(date).getTime() > Date.now()) {
    return { error: 'Дата осеменения не может быть в будущем' }
  }

  /*
   * Номер отёла у осеменения — это отёл, к которому оно относится, то есть
   * тот, который наступит. У тёлки отёлов нет, и номер равен единице:
   * её осеменяют в счёт первого.
   */
  const lactationNumber = (await calvingCount(payload, animalId)) + 1

  const bull = num(formData, 'bull')

  try {
    await payload.create({
      collection: 'inseminations',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        date,
        lactationNumber,
        ...(bull ? { bull } : {}),
        attemptNumber: num(formData, 'attemptNumber') ?? undefined,
        doses: num(formData, 'doses') ?? 1,
        technician: num(formData, 'technician') ?? undefined,
        comment: text(formData, 'comment'),
        source: 'manual',
      } as never,
    })

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: 'Осеменение записано' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать осеменение' }
  }
}

/* ------------------------------------------------------------------ */
/*  Контрольная дойка                                                  */
/* ------------------------------------------------------------------ */

export async function addMilkTestAction(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const ctx = await guard(formData)
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, animalId } = ctx

  const date = iso(formData, 'date')
  if (!date) return { error: 'Дата дойки обязательна' }
  if (new Date(date).getTime() > Date.now()) {
    return { error: 'Дата контрольной дойки не может быть в будущем' }
  }

  const dailyYield = num(formData, 'dailyYield')
  if (dailyYield === null) return { error: 'Удой за день обязателен' }

  const lactationNumber = await calvingCount(payload, animalId)

  try {
    await payload.create({
      collection: 'milk-tests',
      overrideAccess: true,
      user,
      data: {
        animal: animalId,
        date,
        dailyYield,
        ...(lactationNumber ? { lactationNumber } : {}),
        fatPercent: num(formData, 'fatPercent') ?? undefined,
        proteinPercent: num(formData, 'proteinPercent') ?? undefined,
        somaticCells: num(formData, 'somaticCells') ?? undefined,
        /*
         * Источник — «собственник», а не «лаборатория». Разница не
         * формальная: лабораторный замер и собственный имеют разный вес,
         * и записывать введённое руками как лабораторное значило бы
         * повышать доверие к числу самим фактом его ввода.
         */
        source: 'owner',
      } as never,
    })

    revalidatePath(`/animals/${animalId}`)
    revalidatePath('/account')

    return { message: 'Контрольная дойка записана' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось записать дойку' }
  }
}
