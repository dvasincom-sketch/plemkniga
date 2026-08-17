'use client'

import { useActionState } from 'react'
import { setAnimalVisibilityAction, type FormState } from '@/actions/account'

/**
 * Публичность одной записи.
 *
 * До этого переключатель был один и на всё стадо: «Применить ко всему стаду»
 * в настройках кабинета. Он и остаётся — заводя хозяйство, публичность
 * решают оптом, и заставлять человека проходить по тысяче животных
 * бессмысленно.
 *
 * Но оптом решается не всё. Одного быка выставляют на продажу и открывают,
 * пока остальное стадо закрыто; одну корову, наоборот, закрывают перед
 * сделкой. С появлением точечного доступа несоответствие стало заметным:
 * грант выдаётся по одному животному, а публичность — только всему стаду
 * сразу.
 *
 * Две ступени показаны как две, а не одним переключателем «открыть»:
 * они отвечают на разные вопросы — «есть ли запись в книге» и «можно ли
 * открыть карточку», — и путать их нельзя. Вторая без первой ничего
 * не значит, поэтому при выключенной первой вторая гаснет.
 */
export function AnimalVisibility({
  animalId,
  publicVisible,
  publicDetails,
}: {
  animalId: number
  publicVisible: boolean
  publicDetails: boolean
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setAnimalVisibilityAction,
    {},
  )

  return (
    <form action={formAction} className="card mt-6">
      <h2 className="panel-heading">Публичность этой записи</h2>
      <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-ink-700">
        Настройка касается только этого животного и перекрывает то, что задано
        для стада целиком. Точечный доступ отдельным хозяйствам живёт рядом
        и от этих переключателей не зависит.
      </p>

      <input type="hidden" name="animal" value={animalId} />

      <label className="flex items-start gap-3 text-[14px]">
        <input
          type="checkbox"
          name="publicVisible"
          defaultChecked={publicVisible}
          className="checkbox mt-0.5"
        />
        <span>
          Показывать в публичном списке
          <span className="block text-ink-500">
            строка книги: номер, кличка, владелец, удой, жир, белок, ИПЦ
          </span>
        </span>
      </label>

      <label className="mt-4 flex items-start gap-3 text-[14px]">
        <input
          type="checkbox"
          name="publicDetails"
          defaultChecked={publicDetails}
          className="checkbox mt-0.5"
        />
        <span>
          Открывать полную карточку
          <span className="block text-ink-500">
            оценка, экстерьер, происхождение, события, документы
          </span>
        </span>
      </label>

      <p className="mt-4 text-[13px] leading-snug text-ink-500">
        Вторая настройка работает только вместе с первой: записи, которой нет
        в книге, и открывать нечего.
      </p>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}
      {state.message && <p className="mt-4 text-[14px] text-forest-600">{state.message}</p>}

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Сохраняем…' : 'Сохранить'}
      </button>
    </form>
  )
}
