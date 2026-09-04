'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'

/**
 * Разделы шапки: строкой на широком экране, под кнопкой на телефоне.
 *
 * ## Почему кнопка, а не перенос строки
 *
 * Раньше меню и переключатель языка просто переносились на вторую
 * строку. На телефоне это давало шапку в две-три строки — треть первого
 * экрана уходила на навигацию, которой на первом экране никто
 * не пользуется. Кнопка возвращает эту треть содержимому, а разделы
 * никуда не деваются: они за одним нажатием.
 *
 * ## Почему панель, а не выпадающий список
 *
 * Списком браузер рисует меню поверх страницы и норовит закрыть его
 * при прокрутке. Панель — часть шапки: она раздвигает её вниз, страница
 * уезжает следом, и ничего не перекрывается. На узком экране это
 * привычнее и предсказуемее.
 *
 * ## Что здесь важно не потерять
 *
 * Закрытие по Esc и по нажатию мимо, возврат внимания на кнопку,
 * `aria-expanded` и `aria-controls`. Это те мелочи, которые
 * у самодельного меню теряют первыми, а замечают последними.
 */
export function HeaderMenu({
  links,
  label,
  children,
}: {
  links: { href: string; label: string }[]
  /** Подпись кнопки для программы чтения с экрана: «Разделы продукта». */
  label: string
  /** Переключатель языка — приходит готовым, чтобы не знать о нём ничего. */
  children?: React.ReactNode
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }

    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const items = (
    <>
      {links.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          onClick={() => setOpen(false)}
          className="text-white/70 transition-colors hover:text-white"
        >
          {m.label}
        </Link>
      ))}
    </>
  )

  return (
    <div ref={boxRef} className="flex items-center">
      {/* ------------------------- Широкий экран ------------------------- */}
      <div className="hidden items-center gap-x-6 gap-y-3 md:flex">
        <nav aria-label={label} className="flex items-center gap-x-6 text-[15px]">
          {items}
        </nav>

        {/*
           Место переключателя занято всегда, даже когда его нет.

           У разборов языка нет — раздел русский, — и меню без этой
           распорки прыгало вправо на треть шапки при переходе с любой
           другой страницы. Шапка обязана стоять на месте: она
           неподвижная часть, по которой глаз находит всё остальное.
        */}
        <div className="flex min-h-[34px] min-w-[168px] items-center justify-end">{children}</div>
      </div>

      {/* --------------------------- Телефон ----------------------------- */}
      <div className="md:hidden">
        <button
          ref={buttonRef}
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white transition-colors hover:border-white/40"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
          >
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" />
            )}
          </svg>
        </button>

        {open && (
          <div
            id={`${id}-panel`}
            className="absolute inset-x-0 z-30 mt-3 border-t border-white/10 bg-basement px-[max(1rem,calc((100vw-1200px)/2))] py-5"
          >
            <nav aria-label={label} className="flex flex-col gap-4 text-[17px]">
              {items}
            </nav>

            {children && <div className="mt-5 border-t border-white/10 pt-5">{children}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
