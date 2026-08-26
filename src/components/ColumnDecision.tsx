'use client'

import { useActionState } from 'react'
import { decideColumn, type ColumnDecisionState } from '@/actions/pending-columns'

/**
 * Форма решения по одной неопознанной колонке.
 *
 * ## Почему форма у каждой колонки, а не одна на список
 *
 * Решение по колонке — это не отметка в чекбоксе, а вывод с объяснением,
 * и объяснение у каждой своё. Общая форма внизу списка заставила бы
 * выбирать колонку в выпадающем списке, то есть отрывать решение
 * от того, о чём оно.
 *
 * ## Почему кнопок три, а не «сохранить»
 *
 * Три возможных вывода — завести, отклонить, узнать в ней известный
 * признак — это три разных действия, а не три значения одного поля.
 * Выпадающий список с последующим «сохранить» превращает выбор
 * в два движения и позволяет сохранить, ничего не выбрав.
 */
export function ColumnDecision({
  id,
  status,
  comment,
  mapsTo,
}: {
  id: number
  status: string
  comment?: string | null
  mapsTo?: string | null
}) {
  const [state, action, pending] = useActionState<ColumnDecisionState, FormData>(decideColumn, {})

  return (
    <form action={action} className="mt-4 border-t border-ink-100 pt-4">
      <input type="hidden" name="id" value={id} />

      <label className="block text-[13px] text-ink-500" htmlFor={`comment-${id}`}>
        Почему решено так
      </label>
      <textarea
        id={`comment-${id}`}
        name="comment"
        rows={2}
        defaultValue={comment ?? ''}
        placeholder="Например: балл упитанности, у нас такого признака нет — заводим"
        className="field field-on-light mt-1 w-full text-[14px]"
      />

      <label className="mt-3 block text-[13px] text-ink-500" htmlFor={`maps-${id}`}>
        Если это известный признак под другим названием — его ключ
      </label>
      <input
        id={`maps-${id}`}
        name="mapsTo"
        defaultValue={mapsTo ?? ''}
        placeholder="udderDepth"
        className="field field-on-light mt-1 w-full text-[14px]"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          name="status"
          value="accepted"
          disabled={pending}
          className="btn btn-brand text-[14px]"
        >
          Завести признак
        </button>
        <button
          type="submit"
          name="status"
          value="duplicate"
          disabled={pending}
          className="btn text-[14px]"
        >
          Уже есть под другим названием
        </button>
        <button
          type="submit"
          name="status"
          value="declined"
          disabled={pending}
          className="btn text-[14px]"
        >
          Отклонить
        </button>
        {status !== 'new' && (
          <button
            type="submit"
            name="status"
            value="new"
            disabled={pending}
            className="btn text-[14px]"
          >
            Вернуть в разбор
          </button>
        )}
      </div>

      {state.error && <p className="mt-2 text-[13px] text-[#c0392b]">{state.error}</p>}
      {state.ok && <p className="mt-2 text-[13px] text-forest-600">Решение записано</p>}
    </form>
  )
}
