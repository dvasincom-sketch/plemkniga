import type { Animal } from '@/payload-types'
import { AGE_GROUPS, DISPOSAL_HINT, labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'

/**
 * Паспорт животного — сводка, с которой зоотехник начинает работу.
 *
 * Повторяет привычную бумажную форму: сверху принадлежность (хозяйство,
 * регион, район) и место рождения, ниже — идентификация и племенные
 * характеристики двумя колонками. Прочерк означает, что показатель ещё
 * не ведётся в системе, а не что он пустой у этого животного.
 */

const relField = (v: unknown, key: string): string => {
  if (v && typeof v === 'object') {
    const value = (v as Record<string, unknown>)[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return '—'
}

const relName = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const n = o.shortName ?? o.name ?? o.title
    if (typeof n === 'string' && n) return n
  }
  return '—'
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] leading-snug text-ink-500">{label}</p>
      <p className="mt-0.5 break-words text-[15px] leading-snug">{value || '—'}</p>
    </div>
  )
}

export function AnimalPassport({ animal }: { animal: Animal }) {
  const owner = animal.owner
  const region = relField(owner, 'region')

  return (
    <div className="card lg:col-span-2">
      <h2 className="panel-heading">Паспорт животного</h2>

      {/* ---------------- Принадлежность и место рождения ---------------- */}
      <div className="overflow-hidden rounded-xl border border-ink-100">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-x-4 bg-[#f6f6f6] px-4 py-2.5 text-[12px] text-ink-500">
          <span />
          <span>Хозяйство</span>
          <span>Регион</span>
          <span>Район</span>
        </div>

        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-x-4 border-t border-ink-100 px-4 py-3 text-[15px]">
          <span className="text-ink-500">Владелец</span>
          <span className="break-words">{relName(owner)}</span>
          <span>{region}</span>
          <span>—</span>
        </div>

        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-x-4 border-t border-ink-100 px-4 py-3 text-[15px]">
          <span className="text-ink-500">Место рождения</span>
          <span>—</span>
          <span>—</span>
          <span>—</span>
        </div>
      </div>

      {/* -------------------- Идентификация и племенное ------------------- */}
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        <Cell label="Кличка" value={animal.name ?? '—'} />
        <Cell label="Половозрастная группа" value={labelOf(AGE_GROUPS, animal.ageGroup)} />

        <Cell label="Индивидуальный №" value={animal.identNumber} />
        <Cell label="Породность" value={relName(animal.breed)} />

        <Cell label="Дата рождения" value={dateRu(animal.birthDate)} />
        <Cell label="Линия" value={relName(animal.line)} />

        <Cell label="Дата выбытия" value={dateRu(animal.disposalDate)} />
        <Cell
          label="Кровность"
          value={
            typeof animal.bloodPercent === 'number' ? `${animal.bloodPercent} %` : '—'
          }
        />

        <div className="col-span-2 sm:col-span-4">
          <Cell
            label="Причина выбытия"
            value={
              animal.disposalReason ? relName(animal.disposalReason) : DISPOSAL_HINT
            }
          />
        </div>
      </div>
    </div>
  )
}
