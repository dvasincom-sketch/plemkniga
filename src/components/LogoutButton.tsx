'use client'

import { logoutAction } from '@/actions/auth'

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex items-center gap-2 text-ink-900 transition-colors hover:text-forest-500"
        aria-label="Выйти"
        title="Выйти"
      >
        {!compact && <span className="text-[15px]">Выйти</span>}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M12.5 6V4.2c0-.9-.7-1.7-1.7-1.7H4.2c-.9 0-1.7.8-1.7 1.7v11.6c0 .9.8 1.7 1.7 1.7h6.6c1 0 1.7-.8 1.7-1.7V14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M7.5 10h10m0 0-3-3m3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  )
}
