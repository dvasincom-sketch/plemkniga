import type { Animal } from '@/payload-types'
import { dateRu, nf } from '@/lib/format'

/**
 * Продуктивность по лактациям с динамикой.
 *
 * Раньше здесь была панель «Продуктивность (последняя лактация)» с набором
 * чисел без даты: было непонятно, к какому периоду они относятся и что
 * происходило раньше. Теперь показаны все лактации, у каждой — дата отёла
 * и изменение к предыдущей, а над таблицей столбики удоя, чтобы направление
 * читалось с одного взгляда.
 */

type Row = {
  number: number
  date?: string | null
  days?: number | null
  milk: number | null
  fat: number | null
  protein: number | null
}

const Delta = ({ value, digits = 0 }: { value: number | null; digits?: number }) => {
  if (value === null || value === 0) return <span className="text-ink-300">—</span>
  const up = value > 0
  return (
    <span className={up ? 'text-forest-600' : 'text-[#c0392b]'}>
      {up ? '+' : '−'}
      {nf(Math.abs(value), digits)}
    </span>
  )
}

export function LactationDynamics({ animal }: { animal: Animal }) {
  const rows: Row[] = (animal.lactations ?? []).map((l, i) => ({
    number: l.number ?? i + 1,
    date: l.calvingDate,
    days: l.dd,
    milk: l.milk305 ?? l.milkYield ?? null,
    fat: l.fat305 ?? null,
    protein: l.protein305 ?? null,
  }))

  rows.sort((a, b) => a.number - b.number)

  if (rows.length === 0) {
    return (
      <div className="card">
        <h2 className="panel-heading">Продуктивность по лактациям</h2>
        <p className="text-sm leading-relaxed text-ink-500">
          Лактаций пока нет. Для быков-производителей это нормально: их оценивают по потомству,
          смотрите вкладку «Оценка».
        </p>
      </div>
    )
  }

  const last = rows[rows.length - 1]
  const maxMilk = Math.max(...rows.map((r) => r.milk ?? 0), 1)

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="panel-heading mb-0">Продуктивность по лактациям</h2>
        <p className="text-[13px] text-ink-500">
          Последняя — {last.number}-я, отёл {dateRu(last.date)}
        </p>
      </div>

      {/* Столбики: направление видно раньше, чем прочитаны числа */}
      <div className="mb-5 mt-4 flex items-end gap-1.5" aria-hidden="true">
        {rows.map((r) => (
          <div key={r.number} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-brand-500"
              style={{ height: Math.max(4, Math.round(((r.milk ?? 0) / maxMilk) * 64)) }}
            />
            <span className="text-[11px] text-ink-500">{r.number}</span>
          </div>
        ))}
      </div>

      <div className="table-scroll">
        <table className="metric-table w-full">
          <thead>
            <tr>
              <th className="w-10">№</th>
              <th>Отёл</th>
              <th className="text-right">Дней</th>
              <th className="text-right">Удой, кг</th>
              <th className="text-right">Δ удой</th>
              <th className="text-right">Жир, %</th>
              <th className="text-right">Белок, %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const prev = i > 0 ? rows[i - 1] : null
              const dMilk =
                prev && r.milk !== null && prev.milk !== null ? r.milk - prev.milk : null

              return (
                <tr key={r.number}>
                  <td className="tabular-nums">{r.number}</td>
                  <td>{dateRu(r.date)}</td>
                  <td className="text-right tabular-nums">{r.days ?? '—'}</td>
                  <td className="text-right font-medium tabular-nums">{nf(r.milk, 0)}</td>
                  <td className="text-right tabular-nums">
                    <Delta value={dMilk} />
                  </td>
                  <td className="text-right tabular-nums">{nf(r.fat, 2)}</td>
                  <td className="text-right tabular-nums">{nf(r.protein, 2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
        Удой приведён за 305 дней, если он рассчитан; иначе — за всю лактацию.
        Δ показывает изменение к предыдущей лактации.
      </p>
    </div>
  )
}
