import Link from 'next/link'

/**
 * Навигация личного кабинета.
 *
 * Это второй уровень навигации, и он намеренно не похож на первый: меню сайта
 * в шапке — простые текстовые ссылки, здесь — вертикальный список плашек.
 * Раньше оба уровня выглядели одинаковыми рядами кнопок, из-за чего читались
 * как одно меню, хотя между собой никак не связаны.
 *
 * Ряд стоит горизонтально под шапкой: вертикальная колонка отнимала ширину
 * у основного содержимого, а таблицам ширина нужнее. Меню видно на всех
 * страницах кабинета и в карточке своего животного, поэтому из карточки
 * всегда понятно, в каком разделе вы находитесь.
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
    <nav aria-label="Разделы личного кабинета" className="mb-8">
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {ACCOUNT_TABS.map((t) => {
          const isActive = active === t.key
          return (
            <li key={t.key} className="flex-none">
              <Link
                href={`/account?tab=${t.key}`}
                aria-current={isActive ? 'page' : undefined}
                className={`block rounded-xl px-5 py-3 transition-colors ${
                  isActive
                    ? 'bg-forest-500 text-white'
                    : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                }`}
              >
                <span className="block whitespace-nowrap text-[15px] font-medium">{t.label}</span>
                <span
                  className={`mt-0.5 block whitespace-nowrap text-[12px] leading-snug ${
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
