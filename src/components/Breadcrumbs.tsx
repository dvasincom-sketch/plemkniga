import Link from 'next/link'

/**
 * Путь до текущей страницы.
 *
 * Нужен в карточке животного: без него, провалившись из «Мои животные»,
 * пользователь терял понимание, в каком разделе находится и куда возвращаться.
 */
export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[]
}) {
  return (
    <nav aria-label="Навигационная цепочка" className="mb-5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-500">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={item.label} className="flex items-center gap-2">
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-ink-900 hover:underline underline-offset-4">
                  {item.label}
                </Link>
              ) : (
                <span className={last ? 'text-ink-900' : ''} aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
              {!last && (
                <span aria-hidden="true" className="text-ink-300">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
