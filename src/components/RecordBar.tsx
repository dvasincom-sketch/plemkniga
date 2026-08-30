'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { setAnimalVisibilityAction, type FormState } from '@/actions/account'
import { publicityLabel } from '@/lib/visibility'

/**
 * Полоса владельца: что я могу сделать с этой записью.
 *
 * ## Зачем отдельный ярус
 *
 * Настройки публичности лежали внизу вкладки «Общие данные», и это было
 * неверно дважды.
 *
 * Во-первых, по существу: «Общие данные» — вкладка фактов о животном,
 * а публичность не свойство животного, а решение о записи. Животное
 * не бывает публичным; публичной бывает карточка. Человек искал настройку
 * записи там, где написано «данные животного».
 *
 * Во-вторых, по месту: внизу самой длинной вкладки. Настройка, до которой
 * надо доскроллить, — настройка, о существовании которой не знают; в этом
 * проекте так уже прятались отчёты по стаду и разбор своих данных.
 *
 * Третье вылезло попутно: блок показывался только при открытой вкладке
 * «Общие данные». Владелец переключался на «Оценку» — и настройки
 * исчезали, хотя относятся ко всей карточке.
 *
 * ## Почему не в шапку
 *
 * Соблазн был перенести переключатели в шапку, к кличке и номеру. Шапку
 * видят все: чужой, Ассоциация, владелец. Меняй она форму в зависимости
 * от смотрящего — и два человека не смогут говорить об одном экране:
 * «у меня там переключатель» — «а у меня нет». Поэтому шапка и меню
 * разделов остаются одинаковыми для всех, а меняется ровно одна полоса
 * между ними.
 *
 * В шапке при этом стоит **состояние** — знаком того же ряда, что
 * «Верифицировано ассоциацией». Знак там уже был, но только для чужого
 * («Доступ закрыт владельцем»); теперь то же состояние названо и своему.
 * Состояние — знаком, управление — полосой.
 *
 * ## Почему свёрнута
 *
 * Публичность меняют редко, а карточку открывают каждый день. Развёрнутая
 * форма стоила бы ярусом до меню разделов на каждом открытии — на телефоне
 * это лишний экран прокрутки до вкладок. Свёрнутая полоса — одна строка,
 * в которой уже написано главное: в каком состоянии запись.
 *
 * ## Чего здесь нет
 *
 * Архива. Убрать запись из книги — необратимо: карточка исчезает отовсюду.
 * Такому не место в сантиметре от переключателя, который нажимают часто, —
 * рука промахивается. Частое на виду, необратимое за дверью; архив остался
 * последним блоком вкладки.
 */

export function RecordBar({
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
    <section className="mt-6 rounded-xl bg-white px-5 py-4 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px]">
          <span className="text-[12px] uppercase tracking-[0.09em] text-ink-500">Ваша запись</span>
          <span className="font-medium">
            {publicityLabel(publicVisible, publicDetails)}
          </span>
          <span className="flex items-center gap-1.5 text-ink-500 underline underline-offset-4 group-open:text-forest-600">
            настроить видимость
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="transition-transform group-open:rotate-180"
            >
              <polyline
                points="6 9 12 15 18 9"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </summary>

        <form action={formAction} className="mt-4 border-t border-ink-100 pt-4">
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
      </details>
    </section>
  )
}
