import { InfoTip } from './InfoTip'
import { TRUST_LEVELS, trustLabel } from '@/lib/dictionaries'

/**
 * Уровень достоверности данных о животном.
 *
 * ТЗ, Таблица №4 (стр. 43): шкала −1…3, от черновика собственника
 * до записи, верифицированной Ассоциацией. От уровня зависит,
 * можно ли выпускать племенное свидетельство и попадает ли запись
 * в аналитику.
 *
 * Слово «Достоверность» убрано: название шкалы ничего не добавляло к самой
 * подписи — «Верифицировано ассоциацией» и так читается как утверждение
 * о достоверности, а объяснение шкалы целиком лежит в подсказке.
 *
 * Цифра и подпись разведены по ролям. Цифра — чёрный кружок: она одинакова
 * на всех уровнях и служит якорем, по которому взгляд находит значок
 * в шапке карточки. Цвет несёт подпись, и он не декоративный: красный
 * останавливает, серый говорит «ещё не проверено», оранжевый — «проверено,
 * но не Ассоциацией», зелёный — «можно выпускать свидетельство».
 */

/** Цвет плашки по уровню. Ключ — значение шкалы, а не порядковый номер. */
const TONE: Record<number, string> = {
  [-1]: 'bg-[#c0392b] text-white', // отклонено
  0: 'bg-[#4a4d52] text-white', // черновик
  1: 'bg-[#8a8f96] text-white', // проверено собственником
  2: 'bg-[#e08a1e] text-white', // подтверждено лабораторией
  3: 'bg-forest-500 text-white', // верифицировано ассоциацией
}

/**
 * На тёмно-зелёной шапке чужой карточки зелёная плашка исчезает: цвет фона
 * и цвет уровня совпадают. Там третий уровень берёт яркий зелёный —
 * тот же смысл, но плашка снова читается как плашка.
 */
const TONE_ON_DARK: Record<number, string> = { ...TONE, 3: 'bg-brand-500 text-white' }

export function TrustBadge({
  level,
  className = '',
  onDark = false,
}: {
  level?: number | null
  className?: string
  /**
   * Значок стоит на тёмной плашке. Плашка уровня цветная и читается везде,
   * а вот чёрный кружок на тёмно-зелёном сливается — там он становится белым.
   */
  onDark?: boolean
}) {
  const value = level ?? 0
  const palette = onDark ? TONE_ON_DARK : TONE
  const tone = palette[value] ?? palette[0]

  return (
    <span className={`inline-flex items-center gap-2 text-[15px] leading-none ${className}`}>
      <span
        aria-hidden="true"
        className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-[14px] font-medium tabular-nums ${
          onDark ? 'bg-white text-ink-900' : 'bg-ink-900 text-white'
        }`}
      >
        {value}
      </span>

      <span className={`inline-flex items-center rounded-md px-2.5 py-1.5 font-medium ${tone}`}>
        {trustLabel(value)}
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
