import Link from 'next/link'

/**
 * Навигация кабинета Ассоциации.
 *
 * Выглядит как навигация личного кабинета намеренно: это тот же уровень
 * и та же механика, человек не должен переучиваться. А вот разделы другие,
 * и в этом суть отдельного кабинета: у эксперта нет своего стада, у него
 * очередь чужих заявок.
 *
 * Разделы, которых ещё нет, показаны неактивными, а не спрятаны. Спрятанное
 * выглядит как «этого не будет»; тусклое — как «до этого дойдут руки»,
 * и это правда.
 */

export const ASSOCIATION_TABS = [
  { key: 'queue', href: '/association', label: 'Очередь проверки', hint: 'Пакеты, ждущие разбора' },
  { key: 'farms', href: '/association/farms', label: 'Хозяйства', hint: 'Членство и заявки' },
  {
    key: 'journal',
    href: '/association/journal',
    label: 'Журнал',
    hint: 'Что происходило в книге',
  },
  {
    key: 'directory',
    href: '/association/directory',
    label: 'Справочник',
    hint: 'Карточки, заведённые контрагентами',
  },
  {
    key: 'verifications',
    href: '/association/verifications',
    label: 'Верификации',
    hint: 'Заявки хозяйств по животным',
  },
  {
    key: 'documents',
    href: '/association/documents',
    label: 'Документы',
    hint: 'Выпуск и журнал выдачи',
  },
  {
    key: 'quality',
    href: '/association/quality',
    label: 'Качество книги',
    hint: 'Противоречия и достоверность',
  },
] as const

export type AssociationTabKey = (typeof ASSOCIATION_TABS)[number]['key']

/*
 * Пустой `href` означает «раздел ещё не сделан»: такая плашка показывается
 * неактивной, а не прячется. Сейчас пустых нет — все пять разделов работают,
 * — но ветка оставлена: следующий раздел появится сначала в этом списке,
 * а уже потом в виде страницы, и в этот промежуток он должен быть виден.
 */
type Tab = { key: AssociationTabKey; href: string; label: string; hint: string }

export function AssociationNav({ active }: { active?: AssociationTabKey }) {
  return (
    <nav aria-label="Разделы кабинета Ассоциации" className="mb-8">
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {(ASSOCIATION_TABS as readonly Tab[]).map((t) => {
          const isActive = active === t.key
          const base = 'block rounded-xl px-5 py-3 transition-colors'

          if (!t.href) {
            return (
              <li key={t.key} className="flex-none">
                <span
                  className={`${base} cursor-default bg-white/60 text-ink-500`}
                  title="Раздел в работе"
                >
                  <span className="block whitespace-nowrap text-[15px] font-medium">{t.label}</span>
                  <span className="mt-0.5 block whitespace-nowrap text-[12px] leading-snug">
                    скоро
                  </span>
                </span>
              </li>
            )
          }

          return (
            <li key={t.key} className="flex-none">
              <Link
                href={t.href}
                aria-current={isActive ? 'page' : undefined}
                className={`${base} ${
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
