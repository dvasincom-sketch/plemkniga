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
 * Наружу выходит только подпись. Ни слова «Достоверность», ни номера ступени
 * рядом с ней нет: и то и другое — служебные обозначения. «Верифицировано
 * ассоциацией» уже говорит всё, что нужно знать зоотехнику, а цифра рядом
 * заставляла держать в голове шкалу, которой он не пользуется. Номера
 * остались там, где они действительно что-то значат, — в API и в выгрузках.
 *
 * Цвет подписи не декоративный: красный останавливает, серый говорит
 * «ещё не проверено», оранжевый — «проверено, но не Ассоциацией»,
 * зелёный — «можно выпускать свидетельство». Порядок ступеней читается
 * из этого ряда без чисел.
 *
 * Подписи и пояснения берутся из `TRUST_LEVELS` и только оттуда: три
 * разошедшиеся шкалы в трёх местах — ровно то, что здесь исправляли.
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
  /** Значок стоит на тёмной плашке — зелёная ступень берёт яркий оттенок. */
  onDark?: boolean
}) {
  const value = level ?? 0
  const palette = onDark ? TONE_ON_DARK : TONE
  const tone = palette[value] ?? palette[0]

  return (
    <span className={`inline-flex items-center gap-2 text-[15px] leading-none ${className}`}>
      <span className={`inline-flex items-center rounded-md px-2.5 py-1.5 font-medium ${tone}`}>
        {trustLabel(value)}
      </span>

      <InfoTip label="Что означает уровень достоверности">
        <p className="mb-2 font-medium text-ink-900">Уровень достоверности данных</p>
        {/*
           Здесь стояло, что с подтверждения лабораторией запись попадает
           в расчёты индексов. Такого правила в системе нет: отбора
           по уровню в расчётах не было никогда. Обещание, которого код
           не исполняет, дороже пустого места — по нему принимают решения.
        */}
        <p className="mb-3">
          Показывает, кто ручается за запись. Племенное свидетельство выпускается только
          для записей, верифицированных Ассоциацией.
        </p>
        {/* Ступени в порядке возрастания — сам список и есть шкала */}
        <ul className="space-y-2">
          {TRUST_LEVELS.map((t) => {
            const current = Number(t.value) === value
            return (
              <li key={t.value} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className={`mt-[7px] h-1.5 w-1.5 flex-none rounded-full ${
                    current ? 'bg-forest-500' : 'bg-ink-300'
                  }`}
                />
                <span className="min-w-0">
                  <span className={current ? 'font-medium text-ink-900' : 'text-ink-900'}>
                    {t.label}
                    {current && <span className="text-ink-500"> — у этой записи</span>}
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
