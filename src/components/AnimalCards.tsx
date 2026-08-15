import Link from 'next/link'
import type { Animal } from '@/payload-types'
import { AGE_GROUPS, SEXES, STATES, labelOf } from '@/lib/dictionaries'
import { nf, signed } from '@/lib/format'
import { LockHint } from './LockHint'
import { ANONYMOUS, LOCK_HINT, isAnimalLocked, type Viewer } from '@/lib/visibility'

/**
 * Карточки вместо таблицы на узком экране.
 *
 * Таблица книги — четырнадцать колонок; на телефоне она превращается
 * в горизонтальный скролл, по которому невозможно сравнивать животных.
 * Карточка показывает то же самое в порядке важности.
 */
export function AnimalCards({
  animals,
  viewer = ANONYMOUS,
}: {
  animals: Animal[]
  viewer?: Viewer
}) {
  return (
    <ul className="space-y-3">
      {animals.map((a) => {
        const owner =
          typeof a.owner === 'object' && a.owner ? a.owner.shortName || a.owner.name : '—'
        const locked = isAnimalLocked(a, viewer)
        const s = a.summary
        const ipc = a.ipc ?? null

        const metrics: { label: string; value: string }[] = [
          { label: 'Удой, л', value: nf(s?.milkYield) },
          { label: 'Жир, %', value: nf(s?.fatPercent, 2) },
          { label: 'Белок, %', value: nf(s?.proteinPercent, 2) },
          { label: 'СБП, кг', value: nf(s?.fatProteinSum) },
        ]

        const head = (
          <>
            <p className="flex items-center gap-1.5 text-[17px] font-medium leading-tight">
              {a.name ?? '—'}
            </p>
            <p className="mt-0.5 text-[13px] tabular-nums text-ink-500">№ {a.identNumber}</p>
          </>
        )

        return (
          <li key={a.id} className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-2">
                {locked && <LockHint href={`/animals/${a.id}`} text={LOCK_HINT} />}
                <Link href={`/animals/${a.id}`} className="min-w-0">
                  {head}
                </Link>
              </div>

              <div className="flex-none text-right">
                <p className="text-[12px] text-ink-500">ИПЦ</p>
                <p className={`text-[17px] font-medium tabular-nums ${ipc !== null && ipc < 0 ? 'text-[#c0392b]' : 'text-forest-600'}`}>
                  {signed(ipc)}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-700">
              <span>{SEXES.find((o) => o.value === a.sex)?.full ?? '—'}</span>
              <span aria-hidden="true" className="text-ink-300">·</span>
              <span>{labelOf(AGE_GROUPS, a.ageGroup)}</span>
              <span aria-hidden="true" className="text-ink-300">·</span>
              <span>{STATES.find((o) => o.value === a.state)?.full ?? '—'}</span>
            </div>

            <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-ink-100 pt-3">
              {metrics.map((m) => (
                <div key={m.label}>
                  <dt className="text-[11px] leading-tight text-ink-500">{m.label}</dt>
                  <dd className="mt-0.5 text-[14px] tabular-nums">{m.value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-[13px] text-ink-500">
              {owner}
              {locked && ' · подробности закрыты владельцем'}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
