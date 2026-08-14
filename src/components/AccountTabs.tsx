import Link from 'next/link'

export const ACCOUNT_TABS = [
  { key: 'profile', label: 'Личные данные' },
  { key: 'animals', label: 'Мои животные' },
  { key: 'events', label: 'События' },
  { key: 'documents', label: 'Документы' },
  { key: 'settings', label: 'Настройки' },
] as const

export type AccountTabKey = (typeof ACCOUNT_TABS)[number]['key']

export function AccountTabs({ active }: { active: AccountTabKey }) {
  return (
    <nav className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {ACCOUNT_TABS.map((t) => (
        <Link
          key={t.key}
          href={`/account?tab=${t.key}`}
          className={`tab ${active === t.key ? 'tab-active' : ''}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
