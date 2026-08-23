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
   * Верификация — услуга Ассоциации своим членам: она ставит свою подпись
   * под чужими данными. Хозяйству, которое ещё не приняли, подписывать
   * нечего — но вести и выгружать свои записи оно может как прежде.
   */
  const { membershipGate } = await import('@/lib/membership')
  const gate = await membershipGate(payload, orgId)
  if (!gate.allowed) return { error: gate.reason }

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

/**
 * Снятые находки — в том же виде, что и замечания.
 *
 * Отдельная функция, а не переиспользование `plainFindings`, потому что
 * у снятой находки есть ещё одна связь — кто снял. Прогонять её через
 * функцию, знающую только про животное, значило бы записать пользователя
 * объектом и получить связь, которую Payload не примет.
 */
/*
 * Обобщённая по типу строки, а не по `{ animal, by }`.
 *
 * Узкий тип параметра съедает всё остальное: `...d` в результате даёт
 * ровно те поля, которые названы в сигнатуре, и `code` с `reason`
 * пропадают из типа, хотя в значении остаются. Ошибка вылезает у
 * вызывающей стороны и читается как «у снятой находки нет кода».
 *
 * Соседняя `plainFindings` живёт с этой же бедой, и обходят её приведением
 * типа на месте чтения. Здесь сделано наоборот — тип сохраняется.
 */
const plainDismissed = <T extends { animal?: unknown; by?: unknown }>(
  rows: T[] | null | undefined,
) =>
  (rows ?? []).map((d) => ({
    ...d,
    animal: typeof d.animal === 'object' && d.animal ? (d.animal as { id: number }).id : d.animal,
    by: typeof d.by === 'object' && d.by ? (d.by as { id: number }).id : d.by,
  }))

/** Ключ снятия: находка снимается для пары «животное + правило», а не вообще. */
const dismissKey = (animal: unknown, code: unknown) => `${Number(animal)}|${String(code)}`

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
      review: {
        ...(request.review ?? {}),
        assignee: user.id,
        findings: plainFindings(request.review?.findings),
        // Массивы со связями переписываются целиком при каждом обновлении
        // группы. Оставить их в том виде, в каком они пришли из базы —
        // с развёрнутыми объектами вместо идентификаторов, — значит
        // отдать Payload связь, которую он не примет.
        dismissed: plainDismissed(request.review?.dismissed),
      },
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
        dismissed: plainDismissed(request.review?.dismissed),
      },
    } as never,
  })

  revalidatePath(`/association/verifications/${request.id}`)
  return { message: 'Замечание записано' }
}

/**
 * Снять автоматическую находку: «посмотрел, здесь не ошибка».
 *
 * Второй из двух возможных исходов разбора существенной находки. Первый —
 * перенести её в замечания, и тогда запись не подтверждается. Молчание
 * перестало быть исходом: `decideVerificationAction` не подтвердит запись,
 * у которой осталась неразобранная существенная находка.
 *
 * Причина обязательна и хранится вместе со снятием. Через год разбирать,
 * почему запись подтвердили вопреки проверке, будет другой человек,
 * и «эксперт нажал кнопку» ему ничего не объяснит.
 */
export async function dismissAutoIssueAction(
  _prev: VerificationState,
  formData: FormData,
): Promise<VerificationState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, request } = ctx

  const animal = Number(formData.get('animal'))
  const code = String(formData.get('code') || '').trim()
  const reason = String(formData.get('reason') || '').trim()

  if (!Number.isFinite(animal) || animal <= 0) return { error: 'Не указано животное' }
  if (!code) return { error: 'Не указана проверка' }
  if (!reason) {
    return { error: 'Объясните, почему это не ошибка — иначе снятие неотличимо от невнимательности' }
  }

  const existing = plainDismissed(request.review?.dismissed)
  const already = existing.some((d) => dismissKey(d.animal, d.code) === dismissKey(animal, code))
  if (already) return { message: 'Эта находка уже снята' }

  await payload.update({
    collection: 'verification-requests',
    id: request.id,
    overrideAccess: true,
    data: {
      review: {
        ...(request.review ?? {}),
        findings: plainFindings(request.review?.findings),
        dismissed: [
          ...existing,
          { animal, code, reason, by: user.id, at: new Date().toISOString() },
        ],
      },
    } as never,
  })

  revalidatePath(`/association/verifications/${request.id}`)
  return { message: 'Находка снята с объяснением' }
}

/** Вернуть снятую находку в разбор. */
export async function restoreAutoIssueAction(
  _prev: VerificationState,
  formData: FormData,
): Promise<VerificationState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { payload, request } = ctx

  const key = String(formData.get('dismissed') || '')
  const dismissed = plainDismissed(request.review?.dismissed).filter(
    (d) => String((d as { id?: string }).id) !== key,
  )

  await payload.update({
    collection: 'verification-requests',
    id: request.id,
    overrideAccess: true,
    data: {
      review: {
        ...(request.review ?? {}),
        findings: plainFindings(request.review?.findings),
        dismissed,
      },
    } as never,
  })

  revalidatePath(`/association/verifications/${request.id}`)
  return { message: 'Находка возвращена в разбор' }
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
    data: {
      review: {
        ...(request.review ?? {}),
        findings,
        dismissed: plainDismissed(request.review?.dismissed),
      },
    } as never,
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
      /*
       * `> 0` здесь не украшение. У замечания ко всему пакету животного нет,
       * `Number(null)` даёт ноль, а ноль — конечное число: такое замечание
       * попадало в набор исключённых записей под идентификатором 0.
       * Ни одно животное этот идентификатор не носит, поэтому вреда не было —
       * но набор «исключённые записи» содержал бы не запись.
       */
      .filter((n) => Number.isFinite(n) && n > 0),
  )

  const all = (request.animals ?? []).map((a) => relId(a)).filter((n): n is number => n !== null)

  /*
   * Автоматические проверки — часть решения, а не справка рядом с ним.
   *
   * До этой правки они эксперту только показывались. Запись получала
   * «Проверено ассоциацией» с непогашенным `parent-younger` — то есть
   * система ставила знак наивысшей достоверности на данные, которые сама
   * же считала противоречивыми. Хозяйство при этом видело только знак.
   *
   * Запретить подтверждение при существенной находке было нельзя:
   * право эксперта счесть находку несущественной записано в каталоге
   * проверок как обещание. Запрещено поэтому молчание — находка должна
   * быть либо перенесена в замечания, либо снята с объяснением.
   *
   * Проверки гоняются здесь заново, а не берутся с экрана разбора.
   * Между открытием страницы и нажатием кнопки хозяйство могло
   * что-то поправить, а могло и испортить; решение обязано опираться
   * на то, что в базе сейчас, а не на то, что эксперт видел утром.
   */
  const dismissed = new Set(
    plainDismissed(request.review?.dismissed).map((d) => dismissKey(d.animal, d.code)),
  )

  const unresolved = new Map<number, string[]>()

  if (decision === 'approved' && all.length) {
    const { checkAnimals } = await import('@/lib/data-checks')
    const { checkSpec } = await import('@/lib/checks-registry')

    const { docs } = await payload.find({
      collection: 'animals',
      where: { id: { in: all } },
      limit: all.length,
      depth: 0,
      overrideAccess: true,
    })

    const { issues } = await checkAnimals(payload, docs as never)

    for (const i of issues) {
      if (i.severity !== 'fix') continue
      if (dismissed.has(dismissKey(i.animalId, i.code))) continue
      if (held.has(i.animalId)) continue
      unresolved.set(i.animalId, [
        ...(unresolved.get(i.animalId) ?? []),
        checkSpec(i.code)?.label ?? i.code,
      ])
    }
  }

  if (unresolved.size) {
    const names = [...unresolved.values()].flat()
    const uniq = [...new Set(names)]
    return {
      error:
        `Записей с неразобранными существенными находками — ${unresolved.size}: ` +
        `${uniq.slice(0, 3).join(', ')}${uniq.length > 3 ? ` и ещё ${uniq.length - 3}` : ''}. ` +
        'Каждую нужно либо перенести в замечания, либо снять с объяснением. ' +
        'Статус «Проверено ассоциацией» означает наивысшую достоверность — ' +
        'ставить его поверх непогашенного противоречия нельзя.',
    }
  }

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
        dismissed: plainDismissed(request.review?.dismissed),
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
