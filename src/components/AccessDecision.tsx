'use client'

import { useActionState, useState } from 'react'
import { decideAccessAction, type AccessFormState } from '@/actions/access'
import { ACCESS_SCOPES, GRANT_TERMS, SCOPES_BY_PURPOSE } from '@/lib/dictionaries'

/**
 * Решение хозяйства по запросу доступа.
 *
 * Раньше здесь была одна кнопка — «Открыть данные записи», — и она снимала
 * замок с карточки для всех посетителей книги навсегда. Владельцу
 * предлагалось опубликовать животное ради одного разговора о покупке,
 * и он отказывал. Отказ был не осторожностью: это единственная кнопка,
 * которая не делала лишнего.
 *
 * Теперь владелец выдаёт грант и решает три вещи: что открыть, на что
 * и на какой срок. Разбор — `docs/tochechnyy-dostup.md`.
 *
 * Области предзаполняются по цели запроса. Это не ограничение — галочки
 * снимаются и ставятся, — а способ показать соразмерность: «покупка»
 * предлагает всё, «проверка происхождения» только родословную, и владелец
 * видит, совпадает ли просьба с тем, зачем её объяснили.
 *
 * Отказ без объяснения остаётся рабочим сценарием, поэтому поле ответа
 * по-прежнему появляется по кнопке и никому не мешает.
 */
export function AccessDecision({
  requestId,
  purposeValue,
  requestedScopes,
  animalLabel,
  granteeName,
}: {
  requestId: number
  purposeValue: string
  /** Что заявитель попросил сам. Пусто — просил до появления областей. */
  requestedScopes: string[]
  animalLabel: string
  granteeName: string
}) {
  const [state, formAction, pending] = useActionState<AccessFormState, FormData>(
    decideAccessAction,
    {},
  )

  /*
   * Что предложить владельцу отмеченным.
   *
   * Названное заявителем важнее выведенного из цели: он сказал прямо,
   * и подменять сказанное догадкой — способ показать владельцу просьбу
   * не той величины. Набор по цели остаётся для старых запросов, поданных
   * до появления областей.
   */
  const suggested = requestedScopes.length ? requestedScopes : (SCOPES_BY_PURPOSE[purposeValue] ?? [])
  const [scopes, setScopes] = useState<string[]>([...suggested])
  const [coverage, setCoverage] = useState<'animal' | 'herd'>('animal')
  const [term, setTerm] = useState<string>('90')
  const [withResponse, setWithResponse] = useState(false)

  if (state.message) {
    return (
      <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
        {state.message}
      </p>
    )
  }

  const toggle = (value: string) =>
    setScopes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )

  const chosen = ACCESS_SCOPES.filter((s) => scopes.includes(s.value))
  const termLabel = GRANT_TERMS.find((t) => t.value === term)?.label ?? 'Бессрочно'

  /*
   * Последствие называется до нажатия, а не после.
   *
   * Прежний текст был вынужден предупреждать, что запись откроется всему
   * свету. Новый говорит обратное — и это единственная причина, по которой
   * владелец начнёт нажимать «выдать» вместо «отказать».
   */
  const consequence =
    chosen.length === 0
      ? 'Отметьте хотя бы одну область — без неё грант ничего не открывает.'
      : `${granteeName} увидит ${chosen
          .map((s) => s.label.toLowerCase())
          .join(', ')} — ${
          coverage === 'herd' ? 'по всему вашему стаду' : `по записи «${animalLabel}»`
        }, ${term ? `${termLabel.toLowerCase()}` : 'без ограничения срока'}. Остальные посетители книги не увидят ничего: запись останется закрытой. Отозвать можно в любой момент.`

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="request" value={requestId} />
      <input type="hidden" name="coverage" value={coverage} />
      <input type="hidden" name="term" value={term} />

      <fieldset className="mb-4">
        <legend className="mb-2 text-[14px] text-ink-700">
          Что открыть{' '}
          <span className="text-ink-500">
            {requestedScopes.length ? '— отмечено то, что просили' : '— отмечено по цели запроса'}
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {ACCESS_SCOPES.map((s) => {
            const on = scopes.includes(s.value)
            return (
              <label
                key={s.value}
                title={s.hint}
                className={`cursor-pointer rounded-lg px-3 py-2 text-[14px] transition-colors ${
                  on
                    ? 'bg-forest-500 text-white'
                    : 'bg-white text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                }`}
              >
                <input
                  type="checkbox"
                  name="scopes"
                  value={s.value}
                  checked={on}
                  onChange={() => toggle(s.value)}
                  className="sr-only"
                />
                {s.label}
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 text-[14px] text-ink-700">На что</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: 'animal', label: 'Только эта запись' },
              { value: 'herd', label: 'Всё моё стадо' },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setCoverage(o.value)}
              className={`rounded-lg px-3 py-2 text-[14px] transition-colors ${
                coverage === o.value
                  ? 'bg-forest-500 text-white'
                  : 'bg-white text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {coverage === 'herd' && (
          <p className="mt-2 text-[13px] leading-snug text-ink-500">
            Включая животных, которые появятся позже: доступ проверяется по владельцу
            записи, а не по списку, составленному сейчас.
          </p>
        )}
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 text-[14px] text-ink-700">На какой срок</legend>
        <div className="flex flex-wrap gap-2">
          {GRANT_TERMS.map((t) => (
            <button
              key={t.value || 'forever'}
              type="button"
              onClick={() => setTerm(t.value)}
              className={`rounded-lg px-3 py-2 text-[14px] transition-colors ${
                term === t.value
                  ? 'bg-forest-500 text-white'
                  : 'bg-white text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      {withResponse && (
        <label className="mb-3 block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Ответ заявителю</span>
          <textarea
            name="response"
            rows={2}
            maxLength={600}
            className="field field-on-light"
            placeholder="Например: продуктивность откроем после подписания договора"
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          name="decision"
          value="approved"
          className="btn btn-accent"
          disabled={pending || chosen.length === 0}
        >
          Выдать доступ
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

      <p className="mt-2.5 max-w-[75ch] text-[13px] leading-snug text-ink-500">{consequence}</p>

      {state.error && <p className="mt-3 text-[14px] text-red-700">{state.error}</p>}
    </form>
  )
}
