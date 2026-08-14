'use client'

import { useState } from 'react'

const DocIcon = () => (
  <svg width="92" height="80" viewBox="0 0 92 80" fill="none" aria-hidden="true">
    <rect x="8" y="6" width="52" height="66" rx="5" fill="#d6d6d6" />
    <rect x="16" y="12" width="52" height="66" rx="5" fill="#efefef" stroke="#d0d0d0" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={i} x="24" y={24 + i * 8} width={i % 2 ? 28 : 36} height="4" rx="2" fill="#c9c9c9" />
    ))}
    <circle cx="74" cy="52" r="14" fill="#bdbdbd" />
    <path
      d="m68 52 4.5 4.5L81 48"
      stroke="#fff"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
]

export function ExportCard() {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState('csv')

  return (
    <div className="card flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-[21px] font-medium">Экспорт данных</h3>
        <p className="mt-1.5 text-[13px] text-ink-500">
          Выберете нужные вам данные и скачайте в форматах pdf, xls/xlsx, csv, json, xml
        </p>

        <div className="mt-5">
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn btn-brand">
            Экспортировать данные
          </button>

          {open && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="field field-on-light w-40"
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <a href={`/account/export?format=${format}`} className="btn btn-forest">
                Скачать
              </a>
            </div>
          )}
        </div>
      </div>

      <DocIcon />
    </div>
  )
}
