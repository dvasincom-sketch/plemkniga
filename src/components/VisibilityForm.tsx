'use client'

import { useActionState } from 'react'
import { setHerdVisibilityAction, type FormState } from '@/actions/account'

export function VisibilityForm({
  defaultVisible,
  defaultDetails,
}: {
  defaultVisible: boolean
  defaultDetails: boolean
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setHerdVisibilityAction,
    {},
  )

  return (
    <form action={formAction} className="card">
      <h3 className="panel-heading">Публичность данных стада</h3>
      <p className="mb-5 text-sm text-ink-700">
        Управляет тем, что видят неавторизованные посетители в разделе «Племенная книга».
        Настройка применяется сразу ко всем животным организации.
      </p>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="publicVisible"
          defaultChecked={defaultVisible}
          className="mt-0.5 h-4 w-4 accent-[#7cb342]"
        />
        <span>
          Показывать животных в публичном списке
          <span className="block text-ink-500">строка таблицы: номер, кличка, продуктивность, ИПЦ</span>
        </span>
      </label>

      <label className="mt-4 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="publicDetails"
          defaultChecked={defaultDetails}
          className="mt-0.5 h-4 w-4 accent-[#7cb342]"
        />
        <span>
          Открывать полную карточку животного
          <span className="block text-ink-500">оценка, экстерьер, фенотип, происхождение</span>
        </span>
      </label>

      {state.error && <p className="mt-4 text-sm text-red-700">{state.error}</p>}
      {state.message && <p className="mt-4 text-sm text-forest-600">{state.message}</p>}

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Применяем…' : 'Применить ко всему стаду'}
      </button>
    </form>
  )
}
