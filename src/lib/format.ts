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

export const dash = <T,>(v: T | null | undefined): T | '—' =>
  v === null || v === undefined || v === '' ? '—' : v
