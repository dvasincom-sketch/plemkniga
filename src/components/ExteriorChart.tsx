import { signed } from '@/lib/format'

export type ExteriorRow = { key: string; label: string; value?: number | null }

const SCALE_MIN = -2.5
const SCALE_MAX = 2.5
const pct = (v: number) => ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100

function Bar({ value }: { value?: number | null }) {
  if (value === null || value === undefined) {
    return <div className="relative h-6" />
  }
  const clamped = Math.max(SCALE_MIN, Math.min(SCALE_MAX, value))
  const zero = pct(0)
  const here = pct(clamped)
  const left = Math.min(zero, here)
  const width = Math.abs(here - zero)
  const negative = clamped < 0

  return (
    <div className="relative h-6">
      {/* сетка */}
      {[-2, -1, 0, 1, 2].map((t) => (
        <span
          key={t}
          className={`absolute top-0 h-full ${t === 0 ? 'w-px bg-ink-300' : 'w-px bg-ink-100'}`}
          style={{ left: `${pct(t)}%` }}
          aria-hidden="true"
        />
      ))}
      <span
        className={`absolute top-1 h-4 rounded-[2px] ${negative ? 'bg-forest-700' : 'bg-brand-300'}`}
        style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
      />
    </div>
  )
}

export function ExteriorChart({
  traits,
  composites,
}: {
  traits: ExteriorRow[]
  composites: ExteriorRow[]
}) {
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f0f0f0] text-ink-700">
            <th className="w-[46%] rounded-tl-lg px-3.5 pb-1.5 pt-2.5 text-left font-normal">
              Признак
            </th>
            <th className="px-3.5 pb-1.5 pt-2.5 text-center font-normal">Профиль</th>
            <th className="w-[14%] rounded-tr-lg px-3.5 pb-1.5 pt-2.5 text-right font-normal">
              Оценка
            </th>
          </tr>
          <tr className="bg-[#f0f0f0] text-ink-500">
            <th className="rounded-bl-lg" />
            <th className="px-3.5 pb-2 font-normal">
              <span className="relative flex h-4 w-full items-center">
                {[-2, -1, 0, 1, 2].map((t) => (
                  <span
                    key={t}
                    className="absolute -translate-x-1/2 text-xs"
                    style={{ left: `${pct(t)}%` }}
                  >
                    {t > 0 ? `+${t}` : t}
                  </span>
                ))}
              </span>
            </th>
            <th className="rounded-br-lg" />
          </tr>
        </thead>
        <tbody>
          {traits.map((t) => (
            <tr key={t.key} className="border-b border-[#ededed] last:border-0">
              <td className="py-2.5 pr-3 align-middle leading-snug">{t.label}</td>
              <td className="px-3 align-middle">
                <Bar value={t.value} />
              </td>
              <td className="py-2.5 pl-3 text-right align-middle tabular-nums">
                {signed(t.value, t.value !== null && t.value !== undefined && Math.abs(t.value % 1) > 0.05 ? 2 : 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 className="mb-3 mt-6 text-[15px] font-medium text-forest-500">Индексы экстерьера</h4>
      <table className="w-full text-sm">
        <tbody>
          {composites.map((t) => (
            <tr key={t.key} className="border-b border-[#ededed] last:border-0">
              <td className="w-[46%] py-2.5 pr-3 align-middle">{t.label}</td>
              <td className="px-3 align-middle">
                <Bar value={t.value} />
              </td>
              <td className="w-[14%] py-2.5 pl-3 text-right align-middle tabular-nums">
                {signed(t.value, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
