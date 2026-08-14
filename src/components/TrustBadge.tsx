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
    value >= 3
      ? 'bg-brand-50 text-forest-600'
      : value === 2
        ? 'bg-brand-50 text-forest-600'
        : value <= -1
          ? 'bg-red-50 text-red-700'
          : 'bg-[#f0f0f0] text-ink-700'

  return (
    <span className={`flex items-center gap-2 text-[15px] text-ink-700 ${className}`}>
      Уровень достоверности данных:
      <span className={`rounded-md px-2 py-0.5 font-medium tabular-nums ${tone}`}>{value}</span>
      <span className="text-ink-900">{trustLabel(value)}</span>
      <InfoTip label="Что означает уровень достоверности">
        <span className="mb-2 block font-medium text-ink-900">Уровень достоверности данных</span>
        <span className="mb-3 block">
          Показывает, кем проверена запись. Племенное свидетельство выпускается только с уровня 3,
          в расчёты индексов запись попадает с уровня 2.
        </span>
        <span className="block space-y-1.5">
          {TRUST_LEVELS.map((t) => (
            <span
              key={t.value}
              className={`flex gap-2 ${Number(t.value) === value ? 'text-ink-900' : ''}`}
            >
              <span
                className={`w-4 flex-none text-right font-medium tabular-nums ${
                  Number(t.value) === value ? 'text-forest-500' : 'text-ink-300'
                }`}
              >
                {t.value}
              </span>
              <span>
                <span className={Number(t.value) === value ? 'font-medium' : ''}>{t.label}</span>
                {t.hint && <span className="block text-ink-500">{t.hint}</span>}
              </span>
            </span>
          ))}
        </span>
      </InfoTip>
    </span>
  )
}
