'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { newShareToken, SHARE_ANIMALS_CAP, SHARE_MAX_DAYS } from '@/lib/share-links'
import { ACCESS_SCOPES, type AccessScope } from '@/lib/dictionaries'
import { identCore } from '@/lib/animal-id'
import { assertCan } from '@/lib/roles'
import { recordOperation } from '@/lib/operations'

/**
 * Выпуск и отзыв ссылок на просмотр.
 *
 * Ссылка адресована тому, у кого нет учётной записи, поэтому выпуск —
 * единственное место, где хозяйство отдаёт данные наружу без имени
 * получателя. Отсюда строгость: обязательный срок, обязательный объём,
 * только свои записи и никакого «поделиться всем стадом одной кнопкой».
 */

export type ShareFormState = {
  error?: string
  message?: string
  /** Готовый адрес — показать сразу после выпуска, копировать вручную */
  url?: string
  /** Номера, которых не нашлось в своём стаде */
  unknown?: string[]
}

const parseNumbers = (raw: string): string[] =>
  [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))]

export async function createShareLinkAction(
  _prev: ShareFormState,
  formData: FormData,
): Promise<ShareFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const orgId = relId(user.organization)
  if (!orgId) return { error: 'У пользователя не заполнена организация' }

  const guardPayload = await getClient()
  const denied = await assertCan(guardPayload, user, 'share')
  if (denied) return { error: denied }

  const numbers = parseNumbers(String(formData.get('numbers') || ''))
  if (!numbers.length) return { error: 'Укажите хотя бы один индивидуальный номер' }

  /*
   * Потолок назван и до нажатия, и здесь.
   *
   * Двести записей — не техническое ограничение, а смысловое: ссылка
   * на всё стадо перестаёт быть «покажу вот этих» и становится выгрузкой
   * с адресом. Для выгрузки есть выгрузка, и она не живёт месяцами
   * в чужой переписке.
   */
  if (numbers.length > SHARE_ANIMALS_CAP) {
    return {
      error: `В одну ссылку помещается не больше ${SHARE_ANIMALS_CAP} записей, прислано ${numbers.length}. Разделите на несколько ссылок или выгрузите файл.`,
    }
  }

  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((s): s is AccessScope => ACCESS_SCOPES.some((x) => x.value === s))
  if (!scopes.length) return { error: 'Выберите, что открывает ссылка' }

  const until = new Date(String(formData.get('expiresAt') || ''))
  if (Number.isNaN(until.getTime())) return { error: 'Укажите дату, до которой ссылка работает' }

  /*
   * Срок кончается в конце указанного дня, а не в его начале.
   *
   * `<input type="date">` присылает полночь. Ссылка «до 30 августа»,
   * переставшая работать утром 30-го, — не то, что имел в виду человек,
   * и объяснять ему разницу между «до» и «включительно» посреди сделки
   * не место.
   */
  until.setHours(23, 59, 59, 999)

  if (until.getTime() <= Date.now()) return { error: 'Дата уже прошла' }

  /*
   * Год — предел, а не совет. Ссылка, живущая дольше, отличается
   * от бессрочной только на бумаге: за это время сменится и повод,
   * и человек, которому её дали.
   */
  const maxUntil = Date.now() + SHARE_MAX_DAYS * 86_400_000
  if (until.getTime() > maxUntil) {
    return { error: `Ссылку нельзя выпустить дольше чем на ${SHARE_MAX_DAYS} дней` }
  }

  const payload = await getClient()

  /*
   * Записи ищутся только в своём стаде и по ядру номера.
   *
   * Ядро — потому что один и тот же номер пишут по-разному
   * («3662217000196.00», «3662217000196», с пробелами), и требовать
   * от человека точного совпадения с тем, как номер лёг в базу, значит
   * возвращать ему «не найдено» на его же корову.
   */
  const { docs } = await payload.find({
    collection: 'animals',
    where: {
      and: [
        { owner: { equals: orgId } },
        { or: [{ archived: { equals: false } }, { archived: { exists: false } }] },
      ],
    },
    limit: 10_000,
    depth: 0,
    overrideAccess: true,
  })

  const byCore = new Map<string, number>()
  for (const d of docs) {
    const core = identCore(String(d.identNumber ?? ''))
    if (core) byCore.set(core, Number(d.id))
  }

  const found: number[] = []
  const unknown: string[] = []
  for (const n of numbers) {
    /*
     * Слишком короткий номер `identCore` возвращает пустотой, а не ядром:
     * восемь цифр — нижняя граница, ниже которой совпадение случайно.
     * Такие номера попадают в «не найдено» вместе с опечатками, и это
     * верно: «196» действительно ничему не соответствует.
     */
    const core = identCore(n)
    const id = core ? byCore.get(core) : undefined
    if (id) found.push(id)
    else unknown.push(n)
  }

  if (!found.length) {
    return {
      error: 'Ни одного номера не нашлось в вашем стаде. Ссылка выпускается только на свои записи.',
      unknown,
    }
  }

  const token = newShareToken()

  try {
    await payload.create({
      collection: 'share-links',
      data: {
        token,
        owner: orgId,
        createdBy: user.id,
        animals: found,
        scopes,
        expiresAt: until.toISOString(),
        note: String(formData.get('note') || '').trim() || null,
        opens: 0,
      } as never,
      overrideAccess: true,
      user,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Не удалось выпустить ссылку' }
  }

  await recordOperation(guardPayload, {
    action: 'share-created',
    actor: user,
    organization: orgId,
    subjectType: 'share',
    summary: `Записей в ссылке: ${found.length}, срок до ${until.toISOString().slice(0, 10)}`,
  })

  revalidatePath('/account/access')

  const base = process.env.NEXT_PUBLIC_SERVER_URL || ''
  return {
    message: `Ссылка выпущена на ${found.length} ${found.length === 1 ? 'запись' : 'записей'}`,
    url: `${base}/share/${token}`,
    /*
     * Ненайденные номера не отменяют выпуск, но и не замалчиваются.
     * Отменить — значит заставить человека править список из тридцати
     * номеров из-за одной опечатки; промолчать — значит отдать ссылку,
     * в которой нет той самой коровы, ради которой всё делалось.
     */
    unknown: unknown.length ? unknown : undefined,
  }
}

export async function revokeShareLinkAction(
  _prev: ShareFormState,
  formData: FormData,
): Promise<ShareFormState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const orgId = relId(user.organization)
  const id = Number(formData.get('id'))
  if (!Number.isFinite(id) || id <= 0) return { error: 'Ссылка не определена' }

  const payload = await getClient()
  const link = await payload.findByID({
    collection: 'share-links',
    id,
    depth: 0,
    overrideAccess: true,
  })
  if (!link) return { error: 'Ссылка не найдена' }
  if (relId(link.owner) !== orgId && user.role !== 'admin') {
    return { error: 'Отозвать ссылку может только хозяйство, которое её выпустило' }
  }

  /*
   * Отзыв, а не удаление: ссылка отправлена, и по ней приходили —
   * счётчик открытий и есть ответ на вопрос «а кто её видел».
   * Удалённая ссылка уносит этот ответ с собой.
   */
  await payload.update({
    collection: 'share-links',
    id,
    data: { revokedAt: new Date().toISOString() },
    overrideAccess: true,
    user,
  })

  revalidatePath('/account/access')
  await recordOperation(payload, {
    action: 'share-revoked',
    actor: user,
    subjectType: 'share',
    subjectId: id,
    summary: 'Ссылка на просмотр отозвана',
  })

  return { message: 'Ссылка отозвана. По ней больше ничего не откроется.' }
}
