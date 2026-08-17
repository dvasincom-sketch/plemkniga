'use client'

import { useActionState, useEffect, useState } from 'react'
import { updateAnimalAction, type AnimalFormState } from '@/actions/animals'
import type { BlockValue } from '@/lib/animal-edit'
import { Select } from '@/components/Select'
import { DateField } from '@/components/DateField'

/**
 * Блок карточки, который можно поправить не уходя со страницы.
 *
 * Правка поблочная, а не «форма на всю карточку», и причин тому две.
 * Первая техническая: форма, отправляющая двести полей, при каждом
 * сохранении переписывает и те, которых человек не касался, — журнал
 * правок честно запишет это как изменения, и найти в нём настоящую правку
 * станет невозможно. Вторая человеческая: карточку правят точечно —
 * пришла бумага, в ней другая дата рождения. Открывать ради одной даты
 * анкету на два экрана незачем.
 *
 * Пока не нажали «Править», блок выглядит ровно как остальная карточка —
 * тот же список «показатель / значение». Это намеренно: страница не должна
 * выглядеть формой, её читают чаще, чем правят.
 */
export function AnimalEditBlock({
  animalId,
  title,
  values,
  canEdit,
  note,
  extras = [],
}: {
  animalId: number
  title: string
  values: BlockValue[]
  canEdit: boolean
  note?: string
  /**
   * Показатели, которые видно, но нельзя менять: присвоенный системой GUID,
   * номер в ГПК, чип. Прятать их из-за этого неправильно — их читают; давать
   * править тоже: они либо назначаются один раз навсегда, либо приходят
   * извне и меняются вместе с источником.
   */
  extras?: { label: string; value: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState<AnimalFormState, FormData>(
    updateAnimalAction,
    {},
  )

  const saved = Boolean(state.message) && !state.error

  /*
   * Сохранилось — форма закрывается сама. Оставлять её открытой значит
   * предлагать сохранить ещё раз то же самое; а показать новые значения
   * всё равно нужно из карточки: страницу после сохранения перестраивает
   * сервер (`revalidatePath`), и правильные значения приезжают оттуда.
   */
  useEffect(() => {
    if (saved) setEditing(false)
  }, [saved])

  if (!editing) {
    return (
      <div className="card">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="panel-heading">{title}</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[14px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
            >
              Править
            </button>
          )}
        </div>

        {saved && (
          <p className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
            {state.message}. Правки записаны в историю карточки.
          </p>
        )}

        <dl className="divide-y divide-[#ededed] text-sm">
          {values.map((v) => (
            <div key={v.path} className="grid grid-cols-[1fr_1fr] gap-4 py-2">
              <dt className="text-ink-500">{v.label}</dt>
              <dd className="break-words">{v.text || '—'}</dd>
            </div>
          ))}
          {extras.map((e) => (
            <div key={e.label} className="grid grid-cols-[1fr_1fr] gap-4 py-2">
              <dt className="text-ink-500">{e.label}</dt>
              <dd className="break-words">{e.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }

  return (
    <form action={formAction} className="card">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="panel-heading">{title}</h2>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[14px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
        >
          Отмена
        </button>
      </div>

      <input type="hidden" name="id" value={animalId} />
      {/*
        Список полей блока едет отдельным полем: снятый флажок браузер
        не присылает вовсе, и без этого списка «сняли галочку» неотличимо
        от «этого поля в форме не было».
      */}
      <input type="hidden" name="fields" value={values.map((v) => v.path).join(',')} />

      {note && (
        <p className="mb-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">{note}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {values.map((v) => (
          <label key={v.path} className="block text-[14px]">
            <span className="mb-1.5 block text-ink-700">{v.label}</span>

            {v.kind === 'checkbox' ? (
              <span className="flex items-center gap-2 py-2">
                <input type="checkbox" name={v.path} defaultChecked={v.raw === 'on'} />
                <span className="text-ink-700">да</span>
              </span>
            ) : v.choices ? (
              <Select
                name={v.path}
                options={v.choices.map((c) => ({ value: c.value, label: c.label }))}
                defaultValue={v.raw}
                placeholder="— не указано —"
                onLight
                ariaLabel={v.label}
              />
            ) : v.kind === 'date' ? (
              <DateField name={v.path} defaultValue={v.raw} ariaLabel={v.label} />
            ) : (
              <input
                type="text"
                inputMode={v.kind === 'number' ? 'decimal' : undefined}
                name={v.path}
                defaultValue={v.raw}
                className="field field-on-light"
              />
            )}
          </label>
        ))}
      </div>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button type="button" className="btn" onClick={() => setEditing(false)}>
          Отмена
        </button>
      </div>
    </form>
  )
}
