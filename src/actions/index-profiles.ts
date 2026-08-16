'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getClient, getCurrentUser } from '@/lib/payload'
import { TRAIT_BASE, type TraitKey } from '@/lib/breeding-index'
import { builtinByKey, ownIdOf, isOwnKey } from '@/lib/index-profiles'
import type { IndexProfile as IndexProfileDoc } from '@/payload-types'

export type FormState = { error?: string; message?: string }

const orgOf = (user: { organization?: unknown }) =>
  typeof user.organization === 'object' && user.organization
    ? (user.organization as { id: number }).id
    : (user.organization as number | undefined)

/** Профиль принадлежит организации пользователя — иначе трогать нельзя. */
async function ownProfile(id: string, orgId: number) {
  const payload = await getClient()
  const doc = (await payload.findByID({
    collection: 'index-profiles',
    id,
    overrideAccess: true,
  })) as IndexProfileDoc
  const owner =
    typeof doc.organization === 'object' && doc.organization ? doc.organization.id : doc.organization
  if (String(owner) !== String(orgId)) return null
  return doc
}

/**
 * Создать свой профиль — с нуля или скопировав встроенный.
 *
 * Копия встроенного — основной путь: набирать одиннадцать весов с чистого
 * листа мало кто станет, а «взять стандартный и добавить белка» — обычное
 * действие. Копия отвязана от оригинала намеренно: если Ассоциация пересмотрит
 * стандартный профиль, хозяйство не должно узнавать об этом по изменившемуся
 * рейтингу своих животных.
 */
export async function createProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }
  const orgId = orgOf(user)
  if (!orgId) return { error: 'Профиль принадлежит хозяйству, а ваша учётная запись к нему не привязана' }

  const from = String(formData.get('from') || '').trim()
  const source = from ? builtinByKey(from) : null
  const name = String(formData.get('name') || '').trim() || (source ? `${source.name} — копия` : 'Новый профиль')

  const weights: { trait: TraitKey; weight: number }[] = source
    ? (Object.entries(source.weights) as [TraitKey, number][]).map(([trait, weight]) => ({
        trait,
        weight: weight ?? 0,
      }))
    : TRAIT_BASE.map((t) => ({ trait: t.key, weight: 0 }))

  const payload = await getClient()
  let created: IndexProfileDoc
  try {
    created = (await payload.create({
      collection: 'index-profiles',
      overrideAccess: true,
      data: {
        name,
        kind: source?.kind ?? 'selection',
        hint: source?.hint ?? '',
        organization: orgId,
        isDefault: false,
        weights,
        author: user.id,
      },
    })) as IndexProfileDoc
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось создать профиль' }
  }

  revalidatePath('/account/indices')
  redirect(`/account/indices/${created.id}`)
}

/** Сохранить веса профиля. */
export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }
  const orgId = orgOf(user)
  if (!orgId) return { error: 'Учётная запись не привязана к хозяйству' }

  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Профиль не указан' }
  const doc = await ownProfile(id, orgId)
  if (!doc) return { error: 'Профиль не найден или принадлежит другому хозяйству' }

  const name = String(formData.get('name') || '').trim()
  if (!name) return { error: 'У профиля должно быть название' }
  const kind = String(formData.get('kind') || 'selection') === 'economic' ? 'economic' : 'selection'

  const weights: { trait: TraitKey; weight: number }[] = []
  for (const t of TRAIT_BASE) {
    const raw = formData.get(`w_${t.key}`)
    if (raw === null) continue
    const value = Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(value)) return { error: `Вес признака «${t.label}» — не число` }
    if (value === 0) continue // нулевой вес — то же, что отсутствие признака
    weights.push({ trait: t.key, weight: value })
  }

  if (weights.length === 0)
    return { error: 'Хотя бы у одного признака вес должен быть отличен от нуля' }

  const payload = await getClient()
  try {
    await payload.update({
      collection: 'index-profiles',
      id,
      overrideAccess: true,
      data: {
        name,
        kind,
        hint: String(formData.get('hint') || '').trim(),
        weights,
      },
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось сохранить профиль' }
  }

  revalidatePath('/account/indices')
  revalidatePath(`/account/indices/${id}`)
  const sum = weights.reduce((a, w) => a + Math.abs(w.weight), 0)
  return {
    message:
      kind === 'selection' && Math.round(sum) !== 100
        ? `Сохранено. Сумма влияний ${sum.toFixed(0)} % — при расчёте она приводится к 100 %`
        : 'Профиль сохранён',
  }
}

/**
 * Сделать профиль основным для хозяйства.
 *
 * Основной профиль — тот, по которому считается индекс в книге и в карточках
 * для всех сотрудников хозяйства. Встроенный профиль основным сделать нельзя
 * иначе как через отсутствие своего: пустой выбор означает стандартный ИПЦ
 * Ассоциации, и отдельной записи для этого не нужно.
 */
export async function setDefaultProfileAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  const orgId = orgOf(user)
  if (!orgId) return

  const key = String(formData.get('key') || '')
  const payload = await getClient()

  if (isOwnKey(key)) {
    const doc = await ownProfile(ownIdOf(key), orgId)
    if (!doc) return
    // Хук коллекции снимет признак с остальных профилей организации
    await payload.update({
      collection: 'index-profiles',
      id: doc.id,
      overrideAccess: true,
      data: { isDefault: true },
    })
  } else {
    // Возврат к стандартному профилю Ассоциации: своего основного больше нет
    await payload.update({
      collection: 'index-profiles',
      where: { and: [{ organization: { equals: orgId } }, { isDefault: { equals: true } }] },
      overrideAccess: true,
      data: { isDefault: false },
    })
  }

  revalidatePath('/account/indices')
  revalidatePath('/')
}

export async function deleteProfileAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser()
  if (!user) return
  const orgId = orgOf(user)
  if (!orgId) return
  const id = String(formData.get('id') || '')
  const doc = await ownProfile(id, orgId)
  if (!doc) return

  const payload = await getClient()
  await payload.delete({ collection: 'index-profiles', id, overrideAccess: true })
  revalidatePath('/account/indices')
  redirect('/account/indices')
}
