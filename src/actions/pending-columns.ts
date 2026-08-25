'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAssociation } from '@/access'

/**
 * Решение Ассоциации по неопознанной колонке.
 *
 * ## Что делает решение и чего не делает
 *
 * Оно записывает вывод: колонку приняли, отклонили или узнали в ней
 * известный признак под чужим названием. Признак при этом **не заводится**
 * — ни здесь, ни где-либо ещё автоматически.
 *
 * Так и задумано. Признак — это не строка в списке, а шкала с границами,
 * полюса («узкая ← → широкая»), признак оптимума, наследуемость и место
 * в индексе. Ничего из этого в присланной колонке нет и быть не может:
 * там заголовок и числа. Завести признак по нажатию кнопки значит завести
 * пустую оболочку, которая немедленно начнёт показываться в карточках
 * без объяснения, что означают её значения.
 *
 * Поэтому «принята» здесь означает «решено завести» — сигнал разработке,
 * а не действие над схемой. Разрыв неприятный, но честный: он ровно там,
 * где проходит граница между решением и работой.
 *
 * ## Почему обязателен комментарий при отказе
 *
 * Отклонённая без объяснения колонка вернётся тем же вопросом через
 * полгода — от другого хозяйства, и разбирать его будут заново. Причина
 * отказа нужна не хозяйству (оно её не видит), а следующему эксперту
 * Ассоциации.
 */

export type ColumnDecisionState = { error?: string; ok?: boolean }

export async function decideColumn(
  _prev: ColumnDecisionState,
  formData: FormData,
): Promise<ColumnDecisionState> {
  const user = await getCurrentUser()
  if (!user || !isAssociation(user)) return { error: 'Решение по колонкам принимает Ассоциация' }

  const id = Number(formData.get('id'))
  const status = String(formData.get('status') ?? '')
  const comment = String(formData.get('comment') ?? '').trim()
  const mapsTo = String(formData.get('mapsTo') ?? '').trim()

  if (!Number.isFinite(id)) return { error: 'Колонка не найдена' }
  if (!['new', 'accepted', 'declined', 'duplicate'].includes(status))
    return { error: 'Неизвестное решение' }

  /*
   * Объяснение требуется у всего, кроме возврата в «не разобрана»:
   * снять решение можно и молча, а принять — нет. Причём у «принята»
   * оно нужно не меньше, чем у отказа: через полгода никто не вспомнит,
   * почему эту колонку сочли новым признаком, а не тем же самым
   * под другим названием.
   */
  if (status !== 'new' && !comment)
    return { error: 'Напишите, почему решено так: без причины решение придётся принимать заново' }

  if (status === 'duplicate' && !mapsTo)
    return { error: 'Укажите, какому признаку соответствует колонка' }

  const payload = await getClient()

  try {
    await payload.update({
      collection: 'pending-columns',
      id,
      overrideAccess: true,
      data: {
        status: status as 'new' | 'accepted' | 'declined' | 'duplicate',
        mapsTo: mapsTo || null,
        decision: {
          comment: comment || null,
          decidedBy: status === 'new' ? null : (user.id as number),
          decidedAt: status === 'new' ? null : new Date().toISOString(),
        },
      },
    })
  } catch (e) {
    payload.logger.error({ err: e, column: id }, 'Решение по колонке не записано')
    return { error: 'Не удалось записать решение' }
  }

  revalidatePath('/association/columns')
  return { ok: true }
}
