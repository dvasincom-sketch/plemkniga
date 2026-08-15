'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Замок закрытой записи — со всплывающей подсказкой.
 *
 * Раньше объяснение жило в атрибуте `title`: браузер показывал его через
 * секунду с лишним, серой системной плашкой и без возможности прочитать
 * с клавиатуры. Замок — единственное место, где система сообщает о чужом
 * решении, и объяснение должно появляться сразу.
 *
 * Подсказка рисуется порталом в <body>: в таблице у ячеек свой контекст
 * наложения и `overflow`, и любое всплывающее окно внутри строки обрезается.
 *
 * Сам замок — ссылка на запись: закрытая карточка не тупик, на ней можно
 * запросить доступ.
 */

const WIDTH = 300
const MARGIN = 12
const GAP = 8

type Pos = { top: number; left: number; above: boolean }

const LockGlyph = () => (
  <svg width="11" height="13" viewBox="0 0 12 14" fill="none" aria-hidden="true">
    <rect x="1" y="6" width="10" height="7" rx="1.6" fill="currentColor" />
    <path
      d="M3.2 6V4.2a2.8 2.8 0 1 1 5.6 0V6"
      stroke="currentColor"
      strokeWidth="1.4"
      fill="none"
      strokeLinecap="round"
    />
  </svg>
)

export function LockHint({ href, text }: { href: string; text: string }) {
  const [pos, setPos] = useState<Pos | null>(null)
  const anchorRef = useRef<HTMLAnchorElement>(null)
  const id = useId()

  const place = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const maxLeft = window.innerWidth - WIDTH - MARGIN
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - WIDTH / 2, maxLeft))
    const above = window.innerHeight - r.bottom < 160
    setPos({ top: above ? r.top - GAP : r.bottom + GAP, left, above })
  }, [])

  const close = useCallback(() => setPos(null), [])

  useEffect(() => {
    if (!pos) return
    const onScroll = () => place()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('keydown', onKey)
    }
  }, [pos, place, close])

  return (
    <>
      <Link
        ref={anchorRef}
        href={href}
        aria-describedby={pos ? id : undefined}
        aria-label="Доступ к данным закрыт владельцем"
        // z-10 поднимает замок над растянутой ссылкой строки: иначе
        // наведение перехватывает она и подсказка не появляется
        className="relative z-10 inline-flex text-ink-500 transition-colors hover:text-forest-500"
        onMouseEnter={place}
        onMouseLeave={close}
        onFocus={place}
        onBlur={close}
      >
        <LockGlyph />
      </Link>

      {pos !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{
              top: pos.top,
              left: pos.left,
              width: WIDTH,
              transform: pos.above ? 'translateY(-100%)' : undefined,
            }}
            className="pointer-events-none fixed z-[100] rounded-xl bg-white p-4 text-left text-[13px] font-normal leading-relaxed text-ink-700 shadow-[0_12px_32px_rgb(23_24_26_/_0.18)]"
          >
            <p className="mb-1 font-medium text-ink-900">Доступ закрыт владельцем</p>
            <p>{text}</p>
          </div>,
          document.body,
        )}
    </>
  )
}
