/**
 * Складывающийся блок карточки.
 *
 * Вкладка «Оценка» — это семь таблиц подряд, вместе почти три экрана. Человек
 * приходит на неё с одним вопросом за раз: посмотреть индекс, свериться
 * с экстерьером, найти строку по лактации. Показывать всё сразу значит
 * заставлять его прокручивать мимо шести таблиц ради седьмой.
 *
 * Это `<details>`, а не переключатель на состоянии: блок работает без
 * JavaScript, открывается по якорной ссылке и печатается развёрнутым.
 * Что открыто по умолчанию — решает вызывающий: короткие таблицы дешевле
 * показать, длинные (экстерьер, лактации) дешевле свернуть.
 */

const Chevron = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    className="flex-none text-ink-500 transition-transform group-open:rotate-180"
  >
    <polyline
      points="6 9 12 15 18 9"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export function Collapsible({
  title,
  note,
  aside,
  defaultOpen = false,
  children,
}: {
  title: string
  /** Одна фраза под заголовком — видна и в свёрнутом виде. */
  note?: string
  /** Правый угол шапки: например, уровень достоверности. */
  aside?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} className="card group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="flex items-center gap-2">
          <span className="panel-heading !mb-0">{title}</span>
          <Chevron />
        </span>
        {aside}
      </summary>

      {note && <p className="mt-1 text-[13px] leading-relaxed text-ink-500">{note}</p>}

      <div className="mt-4">{children}</div>
    </details>
  )
}
