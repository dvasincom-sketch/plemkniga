'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAssociationUser } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { VERIFICATION_LIMIT } from '@/lib/verification-limit'

/**
 * Полный цикл верификации: хозяйство подаёт — Ассоциация решает.
 *
 * Раньше уровень «Верифицировано ассоциацией» поднимался единственным
 * способом: публикацией проверенного пакета, то есть только животным
 * из последней загрузки. Хозяйство, у которого данные лежат в системе
 * полгода и не менялись, попросить об их подтверждении не могло —
 * а именно это требуется перед выпуском свидетельства.
 */

export type VerificationState = { error?: string; message?: string; createdId?: number | string }

/* --------------------------- Сторона хозяйства --------------------------- */

/**
 * Подать животных на верификацию.
 *
 * Ограничение сверху не техническое. Заявку разбирает человек, и «подал всё
 * стадо целиком» означает не быструю верификацию, а очередь, которая
 * не двинется. Двести записей — примерно день работы эксперта; больше
 * следует делить на части, и лучше это сделает хозяйство, чем Ассоциация.
 */
export async function requestVerificationAction(
  _prev: VerificationState,
  formData: FormData,
): Promise<VerificationState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const orgId = relId(user.organization)
  if (!orgId) return { error: 'У пользователя не заполнена организация' }

  const ids = formData
    .getAll('animals')
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)

  if (!ids.length) return { error: 'Выберите хотя бы одно животное' }
  if (ids.length > VERIFICATION_LIMIT) {
    return {
      error: `За раз можно подать не больше ${VERIFICATION_LIMIT} записей: заявку разбирает человек, и слишком длинная просто встанет в очереди.`,
    }
  }

  const payload = await getClient()

  /*
   * Подать можно только своих. Проверяется на сервере, а не только формой:
   * список приходит из браузера, и полагаться на то, что в нём окажутся
   * ровно те записи, которые мы показали, нельзя.
   */
  const { docs } = await payload.find({
    collection: 'animals',
    where: { and: [{ id: { in: ids } }, { owner: { equals: orgId } }] },
    limit: ids.length,
    depth: 0,
    overrideAccess: true,
  })

  if (docs.length !== ids.length) {
    return { error: 'В списке есть записи другого хозяйства — обновите страницу и попробуйте снова' }
  }

  const purposeRaw = String(formData.get('purpose') || 'trust')
  const purpose = ['trust', 'certificate', 'membership'].includes(purposeRaw) ? purposeRaw : 'trust'

  try {
    const created = await payload.create({
      collection: 'verification-requests',
      overrideAccess: true,
      user,
      data: {
        organization: orgId,
        animals: docs.map((d) => d.id),
        purpose: purpose as 'trust' | 'certificate' | 'membership',
        status: 'new',
        comment: String(formData.get('comment') || '').trim() || undefined,
      } as never,
    })

    revalidatePath('/account')
    revalidatePath('/account/verification')
    revalidatePath('/association/verifications')
    return { message: 'Заявка подана', createdId: created.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось подать заявку' }
  }
}

/* -------------------------- Сторона Ассоциации --------------------------- */

async function guard(id: string) {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' as const }
  if (!isAssociationUser(user)) return { error: 'Доступно только сотрудникам Ассоциации' as const }
  if (!id) return { error: 'Не указана заявка' as const }

  const payload = await getClient()
  const request = await payload.findByID({
    collection: 'verification-requests',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if (!request) return { error: 'Заявка не найдена' as const }

  return { user, payload, request }
}

const plainFindings = (findings: { animal?: unknown }[] | null | undefined) =>
  (findings ?? []).map((f) => ({
    ...f,
    animal: typeof f.animal === 'object' && f.animal ? (f.animal as { id: number }).id : f.animal,
  }))

/** Взять заявку в работу. */
export async function takeVerificationAction(
  _prev: VerificationState,
  formData: FormData,
): Promise<VerificationState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, request } = ctx

  if (request.status === 'approved' || request.status === 'rejected') {
    return { error: 'Заявка уже закрыта' }
  }

  const current = relId(request.review?.assignee)
  if (current && current !== user.id) return { error: 'Заявка уже взята другим экспертом' }

  await payload.update({
    collection: 'verification-requests',
    id: request.id,
    overrideAccess: true,
    data: {
      status: 'checking',
      review: { ...(request.review ?? {}), assignee: user.id, findings: plainFindings(request.review?.findings) },
    } as never,
  })

  revalidatePath('/association/verifications')
  revalidatePath(`/association/verifications/${request.id}`)
  return { message: 'Заявка взята в работу' }
}

/** Записать замечание по животному заявки. */
export async function addVerificationFindingAction(
  _prev: VerificationState,
  formData: FormData,
): Promise<VerificationState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { payload, request } = ctx

  const text = String(formData.get('text') || '').trim()
  if (!text) return { error: 'Опишите, что не так' }

  const animalRaw = Number(formData.get('animal'))
  const animal = Number.isFinite(animalRaw) && animalRaw > 0 ? animalRaw : null
  const severity = formData.get('severity') === 'note' ? 'note' : 'fix'
  const field = String(formData.get('field') || '').trim() || null

  await payload.update({
    collection: 'verification-requests',
    id: request.id,
    overrideAccess: true,
    data: {
      review: {
        ...(request.review ?? {}),
        findings: [...plainFindings(request.review?.findings), { animal, field, severity, text }],
      },
    } as never,
  })

  revalidatePath(`/association/verifications/${request.id}`)
  return { message: 'Замечание записано' }
}

/** Убрать замечание. */
export async function removeVerificationFindingAction(
  _prev: VerificationState,
  formData: FormData,
): Promise<VerificationState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { payload, request } = ctx

  const key = String(formData.get('finding') || '')
  const findings = plainFindings(request.review?.findings).filter(
    (f) => String((f as { id?: string }).id) !== key,
  )

  await payload.update({
    collection: 'verification-requests',
    id: request.id,
    overrideAccess: true,
    data: { review: { ...(request.review ?? {}), findings } } as never,
  })

  revalidatePath(`/association/verifications/${request.id}`)
  return { message: 'Замечание убрано' }
}

/**
 * Решение по заявке.
 *
 * Подтверждение получают не все животные заявки, а те, по которым нет
 * замечания «требует исправления». Замечание работает и объяснением,
 * и исключением: список причин и список исключений — это один список,
 * а не два, которые однажды разойдутся.
 *
 * В отличие от пакета загрузки, здесь уровень достоверности поднимается
 * сразу, без отдельного согласия хозяйства. Разница по существу: пакет —
 * это данные, которые хозяйство прислало и ещё не решило показывать;
 * заявка — просьба подтвердить то, что уже лежит в системе, и согласие
 * дано самой подачей.
 */
export async function decideVerificationAction(
  _prev: VerificationState,
  formData: FormData,
): Promise<VerificationState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, request } = ctx

  const decision = String(formData.get('decision') || '')
  if (decision !== 'approved' && decision !== 'rejected') return { error: 'Не выбрано решение' }

  const comment = String(formData.get('comment') || '').trim()
  if (decision === 'rejected' && !comment) {
    return { error: 'При отклонении объясните причину — хозяйству по ней исправлять' }
  }

  const findings = plainFindings(request.review?.findings)
  const held = new Set(
    findings
      .filter((f) => ((f as { severity?: string }).severity ?? 'fix') === 'fix')
      .map((f) => Number((f as { animal?: number }).animal))
      .filter((n) => Number.isFinite(n)),
  )

  const all = (request.animals ?? []).map((a) => relId(a)).filter((n): n is number => n !== null)
  const approved = decision === 'approved' ? all.filter((id) => !held.has(id)) : []

  if (decision === 'approved' && approved.length === 0) {
    return {
      error:
        'Все записи заявки помечены замечанием «требует исправления» — подтверждать нечего. Отклоните заявку или снимите часть замечаний.',
    }
  }

  const now = new Date().toISOString()

  if (approved.length) {
    await payload.update({
      collection: 'animals',
      where: { id: { in: approved } },
      overrideAccess: true,
      data: { trustLevel: 3, trustCheckedAt: now },
      /*
       * Не журналим как ручную правку: это решение Ассоциации, и его след —
       * сама заявка с заключением и замечаниями. Строка «уровень
       * достоверности: 0 → 3» в истории карточки повторяла бы её, ничего
       * не добавляя, и делала бы это по разу на каждое животное.
       */
      context: { skipJournal: true },
    })
  }

  await payload.update({
    collection: 'verification-requests',
    id: request.id,
    overrideAccess: true,
    data: {
      status: decision,
      review: {
        ...(request.review ?? {}),
        findings,
        decidedBy: user.id,
        decidedAt: now,
        comment: comment || undefined,
        approvedCount: approved.length,
        heldCount: all.length - approved.length,
      },
    } as never,
  })

  revalidatePath('/association/verifications')
  revalidatePath(`/association/verifications/${request.id}`)
  revalidatePath('/account')

  return {
    message:
      decision === 'approved'
        ? `Подтверждено записей: ${approved.length}${all.length - approved.length ? `, оставлено с замечаниями: ${all.length - approved.length}` : ''}`
        : 'Заявка отклонена — хозяйство увидит причину и замечания',
  }
}
