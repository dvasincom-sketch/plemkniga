'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ACCOUNT_TABS } from './AccountNav'

/**
 * Меню кабинета в шапке — раскрывается при наведении на имя пользователя.
 *
 * Разделы оформлены теми же зелёными плашками, что и основное меню кабинета:
 * это один и тот же список, и выглядеть он должен одинаково, где бы
 * ни показывался. Иначе пользователь считает их разными меню.
 *
 * Само имя остаётся ссылкой на профиль: наведение раскрывает список,
 * клик ведёт на страницу профиля.
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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Небольшая задержка на закрытие: иначе меню исчезает, пока курсор
  // переходит с имени на список
  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 160)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <Link
        href="/account/profile"
        aria-expanded={open}
        aria-haspopup="true"
        onFocus={show}
        className={`flex items-center gap-2.5 transition-colors hover:text-forest-500 ${
          active === '/account/profile' ? 'text-forest-500' : 'text-ink-900'
        }`}
      >
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-ink-900 text-white">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="6.5" r="3.5" fill="currentColor" />
            <path d="M3.5 17c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" fill="currentColor" />
          </svg>
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[15px]">{displayName}</span>
          {orgName && <span className="block text-[12px] text-ink-500">{orgName}</span>}
        </span>
      </Link>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[290px] rounded-2xl bg-white p-3 shadow-[0_16px_40px_rgb(23_24_26_/_0.16)]"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <ul className="space-y-2">
            {ACCOUNT_TABS.map((t) => (
              <li key={t.key}>
                <Link
                  href={`/account?tab=${t.key}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl bg-forest-500 px-4 py-2.5 text-white transition-colors hover:bg-brand-500"
                >
                  <span className="block text-[15px] font-medium">{t.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-white/75">
                    {t.hint}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/account/profile"
            onClick={() => setOpen(false)}
            className="mt-3 block rounded-xl px-4 py-2.5 text-[14px] text-ink-700 transition-colors hover:bg-[#f4f4f4] hover:text-ink-900"
          >
            Профиль пользователя
          </Link>
        </div>
      )}
    </div>
  )
}
