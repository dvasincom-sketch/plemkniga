'use client'

import { useEffect, useId, useRef, useState } from 'react'

export type SelectOption = { value: string; label: string }

/**
 * Выпадающий список в фирменном стиле вместо нативного <select>.
 *
 * Значение уходит в форму через скрытый input, поэтому компонент одинаково
 * работает и в GET-формах поиска, и в server actions.
 * Доступность: роль listbox, управление с клавиатуры, поиск по первым буквам.
 */
export function Select({
  name,
  options,
  defaultValue = '',
  placeholder = 'Выберите значение',
  onLight = false,
  className = '',
  ariaLabel,
  onChange,
}: {
  name: string
  options: SelectOption[]
  defaultValue?: string
  placeholder?: string
  /** Светлый фон вокруг — рисуем рамку. */
  onLight?: boolean
  className?: string
  ariaLabel?: string
  onChange?: (value: string) => void
}) {
  const all = placeholder ? [{ value: '', label: placeholder }, ...options] : options

  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => Math.max(0, all.findIndex((o) => o.value === defaultValue)))

  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typed = useRef({ query: '', at: 0 })
  const listId = useId()

  const selected = all.find((o) => o.value === value)
  const isPlaceholder = !value

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({
      block: 'nearest',
    })
  }, [open, active])

  const choose = (i: number) => {
    const opt = all[i]
    if (!opt) return
    setValue(opt.value)
    setActive(i)
    setOpen(false)
    onChange?.(opt.value)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'Tab') {
      setOpen(false)
      return
    }

    if (!open && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(all.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(all.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key.length === 1) {
      // Поиск по первым буквам
      const now = Date.now()
      typed.current.query = now - typed.current.at > 800 ? e.key : typed.current.query + e.key
      typed.current.at = now
      const q = typed.current.query.toLowerCase()
      const i = all.findIndex((o) => o.label.toLowerCase().startsWith(q))
      if (i >= 0) setActive(i)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Пустое значение не отправляем — URL поиска остаётся чистым */}
      {value !== '' && <input type="hidden" name={name} value={value} />}

      <button
        type="button"
        className={`select-trigger ${onLight ? 'on-light' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span className={`truncate ${isPlaceholder ? 'text-ink-300' : 'text-ink-900'}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`flex-none transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline
            points="6 9 12 15 18 9"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="select-menu"
        >
          {all.map((o, i) => (
            <div
              key={o.value || `__empty-${i}`}
              role="option"
              aria-selected={o.value === value}
              data-active={i === active}
              data-selected={o.value === value}
              className="select-option"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span className={o.value === '' ? 'opacity-70' : ''}>{o.label}</span>
              {o.value === value && (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="m4 10.5 4 4 8-9"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
