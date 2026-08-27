'use client'

import { useActionState } from 'react'
import { publishSubmissionAction, type SubmissionState } from '@/actions/submissions'

export function SubmissionPublishForm({
  id,
  disabled,
  alreadyPublished,
}: {
  id: string
  disabled?: boolean
  alreadyPublished?: boolean
}) {
  const [state, formAction, pending] = useActionState<SubmissionState, FormData>(
    publishSubmissionAction,
    {},
  )

  if (alreadyPublished) {
    return (
      <p className="mt-6 rounded-xl bg-brand-50 px-5 py-4 text-sm text-forest-600">
        {/* Прежде здесь стояло «получили уровень Верифицировано ассоциацией».
            Это была неправда: подпись ставило само хозяйство нажатием кнопки,
            без единой проверки. Теперь сказано и что случилось, и куда идти
            за подписью, — иначе владелец решит, что дело сделано. */}
        Данные приняты и опубликованы. Записи заявлены хозяйством; подпись
        Ассоциации ставится отдельно — по заявке на верификацию.
      </p>
    )
  }

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="id" value={id} />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="agreed"
          disabled={disabled}
          className="checkbox mt-0.5"
        />
        <span>
          Согласен с результатом проверки и разрешаю публикацию данных в племенной книге
        </span>
      </label>

      {state.error && <p className="mt-4 text-sm text-red-700">{state.error}</p>}
      {state.message && <p className="mt-4 text-sm text-forest-600">{state.message}</p>}

      <button type="submit" className="btn btn-accent mt-6" disabled={pending || disabled}>
        {/* Кнопка не грузит файл, а подтверждает согласие с проверкой —
            прежняя подпись «Загрузить данные» отправляла читателя обратно
            к импорту. */}
        {pending ? 'Публикуем…' : 'Опубликовать данные'}
      </button>

      {disabled && (
        <p className="mt-3 text-sm text-ink-500">
          Кнопка станет активной после того, как Ассоциация завершит проверку пакета.
        </p>
      )}
    </form>
  )
}
