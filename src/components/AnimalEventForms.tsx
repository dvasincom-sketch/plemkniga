'use client'

import { useActionState, useState } from 'react'
import { addEventAction, addExteriorAction, type EventFormState } from '@/actions/events'
import { EXTERIOR_COMPOSITES, EXTERIOR_TRAITS, STATES } from '@/lib/dictionaries'

type Choice = { value: string; label: string }

/**
 * Ввод событий с карточки животного.
 *
 * Событий три вида, и у каждого свой набор полей: у запуска — только дата,
 * у перемещения — ещё стадо, у выбытия — причина и новое состояние.
 * Показывать все поля сразу и надеяться, что человек заполнит нужные, —
 * верный способ получить выбытие без причины. Поэтому форма меняется
 * вслед за выбранным типом.
 *
 * Оценка экстерьера стоит отдельно: у неё двадцать одна цифра, дата,
 * бонитёр и лактация — в ленту событий это не помещается, да и не должно.
 */

const OUTCOMES = STATES.filter((s) => s.value !== 'alive')

export function AnimalEventForms({
  animalId,
  herds,
  disposalReasons,
  technicians,
}: {
  animalId: number
  herds: Choice[]
  disposalReasons: Choice[]
  technicians: Choice[]
}) {
  const [open, setOpen] = useState<'event' | 'exterior' | null>(null)

  if (!open) {
    return (
      <div className="card">
        <h3 className="panel-heading">Добавить запись</h3>
        <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Отёлы, осеменения и контрольные дойки приходят загрузкой файлом — у каждого свой
          раздел. Здесь то, что записывают по ходу дела.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-accent" onClick={() => setOpen('event')}>
            Событие
          </button>
          <button type="button" className="btn" onClick={() => setOpen('exterior')}>
            Оценка экстерьера
          </button>
        </div>
      </div>
    )
  }

  return open === 'event' ? (
    <EventForm
      animalId={animalId}
      herds={herds}
      disposalReasons={disposalReasons}
      onClose={() => setOpen(null)}
    />
  ) : (
    <ExteriorForm animalId={animalId} technicians={technicians} onClose={() => setOpen(null)} />
  )
}

function Result({ state }: { state: EventFormState }) {
  if (state.error) return <p className="mt-4 text-[14px] text-red-700">{state.error}</p>
  if (state.message)
    return (
      <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
        {state.message}
      </p>
    )
  return null
}

function EventForm({
  animalId,
  herds,
  disposalReasons,
  onClose,
}: {
  animalId: number
  herds: Choice[]
  disposalReasons: Choice[]
  onClose: () => void
}) {
  const [type, setType] = useState<'dryOff' | 'move' | 'disposal'>('dryOff')
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(addEventAction, {})

  return (
    <form action={formAction} className="card">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="panel-heading">Новое событие</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[14px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
        >
          Закрыть
        </button>
      </div>

      <input type="hidden" name="animal" value={animalId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Что произошло</span>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="field field-on-light"
          >
            <option value="dryOff">Запуск</option>
            <option value="move">Перемещение</option>
            <option value="disposal">Выбытие</option>
          </select>
        </label>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Дата</span>
          <input type="date" name="date" required className="field field-on-light" />
        </label>

        {type === 'move' && (
          <label className="block text-[14px]">
            <span className="mb-1.5 block text-ink-700">Новое стадо</span>
            <select name="herd" defaultValue="" className="field field-on-light">
              <option value="">— не меняется —</option>
              {herds.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === 'disposal' && (
          <>
            <label className="block text-[14px]">
              <span className="mb-1.5 block text-ink-700">Как выбыло</span>
              <select name="state" defaultValue="sold" className="field field-on-light">
                {OUTCOMES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.full}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-[14px]">
              <span className="mb-1.5 block text-ink-700">Причина</span>
              <select name="disposalReason" defaultValue="" className="field field-on-light">
                <option value="">— не указана —</option>
                {disposalReasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {type === 'disposal' && (
        <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
          Состояние животного в карточке изменится вместе с записью: лента и карточка описывают
          одно и то же животное, и расходиться им нельзя. Запись останется в книге —
          выбывшие животные не удаляются, по ним считают продуктивное долголетие.
        </p>
      )}

      <label className="mt-4 block text-[14px]">
        <span className="mb-1.5 block text-ink-700">
          Комментарий <span className="text-ink-500">— необязательно</span>
        </span>
        <textarea name="comment" rows={2} className="field field-on-light" />
      </label>

      <Result state={state} />

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? 'Записываем…' : 'Записать'}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  )
}

/**
 * Оценка экстерьера — бланк бонитёра.
 *
 * Восемнадцать статей и три композита идут сеткой в том же порядке,
 * в каком их обходят при осмотре: так заполняют с бумаги, не выискивая
 * поля глазами. Пустое поле означает «не оценивали», а не ноль: ноль
 * на шкале −2…+2 — это середина, вполне осмысленная оценка.
 */
function ExteriorForm({
  animalId,
  technicians,
  onClose,
}: {
  animalId: number
  technicians: Choice[]
  onClose: () => void
}) {
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(
    addExteriorAction,
    {},
  )

  return (
    <form action={formAction} className="card">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="panel-heading">Оценка экстерьера</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[14px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
        >
          Закрыть
        </button>
      </div>

      <input type="hidden" name="animal" value={animalId} />

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Шкала −2…+2. Пустое поле означает, что признак не оценивали: ноль здесь —
        это середина шкалы, а не отсутствие оценки. Прежняя оценка сохранится в истории,
        действующей станет эта.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Дата оценки</span>
          <input type="date" name="assessedAt" required className="field field-on-light" />
        </label>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Бонитёр</span>
          <select name="assessor" defaultValue="" className="field field-on-light">
            <option value="">— не указан —</option>
            {technicians.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Лактация</span>
          <input
            name="lactation"
            inputMode="numeric"
            placeholder="0 — до первого отёла"
            className="field field-on-light"
          />
        </label>
      </div>

      <h4 className="mt-6 text-[15px] font-medium text-forest-500">Линейные признаки</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXTERIOR_TRAITS.map((t) => (
          <label key={t.key} className="flex items-center justify-between gap-3 text-[14px]">
            <span className="text-ink-700">{t.label}</span>
            <input
              name={t.key}
              inputMode="decimal"
              className="field field-on-light w-20 text-right"
            />
          </label>
        ))}
      </div>

      <h4 className="mt-6 text-[15px] font-medium text-forest-500">Композиты</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXTERIOR_COMPOSITES.map((t) => (
          <label key={t.key} className="flex items-center justify-between gap-3 text-[14px]">
            <span className="text-ink-700">{t.label}</span>
            <input
              name={t.key}
              inputMode="decimal"
              className="field field-on-light w-20 text-right"
            />
          </label>
        ))}
      </div>

      <label className="mt-6 block text-[14px]">
        <span className="mb-1.5 block text-ink-700">
          Примечание <span className="text-ink-500">— необязательно</span>
        </span>
        <textarea name="note" rows={2} className="field field-on-light" />
      </label>

      <Result state={state} />

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? 'Записываем…' : 'Записать оценку'}
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  )
}
