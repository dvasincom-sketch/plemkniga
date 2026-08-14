import Link from 'next/link'

const Arrow = ({ dir }: { dir: 'prev' | 'next' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <polyline
      points={dir === 'prev' ? '15 6 9 12 15 18' : '9 6 15 12 9 18'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/** 1 2 3 4 5 6 7 8 … 13 */
function pageItems(current: number, total: number): (number | '…')[] {
  if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1)
  const items: (number | '…')[] = []
  const window = 8
  let start = Math.max(1, Math.min(current - 3, total - window))
  if (start < 1) start = 1
  for (let p = start; p < start + window && p <= total; p++) items.push(p)
  if (start + window <= total - 1) items.push('…')
  if (!items.includes(total)) items.push(total)
  return items
}

export function Pagination({
  page,
  totalPages,
  searchParams,
  basePath,
}: {
  page: number
  totalPages: number
  searchParams: Record<string, string | string[] | undefined>
  basePath: string
}) {
  if (totalPages <= 1) return null

  const href = (p: number) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === 'page' || v === undefined) continue
      qs.set(k, Array.isArray(v) ? v[0] : v)
    }
    qs.set('page', String(p))
    return `${basePath}?${qs.toString()}`
  }

  const cell =
    'flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm transition-colors'
  const inactive = `${cell} bg-white hover:bg-brand-100`
  const active = `${cell} bg-forest-500 font-medium text-white`

  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Постраничная навигация">
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        className={`${inactive} ${page === 1 ? 'pointer-events-none opacity-40' : ''}`}
        aria-label="Предыдущая страница"
      >
        <Arrow dir="prev" />
      </Link>

      {pageItems(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className={`${inactive} pointer-events-none`}>
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            className={p === page ? active : inactive}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </Link>
        ),
      )}

      <Link
        href={href(Math.min(totalPages, page + 1))}
        aria-disabled={page === totalPages}
        className={`${inactive} ${page === totalPages ? 'pointer-events-none opacity-40' : ''}`}
        aria-label="Следующая страница"
      >
        <Arrow dir="next" />
      </Link>
    </nav>
  )
}
