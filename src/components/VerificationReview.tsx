'use client'

import { useActionState } from 'react'
import {
  addVerificationFindingAction,
  decideVerificationAction,
  removeVerificationFindingAction,
  takeVerificationAction,
  type VerificationState,
} from '@/actions/verification'

type Finding = {
  id: string
  text: string
  field?: string | null
  severity?: string | null
  animal?: { id: number; identNumber?: string } | number | null
}

type AnimalOpt = { id: number; identNumber: string; name?: string | null }

/**
 * Разбор заявки на верификацию — сторона Ассоциации.
 *
 * Отличие от разбора пакета одно, но существенное: здесь замечание
 * «требует исправления» не просто объясняет, а исключает своё животное
 * из подтверждения. Поэтому оно и подписано так прямо — эксперт должен
 * видеть последствие в тот момент, когда его ставит, а не узнавать о нём
 * из результата.
 */

function Result({ state }: { state: VerificationState }) {
  if (state.error) return <p className="mt-4 text-[14px] text-red-700">{state.error}</p>
  if (state.message)
    return (
      <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
        {state.message}
      </p>
    )
  return null
}

export function TakeVerification({ id, taken }: { id: number | string; taken: string | null }) {
  const [state, formAction, pending] = useActionState<VerificationState, FormData>(
    takeVerificationAction,
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

export function VerificationAutoIssues({
  id,
  issues,
  readOnly,
}: {
  id: number | string
  issues: {
    code: string
    animalId: number
    ident: string
    field?: string
    severity: string
    text: string
  }[]
  readOnly: boolean
}) {
  const [, addAction] = useActionState<VerificationState, FormData>(
    addVerificationFindingAction,
    {},
  )

  if (!issues.length) {
    return (
      <div className="card">
        <h2 className="panel-heading">Автоматические проверки</h2>
        <p className="text-[15px] text-ink-700">
          Несостыковок не найдено. Это не заключение — это значит, что машинных признаков
          противоречий нет; документы всё равно смотрит человек.
        </p>
      </div>
    )
  }

  const fix = issues.filter((i) => i.severity === 'fix').length

  return (
    <div className="card">
      <h2 className="panel-heading">Автоматические проверки · {issues.length}</h2>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        {fix} существенных, {issues.length - fix} на усмотрение. Перенесённое в замечания
        с пометкой «требует исправления» исключит своё животное из подтверждения — остальные
        записи заявки это не затронет.
      </p>

      <ul className="divide-y divide-[#ededed]">
        {issues.map((i, n) => (
          <li
            key={`${i.code}-${i.animalId}-${n}`}
            className="flex items-start justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-[15px] leading-snug">
                <span
                  className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[12px] ${
                    i.severity === 'fix' ? 'bg-red-50 text-red-700' : 'bg-[#f2f2f2] text-ink-500'
                  }`}
                >
                  {i.severity === 'fix' ? 'существенно' : 'на усмотрение'}
                </span>
                {i.text}
              </p>
              <p className="mt-1 text-[13px] text-ink-500">
                № {i.ident}
                {i.field ? ` · ${i.field}` : ''}
              </p>
            </div>

            {!readOnly && (
              <form action={addAction} className="flex-none">
                <input type="hidden" name="id" value={String(id)} />
                <input type="hidden" name="animal" value={i.animalId} />
                <input type="hidden" name="field" value={i.field ?? ''} />
                <input type="hidden" name="severity" value={i.severity} />
                <input type="hidden" name="text" value={i.text} />
                <button
                  type="submit"
                  className="whitespace-nowrap text-[13px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
                >
                  в замечания
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function VerificationFindings({
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
  const [addState, addAction, adding] = useActionState<VerificationState, FormData>(
    addVerificationFindingAction,
    {},
  )
  const [, removeAction] = useActionState<VerificationState, FormData>(
    removeVerificationFindingAction,
    {},
  )

  const identOf = (a: Finding['animal']): string => {
    if (!a) return 'вся заявка'
    if (typeof a === 'number') return `#${a}`
    return a.identNumber ?? `#${a.id}`
  }

  return (
    <div className="card">
      <h2 className="panel-heading">Замечания</h2>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Замечание «требует исправления» оставляет своё животное с прежним уровнем достоверности.
        Остальные записи заявки подтверждаются как обычно: одна спорная корова не должна
        задерживать сто бесспорных.
      </p>

      {findings.length === 0 ? (
        <p className="text-[14px] text-ink-500">Замечаний нет — заявка подтвердится целиком.</p>
      ) : (
        <ul className="divide-y divide-[#ededed]">
          {findings.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] leading-snug">{f.text}</p>
                <p className="mt-1 text-[13px] text-ink-500">
                  {identOf(f.animal)}
                  {f.field ? ` · ${f.field}` : ''} ·{' '}
                  {(f.severity ?? 'fix') === 'fix'
                    ? 'не подтверждается'
                    : 'на усмотрение хозяйства'}
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
                <option value="">— вся заявка —</option>
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
              <input name="field" className="field field-on-light" placeholder="Происхождение" />
            </label>

            <label className="block text-[14px]">
              <span className="mb-1.5 block text-ink-700">Последствие</span>
              <select name="severity" defaultValue="fix" className="field field-on-light">
                <option value="fix">Не подтверждать эту запись</option>
                <option value="note">Подтвердить, но отметить</option>
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
              placeholder="Происхождение не подтверждено документами: нет свидетельства на мать"
            />
          </label>

          <Result state={addState} />

          <button type="submit" className="btn mt-4" disabled={adding}>
            {adding ? 'Записываем…' : 'Добавить замечание'}
          </button>
        </form>
      )}
    </div>
  )
}

export function VerificationDecision({
  id,
  total,
  held,
}: {
  id: number | string
  total: number
  held: number
}) {
  const [state, formAction, pending] = useActionState<VerificationState, FormData>(
    decideVerificationAction,
    {},
  )

  return (
    <form action={formAction} className="card">
      <h2 className="panel-heading">Решение по заявке</h2>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        При подтверждении уровень «Верифицировано ассоциацией» получат {total - held} из {total}{' '}
        записей
        {held > 0 && <>; {held} останутся с прежним — по ним есть замечание «не подтверждать»</>}.
        Согласия хозяйства отдельно не требуется: оно дано самой подачей заявки.
      </p>

      <input type="hidden" name="id" value={String(id)} />

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-xl bg-[#f6f6f6] px-4 py-3 text-[14px]">
          <input type="radio" name="decision" value="approved" defaultChecked className="mt-1" />
          <span>
            <span className="block font-medium">Подтвердить</span>
            <span className="text-ink-500">
              Записи без существенных замечаний получат уровень «Верифицировано ассоциацией»
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl bg-[#f6f6f6] px-4 py-3 text-[14px]">
          <input type="radio" name="decision" value="rejected" className="mt-1" />
          <span>
            <span className="block font-medium">Отклонить</span>
            <span className="text-ink-500">
              Ни одна запись не подтверждается; хозяйство увидит причину и замечания
            </span>
          </span>
        </label>
      </fieldset>

      <label className="mt-4 block text-[14px]">
        <span className="mb-1.5 block text-ink-700">Заключение</span>
        <textarea
          name="comment"
          rows={3}
          className="field field-on-light"
          placeholder="Происхождение и продуктивность подтверждены документами хозяйства"
        />
      </label>

      <Result state={state} />

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Вынести решение'}
      </button>
    </form>
  )
}
