import Link from 'next/link'

/** Знак Ассоциации производителей КРС голштинской породы. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`} aria-label="На главную">
      <svg width="44" height="34" viewBox="0 0 44 34" fill="none" aria-hidden="true">
        {/* голова коровы */}
        <path
          d="M6 6c0-2.2 2-3.6 4-2.8l4.4 1.8C16.6 3.4 19.2 2.8 22 2.8s5.4.6 7.6 2.2L34 3.2c2-.8 4 .6 4 2.8v7.4c0 7.6-5.6 13.8-13.4 14.6-1.7.2-3.5.2-5.2 0C11.6 27.2 6 21 6 13.4V6Z"
          fill="#17181A"
        />
        <path
          d="M13.6 14.4c0-3.6 3.8-6.4 8.4-6.4s8.4 2.8 8.4 6.4c0 5-3.8 8.8-8.4 8.8s-8.4-3.8-8.4-8.8Z"
          fill="#fff"
        />
        <ellipse cx="18.2" cy="13.6" rx="1.5" ry="1.9" fill="#17181A" />
        <ellipse cx="25.8" cy="13.6" rx="1.5" ry="1.9" fill="#17181A" />
        <path
          d="M16.8 19.4c0-1.3 2.3-2.3 5.2-2.3s5.2 1 5.2 2.3-2.3 2.6-5.2 2.6-5.2-1.3-5.2-2.6Z"
          fill="#17181A"
          opacity=".25"
        />
        {/* триколор */}
        <rect x="6" y="29.6" width="10.6" height="1.5" rx=".75" fill="#fff" stroke="#D9D9D9" strokeWidth=".4" />
        <rect x="16.6" y="29.6" width="10.6" height="1.5" rx=".75" fill="#0039A6" />
        <rect x="27.2" y="29.6" width="10.6" height="1.5" rx=".75" fill="#D52B1E" />
      </svg>
      <span className="hidden text-[8.5px] font-bold uppercase leading-[1.35] tracking-[0.02em] text-ink-900 sm:block">
        Ассоциация
        <br />
        производителей КРС
        <br />
        голштинской породы
      </span>
    </Link>
  )
}
