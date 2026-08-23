'use client'

import { useActionState, useState } from 'react'
import { blockUserAction, type TeamFormState } from '@/actions/team'

/**
 * Блокировка человека глазами Ассоциации.
 *
 * Отдельный компонент, а не тот же, что в кабинете хозяйства: там форма
 * стоит в списке сотрудников с местом под объяснения, здесь — в ячейке
 * таблицы, где на всё про всё одна строка. Общий компонент пришлось бы
 * настраивать двумя пропсами вида `compact`, а это верный способ получить
 * один компонент, который плохо выглядит в обоих местах.
 *
 * Причина спрашивается и здесь. Заблокированный увидит её при попытке
 * войти, и «Ассоциация заблокировала, звоните» — не тот ответ, который
 * стоит давать хозяйству на другом конце страны.
 */
export function UserBlock({ userId, blocked }: { userId: number; blocked: boolean }) {
  const [state, formAction, pending] = useActionState<TeamFormState, FormData>(blockUserAction, {})
  const [open, setOpen] = useState(false)

  if (blocked) {
    return (
      <form action={formAction} className="inline">
        <input type="hidden" name="user" value={userId} />
        <input type="hidden" name="unblock" value="1" />
        <button
          type="submit"
          disabled={pending}
          className="whitespace-nowrap text-[12px] text-forest-500 underline underline-offset-4 hover:text-forest-600"
        >
          {pending ? '…' : 'разблокировать'}
        </button>
        {state.error && <span className="ml-2 text-[12px] text-red-700">{state.error}</span>}
      </form>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap text-[12px] text-ink-500 underline underline-offset-4 hover:text-[#c0392b]"
      >
        заблокировать
      </button>
    )
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="user" value={userId} />
      <input
        name="reason"
        required
        minLength={3}
        placeholder="Причина"
        className="field field-on-light w-[18ch] text-[12px]"
      />
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap text-[12px] underline underline-offset-4 hover:text-[#c0392b]"
      >
        {pending ? '…' : 'ок'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[12px] text-ink-500 underline underline-offset-4"
      >
        отмена
      </button>
      {state.error && <span className="ml-1 text-[12px] text-red-700">{state.error}</span>}
    </form>
  )
}
