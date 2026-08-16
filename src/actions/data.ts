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
  /** Пакет загрузки, заведённый этим импортом. */
  submissionId?: number | string
  submissionNumber?: string
  /** Непринятые строки с причинами — чтобы «пропущено 4» можно было понять. */
  issues?: { row: number; ident?: string; reason: string }[]
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
  /*
   * Записи, которых коснулся файл. Нужны пакету: проверка Ассоциации
   * и последующая публикация касаются именно их, а не всего стада.
   */
  const touched: number[] = []
  /*
   * Причины отказа. Проверки живут в коллекции животных — формат номера,
   * даты, родословная, — и сообщение об ошибке возникает ровно здесь,
   * в момент разбора строки. Не записав его сейчас, мы теряем его совсем
   * и оставляем человека с числом «пропущено 4» без объяснения.
   * Первых пятидесяти хватает: дальше это уже не разбор, а другой файл.
   */
  const issues: { row: number; ident?: string; reason: string }[] = []
  const skip = (line: number, reason: string, ident?: string) => {
    skipped++
    if (issues.length < 50) issues.push({ row: line, ident, reason })
  }

  for (const [i, row] of rows.slice(1).entries()) {
    // Номер строки, как его видит человек в редакторе: заголовок — первая
    const line = i + 2

    const get = (key: string) => {
      const idx = header.indexOf(key)
      return idx === -1 ? undefined : row[idx]?.trim()
    }

    const identNumber = row[idIdx]?.trim()
    if (!identNumber) {
      skip(line, 'Пустой индивидуальный номер')
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
          skip(line, 'Запись принадлежит другой организации', identNumber)
          continue
        }
        await payload.update({
          collection: 'animals',
          id: doc.id,
          data: data as never,
          overrideAccess: true,
        })
        touched.push(doc.id as number)
        updated++
      } else {
        const doc = await payload.create({
          collection: 'animals',
          data: data as never,
          overrideAccess: true,
        })
        touched.push(doc.id as number)
        created++
      }
    } catch (e) {
      /*
       * Сообщения проверок написаны для человека («Некорректный
       * индивидуальный номер. Национальный номер РФ: от 6 до 15 цифр…»),
       * поэтому показываем их как есть, а не подменяем общей фразой.
       */
      const message = e instanceof Error ? e.message : String(e)
      skip(line, message.slice(0, 200) || 'Запись не сохранилась', identNumber)
    }
  }

  /*
   * Пакет загрузки — не бюрократия, а условие доверия к данным.
   *
   * Записи попадают в стадо сразу: это данные владельца, и держать их
   * взаперти до чужой проверки незачем. Но уровень достоверности у них
   * остаётся черновиком, пока Ассоциация не посмотрит пакет и владелец
   * не согласится с результатом. Раньше пакета из импорта не возникало
   * вовсе, и «проверено Ассоциацией» было обещанием, которое система
   * не могла выполнить: поднять уровень было нечем и не на чём.
   *
   * Сбой на этом шаге не отменяет уже загруженные записи: данные важнее
   * сопроводительной записи о них, и терять их из-за неё нельзя.
   */
  let submissionId: number | string | undefined
  let submissionNumber: string | undefined
  try {
    const media = await payload.create({
      collection: 'media',
      overrideAccess: true,
      data: { alt: `Файл импорта ${file.name}` },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        name: file.name,
        mimetype: file.type || 'text/csv',
        size: file.size,
      },
    })

    const submission = await payload.create({
      collection: 'data-submissions',
      overrideAccess: true,
      data: {
        kind: 'animals',
        status: 'uploaded',
        organization: orgId,
        submittedBy: user.id,
        submittedAt: new Date().toISOString(),
        sourceFile: media.id,
        animals: touched,
        intake: { rows: rows.length - 1, created, updated, skipped, issues },
        consent: { agreed: false },
      },
    })
    submissionId = submission.id
    submissionNumber = submission.number ?? undefined
  } catch (e) {
    // Пакет не завёлся — данные всё равно загружены, о чём и сообщаем
    console.error('[import] не удалось создать пакет загрузки:', e)
  }

  revalidatePath('/account')
  return { ok: true, created, updated, skipped, submissionId, submissionNumber, issues }
}
