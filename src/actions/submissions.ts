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
 * пакета и разрешило показывать данные. Записи получают первую ступень —
 * «Заявлено хозяйством», ту самую, до которой прежде было не дойти ничем.
 * Подпись Ассоциации ставится по заявке на верификацию, и об этом сказано
 * прямо в ответе.
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

  /*
   * Первая ступень — «Заявлено хозяйством» — и есть смысл этой кнопки.
   *
   * До сих пор до неё было не дойти: единственным, кто её ставил, был сид.
   * Ступень существовала в шкале и не существовала в жизни, а публикация
   * при этом ставила третью — чужую подпись. Поменялись местами оба:
   * публикация ставит ровно то, чем является, — заявление хозяйства
   * о собственных данных.
   *
   * Поднимаются только черновики. Записи, уже подтверждённые лабораторией
   * или Ассоциацией, повторная публикация не опускает: заявление хозяйства
   * слабее обеих подписей и перебивать их не может.
   */
  let claimed = 0
  if (ids.length) {
    const res = await payload.update({
      collection: 'animals',
      where: { and: [{ id: { in: ids } }, { trustLevel: { equals: 0 } }] },
      // Поле закрыто на запись всем: законный путь идёт мимо правил поля
      overrideAccess: true,
      data: { trustLevel: 1 },
      // Публикация пакета — не правка карточки: её след в самом пакете
      context: { skipJournal: true },
    })
    claimed = res.docs?.length ?? 0
  }

  revalidatePath('/account')
  revalidatePath(`/account/submissions/${id}`)

  await recordOperation(guardPayload, {
    action: 'submission-published',
    actor: user,
    subjectType: 'submission',
    subject: submission.number ?? String(id),
    summary: `Опубликовано записей: ${ids.length}, заявлено хозяйством: ${claimed}`,
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
      `Уровень «Заявлено хозяйством» получили ${claimed} ${plural(claimed, 'запись', 'записи', 'записей')} — ` +
      'это ваша подпись под своими данными. Подпись Ассоциации ставится отдельно, ' +
      'по заявке на верификацию: «Стадо → Верификация».',
  }
}
