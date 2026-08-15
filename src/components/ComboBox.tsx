'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Выпадающий список с поиском по строке.
 *
 * Обычный список годится, пока вариантов десяток. Хозяйств и стад могут быть
 * сотни, и тогда прокрутка перестаёт работать как способ выбора — нужен ввод.
 * Поэтому здесь поле ввода фильтрует варианты по подстроке, а выбранное
 * значение уходит в форму скрытым input, как и у обычного `Select`.
 *
 * Сам список рисуется порталом в <body> с координатами от поля. Внутри потока
 * он уходил под таблицу: у заголовков таблицы `position: sticky`, и они
 * перекрывали выпадающий список. Портал снимает вопрос порядка наложения
 * целиком, а не подбором z-index.
 */

export type Option = { value: string; label: string }

export function ComboBox({
  name,
  options,
  defaultValue = '',
  placeholder = 'Любое',
  ariaLabel,
  className = '',
}: {
  name: string
  options: Option[]
  defaultValue?: string
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const selected = options.find((o) => o.value === defaultValue) ?? null

  const [value, setValue] = useState(defaultValue)
  const [query, setQuery] = useState(selected?.label ?? '')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)

  const boxRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const listId = useId()

  const place = useCallback(() => {
    const el = fieldRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = q && q !== selected?.label.toLowerCase() ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
    return source.slice(0, 50)
  }, [query, options, selected])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (boxRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (!open) return
    place()
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  const choose = (o: Option | null) => {
    setValue(o?.value ?? '')
    setQuery(o?.label ?? '')
    setOpen(false)
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {value && <input type="hidden" name={name} value={value} />}

      <input
        ref={fieldRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        className="field"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setValue('')
          place()
          setOpen(true)
          setCursor(0)
        }}
        onFocus={() => {
          place()
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setCursor((c) => Math.min(c + 1, filtered.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter' && open) {
            e.preventDefault()
            choose(filtered[cursor] ?? null)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />

      {query && (
        <button
          type="button"
          aria-label="Очистить"
          onClick={() => choose(null)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 transition-colors hover:text-ink-900"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {open &&
        rect &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ top: rect.top, left: rect.left, width: rect.width }}
            className="fixed z-[90] max-h-[260px] overflow-auto rounded-xl bg-white py-1.5 shadow-[0_12px_32px_rgb(23_24_26_/_0.18)]"
          >
            {filtered.length === 0 && (
              <li className="px-4 py-2.5 text-[14px] text-ink-500">Ничего не найдено</li>
            )}
            {filtered.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(o)}
                  className={`block w-full px-4 py-2.5 text-left text-[14px] transition-colors ${
                    i === cursor ? 'bg-brand-50 text-forest-600' : 'text-ink-900 hover:bg-[#f4f4f4]'
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}

    </div>
  )
}
