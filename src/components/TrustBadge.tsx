import { InfoTip } from './InfoTip'
import { TRUST_LEVELS, trustLabel } from '@/lib/dictionaries'

/**
 * Уровень достоверности данных о животном.
 *
 * ТЗ, Таблица №4 (стр. 43): шкала −1…3, от черновика собственника
 * до записи, верифицированной Ассоциацией. От уровня зависит,
 * можно ли выпускать племенное свидетельство и попадает ли запись
 * в аналитику.
 */
export function TrustBadge({
  level,
  className = '',
}: {
  level?: number | null
  className?: string
}) {
  const value = level ?? 0

  const tone =
    value >= 2
      ? 'bg-brand-50 text-forest-600'
      : value <= -1
        ? 'bg-red-50 text-red-700'
        : 'bg-[#f0f0f0] text-ink-700'

  return (
    <span className={`inline-flex items-center gap-2 text-[15px] leading-none ${className}`}>
      <span className="text-ink-500">Достоверность</span>

      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium ${tone}`}>
        <span className="tabular-nums">{value}</span>
        <span>{trustLabel(value)}</span>
      </span>

      <InfoTip label="Что означает уровень достоверности">
        <p className="mb-2 font-medium text-ink-900">Уровень достоверности данных</p>
        <p className="mb-3">
          Показывает, кем проверена запись. Племенное свидетельство выпускается только с уровня 3, в
          расчёты индексов запись попадает с уровня 2.
        </p>
        <ul className="space-y-2">
          {TRUST_LEVELS.map((t) => {
            const current = Number(t.value) === value
            return (
              <li key={t.value} className="flex gap-2.5">
                <span
                  className={`w-5 flex-none text-right font-medium tabular-nums ${
                    current ? 'text-forest-500' : 'text-ink-300'
                  }`}
                >
                  {t.value}
                </span>
                <span className="min-w-0">
                  <span className={current ? 'font-medium text-ink-900' : 'text-ink-900'}>
                    {t.label}
                  </span>
                  {t.hint && <span className="block text-ink-500">{t.hint}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      </InfoTip>
    </span>
  )
}
