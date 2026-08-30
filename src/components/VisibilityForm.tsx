'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { setAnimalVisibilityAction, type FormState } from '@/actions/account'

/**
 * Форма видимости записи — без обёрток и заголовков.
 *
 * Раскрывается полноширинным блоком под шапкой, когда в адресе стоит
 * `?manage=visibility`; заголовок и рамку рисует страница. Разбор того,
 * почему настройка живёт в шапке карточки, а не в подвале вкладки, —
 * в `RecordPanel`.
 *
 * Две ступени показаны как две, а не одним переключателем «открыть»:
 * они отвечают на разные вопросы — «есть ли запись в книге» и «можно ли
 * открыть карточку», — и путать их нельзя. Вторая без первой ничего
 * не значит.
 */
export function VisibilityForm({
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
      <form action={formAction}>
        <input type="hidden" name="animal" value={animalId} />

        <p className="mb-4 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
          Настройка касается только этого животного и перекрывает то, что задано
          для стада целиком. Точечный доступ отдельным хозяйствам живёт рядом
          и от этих переключателей не зависит.
        </p>

        {/*
           Две ступени показаны как две, а не одним переключателем «открыть»:
           они отвечают на разные вопросы — «есть ли запись в книге» и «можно
           ли открыть карточку», — и путать их нельзя. Вторая без первой
           ничего не значит.
        */}
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

        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button type="submit" className="btn btn-accent" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>

          {/*
             Ссылка на общее правило обязательна.

             Публичность решается и оптом — в настройках хозяйства, — и здесь
             поштучно. Без этой ссылки владелец переключает одну запись
             и не понимает, почему у остальных ничего не изменилось: самая
             частая ошибка в парах «оптом / поштучно».
          */}
          <Link
            href="/account?tab=farm"
            className="text-[13px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
          >
            Правило для всего стада — в настройках хозяйства
          </Link>
        </div>
      </form>
  )
}
