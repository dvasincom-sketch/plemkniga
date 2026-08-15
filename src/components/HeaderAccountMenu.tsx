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
export function HeaderAccountMenu({
  displayName,
  orgName,
  active,
}: {
  displayName: string
  orgName: string | null
  active?: string
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
    // Ширина списка в точности равна ширине блока имени: любое расхождение
    // даёт ступеньку на стыке, и силуэт перестаёт читаться как одна плашка.
    // Минимальную ширину задаёт сам блок имени, а не список.
    setRect({ top: r.bottom, right: window.innerWidth - r.right, width: r.width })
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
           Скругление задано всегда, а не только в раскрытом состоянии:
           иначе при появлении фона углы успевали мигнуть прямыми — фон
           анимируется, радиус нет.

           Собственной подсветки при наведении у ссылки нет намеренно:
           наведение и так раскрывает меню и красит блок в зелёный.
           Две реакции на одно движение читались как два разных элемента.
        */
        className={`flex items-center gap-2.5 rounded-t-2xl px-3 py-2 transition-colors duration-150 ${
          open
            ? 'bg-forest-500 text-white'
            : isProfile
              ? 'text-forest-500'
              : 'text-ink-900'
        }`}
      >
        <span
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
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
            className="account-menu fixed z-[100] overflow-hidden rounded-b-2xl bg-forest-500 pb-1.5 shadow-[0_16px_40px_rgb(23_24_26_/_0.22)]"
          >
            <ul className="border-t border-white/15">
              {ACCOUNT_TABS.map((t) => (
                <li key={t.key}>
                  <Link
                    href={`/account?tab=${t.key}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-[15px] text-white transition-colors hover:bg-brand-500"
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/account/profile"
              onClick={() => setOpen(false)}
              className="mt-1.5 block border-t border-white/20 px-4 py-2.5 text-[14px] text-white/85 transition-colors hover:bg-brand-500 hover:text-white"
            >
              Профиль пользователя
            </Link>
          </div>,
          document.body,
        )}
    </div>
  )
}
