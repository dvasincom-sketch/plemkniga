'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAssociationUser } from '@/lib/association'
import { thresholdSpec } from '@/lib/check-thresholds'

/**
 * Правка порогов проверок — сторона Ассоциации.
 *
 * ## Почему возврат к заложенному — отдельное действие, а не «введите старое число»
 *
 * Строка в базе означает «Ассоциация решила иначе». Если вернуть прежнее
 * значение вводом, строка останется, и каталог будет честно писать
 * «изменено Ассоциацией» о числе, которое ничем не отличается. Через год
 * это прочитают как решение, которого не было.
 *
 * Поэтому возврат удаляет строку. Отсутствие записи и есть «как заложено».
 */

export type ThresholdState = { error?: string; message?: string }

async function guard() {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' as const }
  if (!isAssociationUser(user)) {
    return { error: 'Пороги проверок меняет только Ассоциация' as const }
  }
  return { user, payload: await getClient() }
}

export async function setThresholdAction(
  _prev: ThresholdState,
  formData: FormData,
): Promise<ThresholdState> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload } = ctx

  const key = String(formData.get('key') || '').trim()
  const spec = thresholdSpec(key)
  if (!spec) return { error: 'Такого порога нет' }

  const raw = String(formData.get('value') || '').trim().replace(',', '.')
  const value = Number(raw)

  if (!raw || !Number.isFinite(value)) return { error: `«${spec.label}»: введите число` }

  if (value < spec.min || value > spec.max) {
    return {
      error:
        `«${spec.label}»: допустимо от ${spec.min} до ${spec.max} ${spec.unit}. ` +
        'За этими границами проверка не выключается, а перестаёт находить — ' +
        'то есть остаётся в списке действующих и молчит.',
    }
  }

  const note = String(formData.get('note') || '').trim()

  const existing = await payload
    .find({
      collection: 'check-thresholds',
      where: { key: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .then((r) => r.docs[0] ?? null)
    .catch(() => null)

  try {
    if (existing) {
      await payload.update({
        collection: 'check-thresholds',
        id: existing.id,
        overrideAccess: true,
        user,
        data: { value, note: note || undefined } as never,
      })
    } else {
      await payload.create({
        collection: 'check-thresholds',
        overrideAccess: true,
        user,
        data: { key, value, note: note || undefined } as never,
      })
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось сохранить порог' }
  }

  /*
   * Обновляются обе страницы, а не только та, где нажали. Каталог читает
   * хозяйство, и показывать ему прежнее число до случайного обновления
   * значило бы отправить его чинить данные под несуществующую границу.
   */
  revalidatePath('/association/checks')
  revalidatePath('/account/checks')
  return { message: `«${spec.label}» — ${value} ${spec.unit}` }
}

export async function resetThresholdAction(
  _prev: ThresholdState,
  formData: FormData,
): Promise<ThresholdState> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  const { payload } = ctx

  const key = String(formData.get('key') || '').trim()
  const spec = thresholdSpec(key)
  if (!spec) return { error: 'Такого порога нет' }

  const existing = await payload
    .find({
      collection: 'check-thresholds',
      where: { key: { equals: key } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .then((r) => r.docs[0] ?? null)
    .catch(() => null)

  if (!existing) return { message: 'Порог и так заложенный' }

  await payload.delete({
    collection: 'check-thresholds',
    id: existing.id,
    overrideAccess: true,
  })

  revalidatePath('/association/checks')
  revalidatePath('/account/checks')
  return { message: `«${spec.label}» — снова ${spec.default} ${spec.unit}` }
}
