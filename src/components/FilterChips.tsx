import Link from 'next/link'

/**
 * Отбор над таблицей — и по виду не раздел.
 *
 * ## Зачем отличать
 *
 * В очередях Ассоциации стоял ряд «Все открытые · 2 / Мои · 0 / Закрытые»,
 * сделанный теми же плашками, что разделы внутри раздела (`SubTabs`).
 * По виду одно и то же, по смыслу — разное: раздел уводит на другую
 * страницу, отбор меняет содержимое таблицы, оставаясь на месте. Пока
 * они выглядели одинаково, эксперт не мог понять, вернётся ли он сюда
 * же, не нажав.
 *
 * Отличие сделано формой, а не цветом: скруглённые по кругу, ниже ростом,
 * выбранный — тёмный, а не зелёный. Зелёный в системе означает «вы здесь,
 * это раздел»; на отборе он говорил бы неправду.
 *
 * ## Число внутри плашки
 *
 * Счёт стоит в самой плашке, а не рядом: он часть условия отбора,
 * а не отдельная новость. «Мои · 0» сразу отвечает, есть ли смысл
 * нажимать, — и это единственная причина показывать ноль.
 */

export type FilterChip = {
  key: string
  label: string
  href: string
  /** Сколько записей под этим отбором. `null` — считать не стали. */
  count?: number | null
  /** Подсказка при наведении: чем этот отбор отличается от соседнего. */
  hint?: string
}

export function FilterChips({
  label,
  items,
  active,
}: {
  label: string
  items: readonly FilterChip[]
  active: string
}) {
  return (
    <nav aria-label={label} className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {items.map((f) => {
          const isActive = f.key === active
          return (
            <li key={f.key}>
              <Link
                href={f.href}
                aria-current={isActive ? 'true' : undefined}
                title={f.hint}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] leading-6 transition-colors ${
                  isActive
                    ? 'bg-ink-900 text-white'
                    : 'bg-white text-ink-700 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                }`}
              >
                {f.label}
                {typeof f.count === 'number' && (
                  <span className={`tabular-nums ${isActive ? 'text-white/60' : 'text-ink-500'}`}>
                    {f.count.toLocaleString('ru-RU')}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
