export const nf = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export const signed = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const s = nf(Math.abs(value), digits)
  return `${value < 0 ? '−' : '+'}${s}`
}

export const dateRu = (value?: string | null): string => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Дата со временем — для ленты событий.
 *
 * В ленте за один день накапливается несколько записей, и без времени
 * их порядок выглядит случайным.
 */
export const dateTimeRu = (value?: string | null): string => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const dash = <T,>(v: T | null | undefined): T | '—' =>
  v === null || v === undefined || v === '' ? '—' : v

/**
 * Форма слова при числе: «1 запись», «2 записи», «5 записей».
 *
 * Заводится потому, что в кабинете стояло «2 записей неполны» — родительный
 * падеж там, где нужен именительный. Правило русского счёта не сводится
 * к «один или много», и написанное на глаз условие `n === 1 ? … : …`
 * ошибается на каждом числе от двух до четырёх — то есть на самых частых.
 *
 * Формы передаются как есть: `['запись', 'записи', 'записей']`.
 */
export const plural = (n: number, forms: [string, string, string]): string => {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}
