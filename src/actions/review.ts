'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAssociationUser } from '@/lib/association'

/**
 * Проверка пакета данных со стороны Ассоциации.
 *
 * Здесь эксперт делает единственное, что ему позволено делать с чужими
 * данными: выносит о них суждение. Править их он не может — это осознанное
 * ограничение роли, а не недоделка. Проверяющий, способный молча исправить
 * проверяемое, обесценивает проверку: неизвестно становится, что именно
 * подтверждено — присланное или поправленное.
 *
 * Разбор — docs/kabinet-associacii.md, раздел 3.
 */

export type ReviewState = { error?: string; message?: string }

async function guard(id: string) {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' as const }
  if (!isAssociationUser(user)) return { error: 'Доступно только сотрудникам Ассоциации' as const }
  if (!id) return { error: 'Не указан пакет данных' as const }

  const payload = await getClient()
  const submission = await payload.findByID({
    collection: 'data-submissions',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if (!submission) return { error: 'Пакет данных не найден' as const }

  return { user, payload, submission }
}

/**
 * Взять пакет в работу.
 *
 * Переводит в «на проверке» и записывает, кто взял. Смысл не в статусе,
 * а в имени: два эксперта, разбирающие один пакет, теряют время оба,
 * и узнать об этом они должны из очереди, а не потом друг от друга.
 *
 * Повторное нажатие тем же человеком ничего не меняет; чужой пакет
 * не перехватывается молча — на это нужен отдельный разговор, и пока
 * такого действия нет.
 */
export async function takeSubmissionAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, submission } = ctx

  if (submission.status === 'accepted' || submission.status === 'rejected') {
    return { error: 'Пакет уже закрыт' }
  }

  const current =
    typeof submission.review?.assignee === 'object' && submission.review?.assignee
      ? submission.review.assignee.id
      : submission.review?.assignee

  if (current && current !== user.id) {
    return { error: 'Пакет уже взят другим экспертом' }
  }

  await payload.update({
    collection: 'data-submissions',
    id: submission.id,
    overrideAccess: true,
    data: {
      status: 'checking',
      review: { ...(submission.review ?? {}), assignee: user.id },
    },
  })

  revalidatePath('/association')
  revalidatePath(`/association/submissions/${submission.id}`)
  return { message: 'Пакет взят в работу' }
}

/**
 * Записать находку.
 *
 * По одной за раз, а не таблицей на всё сразу: находки появляются по ходу
 * разбора, и форма, которую надо заполнить целиком перед сохранением,
 * заставляет держать их в голове. Удаление — отдельным действием, чтобы
 * случайный повторный отправленный запрос не стирал написанное.
 */
export async function addFindingAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { payload, submission } = ctx

  const text = String(formData.get('text') || '').trim()
  if (!text) return { error: 'Опишите, что не так' }

  const animalRaw = Number(formData.get('animal'))
  const animal = Number.isFinite(animalRaw) && animalRaw > 0 ? animalRaw : null
  const field = String(formData.get('field') || '').trim() || null
  const severity = formData.get('severity') === 'note' ? 'note' : 'fix'

  const findings = (submission.review?.findings ?? []).map((f) => ({
    ...f,
    animal: typeof f.animal === 'object' && f.animal ? f.animal.id : f.animal,
  }))

  await payload.update({
    collection: 'data-submissions',
    id: submission.id,
    overrideAccess: true,
    data: {
      review: {
        ...(submission.review ?? {}),
        findings: [...findings, { animal, field, severity, text }],
      },
    } as never,
  })

  revalidatePath(`/association/submissions/${submission.id}`)
  return { message: 'Находка записана' }
}

/** Убрать находку — эксперт ошибся или разобрался. */
export async function removeFindingAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { payload, submission } = ctx

  const key = String(formData.get('finding') || '')
  const findings = (submission.review?.findings ?? [])
    .filter((f) => String(f.id) !== key)
    .map((f) => ({
      ...f,
      animal: typeof f.animal === 'object' && f.animal ? f.animal.id : f.animal,
    }))

  await payload.update({
    collection: 'data-submissions',
    id: submission.id,
    overrideAccess: true,
    data: { review: { ...(submission.review ?? {}), findings } } as never,
  })

  revalidatePath(`/association/submissions/${submission.id}`)
  return { message: 'Находка убрана' }
}

/**
 * Решение по пакету.
 *
 * Решение принимается по пакету целиком, даже когда находок много.
 * Частичное принятие — «эти сорок строк вернуть, остальные принять» —
 * рассматривалось и отложено: пакет перестаёт быть единицей работы,
 * и «данные приняты» становится утверждением без однозначного смысла.
 *
 * Уровень достоверности здесь не поднимается. «Проверено» — это заключение
 * Ассоциации; публикацию разрешает владелец, отдельным действием
 * (`publishSubmissionAction`). Так устроено с самого начала и менять это
 * незачем: данные принадлежат хозяйству, и решение показать их принимает оно.
 */
export async function decideSubmissionAction(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const ctx = await guard(String(formData.get('id') || ''))
  if ('error' in ctx) return { error: ctx.error }
  const { user, payload, submission } = ctx

  const decision = String(formData.get('decision') || '')
  if (decision !== 'checked' && decision !== 'rejected') return { error: 'Не выбрано решение' }

  const comment = String(formData.get('comment') || '').trim()
  if (decision === 'rejected' && !comment) {
    return { error: 'При отклонении объясните причину — хозяйству по ней исправлять' }
  }

  const findings = submission.review?.findings ?? []
  const blocking = findings.filter((f) => (f.severity ?? 'fix') === 'fix').length

  /*
   * Проверка на противоречие: «проверено» при существенных находках.
   *
   * Не запрет, а требование объясниться. Ситуация бывает законной —
   * замечания несущественны для этого пакета, и эксперт готов это сказать
   * словами. А вот молча поставить «проверено», оставив в списке двенадцать
   * строк «требует исправления», нельзя: хозяйство получит одобрение
   * и список претензий одновременно и не поймёт, что с этим делать.
   */
  if (decision === 'checked' && blocking > 0 && !comment) {
    return {
      error: `В находках ${blocking} с пометкой «требует исправления». Если пакет всё же проверен, объясните это в комментарии.`,
    }
  }

  const total = (submission.animals ?? []).length || submission.intake?.rows || 0

  /*
   * «С ошибками» — это записи, а не находки.
   *
   * Здесь стояло число находок уровня «требует исправления»: на одну
   * запись их бывает несколько, а бывают и находки без животного вовсе.
   * Рядом «Принято» равнялось всем строкам пакета независимо от находок,
   * и три числа в протоколе не сходились между собой: принято плюс
   * с ошибками не равнялось всего.
   */
  const flagged = new Set(
    findings
      .filter((f) => (f.severity ?? 'fix') === 'fix')
      .map((f) => (typeof f.animal === 'object' && f.animal ? f.animal.id : f.animal))
      .filter((id): id is number => typeof id === 'number'),
  )

  await payload.update({
    collection: 'data-submissions',
    id: submission.id,
    overrideAccess: true,
    data: {
      status: decision,
      review: {
        ...(submission.review ?? {}),
        findings: findings.map((f) => ({
          ...f,
          animal: typeof f.animal === 'object' && f.animal ? f.animal.id : f.animal,
        })),
        checkedBy: user.id,
        checkedAt: new Date().toISOString(),
        comment: comment || undefined,
        totalRows: total,
        acceptedRows: decision === 'checked' ? Math.max(total - flagged.size, 0) : 0,
        rejectedRows: flagged.size,
      },
    } as never,
  })

  revalidatePath('/association')
  revalidatePath(`/association/submissions/${submission.id}`)
  revalidatePath(`/account/submissions/${submission.id}`)
  revalidatePath('/account')

  return {
    message:
      decision === 'checked'
        ? 'Пакет проверен. Хозяйство увидит заключение и сможет разрешить публикацию.'
        : 'Пакет отклонён. Хозяйство увидит причину и находки.',
  }
}
