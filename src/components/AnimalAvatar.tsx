/**
 * Типографическая плашка вместо фотографии животного.
 *
 * От фотозаглушек отказались: обобщённый рисунок коровы ничего не сообщает
 * о конкретном животном и мешает читать карточку. Монограмма по кличке
 * работает как якорь для глаза и всегда соответствует записи.
 */
export function AnimalAvatar({
  name,
  identNumber,
  size = 84,
  className = '',
}: {
  name?: string | null
  identNumber?: string | null
  size?: number
  className?: string
}) {
  const source = (name ?? identNumber ?? '').trim()
  const letter = source ? source[0].toUpperCase() : '—'

  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={`flex flex-none items-center justify-center rounded-2xl bg-brand-50 font-medium leading-none text-forest-600 ${className}`}
    >
      {letter}
    </div>
  )
}
