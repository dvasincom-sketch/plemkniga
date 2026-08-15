import Link from 'next/link'

/**
 * Навигация личного кабинета.
 *
 * Это второй уровень навигации, и он намеренно не похож на первый: меню сайта
 * в шапке — простые текстовые ссылки, здесь — вертикальный список плашек.
 * Раньше оба уровня выглядели одинаковыми рядами кнопок, из-за чего читались
 * как одно меню, хотя между собой никак не связаны.
 *
 * Список виден на всех страницах кабинета и в карточке своего животного,
 * поэтому из карточки всегда понятно, в каком разделе вы находитесь.
 */

export const ACCOUNT_TABS = [
  { key: 'animals', label: 'Мои животные', hint: 'Стадо и поиск по нему' },
  { key: 'events', label: 'События', hint: 'Загрузки данных и их проверка' },
  { key: 'documents', label: 'Документы', hint: 'Файлы организации' },
  { key: 'settings', label: 'Настройки', hint: 'Личные данные и видимость' },
] as const

export type AccountTabKey = (typeof ACCOUNT_TABS)[number]['key']

export function AccountNav({ active }: { active?: AccountTabKey }) {
  return (
    <nav aria-label="Разделы личного кабинета" className="lg:sticky lg:top-6">
      <p className="mb-3 px-1 text-[12px] uppercase tracking-[0.09em] text-ink-500">
        Личный кабинет
      </p>

      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {ACCOUNT_TABS.map((t) => {
          const isActive = active === t.key
          return (
            <li key={t.key} className="flex-none lg:flex-auto">
              <Link
                href={`/account?tab=${t.key}`}
                aria-current={isActive ? 'page' : undefined}
                className={`block rounded-xl px-4 py-3 transition-colors ${
                  isActive
                    ? 'bg-forest-500 text-white'
                    : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                }`}
              >
                <span className="block whitespace-nowrap text-[15px] font-medium">{t.label}</span>
                <span
                  className={`mt-0.5 hidden text-[12px] leading-snug lg:block ${
                    isActive ? 'text-white/75' : 'text-ink-500'
                  }`}
                >
                  {t.hint}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
