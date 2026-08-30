'use client'

import { useActionState } from 'react'
import { setHerdVisibilityAction, type FormState } from '@/actions/account'

/**
 * Видимость всего стада в общей книге — настройка кабинета.
 *
 * ## Почему отдельный компонент, а не тот же, что у карточки
 *
 * `VisibilityForm` переехал на одно животное: он появился в шапке карточки
 * вместе с точечной публичностью и требует `animalId`. Кабинет же решает
 * оптом — заводя хозяйство, публичность выставляют разом, и гонять
 * человека по тысяче животных незачем.
 *
 * Пока эти два случая делили один компонент, кабинет передавал ему
 * `defaultVisible` от **первого попавшегося животного** и выдавал это
 * за состояние стада. На стаде, где половина открыта, а половина закрыта,
 * переключатель показывал случайное из двух — и человек, ничего
 * не трогая, а просто нажав «Сохранить», переворачивал видимость всему
 * хозяйству.
 *
 * Разведены они не ради опрятности: у настроек разные действия
 * (`setHerdVisibilityAction` против `setAnimalVisibilityAction`), разные
 * права и разная цена ошибки.
 *
 * ## Почему переключатели не показывают текущее состояние
 *
 * Потому что у стада его нет. «Открыто ли стадо» — вопрос без ответа,
 * когда часть записей открыта, а часть нет; любое значение по умолчанию
 * здесь было бы утверждением, которого мы сделать не можем.
 *
 * Поэтому форма читается как действие, а не как состояние: два флажка
 * и кнопка «Применить ко всем записям». Что стало с конкретной записью,
 * видно в её карточке — там состояние есть и оно однозначно.
 */
export function HerdVisibilityForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setHerdVisibilityAction,
    {},
  )

  return (
    <form action={formAction} className="card lg:col-span-2">
      <p className="max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
        Применяется сразу ко всем записям хозяйства и перекрывает то, что задано
        у отдельных животных. Настройка одной записи живёт в её карточке.
      </p>

      {/*
         Две ступени показаны как две, а не одним переключателем «открыть»:
         они отвечают на разные вопросы — «есть ли запись в книге» и «можно
         ли открыть карточку». Вторая без первой ничего не значит, и порядок
         тут не оформительский.
      */}
      <label className="mt-5 flex items-start gap-3 text-[14px]">
        <input type="checkbox" name="publicVisible" className="checkbox mt-0.5" />
        <span>
          Показывать в публичном списке
          <span className="block text-ink-500">
            строка книги: номер, кличка, владелец, удой, жир, белок, ИПЦ
          </span>
        </span>
      </label>

      <label className="mt-3 flex items-start gap-3 text-[14px]">
        <input type="checkbox" name="publicDetails" className="checkbox mt-0.5" />
        <span>
          Открывать полную карточку
          <span className="block text-ink-500">
            происхождение, лактации, оценки. Без первого флажка не действует
          </span>
        </span>
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-brand">
          {pending ? 'Применяем…' : 'Применить ко всем записям'}
        </button>

        {/*
           Ответ действия показывается здесь, а не всплывающим сообщением:
           он несёт число обновлённых записей, и это единственное
           подтверждение, что настройка оптом сработала так, как ждали.
        */}
        {state.message && <span className="text-[14px] text-forest-700">{state.message}</span>}
        {state.error && <span className="text-[14px] text-rust-700">{state.error}</span>}
      </div>
    </form>
  )
}
