'use client'

import { useActionState, useState } from 'react'
import { decideAccessAction, type AccessFormState } from '@/actions/access'

/**
 * Решение хозяйства по запросу доступа.
 *
 * Отказ без объяснения — рабочий сценарий, поэтому поле ответа появляется
 * по кнопке и не мешает тем, кто просто открывает доступ.
 *
 * Формулировка кнопки называет последствие целиком: система пока умеет
 * открывать запись всем, а не одному запросившему, и узнавать об этом
 * после нажатия было бы неприятным сюрпризом.
 */
export function AccessDecision({ requestId }: { requestId: number }) {
  const [state, formAction, pending] = useActionState<AccessFormState, FormData>(
    decideAccessAction,
    {},
  )
  const [withResponse, setWithResponse] = useState(false)

  if (state.message) {
    return (
      <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
        {state.message}
      </p>
    )
  }

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="request" value={requestId} />

      {withResponse && (
        <label className="mb-3 block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Ответ заявителю</span>
          <textarea
            name="response"
            rows={2}
            maxLength={600}
            className="field field-on-light"
            placeholder="Например: данные откроем после завершения сделки"
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          name="decision"
          value="approved"
          className="btn btn-accent"
          disabled={pending}
        >
          Открыть данные записи
        </button>

        <button
          type="submit"
          name="decision"
          value="declined"
          className="rounded-lg bg-white px-4 py-2.5 text-[15px] shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
          disabled={pending}
        >
          Отказать
        </button>

        {!withResponse && (
          <button
            type="button"
            onClick={() => setWithResponse(true)}
            className="text-[14px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
          >
            Добавить ответ
          </button>
        )}
      </div>

      <p className="mt-2.5 text-[13px] leading-snug text-ink-500">
        «Открыть данные» снимает замок с этой записи для всех посетителей книги.
        Точечный доступ одному хозяйству появится вместе с журналом прав.
      </p>

      {state.error && <p className="mt-3 text-[14px] text-red-700">{state.error}</p>}
    </form>
  )
}
