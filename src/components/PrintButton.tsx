'use client'

/**
 * Печать документа средствами браузера.
 *
 * Отдельного экспорта в PDF нет намеренно: диалог печати уже умеет сохранять
 * в PDF на всех платформах, и результат совпадает с тем, что человек видит
 * на экране. Служебные элементы скрыты правилами `@media print`.
 */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-brand">
      Печать или сохранение в PDF
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M6 7V2.5h8V7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="2.5" y="7" width="15" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 12h8v5.5H6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
