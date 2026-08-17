'use client'

import { useActionState, useState } from 'react'
import {
  issueDocumentAction,
  revokeDocumentAction,
  type DocumentState,
} from '@/actions/documents'
import { Select } from '@/components/Select'

/**
 * Выпуск документа — по индивидуальному номеру, а не выбором из списка.
 *
 * Списком тут не обойтись: животных в книге триста тысяч, и выпадающее поле
 * на такой список бесполезно. А номер у эксперта перед глазами — он пришёл
 * из заявки, из письма или с бумаги, и его переписывают, а не ищут.
 */
export function IssueDocument() {
  const [state, formAction, pending] = useActionState<DocumentState, FormData>(
    issueDocumentAction,
    {},
  )

  return (
    <form action={formAction} className="card">
      <h2 className="panel-heading">Выпустить документ</h2>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Документ выпускается по проверенным данным: животное должно иметь уровень
        «Верифицировано ассоциацией», а форма — сойтись целиком. Если чего-то не хватает,
        система скажет чего именно, а не откажет молча.
      </p>

      <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr_auto] sm:items-end">
        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Индивидуальный № животного</span>
          <input
            name="identNumber"
            required
            className="field field-on-light"
            placeholder="112233445566778"
          />
        </label>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Что выпускаем</span>
          <Select
            name="kind"
            options={[
              { value: 'pedigree', label: 'Племенное свидетельство' },
              { value: 'zootechnical', label: 'Зоотехнический сертификат' },
            ]}
            defaultValue="pedigree"
            placeholder=""
            onLight
            ariaLabel="Что выпускаем"
          />
        </label>

        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? 'Проверяем…' : 'Выпустить'}
        </button>
      </div>

      {state.error && (
        <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-red-700">{state.error}</p>
      )}
      {state.message && (
        <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
          {state.message}
        </p>
      )}
    </form>
  )
}

/**
 * Отзыв — с причиной и без удаления.
 *
 * Форма раскрывается по требованию: в журнале сотни строк, и поле ввода
 * у каждой превратило бы его в анкету.
 */
export function RevokeDocument({ documentId }: { documentId: number }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<DocumentState, FormData>(
    revokeDocumentAction,
    {},
  )

  if (state.message) return <span className="text-[13px] text-ink-500">{state.message}</span>

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap text-[13px] text-ink-500 underline underline-offset-4 hover:text-red-700"
      >
        отозвать
      </button>
    )
  }

  return (
    <form action={formAction} className="min-w-[16rem] space-y-2">
      <input type="hidden" name="document" value={documentId} />
      <textarea
        name="reason"
        rows={2}
        required
        placeholder="Причина отзыва — останется в журнале"
        className="field field-on-light text-[14px]"
      />
      {state.error && <p className="text-[13px] text-red-700">{state.error}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn px-3 py-1.5 text-[13px]" disabled={pending}>
          {pending ? 'Отзываем…' : 'Отозвать'}
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
