'use client'

import { useActionState } from 'react'
import { decideColumn, type ColumnDecisionState } from '@/actions/pending-columns'

/**
 * Единственное действие над закрытым решением — вернуть его в разбор.
 *
 * ## Почему закрытое решение не редактируется на месте
 *
 * Разобранная колонка — это не черновик, а вывод, на который уже
 * сослались: по нему приняли или отклонили чужие данные, а иногда завели
 * признак. Форма с тремя кнопками рядом с таким выводом означает, что его
 * можно переписать мимоходом — и однажды его перепишут, не заметив,
 * что решение вообще было.
 *
 * Поэтому здесь два движения вместо одного: сперва «вернуть в разбор»,
 * и только потом правка. Лишнее движение тут и есть смысл — оно называет
 * то, что происходит: не «поправил поле», а «пересматриваю решение».
 *
 * ## Почему это отдельный компонент, а не режим формы решения
 *
 * У них разные обязанности. Форма решения собирает вывод: обоснование,
 * ключ признака, три исхода. Здесь ничего не собирается — только снимается
 * замок. Свести их в один компонент с признаком «закрыто» значило бы
 * держать в одном месте два несвязанных экрана и ветвить всю разметку.
 */
export function ColumnReopen({ id }: { id: number }) {
  const [state, action, pending] = useActionState<ColumnDecisionState, FormData>(decideColumn, {})

  return (
    <form action={action} className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="new" />

      <p className="text-[13px] leading-snug text-ink-500">
        Решение закрыто для правки: на него уже ссылались при разборе файлов.
      </p>
      <button type="submit" disabled={pending} className="btn text-[14px]">
        {pending ? 'Возвращаем…' : 'Вернуть в разбор'}
      </button>

      {state.error && <p className="text-[13px] text-[#c0392b]">{state.error}</p>}
    </form>
  )
}
