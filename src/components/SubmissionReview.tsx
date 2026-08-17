'use client'

import { useActionState } from 'react'
import {
  addFindingAction,
  decideSubmissionAction,
  removeFindingAction,
  takeSubmissionAction,
  type ReviewState,
} from '@/actions/review'

type Finding = {
  id: string
  text: string
  field?: string | null
  severity?: string | null
  animal?: { id: number; identNumber?: string; name?: string | null } | number | null
}

type AnimalOpt = { id: number; identNumber: string; name?: string | null }

/**
 * Рабочее место эксперта: находки и решение.
 *
 * Три формы вместо одной большой. Находки появляются по ходу разбора, и та,
 * которую надо заполнить целиком перед сохранением, заставляет держать
 * их в голове; решение же принимается один раз и в конце. Смешивать их
 * в одну отправку значило бы терять записанное при каждой опечатке
 * в комментарии.
 */

function Result({ state }: { state: ReviewState }) {
  if (state.error) return <p className="mt-4 text-[14px] text-red-700">{state.error}</p>
  if (state.message)
    return (
      <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
        {state.message}
      </p>
    )
  return null
}

export function TakeIntoWork({ id, taken }: { id: number | string; taken: string | null }) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(
    takeSubmissionAction,
    {},
  )

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={String(id)} />
      {taken ? (
        <span className="text-[14px] text-ink-500">В работе у: {taken}</span>
      ) : (
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? 'Берём…' : 'Взять в работу'}
        </button>
      )}
      {state.error && <span className="text-[14px] text-red-700">{state.error}</span>}
    </form>
  )
}

export function Findings({
  id,
  findings,
  animals,
  readOnly,
}: {
  id: number | string
  findings: Finding[]
  animals: AnimalOpt[]
  readOnly: boolean
}) {
  const [addState, addAction, adding] = useActionState<ReviewState, FormData>(addFindingAction, {})
  const [, removeAction] = useActionState<ReviewState, FormData>(removeFindingAction, {})

  const identOf = (a: Finding['animal']): string => {
    if (!a) return ''
    if (typeof a === 'number') return `#${a}`
    return a.identNumber ?? `#${a.id}`
  }

  return (
    <div className="card">
      <h2 className="panel-heading">Находки проверки</h2>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        То, что нашёл человек, а не машина: причины, по которым импорт не принял строки, лежат
        выше и написаны программой. Хозяйство увидит этот список вместе с решением — по нему
        оно и будет исправлять.
      </p>

      {findings.length === 0 ? (
        <p className="text-[14px] text-ink-500">Находок нет.</p>
      ) : (
        <ul className="divide-y divide-[#ededed]">
          {findings.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] leading-snug">{f.text}</p>
                <p className="mt-1 text-[13px] text-ink-500">
                  {[identOf(f.animal), f.field].filter(Boolean).join(' · ') || 'весь пакет'}
                  {' · '}
                  {(f.severity ?? 'fix') === 'fix' ? 'требует исправления' : 'на усмотрение хозяйства'}
                </p>
              </div>
              {!readOnly && (
                <form action={removeAction} className="flex-none">
                  <input type="hidden" name="id" value={String(id)} />
                  <input type="hidden" name="finding" value={f.id} />
                  <button
                    type="submit"
                    className="text-[13px] text-ink-500 underline underline-offset-4 hover:text-red-700"
                  >
                    убрать
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <form action={addAction} className="mt-6 border-t border-[#ededed] pt-6">
          <input type="hidden" name="id" value={String(id)} />

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-[14px]">
              <span className="mb-1.5 block text-ink-700">Животное</span>
              <select name="animal" defaultValue="" className="field field-on-light">
                <option value="">— весь пакет —</option>
                {animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.identNumber}
                    {a.name ? ` · ${a.name}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[14px]">
              <span className="mb-1.5 block text-ink-700">Поле или показатель</span>
              <input name="field" className="field field-on-light" placeholder="Дата рождения" />
            </label>

            <label className="block text-[14px]">
              <span className="mb-1.5 block text-ink-700">Насколько существенно</span>
              <select name="severity" defaultValue="fix" className="field field-on-light">
                <option value="fix">Требует исправления</option>
                <option value="note">На усмотрение хозяйства</option>
              </select>
            </label>
          </div>

          <label className="mt-4 block text-[14px]">
            <span className="mb-1.5 block text-ink-700">Что не так</span>
            <textarea
              name="text"
              rows={2}
              required
              className="field field-on-light"
              placeholder="Мать моложе дочери: проверьте дату рождения или связь с матерью"
            />
          </label>

          <Result state={addState} />

          <button type="submit" className="btn mt-4" disabled={adding}>
            {adding ? 'Записываем…' : 'Добавить находку'}
          </button>
        </form>
      )}
    </div>
  )
}

export function Decision({
  id,
  blocking,
  decided,
}: {
  id: number | string
  blocking: number
  decided: boolean
}) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(
    decideSubmissionAction,
    {},
  )

  if (decided) return null

  return (
    <form action={formAction} className="card">
      <h2 className="panel-heading">Решение по пакету</h2>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Решение принимается по пакету целиком. Уровень достоверности здесь не поднимается:
        «проверено» — это заключение Ассоциации, а показать данные разрешает владелец,
        отдельным действием у себя в кабинете.
        {blocking > 0 && (
          <>
            {' '}
            Сейчас находок с пометкой «требует исправления»: <b>{blocking}</b>.
          </>
        )}
      </p>

      <input type="hidden" name="id" value={String(id)} />

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-xl bg-[#f6f6f6] px-4 py-3 text-[14px]">
          <input type="radio" name="decision" value="checked" defaultChecked className="mt-1" />
          <span>
            <span className="block font-medium">Проверено</span>
            <span className="text-ink-500">
              Хозяйство сможет разрешить публикацию, записи пакета получат уровень
              «Верифицировано ассоциацией»
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl bg-[#f6f6f6] px-4 py-3 text-[14px]">
          <input type="radio" name="decision" value="rejected" className="mt-1" />
          <span>
            <span className="block font-medium">Отклонено</span>
            <span className="text-ink-500">
              Данные останутся в стаде с прежним уровнем достоверности; хозяйство увидит
              причину и находки
            </span>
          </span>
        </label>
      </fieldset>

      <label className="mt-4 block text-[14px]">
        <span className="mb-1.5 block text-ink-700">Комментарий хозяйству</span>
        <textarea
          name="comment"
          rows={3}
          className="field field-on-light"
          placeholder="Например: данные подтверждены; замечания по двум записям не влияют на оценку"
        />
      </label>

      <Result state={state} />

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Вынести решение'}
      </button>
    </form>
  )
}
