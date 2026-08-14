/** Минимальный CSV-парсер: поддерживает `,` и `;`, кавычки и переносы строк внутри кавычек. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const delimiter = (clean.split('\n')[0].match(/;/g)?.length ?? 0) >= (clean.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
      continue
    }

    if (ch === '"') inQuotes = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') field += ch
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const escape = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))]
  return '﻿' + lines.join('\r\n')
}
