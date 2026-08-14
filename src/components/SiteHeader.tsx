import Link from 'next/link'
import { Logo } from './Logo'
import { getCurrentUser } from '@/lib/payload'
import { LogoutButton } from './LogoutButton'

const LockIcon = () => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true">
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

type NavItem = { href: string; label: string; locked?: boolean }

export async function SiteHeader({ active }: { active?: string }) {
  const user = await getCurrentUser()

  const nav: NavItem[] = [
    { href: '/', label: 'Племенная книга' },
    { href: '/analytics', label: 'Аналитика', locked: !user },
    { href: '/auctions', label: 'Аукционы', locked: !user },
  ]

  return (
    <header className="bg-canvas">
      <div className="container-page flex h-[74px] items-center justify-between gap-6">
        <Logo />

        <nav className="hidden items-center gap-10 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.locked ? '/login' : item.href}
              className={`flex items-center gap-1.5 text-[15px] transition-colors hover:text-forest-500 ${
                active === item.href ? 'text-forest-500' : 'text-ink-900'
              }`}
            >
              {item.label}
              {item.locked && (
                <span className="text-ink-900">
                  <LockIcon />
                </span>
              )}
            </Link>
          ))}
        </nav>

        {user ? (
          <div className="flex items-center gap-4">
            <span className="relative text-ink-900" aria-hidden="true">
              <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
                <path
                  d="M9 1.5a5.5 5.5 0 0 0-5.5 5.5v3.2L2 13.5h14l-1.5-3.3V7A5.5 5.5 0 0 0 9 1.5Z"
                  fill="#E74C3C"
                />
                <path d="M7 16a2 2 0 0 0 4 0" stroke="#E74C3C" strokeWidth="1.5" fill="none" />
              </svg>
            </span>
            <Link href="/account" className="text-[15px] hover:text-forest-500">
              Личный кабинет
            </Link>
            <LogoutButton compact />
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[15px]">
            <Link href="/login" className="flex items-center gap-2 hover:text-forest-500">
              <svg width="16" height="14" viewBox="0 0 16 14" fill="none" aria-hidden="true">
                <path
                  d="M1 7h12m0 0-4-4m4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Войти
            </Link>
            <span className="text-ink-300">|</span>
            <Link href="/register" className="hover:text-forest-500">
              Регистрация
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
