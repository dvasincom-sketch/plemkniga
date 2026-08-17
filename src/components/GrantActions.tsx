'use client'

import { useActionState } from 'react'
import {
  replacePublicWithGrantsAction,
  revokeGrantAction,
  type GrantFormState,
} from '@/actions/grants'

/**
 * Кнопки вкладки «Доступы».
 *
 * Обе — формы с серверным действием, а не обработчики: страница кабинета
 * серверная, и лишний клиентский слой ей не нужен. Клиентскими они сделаны
 * ровно затем, чтобы показать состояние отправки и ответ на месте, а не
 * перезагружать раздел.
 */

export function RevokeGrant({ grantId }: { grantId: number }) {
  const [state, formAction, pending] = useActionState<GrantFormState, FormData>(
    revokeGrantAction,
    {},
  )

  if (state.message) {
    return <span className="text-[13px] text-ink-500">{state.message}</span>
  }

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="grant" value={grantId} />
      <button
        type="submit"
        disabled={pending}
        className="text-[14px] text-ink-500 underline underline-offset-4 transition-colors hover:text-[#c0392b]"
      >
        {pending ? 'Отзываем…' : 'Отозвать'}
      </button>
      {state.error && <span className="ml-2 text-[13px] text-red-700">{state.error}</span>}
    </form>
  )
}

export function ReplacePublic({ animalId }: { animalId: number }) {
  const [state, formAction, pending] = useActionState<GrantFormState, FormData>(
    replacePublicWithGrantsAction,
    {},
  )

  if (state.message) {
    return <span className="text-[13px] text-forest-600">{state.message}</span>
  }

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="animal" value={animalId} />
      <button type="submit" disabled={pending} className="btn btn-brand">
        {pending ? 'Закрываем…' : 'Закрыть и выдать точечно'}
      </button>
      {state.error && <p className="mt-2 text-[13px] text-red-700">{state.error}</p>}
    </form>
  )
}
