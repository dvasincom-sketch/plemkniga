'use client'

import { useEffect, useState } from 'react'

export type NavItem = {
  id: string
  title: string
  /** 0 — часть, 1 — глава, 2 — подраздел */
  level: 0 | 1 | 2
}

/**
 * Оглавление документации слева.
 *
 * Почему подсветка текущего раздела считается наблюдателем, а не по хешу
 * в адресе. Хеш меняется только при клике по ссылке; человек, читающий
 * документ подряд, прокруткой, в этом случае весь час видел бы подсвеченным
 * первый пункт. Документ длинный, и «где я сейчас» — не украшение,
 * а единственный способ не потеряться.
 *
 * Наблюдается верхняя треть экрана (rootMargin снизу отрезает низ): иначе
 * подсвечивались бы сразу два-три заголовка, попавших в окно, и подсветка
 * прыгала бы. Берётся первый видимый — тот, к которому относится текст
 * под верхней кромкой.
 */
export function DocsNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const targets = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null)

    if (targets.length === 0) return

    const visible = new Set<string>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        // Порядок берём из оглавления, а не из порядка срабатывания:
        // наблюдатель отдаёт записи как попало, и без этого при быстрой
        // прокрутке подсвечивался бы случайный из видимых.
        const first = items.find((i) => visible.has(i.id))
        if (first) setActive(first.id)
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-label="Оглавление документации" className="text-[14px] leading-snug">
      <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-ink-500">Содержание</p>

      <ul className="space-y-1">
        {items.map((item) => {
          const isActive = item.id === active

          if (item.level === 0) {
            return (
              <li key={item.id} className="pt-4 first:pt-0">
                <a
                  href={`#${item.id}`}
                  className={`block text-[12px] font-bold uppercase tracking-wide transition-colors ${
                    isActive ? 'text-forest-600' : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  {item.title}
                </a>
              </li>
            )
          }

          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`block border-l-2 py-1 transition-colors ${
                  item.level === 1 ? 'pl-3 font-medium' : 'pl-6 text-[13px]'
                } ${
                  isActive
                    ? 'border-l-forest-500 text-forest-600'
                    : 'border-l-transparent text-ink-700 hover:border-l-ink-100 hover:text-ink-900'
                }`}
              >
                {item.title}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
