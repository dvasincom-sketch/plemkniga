'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAssociationUser } from '@/lib/association'
import {
  CERTIFICATE_KINDS,
  DOCUMENT_TYPE_OF,
  certificateReadiness,
  type CertificateKind,
} from '@/lib/certification'
import { relId } from '@/lib/visibility'
import { buildCertificateView } from '@/lib/certificate-view'
import { newCertificateCode } from '@/lib/certificate-check'
import type { Animal } from '@/payload-types'
import { recordOperation } from '@/lib/operations'

/**
 * Выпуск племенных документов и журнал выдачи.
 *
 * Готовность животного к свидетельству система считала и раньше — а вот
 * кто и когда его выдал, не фиксировалось нигде. Печатную форму можно было
 * открыть и распечатать, и на этом след обрывался. Свидетельство —
 * юридически значимый документ; вопрос «кто его выдал» рано или поздно
 * задают, и ответ «где-то в браузере у кого-то» не годится.
 */

export type DocumentState = { error?: string; message?: string; issuedId?: number | string }

// Сопоставление живёт в `src/lib/certification.ts`: им пользуется и печатная форма
const TYPE_OF = DOCUMENT_TYPE_OF

/** Префикс номера: по нему документ узнают в разговоре и в бумагах. */
const PREFIX_OF: Record<CertificateKind, string> = {
  pedigree: 'ПС',
  zootechnical: 'ЗС',
}

async function guard() {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' as const }
  if (!isAssociationUser(user)) return { error: 'Выпускать документы может только Ассоциация' as const }
  return { user, payload: await getClient() }
}

/**
 * Выпустить документ на животное.
 *
 * Три проверки перед выпуском, и каждая из них — отказ, а не предупреждение.
 *
 * Первая: животное должно быть верифицировано Ассоциацией. Свидетельство —
 * это её подпись под чужими данными; ставить её под непроверенным нечего.
 *
 * Вторая: расчёт готовности должен сойтись. Он перечисляет, чего не хватает
 * (происхождения, породы, оценки), и выпускать документ с дырами в форме
 * значит выдавать бумагу, которую вернут.
 *
 * Третья: действующий документ того же вида уже не должен существовать.
 * Два непогашенных свидетельства на одно животное — это ровно тот случай,
 * когда в спорной ситуации предъявляют то, которое выгоднее.
 */
export async function issueDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload } = ctx

  const kindRaw = String(formData.get('kind') || 'pedigree')
  const kind: CertificateKind = kindRaw === 'zootechnical' ? 'zootechnical' : 'pedigree'

  const identNumber = String(formData.get('identNumber') || '').trim()
  if (!identNumber) return { error: 'Укажите индивидуальный номер животного' }

  const { docs } = await payload.find({
    collection: 'animals',
    where: { identNumber: { equals: identNumber } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })

  const animal = docs[0] as Animal | undefined
  if (!animal) return { error: `Животное № ${identNumber} в книге не найдено` }

  if (animal.trustLevel !== 3) {
    return {
      error:
        'Записи животного не имеют уровня «Верифицировано ассоциацией». Документ выпускается ' +
        'по проверенным данным — сначала подтвердите записи заявкой на верификацию.',
    }
  }

  const readiness = await certificateReadiness(payload, animal)
  const check = readiness[kind]
  if (!check.ready) {
    const missing = check.requirements.filter((r) => !r.ok).map((r) => r.label)
    return {
      error: `Не хватает для выпуска (${check.done} из ${check.total}): ${missing.join('; ')}`,
    }
  }

  const existing = await payload.find({
    collection: 'documents',
    where: {
      and: [
        { animal: { equals: animal.id } },
        { type: { equals: TYPE_OF[kind] } },
        { 'revoked.at': { exists: false } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existing.totalDocs > 0) {
    const old = existing.docs[0]
    return {
      error: `На это животное уже выдан действующий документ № ${old.number ?? old.id}. Отзовите его, если выпускаете взамен.`,
    }
  }

  const year = new Date().getFullYear()
  const prefix = PREFIX_OF[kind]
  const { totalDocs } = await payload.count({
    collection: 'documents',
    where: { number: { like: `${prefix}-${year}-` } },
    overrideAccess: true,
  })
  const number = `${prefix}-${year}-${String(totalDocs + 1).padStart(4, '0')}`
  const issuedAt = new Date().toISOString()

  /*
   * Код проверки выпускается вместе с документом и печатается на бланке.
   *
   * Выпускать его позже нельзя: бланк уходит на руки в момент выдачи,
   * и код, добавленный после, на бумаге не появится — а проверять будут
   * именно по бумаге.
   */
  const publicCode = newCertificateCode()

  /*
   * Снимок собирается тем же сборщиком, которым страница рисует бланк.
   *
   * Два независимых сборщика одного документа разошлись бы, и расхождение
   * обнаружилось бы на бумаге, которую уже отдали покупателю. Поэтому
   * сборщик один, а здесь только его вызов.
   */
  const snapshot = await buildCertificateView(payload, animal, kind, issuedAt)

  try {
    const created = await payload.create({
      collection: 'documents',
      overrideAccess: true,
      user,
      data: {
        title: `${CERTIFICATE_KINDS[kind].title} № ${number} — ${animal.identNumber}`,
        type: TYPE_OF[kind] as never,
        number,
        issuedAt,
        animal: animal.id,
        organization: relId(animal.owner) ?? undefined,
        issuedBy: user.id,
        publicCode,
        snapshot,
      } as never,
    })

    revalidatePath('/association/documents')
    revalidatePath(`/animals/${animal.id}`)
    revalidatePath('/account')

    await recordOperation(payload, {
      action: 'document-issued',
      actor: user,
      organization: relId(animal.owner),
      subjectType: 'document',
      subjectId: Number(created.id),
      subject: number,
      summary: `На животное ${animal.identNumber ?? ''}`,
    })

    return { message: `Выдан документ № ${number}`, issuedId: created.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось выпустить документ' }
  }
}

/**
 * Отозвать выданный документ.
 *
 * Выданное свидетельство не удаляют: оно существовало, на него ссылались,
 * по нему продавали. Удалить строку — переписать прошлое; отозвать — сказать
 * правду о настоящем. Поэтому отзыв это отметка с причиной и автором,
 * а сама запись остаётся в журнале навсегда.
 */
export async function revokeDocumentAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload } = ctx

  const id = Number(formData.get('document'))
  if (!Number.isFinite(id) || id <= 0) return { error: 'Документ не определён' }

  const reason = String(formData.get('reason') || '').trim()
  if (!reason) return { error: 'Укажите причину отзыва — она останется в журнале' }

  /*
   * Отозвать дважды нельзя.
   *
   * Кнопка в интерфейсе у отозванного документа скрыта, но действие
   * принимает любой идентификатор, и повторный отзыв переписывал бы дату,
   * автора и причину первого. Отзыв — событие, случившееся однажды;
   * переписать его значит подменить запись о прошлом, ровно то, ради чего
   * документы не удаляют, а отзывают.
   */
  const current = await payload.findByID({
    collection: 'documents',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if ((current as { revoked?: { at?: string | null } })?.revoked?.at) {
    return { error: 'Документ уже отозван — повторно отозвать его нельзя' }
  }

  try {
    await payload.update({
      collection: 'documents',
      id,
      overrideAccess: true,
      data: {
        revoked: { at: new Date().toISOString(), by: user.id, reason },
      } as never,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось отозвать документ' }
  }

  revalidatePath('/association/documents')
  return { message: 'Документ отозван' }
}

/**
 * Зарегистрировать протокол лаборатории.
 *
 * ## Зачем отдельное действие
 *
 * Второй уровень достоверности — «Подтверждено лабораторией» — в шкале
 * был, а дойти до него было нельзя: ни формы, ни правила. Ступень
 * существовала только в подписи и объясняла покупателю то, чего система
 * не знала.
 *
 * Обсуждали галочку «есть протокол ДНК» в карточке животного и отказались:
 * галочка — это утверждение, а не доказательство, и ставило бы её то же
 * хозяйство, чьи данные подтверждаются. Протокол лежит документом:
 * файлом, с номером, датой и названной лабораторией. Ступень из него
 * выводится (`src/lib/trust.ts`), а не проставляется здесь, — поэтому
 * отзыв протокола её опускает сам.
 *
 * ## Почему регистрирует Ассоциация
 *
 * У хозяйства нет права заполнить «кто выдал», а без этого поля протокол
 * для правила не существует. Пустить сюда хозяйство значило бы вернуть
 * закрытую дыру: завёл документ через API — подписал себя сам.
 *
 * Ассоциация ручается ровно за одно: бумагу принесли и она её приняла.
 * Что лаборатория настоящая, система не знает и не обещает — у лабораторий
 * здесь нет учётных записей.
 *
 * ## Почему свой номер, а не номер лаборатории
 *
 * Номер документа в книге уникален, а номера протоколов у разных
 * лабораторий совпадают запросто. Книга нумерует своё («ЛП-2026-0001»),
 * лабораторный номер идёт в название — там он и нужен человеку, который
 * сверяет бумагу с записью.
 */
export async function registerLabProtocolAction(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload } = ctx

  const identNumber = String(formData.get('identNumber') || '').trim()
  if (!identNumber) return { error: 'Укажите индивидуальный номер животного' }

  const labName = String(formData.get('labName') || '').trim()
  if (!labName) {
    return { error: 'Назовите лабораторию: протокол без её имени ничего не удостоверяет' }
  }

  const labNumber = String(formData.get('labNumber') || '').trim()
  const issuedAtRaw = String(formData.get('issuedAt') || '').trim()

  /*
   * Файл обязателен. Именно он отличает протокол от галочки: запись
   * о протоколе без протокола — это утверждение, что бумага где-то есть,
   * и проверить его нечем.
   */
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Приложите файл протокола — без него это отметка, а не документ' }
  }

  const { docs } = await payload.find({
    collection: 'animals',
    where: { identNumber: { equals: identNumber } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  const animal = docs[0] as Animal | undefined
  if (!animal) return { error: `Животное № ${identNumber} в книге не найдено` }

  const orgId = relId(animal.owner) ?? undefined

  const year = new Date().getFullYear()
  const { totalDocs } = await payload.count({
    collection: 'documents',
    where: { number: { like: `ЛП-${year}-` } },
    overrideAccess: true,
  })
  const number = `ЛП-${year}-${String(totalDocs + 1).padStart(4, '0')}`
  const issuedAt = issuedAtRaw ? new Date(`${issuedAtRaw}T00:00:00`).toISOString() : new Date().toISOString()

  try {
    const bytes = await file.arrayBuffer()
    const media = await payload.create({
      collection: 'media',
      overrideAccess: true,
      /*
       * Протокол закрыт: это данные о конкретном животном конкретного
       * хозяйства. Плашка «подтверждено лабораторией» видна всем,
       * сам файл — владельцу и Ассоциации. Ограничение осознанное:
       * открывать чужие ДНК-протоколы наружу ради убедительности плашки
       * — плата не по счёту.
       */
      data: { alt: `Протокол лаборатории ${labName} — ${identNumber}`, owner: orgId, visibility: 'private' },
      file: {
        data: Buffer.from(bytes),
        name: file.name,
        mimetype: file.type || 'application/pdf',
        size: file.size,
      },
    })

    const title =
      `Протокол лаборатории ${labName}` +
      (labNumber ? ` № ${labNumber}` : '') +
      ` — ${animal.identNumber ?? identNumber}`

    const created = await payload.create({
      collection: 'documents',
      overrideAccess: true,
      user,
      data: {
        title,
        type: 'genotypeReport' as never,
        number,
        issuedAt,
        animal: animal.id,
        organization: orgId,
        issuedBy: user.id,
        labName,
        file: media.id,
      } as never,
    })

    revalidatePath('/association/documents')
    revalidatePath(`/animals/${animal.id}`)
    revalidatePath('/account')

    await recordOperation(payload, {
      action: 'document-issued',
      actor: user,
      organization: orgId,
      subjectType: 'document',
      subjectId: Number(created.id),
      subject: number,
      summary: `Протокол лаборатории «${labName}» на животное ${animal.identNumber ?? identNumber}`,
    })

    /*
     * В ответе сказано и про ступень: регистратор нажимал «зарегистрировать
     * протокол», а изменилось при этом ещё и то, что видит покупатель.
     * Молчаливое побочное действие — худший вид действия.
     */
    return {
      message:
        `Протокол № ${number} зарегистрирован. Уровень достоверности записи — ` +
        '«Подтверждено лабораторией»; он снимется сам, если протокол отозвать.',
      issuedId: created.id,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось зарегистрировать протокол' }
  }
}
