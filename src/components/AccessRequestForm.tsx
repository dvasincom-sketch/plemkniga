'use client'

import { useActionState } from 'react'
import { requestAccessAction, type AccessFormState } from '@/actions/access'
import { ACCESS_REQUEST_PURPOSES } from '@/collections/AccessRequests'

/**
 * Запрос доступа к закрытой карточке.
 *
 * Цель запроса спрашивается не для отчётности: владелец решает по ней.
 * «Хочу купить» и «пишу диссертацию» — разные разговоры, и без этой строки
 * хозяйству пришлось бы гадать или отказывать по умолчанию.
 */
export function AccessRequestForm({
  animalId,
  ownerName,
}: {
  animalId: number
  ownerName: string
}) {
  const [state, formAction, pending] = useActionState<AccessFormState, FormData>(
    requestAccessAction,
    {},
  )

  const sent = Boolean(state.message)

  return (
    <form action={formAction} className="card">
      <h2 className="panel-heading">Запросить доступ у хозяйства</h2>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Запрос уйдёт в личный кабинет {ownerName}. Решение принимает хозяйство — Ассоциация
        не открывает чужие данные за владельца. Ответ придёт в ваши уведомления.
      </p>

      <input type="hidden" name="animal" value={animalId} />

      <label className="block text-[14px]">
        <span className="mb-1.5 block text-ink-700">Зачем нужен доступ</span>
        <select name="purpose" className="field field-on-light" defaultValue="purchase" disabled={sent}>
          {ACCESS_REQUEST_PURPOSES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-[14px]">
        <span className="mb-1.5 block text-ink-700">
          Сообщение хозяйству <span className="text-ink-500">— необязательно</span>
        </span>
        <textarea
          name="comment"
          rows={3}
          maxLength={600}
          disabled={sent}
          placeholder="Например: подбираем быка для стада, интересует оценка экстерьера дочерей"
          className="field field-on-light"
        />
      </label>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}
      {state.message && (
        <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
          {state.message}
        </p>
      )}

      {!sent && (
        <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
          {pending ? 'Отправляем…' : 'Отправить запрос'}
        </button>
      )}
    </form>
  )
}
