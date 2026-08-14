import Link from 'next/link'
import type { Animal } from '@/payload-types'
import { AGE_GROUPS, SEXES, STATES } from '@/lib/dictionaries'
import { nf, signed } from '@/lib/format'

const short = (arr: readonly { value: string; label: string }[], v?: string | null) =>
  arr.find((o) => o.value === v)?.label ?? '—'

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

const COLUMNS = [
  '№',
  'Инд.№',
  'Кличка',
  'Состо­яние',
  'Пол',
  'Возраст',
  'Удой (л)',
  'Жир (%)',
  'Белок (%)',
  'Жир (кг)',
  'Белок (кг)',
  'СБП (кг)',
  'ИПЦ',
  'Владелец',
]

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
      <table className="data-table min-w-[1120px]">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} className="whitespace-normal">
                {c}
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
            const owner = typeof a.owner === 'object' && a.owner ? a.owner.shortName || a.owner.name : '—'
            const locked = !canOpenAll && !a.publicDetails
            const s = a.summary
            const ipc = a.ipc ?? null

            return (
              <tr key={a.id}>
                <td>{startIndex + i + 1}</td>
                <td>
                  {locked ? (
                    <span>{a.identNumber}</span>
                  ) : (
                    <Link href={`/animals/${a.id}`} className="hover:underline">
                      {a.identNumber}
                    </Link>
                  )}
                </td>
                <td>
                  {locked ? (
                    (a.name ?? '—')
                  ) : (
                    <Link href={`/animals/${a.id}`} className="hover:underline">
                      {a.name ?? '—'}
                    </Link>
                  )}
                </td>
                <td>{short(STATES, a.state)}</td>
                <td>{short(SEXES, a.sex)}</td>
                <td title={AGE_GROUPS.find((o) => o.value === a.ageGroup)?.label}>
                  {ageShort(a.ageGroup)}
                </td>
                <td>{nf(s?.milkYield)}</td>
                <td>{nf(s?.fatPercent, 2)}</td>
                <td>{nf(s?.proteinPercent, 2)}</td>
                <td>{nf(s?.fatKg)}</td>
                <td>{nf(s?.proteinKg)}</td>
                <td>{nf(s?.fatProteinSum)}</td>
                <td>
                  <span className={ipc !== null && ipc < 0 ? 'ipc-negative' : 'ipc-positive'}>
                    {signed(ipc)}
                  </span>
                </td>
                <td>
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
