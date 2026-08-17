'use client'

import { useActionState, useState } from 'react'
import {
  confirmUserAction,
  decideMembershipAction,
  type MembershipState,
} from '@/actions/membership'

/**
 * Решение по членству — раскрывается по требованию.
 *
 * В списке сорок хозяйств; форма решения у каждого, раскрытая по умолчанию,
 * превратила бы страницу в анкету на сорок разделов. Пока не нажали
 * «Решить», строка остаётся строкой таблицы.
 */
export function MembershipDecision({
  organizationId,
  organizationName,
  membership,
}: {
  organizationId: number
  organizationName: string
  membership: string
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<MembershipState, FormData>(
    decideMembershipAction,
    {},
  )

  if (state.message) {
    return <span className="text-[13px] text-forest-500">{state.message}</span>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap text-[13px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
      >
        {membership === 'member' ? 'изменить' : 'решить'}
      </button>
    )
  }

  return (
    <form action={formAction} className="min-w-[18rem] space-y-2">
      <input type="hidden" name="organization" value={organizationId} />

      <p className="text-[13px] text-ink-500">{organizationName}</p>

      <select
        name="decision"
        defaultValue={membership === 'member' ? 'suspended' : 'member'}
        className="field field-on-light text-[14px]"
      >
        <option value="member">Принять в члены</option>
        <option value="suspended">Приостановить членство</option>
        <option value="none">Отказать / исключить</option>
      </select>

      <textarea
        name="comment"
        rows={2}
        placeholder="Основание — обязательно для отказа и приостановки"
        className="field field-on-light text-[14px]"
      />

      {state.error && <p className="text-[13px] text-red-700">{state.error}</p>}

      <div className="flex gap-3">
        <button type="submit" className="btn btn-accent px-3 py-1.5 text-[13px]" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] text-ink-500 underline underline-offset-4"
        >
          отмена
        </button>
      </div>
    </form>
  )
}

/**
 * Подтверждение учётной записи — одно нажатие.
 *
 * Здесь не нужно ни формы, ни основания: подтверждение говорит «человек тот,
 * за кого себя выдаёт», и отказ в нём — не решение по существу, а «пока
 * не проверили». Разговор по существу ведётся о хозяйстве, не о сотруднике.
 */
export function ConfirmUser({
  userId,
  confirmed,
  label,
}: {
  userId: number
  confirmed: boolean
  label: string
}) {
  const [state, formAction, pending] = useActionState<MembershipState, FormData>(
    confirmUserAction,
    {},
  )

  return (
    <form action={formAction} className="flex items-center justify-between gap-3 py-1.5">
      <input type="hidden" name="user" value={userId} />
      <input type="hidden" name="confirmed" value={confirmed ? '0' : '1'} />

      <span className="min-w-0 truncate text-[14px]">{label}</span>

      <button
        type="submit"
        disabled={pending}
        className={`whitespace-nowrap text-[13px] underline underline-offset-4 ${
          confirmed ? 'text-ink-500 hover:text-red-700' : 'text-forest-500 hover:text-forest-600'
        }`}
      >
        {pending ? '…' : confirmed ? 'снять подтверждение' : 'подтвердить'}
      </button>

      {state.error && <span className="text-[13px] text-red-700">{state.error}</span>}
    </form>
  )
}
