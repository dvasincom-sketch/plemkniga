'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { assertCan } from '@/lib/roles'
import { recordOperation } from '@/lib/operations'

export type SubmissionState = { error?: string; message?: string }

const plural = (n: number, one: string, few: string, many: string) => {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}

const orgOf = (user: { organization?: unknown }) =>
  typeof user.organization === 'object' && user.organization
    ? (user.organization as { id: number }).id
    : (user.organization as number | undefined)

/**
 * Владелец соглашается с результатом проверки и разрешает публикацию данных.
 *
 * ## Уровень достоверности здесь больше не поднимается
 *
 * Публикация ставила животным пакета уровень 3 — «Верифицировано
 * ассоциацией». Ставило его **само хозяйство**, нажимая кнопку в своём
 * кабинете, и ни одна автоматическая проверка в этот момент не работала:
 * заслон подтверждения живёт в разборе заявки и отсюда не звался вовсе.
 *
 * Получалось два пути к одной подписи, и на одном стоял эксперт с полным
 * разбором находок, а на другом — галочка «согласен». По значку они
 * не различались, и покупатель, глядя на «верифицировано», не мог знать,
 * какой из двух перед ним.
 *
 * ## Почему не провести публикацию через тот же заслон
 *
 * Заслон опирается на разбор: эксперт снимает ложные находки с указанием
 * причины, и снятые перестают держать. У пакета такого разбора нет
 * и завести его некому — хозяйство снимать находки со своих же записей
 * не может по смыслу. Значит заслон здесь либо не пропускал бы почти
 * ничего, либо пропускал бы всё, и второе вернуло бы нас к тому же.
 *
 * ## Что означает публикация теперь
 *
 * Ровно то, что написано: хозяйство согласилось с результатом разбора
 * пакета и разрешило показывать данные. Статус «принят» — это про пакет,
 * а не про подпись под каждым животным. Подпись ставится по заявке
 * на верификацию, и об этом сказано прямо в ответе.
 *
 * ТЗ, п. 1.6: смена статуса фиксируется в журнале с указанием, кто и когда
 * утвердил.
 */
export async function publishSubmissionAction(
  _prev: SubmissionState,
  formData: FormData,
): Promise<SubmissionState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const id = String(formData.get('id') || '')
  if (!id) return { error: 'Не указан пакет данных' }

  const guardPayload = await getClient()
  const denied = await assertCan(guardPayload, user, 'submit')
  if (denied) return { error: denied }
  if (formData.get('agreed') !== 'on') {
    return { error: 'Отметьте согласие с результатом проверки' }
  }

  const payload = await getClient()

  const submission = await payload.findByID({
    collection: 'data-submissions',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if (!submission) return { error: 'Пакет данных не найден' }

  const orgId = orgOf(user)
  const subOrg =
    typeof submission.organization === 'object' && submission.organization
      ? submission.organization.id
      : submission.organization

  if (user.role !== 'admin' && subOrg !== orgId) {
    return { error: 'Пакет принадлежит другой организации' }
  }
  if (submission.status !== 'checked') {
    return { error: 'Публикация доступна только после проверки Ассоциацией' }
  }

  const now = new Date().toISOString()

  await payload.update({
    collection: 'data-submissions',
    id,
    overrideAccess: true,
    data: {
      status: 'accepted',
      consent: { agreed: true, agreedAt: now, publishedAt: now },
    },
  })

  const ids = (submission.animals ?? [])
    .map((a) => (typeof a === 'object' && a ? a.id : a))
    .filter((v): v is number => typeof v === 'number')

  revalidatePath('/account')
  revalidatePath(`/account/submissions/${id}`)

  await recordOperation(guardPayload, {
    action: 'submission-published',
    actor: user,
    subjectType: 'submission',
    subject: submission.number ?? String(id),
    summary: `Опубликовано записей: ${ids.length}`,
  })

  /*
   * В ответе сказано, чего публикация не делает. Прежде она поднимала
   * уровень, и хозяйство привыкло, что после неё запись «верифицирована»;
   * молча перестать — значит оставить человека с неверным представлением
   * о собственных данных.
   */
  return {
    message:
      `Данные опубликованы: ${ids.length} ${plural(ids.length, 'запись', 'записи', 'записей')}. ` +
      'Уровень достоверности при этом не меняется: подпись Ассоциации ставится ' +
      'по заявке на верификацию, где каждую запись разбирает эксперт. ' +
      'Подать записи: «Стадо → Верификация».',
  }
}
