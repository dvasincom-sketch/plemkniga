'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Поле даты в фирменном стиле вместо нативного `<input type="date">`.
 *
 * Нативное поле каждая система рисует по-своему: на macOS это три сегмента
 * с системным календарём, на Windows другой календарь, на телефоне колесо
 * во весь экран. Рядом с нашими полями и списками оно читается как чужое —
 * и это заметно даже тому, кто не думает про интерфейсы.
 *
 * ## Что здесь важнее вида
 *
 * **Ввод с клавиатуры остаётся главным способом.** Дату рождения животного
 * переписывают со свидетельства, а не выбирают в календаре: пролистать
 * мышью до 2019 года — двадцать нажатий. Поэтому поле обычное текстовое,
 * принимает `17.08.2026`, `17/08/2026` и `17082026`, само расставляя точки.
 * Календарь — второй способ, для «позавчера» и «в конце месяца».
 *
 * **В форму уходит ISO.** Видимое значение русское, скрытый input отдаёт
 * `2026-08-17` — ровно то, что отдавало нативное поле. Ни одно действие
 * на сервере от замены не меняется.
 *
 * **Неполный ввод не отправляется.** Пока дата не разобрана целиком,
 * скрытого поля нет вовсе: «17.08.20» — это незаконченный ввод, а не
 * двадцатый год. Отправлять его значит записать в карточку то, чего человек
 * не писал.
 *
 * Список рисуется порталом в `<body>`: у ячеек таблиц и у карточек свой
 * контекст наложения, и всплывающий календарь внутри потока обрезается.
 * Тот же приём, что у `ComboBox`.
 */

const MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** ISO (`2026-08-17`) → русское (`17.08.2026`). */
const toRu = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/**
 * Русское → ISO. Возвращает пустую строку, пока дата не разобрана целиком
 * или не существует: 31 февраля здесь не дата, а опечатка.
 */
const toIso = (ru: string): string => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(ru.trim())
  if (!m) return ''
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  if (
    d.getFullYear() !== Number(yyyy) ||
    d.getMonth() !== Number(mm) - 1 ||
    d.getDate() !== Number(dd)
  ) {
    return ''
  }
  return `${yyyy}-${mm}-${dd}`
}

/** Точки расставляются сами: человек набирает цифры, а не разделители. */
const mask = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean)
  return parts.join('.')
}

/** Понедельник — первый: у нас неделя начинается с него, а у `getDay()` нет. */
const firstWeekday = (year: number, month: number): number => (new Date(year, month, 1).getDay() + 6) % 7

const daysIn = (year: number, month: number): number => new Date(year, month + 1, 0).getDate()

export function DateField({
  name,
  defaultValue = '',
  placeholder = 'дд.мм.гггг',
  required = false,
  ariaLabel,
  className = '',
  max,
}: {
  name: string
  /** ISO, как у нативного поля. */
  defaultValue?: string
  placeholder?: string
  required?: boolean
  ariaLabel?: string
  className?: string
  /** ISO-предел сверху: у даты рождения будущего быть не может. */
  max?: string
}) {
  const [text, setText] = useState(() => toRu(defaultValue))
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null)

  const iso = toIso(text)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridId = useId()

  /** Какой месяц показывает календарь: разобранная дата, иначе текущий. */
  const [cursor, setCursor] = useState(() => {
    const start = toIso(toRu(defaultValue)) || defaultValue
    const d = start ? new Date(start) : new Date()
    return Number.isNaN(d.getTime())
      ? { year: new Date().getFullYear(), month: new Date().getMonth() }
      : { year: d.getFullYear(), month: d.getMonth() }
  })

  useEffect(() => {
    if (!open) return

    const place = () => {
      const r = rootRef.current?.getBoundingClientRect()
      if (r) setBox({ top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX, width: r.width })
    }
    place()

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !document.getElementById(gridId)?.contains(t)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, gridId])

  const cells = useMemo(() => {
    const lead = firstWeekday(cursor.year, cursor.month)
    const total = daysIn(cursor.year, cursor.month)
    const out: (number | null)[] = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= total; d++) out.push(d)
    return out
  }, [cursor])

  const choose = (day: number) => {
    const dd = String(day).padStart(2, '0')
    const mm = String(cursor.month + 1).padStart(2, '0')
    setText(`${dd}.${mm}.${cursor.year}`)
    setOpen(false)
    inputRef.current?.focus()
  }

  const shift = (by: number) => {
    const m = cursor.month + by
    setCursor({ year: cursor.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 })
  }

  const beyondMax = Boolean(max && iso && iso > max)
  const incomplete = text.length > 0 && !iso

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* В форму уходит только разобранная дата: незаконченный ввод — не дата */}
      {iso && !beyondMax && <input type="hidden" name={name} value={iso} />}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(mask(e.target.value))}
          onFocus={() => {
            if (iso) {
              const d = new Date(iso)
              setCursor({ year: d.getFullYear(), month: d.getMonth() })
            }
          }}
          className="field field-on-light flex-1"
        />

        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Открыть календарь"
          onClick={() => setOpen((v) => !v)}
          className="flex-none rounded-lg bg-white px-3 py-2.5 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {incomplete && (
        <p className="mt-1 text-[12px] text-ink-500">Дата вводится как 17.08.2026</p>
      )}
      {beyondMax && (
        <p className="mt-1 text-[12px] text-[#c0392b]">Дата не может быть в будущем</p>
      )}

      {open &&
        box &&
        createPortal(
          <div
            id={gridId}
            role="dialog"
            aria-label="Календарь"
            style={{ top: box.top, left: box.left, minWidth: Math.max(box.width, 268) }}
            className="absolute z-50 rounded-xl bg-white p-3 shadow-[0_8px_28px_rgb(23_24_26_/_0.16)]"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shift(-1)}
                aria-label="Предыдущий месяц"
                className="rounded-md px-2 py-1 text-ink-700 transition-colors hover:bg-[#f6f6f6]"
              >
                ←
              </button>

              <span className="text-[14px] font-medium">
                {MONTHS[cursor.month]} {cursor.year}
              </span>

              <button
                type="button"
                onClick={() => shift(1)}
                aria-label="Следующий месяц"
                className="rounded-md px-2 py-1 text-ink-700 transition-colors hover:bg-[#f6f6f6]"
              >
                →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((w) => (
                <span key={w} className="py-1 text-[11px] text-ink-500">
                  {w}
                </span>
              ))}

              {cells.map((day, i) => {
                if (day === null) return <span key={`x${i}`} />
                const dd = String(day).padStart(2, '0')
                const mm = String(cursor.month + 1).padStart(2, '0')
                const value = `${cursor.year}-${mm}-${dd}`
                const selected = value === iso
                const disabled = Boolean(max && value > max)

                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    onClick={() => choose(day)}
                    className={`rounded-md py-1.5 text-[13px] tabular-nums transition-colors ${
                      selected
                        ? 'bg-forest-500 text-white'
                        : disabled
                          ? 'text-ink-300'
                          : 'hover:bg-[#f6f6f6]'
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setText('')
                setOpen(false)
              }}
              className="mt-2 w-full rounded-md py-1.5 text-[13px] text-ink-500 transition-colors hover:bg-[#f6f6f6]"
            >
              Очистить
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
