'use client'

import { useId, useState } from 'react'

/**
 * Подсказка «i»: раскрывается по наведению и по фокусу с клавиатуры.
 * Нативный `title` для длинных пояснений не годится — он появляется
 * с задержкой и не поддаётся оформлению.
 */
export function InfoTip({
  children,
  align = 'right',
  label = 'Подсказка',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ink-900 text-[11px] font-bold text-white transition-colors hover:bg-forest-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-100"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>

      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-[26px] z-50 w-[320px] rounded-xl bg-white p-4 text-left text-[13px] font-normal leading-relaxed text-ink-700 shadow-[0_12px_32px_rgb(23_24_26_/_0.16)] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </span>
      )}
    </span>
  )
}
