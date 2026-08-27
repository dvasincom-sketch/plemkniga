'use client'

import { useActionState } from 'react'
import {
  resetThresholdAction,
  setThresholdAction,
  type ThresholdState,
} from '@/actions/checks'

/**
 * Одна ручка настройки — одна форма.
 *
 * ## Почему не одна форма на всю страницу
 *
 * Соблазн: собрать двадцать полей и одну кнопку «Сохранить». Отвергнуто
 * по двум причинам.
 *
 * Первая — объяснение. У правки порога есть причина, и она своя у каждого
 * числа. Общая кнопка означала бы одно объяснение на двадцать правок,
 * то есть отсутствие объяснения.
 *
 * Вторая — цена ошибки. Двадцать полей сохраняются вместе, и опечатка
 * в одном либо роняет всё сохранение, либо проходит вместе с девятнадцатью
 * верными. Отдельная форма отвечает про своё число и не трогает соседей.
 */

type Spec = {
  key: string
  label: string
  unit: string
  value: number
  default: number
  min: number
  max: number
  step: number
  why: string
  used: string[]
  note?: string | null
}

export function ThresholdForm({ spec }: { spec: Spec }) {
  const [state, save, saving] = useActionState<ThresholdState, FormData>(setThresholdAction, {})
  const [resetState, reset] = useActionState<ThresholdState, FormData>(resetThresholdAction, {})

  const changed = spec.value !== spec.default
  const message = state.error ?? state.message ?? resetState.error ?? resetState.message
  const failed = Boolean(state.error ?? resetState.error)

  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[17px] font-medium leading-snug">{spec.label}</h3>
        {changed && (
          <span className="flex-none rounded bg-canvas px-2 py-0.5 text-[12px] text-ink-700">
            заложено {spec.default} {spec.unit}
          </span>
        )}
      </div>

      <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">{spec.why}</p>

      {/*
         Список затронутых правил — над полем ввода, а не под ним.
         Одно число обслуживает несколько проверок, и узнать, какие именно
         изменятся, нужно до правки, а не после.
      */}
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-ink-500">
        <span className="text-ink-700">Изменятся правила:</span> {spec.used.join(', ')}
      </p>

      <form action={save} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="key" value={spec.key} />

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Значение, {spec.unit}</span>
          <input
            type="number"
            name="value"
            defaultValue={spec.value}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            required
            className="field field-on-light w-[160px] tabular-nums"
          />
        </label>

        <label className="block min-w-[220px] flex-1 text-[14px]">
          <span className="mb-1.5 block text-ink-700">Чем объясняется правка</span>
          <input
            type="text"
            name="note"
            defaultValue={spec.note ?? ''}
            placeholder="через год объяснять будет другой человек"
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </label>

        <button type="submit" className="btn btn-forest" disabled={saving}>
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </form>

      <p className="mt-2 text-[13px] text-ink-500">
        Допустимо от {spec.min} до {spec.max} {spec.unit}.
      </p>

      {changed && (
        <form action={reset} className="mt-3">
          <input type="hidden" name="key" value={spec.key} />
          <button
            type="submit"
            className="text-[13px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
          >
            вернуть заложенное значение
          </button>
        </form>
      )}

      {message && (
        <p className={`mt-3 text-[14px] ${failed ? 'text-red-700' : 'text-forest-600'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
