'use client'

import Link from 'next/link'
import { useActionState, useState, type ReactNode } from 'react'
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
 * ## Почему в углу шапки, а не полосой под ней
 *
 * Первая редакция ставила полосу отдельным ярусом между шапкой и меню
 * разделов. Ярус оказался дорогим: три строки на каждом открытии карточки
 * ради настройки, которую меняют раз в месяц, и лишний экран прокрутки
 * до вкладок на телефоне.
 *
 * Довод, которым ярус защищался, — «шапку видят все, и меняться
 * от смотрящего она не должна» — оказался слабее, чем звучал: в шапке
 * уже есть содержимое только для владельца, счётчик просмотров карточки.
 * Правило было не про то, что в шапке ничего своего быть не может,
 * а про то, что её каркас не должен разъезжаться.
 *
 * Поэтому управление свёрнуто в один вход в правом верхнем углу — там,
 * где уже стоят дата обновления, счётчик и знак достоверности, — а панель
 * раскрывается поверх содержимого и ничего не сдвигает.
 *
 * ## Почему с подписью, а не иконкой
 *
 * Иконки просились: угол тесный, а шестерёнка и коробка занимают вдвое
 * меньше. Но «убрать из книги» коробкой читается как «удалить», а архив
 * обратим тридцать дней; «видимость» глазом — как «предпросмотр».
 * В системе, где неверное нажатие убирает запись из книги, цена догадки
 * выше сэкономленных пикселей. Иконка здесь одна и она при слове,
 * а не вместо него.
 *
 * ## Почему архив всё-таки здесь
 *
 * Первая редакция оставила его внизу вкладки с доводом «необратимое —
 * за дверью». Довод был неверен по факту: архив обратим все тридцать
 * дней, и в самом блоке об этом написано — кнопка там нарочно не красная,
 * потому что красный в книге означает необратимое. Необратимым архив
 * становится по истечении срока, а не в момент нажатия.
 *
 * А раз так, разносить две настройки записи по разным местам не за что.
 * Оставленный внизу вкладки архив воспроизводил ровно ту беду, ради
 * которой полоса и заводилась: настройка записи там, где написано «данные
 * животного», и исчезает при переключении вкладки.
 *
 * Расстояние всё же сохранено, но не местом, а количеством шагов: полоса
 * свёрнута, у архива своя створка, и внутри требуется причина. Три
 * действия до отправки в архив — этого хватает, чтобы не промахнуться
 * рукой.
 */

export function RecordBar({
  animalId,
  publicVisible,
  publicDetails,
  archived,
  archive,
  onDark,
}: {
  animalId: number
  publicVisible: boolean
  publicDetails: boolean
  /** Запись уже в архиве: тогда створка предлагает вернуть, а не убрать. */
  archived?: boolean
  /** Блок архива приходит готовым: он серверный по данным, клиентский по форме. */
  archive?: ReactNode
  /** Шапка бывает на тёмной подложке — у чужого закрытого животного. */
  onDark?: boolean
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setAnimalVisibilityAction,
    {},
  )
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      {/*
         Состояние — словами и в шапке: владелец должен видеть, открыта
         запись или нет, ещё до того, как что-то нажмёт. Иконка этого
         сказать не может.
      */}
      <p className={`text-[13px] leading-snug ${onDark ? 'text-white/70' : 'text-ink-500'}`}>
        Ваша запись:{' '}
        <span className={onDark ? 'text-white' : 'text-ink-900'}>
          {archived ? 'в архиве' : publicityLabel(publicVisible, publicDetails).toLowerCase()}
        </span>
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
          onDark
            ? 'bg-white/15 text-white hover:bg-white/25'
            : 'bg-[#eeeeee] text-ink-700 hover:bg-[#e4e4e4]'
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Управление записью
      </button>

      {/*
         Панель поверх содержимого, а не ярусом в потоке: ярус стоил бы
         трёх строк на каждом открытии карточки ради настройки, которую
         меняют раз в месяц.
      */}
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(34rem,calc(100vw-2rem))] rounded-xl bg-white p-5 text-left shadow-[0_8px_28px_rgb(23_24_26_/_0.16)]">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="panel-heading !mb-0">Управление записью</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[13px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
            >
              закрыть
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            <p className="mb-3 text-[12px] uppercase tracking-[0.09em] text-ink-500">
              Видимость в книге
            </p>
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

            {/*
               Архив — отдельным разделом за чертой, а не соседним
               переключателем: у видимости и у архива разная цена ошибки.
            */}
            {archive && (
              <div className="mt-6 border-t border-ink-100 pt-5">
                <p className="mb-3 text-[12px] uppercase tracking-[0.09em] text-ink-500">
                  {archived ? 'Возврат из архива' : 'Убрать запись из книги'}
                </p>
                {archive}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
