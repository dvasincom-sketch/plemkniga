'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Подсказка «i»: раскрывается по наведению и по фокусу с клавиатуры.
 *
 * Всплывающее окно рисуется порталом в <body> с координатами, посчитанными
 * от кнопки. Так подсказка не обрезается ни родительским overflow, ни правым
 * краем экрана: положение зажимается в границы окна.
 */

const WIDTH = 340
const MARGIN = 12
const GAP = 10

type Pos = { top: number; left: number; placement: 'below' | 'above' }

export function InfoTip({
  children,
  label = 'Подсказка',
  trigger,
}: {
  children: React.ReactNode
  label?: string
  /**
   * Чем открывать подсказку, если кружок «i» не подходит.
   *
   * Понадобилось для посчитанных книгой чисел: у них подсказка про формулу
   * висит на самом числе, подчёркнутом пунктиром, а не на значке рядом.
   * Значок рядом с каждым таким числом превратил бы карточку в россыпь
   * кружков — их на одном экране больше десятка, — и главное, разорвал бы
   * связь: кружок объясняет «что-то поблизости», подчёркивание объясняет
   * именно это число.
   *
   * Реализация одна на оба случая намеренно. Всплывающее окно — портал
   * с пересчётом координат, обработкой краёв экрана, клавиатуры и прокрутки;
   * второй такой же рядом разошёлся бы с первым в первую же правку.
   */
  trigger?: React.ReactNode
}) {
  const [pos, setPos] = useState<Pos | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  const place = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()

    // По горизонтали центрируем по кнопке и зажимаем в окно
    const maxLeft = window.innerWidth - WIDTH - MARGIN
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - WIDTH / 2, maxLeft))

    // Снизу, если внизу есть место; иначе сверху
    const spaceBelow = window.innerHeight - r.bottom
    const placement: Pos['placement'] = spaceBelow > 260 ? 'below' : 'above'
    const top = placement === 'below' ? r.bottom + GAP : r.top - GAP

    setPos({ top, left, placement })
  }, [])

  const open = useCallback(() => place(), [place])
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
      <button
        ref={anchorRef}
        type="button"
        aria-label={label}
        aria-expanded={pos !== null}
        aria-describedby={pos ? id : undefined}
        className={
          trigger
            ? 'cursor-help border-b border-dashed border-ink-300 leading-none decoration-dotted transition-colors hover:border-forest-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-100'
            : 'inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-ink-900 text-[11px] font-bold leading-none text-white transition-colors hover:bg-forest-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-100'
        }
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={() => (pos ? close() : open())}
      >
        {trigger ?? 'i'}
      </button>

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
              transform: pos.placement === 'above' ? 'translateY(-100%)' : undefined,
            }}
            className="pointer-events-none fixed z-[100] rounded-xl bg-white p-4 text-left text-[13px] font-normal leading-relaxed text-ink-700 shadow-[0_12px_32px_rgb(23_24_26_/_0.18)]"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}
