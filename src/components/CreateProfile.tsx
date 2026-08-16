'use client'

import { useActionState } from 'react'
import { createProfileAction, type FormState } from '@/actions/index-profiles'

/**
 * Кнопка «взять за основу»: создаёт свой профиль копией готового.
 *
 * Копия отвязана от оригинала намеренно: если Ассоциация пересмотрит
 * стандартный профиль, хозяйство не должно узнавать об этом по внезапно
 * изменившемуся рейтингу собственных животных.
 */
export function CreateProfile({
  from,
  name,
  label = 'Создать свой профиль',
}: {
  from?: string
  name?: string
  label?: string
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createProfileAction, {})

  return (
    <form action={formAction}>
      {from && <input type="hidden" name="from" value={from} />}
      {name && <input type="hidden" name="name" value={name} />}
      <button
        type="submit"
        disabled={pending}
        className={from ? 'text-[14px] underline underline-offset-4 hover:text-forest-500' : 'btn btn-accent'}
      >
        {pending ? 'Создаём…' : label}
      </button>
      {state.error && <p className="mt-2 text-[13px] text-red-700">{state.error}</p>}
    </form>
  )
}
