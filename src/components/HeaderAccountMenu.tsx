'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ACCOUNT_TABS } from './AccountNav'

/**
 * Меню кабинета в шапке — раскрывается при наведении на имя пользователя.
 *
 * Список рисуется порталом в <body> с координатами от блока имени: внутри
 * потока он оказывался под содержимым страницы, и подбирать z-index здесь
 * бесполезно — на соседнем экране всё повторилось бы.
 *
 * Пока меню раскрыто, сам блок имени тоже становится зелёным и смыкается
 * с выпадающим списком в одну плашку: так видно, что это одно целое,
 * а не две случайно наложившиеся поверхности. Подписи разделов в шапке
 * не показываются — здесь важна краткость, развёрнутый вид остаётся
 * в основном меню кабинета.
 */
/** Минимальная ширина списка — по самой длинной подписи раздела. */
const MIN_WIDTH = 232

/** Отступ от края экрана, чтобы список не прилипал к нему на телефоне. */
const SCREEN_GAP = 8

export function HeaderAccountMenu({
  displayName,
  orgName,
  active,
  unread = 0,
}: {
  displayName: string
  orgName: string | null
  active?: string
  unread?: number
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; right: number; width: number } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const place = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    /*
     * На широком экране список повторяет ширину блока имени: любое расхождение
     * даёт ступеньку на стыке, и силуэт перестаёт читаться как одна плашка.
     *
     * На телефоне имя и организация скрыты, от блока остаётся один кружок
     * с аватаром — сорок с небольшим пикселей. Список такой ширины обрезал
     * подписи по буквам: «Мои живот…», «Настр…». Поэтому ширина не меньше
     * MIN_WIDTH и не шире экрана: смыкание в одну плашку — приём для
     * просторного экрана, читаемость важнее.
     */
    const width = Math.min(Math.max(r.width, MIN_WIDTH), window.innerWidth - 2 * SCREEN_GAP)
    const right = Math.min(Math.max(window.innerWidth - r.right, SCREEN_GAP), window.innerWidth - width - SCREEN_GAP)
    setRect({ top: r.bottom - 1, right, width })
  }, [])

  // Небольшая задержка на закрытие: иначе меню исчезает, пока курсор
  // переходит с имени на список
  const show = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    place()
    setOpen(true)
  }, [place])

  const hide = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 160)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  const isProfile = active === '/account/profile'

  return (
    <div ref={anchorRef} className="sm:min-w-[210px]" onMouseEnter={show} onMouseLeave={hide}>
      <Link
        href="/account/profile"
        aria-expanded={open}
        aria-haspopup="true"
        onFocus={show}
        /*
           Скругление сверху только в раскрытом состоянии: в шапке блок
           выглядит как обычная кнопка, а при открытии смыкается со списком
           в одну плашку. В закрытом виде — лёгкая подсветка фона при наведении.
        */
        className={`flex items-center gap-2.5 px-3 py-2 transition-[background-color,color,box-shadow] duration-150 ${
          open
            ? 'rounded-t-2xl bg-forest-500 text-white shadow-[0_8px_24px_rgb(23_24_26_/_0.12)]'
            : `rounded-xl ${isProfile ? 'text-forest-500' : 'text-ink-900'} hover:bg-ink-50`
        }`}
      >
        <span
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors duration-150 ${
            open ? 'bg-white text-forest-500' : 'bg-ink-900 text-white'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="6.5" r="3.5" fill="currentColor" />
            <path d="M3.5 17c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" fill="currentColor" />
          </svg>
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[15px]">{displayName}</span>
          {orgName && (
            <span className={`block text-[12px] ${open ? 'text-white/75' : 'text-ink-500'}`}>
              {orgName}
            </span>
          )}
        </span>
      </Link>

      {open &&
        rect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listRef}
            onMouseEnter={show}
            onMouseLeave={hide}
            style={{ top: rect.top, right: rect.right, width: rect.width }}
            /*
               Правый верхний угол всегда прямой: этой стороной список
               примыкает к блоку с аватаром, и любое скругление там читается
               как щель между двумя разными плашками.
               Левый верхний скругляется только на телефоне — там список шире
               блока и торчит влево; на широком экране ширины совпадают,
               и оба верхних угла должны быть прямыми.
            */
            className="account-menu fixed z-[100] overflow-hidden rounded-b-2xl rounded-tl-2xl bg-forest-500 pb-1.5 shadow-[0_16px_40px_rgb(23_24_26_/_0.22)] sm:rounded-tl-none"
          >
            <ul>
              {ACCOUNT_TABS.map((t) => (
                <li key={t.key}>
                  <Link
                    href={`/account?tab=${t.key}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-[15px] text-white/95 transition-colors hover:bg-white/10 active:bg-white/15"
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Уведомления и профиль — не разделы кабинета, а личные страницы
                пользователя, поэтому стоят за чертой */}
            <div className="mt-1 border-t border-white/15 pt-1">
              <Link
                href="/account/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px] text-white/80 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15"
              >
                Уведомления
                {unread > 0 && (
                  <span className="min-w-[18px] rounded-full bg-white px-1 text-center text-[11px] font-medium leading-[18px] text-forest-500">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>

              <Link
                href="/account/profile"
                onClick={() => setOpen(false)}
                className="block px-4 py-2.5 text-[14px] text-white/80 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15"
              >
                Профиль пользователя
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
