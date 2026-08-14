import Link from 'next/link'
import type { Animal } from '@/payload-types'
import { AGE_GROUPS, SEXES, STATES } from '@/lib/dictionaries'
import { nf, signed } from '@/lib/format'

/**
 * Таблица книги.
 *
 * Колонок четырнадцать, и при узкой области они превращаются в горизонтальный
 * скролл, по которому невозможно сравнивать животных. Поэтому у каждой колонки
 * есть приоритет: основные видны всегда, вспомогательные показываются, когда
 * для них есть место. Ничего не теряется — полный набор всегда в карточке
 * животного, а на широком экране видна и вся таблица.
 */

const ageShort = (v?: string | null) => AGE_GROUPS.find((o) => o.value === v)?.short ?? '—'

const LockBadge = () => (
  <span
    title="Полная карточка доступна после авторизации"
    className="ml-1.5 inline-flex align-middle text-ink-900"
  >
    <svg width="11" height="13" viewBox="0 0 12 14" fill="none" aria-hidden="true">
      <rect x="1" y="6" width="10" height="7" rx="1.6" fill="currentColor" />
      <path
        d="M3.2 6V4.2a2.8 2.8 0 1 1 5.6 0V6"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  </span>
)

/** `hide` — класс, скрывающий колонку на тесных ширинах. */
const COLUMNS: { key: string; label: string; hide?: string }[] = [
  { key: 'num', label: '№' },
  { key: 'ident', label: 'Инд.№' },
  { key: 'name', label: 'Кличка' },
  { key: 'state', label: 'Состояние', hide: 'hidden 2xl:table-cell' },
  { key: 'sex', label: 'Пол' },
  { key: 'age', label: 'Возраст' },
  { key: 'milk', label: 'Удой (л)' },
  { key: 'fatPercent', label: 'Жир (%)', hide: 'hidden xl:table-cell' },
  { key: 'proteinPercent', label: 'Белок (%)', hide: 'hidden xl:table-cell' },
  { key: 'fatKg', label: 'Жир (кг)', hide: 'hidden 2xl:table-cell' },
  { key: 'proteinKg', label: 'Белок (кг)', hide: 'hidden 2xl:table-cell' },
  { key: 'sum', label: 'СБП (кг)', hide: 'hidden 2xl:table-cell' },
  { key: 'ipc', label: 'ИПЦ' },
  { key: 'owner', label: 'Владелец' },
]

const cls = (key: string) => COLUMNS.find((c) => c.key === key)?.hide ?? ''

export function AnimalTable({
  animals,
  startIndex = 0,
  canOpenAll = false,
  emptyText = 'По заданным условиям животных не найдено',
}: {
  animals: Animal[]
  startIndex?: number
  /** Пользователь авторизован — открыты все карточки. */
  canOpenAll?: boolean
  emptyText?: string
}) {
  return (
    <div className="table-scroll">
      <table className="data-table w-full">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className={`whitespace-normal ${c.hide ?? ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {animals.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="py-10 text-center text-ink-500">
                {emptyText}
              </td>
            </tr>
          )}

          {animals.map((a, i) => {
            const owner =
              typeof a.owner === 'object' && a.owner ? a.owner.shortName || a.owner.name : '—'
            const locked = !canOpenAll && !a.publicDetails
            const s = a.summary
            const ipc = a.ipc ?? null

            return (
              <tr key={a.id}>
                <td className="tabular-nums">{startIndex + i + 1}</td>
                <td className="tabular-nums">
                  {locked ? (
                    <span>{a.identNumber}</span>
                  ) : (
                    <Link href={`/animals/${a.id}`} className="hover:underline">
                      {a.identNumber}
                    </Link>
                  )}
                </td>
                <td className="cell-truncate" title={a.name ?? undefined}>
                  {locked ? (
                    (a.name ?? '—')
                  ) : (
                    <Link href={`/animals/${a.id}`} className="font-medium hover:underline">
                      {a.name ?? '—'}
                    </Link>
                  )}
                </td>
                {/* Полное название состояния: сокращения «Ж» у пола и у состояния означали разное */}
                <td className={cls('state')}>
                  {STATES.find((o) => o.value === a.state)?.full ?? '—'}
                </td>
                <td>{SEXES.find((o) => o.value === a.sex)?.label ?? '—'}</td>
                <td title={AGE_GROUPS.find((o) => o.value === a.ageGroup)?.label}>
                  {ageShort(a.ageGroup)}
                </td>
                <td className="tabular-nums">{nf(s?.milkYield)}</td>
                <td className={`tabular-nums ${cls('fatPercent')}`}>{nf(s?.fatPercent, 2)}</td>
                <td className={`tabular-nums ${cls('proteinPercent')}`}>
                  {nf(s?.proteinPercent, 2)}
                </td>
                <td className={`tabular-nums ${cls('fatKg')}`}>{nf(s?.fatKg)}</td>
                <td className={`tabular-nums ${cls('proteinKg')}`}>{nf(s?.proteinKg)}</td>
                <td className={`tabular-nums ${cls('sum')}`}>{nf(s?.fatProteinSum)}</td>
                <td className="tabular-nums">
                  <span className={ipc !== null && ipc < 0 ? 'ipc-negative' : 'ipc-positive'}>
                    {signed(ipc)}
                  </span>
                </td>
                <td className="cell-truncate" title={owner}>
                  {owner}
                  {locked && <LockBadge />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
