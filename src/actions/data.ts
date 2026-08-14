'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { parseCsv } from '@/lib/csv'

export type ImportState = {
  error?: string
  created?: number
  updated?: number
  skipped?: number
  ok?: boolean
}

/** Заголовки CSV, которые понимает импорт (регистр не важен). */
const MAP: Record<string, string> = {
  'инд.№': 'identNumber',
  'инд№': 'identNumber',
  'индивидуальный номер': 'identNumber',
  identnumber: 'identNumber',
  кличка: 'name',
  name: 'name',
  пол: 'sex',
  sex: 'sex',
  'дата рождения': 'birthDate',
  birthdate: 'birthDate',
  возраст: 'ageGroup',
  состояние: 'state',
  'удой': 'milkYield',
  'удой, л': 'milkYield',
  'жир, %': 'fatPercent',
  'белок, %': 'proteinPercent',
  'жир, кг': 'fatKg',
  'белок, кг': 'proteinKg',
  ипц: 'ipc',
  ipc: 'ipc',
}

const numOrUndef = (v?: string) => {
  if (!v) return undefined
  const n = Number(v.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

const sexOf = (v?: string) => {
  const s = (v || '').trim().toLowerCase()
  if (['ж', 'f', 'female', 'женский'].includes(s)) return 'female'
  if (['м', 'm', 'male', 'мужской'].includes(s)) return 'male'
  return undefined
}

export async function importAnimalsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)
  if (!orgId) return { error: 'У пользователя не заполнена организация' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Выберите CSV-файл' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Файл больше 8 МБ' }

  const rows = parseCsv(await file.text())
  if (rows.length < 2) return { error: 'В файле нет строк с данными' }

  const header = rows[0].map((h) => MAP[h.trim().toLowerCase()] ?? h.trim())
  const idIdx = header.indexOf('identNumber')
  if (idIdx === -1)
    return { error: 'В файле не найдена колонка «Инд.№» (identNumber)' }

  const payload = await getClient()
  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of rows.slice(1)) {
    const get = (key: string) => {
      const i = header.indexOf(key)
      return i === -1 ? undefined : row[i]?.trim()
    }

    const identNumber = row[idIdx]?.trim()
    if (!identNumber) {
      skipped++
      continue
    }

    const data: Record<string, unknown> = {
      identNumber,
      name: get('name') || undefined,
      sex: sexOf(get('sex')) ?? 'female',
      owner: orgId,
      author: user.id,
      ipc: numOrUndef(get('ipc')),
      summary: {
        milkYield: numOrUndef(get('milkYield')),
        fatPercent: numOrUndef(get('fatPercent')),
        proteinPercent: numOrUndef(get('proteinPercent')),
        fatKg: numOrUndef(get('fatKg')),
        proteinKg: numOrUndef(get('proteinKg')),
      },
    }
    const birthDate = get('birthDate')
    if (birthDate && !Number.isNaN(Date.parse(birthDate))) data.birthDate = new Date(birthDate).toISOString()

    try {
      const existing = await payload.find({
        collection: 'animals',
        where: { identNumber: { equals: identNumber } },
        limit: 1,
        overrideAccess: true,
      })

      if (existing.totalDocs > 0) {
        const doc = existing.docs[0]
        const docOwner = typeof doc.owner === 'object' ? doc.owner.id : doc.owner
        if (docOwner !== orgId) {
          skipped++
          continue
        }
        await payload.update({
          collection: 'animals',
          id: doc.id,
          data: data as never,
          overrideAccess: true,
        })
        updated++
      } else {
        await payload.create({ collection: 'animals', data: data as never, overrideAccess: true })
        created++
      }
    } catch {
      skipped++
    }
  }

  revalidatePath('/account')
  return { ok: true, created, updated, skipped }
}
