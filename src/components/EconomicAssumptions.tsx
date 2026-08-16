import { ECONOMIC_ASSUMPTIONS } from '@/lib/economics'

/**
 * Цены, из которых собран экономический профиль.
 *
 * Стоит рядом с самим профилем, а не отдельным разделом внизу страницы:
 * это не общая справка, а его собственная изнанка. Свёрнуто по умолчанию —
 * читают её редко, но когда читают, ищут именно здесь.
 */
export function EconomicAssumptions() {
  return (
    <details className="mt-4 rounded-xl border border-ink-100 px-4 py-3">
      <summary className="cursor-pointer text-[14px]">Из каких цен считается</summary>

      <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-500">
        Экономический индекс верен ровно настолько, насколько верны цены под ним. Это допущения
        по рынку 2026 года, а не истина: у хозяйства цифры свои, и под них заводят свой профиль.
      </p>

      <dl className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        {ECONOMIC_ASSUMPTIONS.map((a) => (
          <div key={a.label} className="border-b border-ink-100 pb-2">
            <dt className="flex items-baseline justify-between gap-3 text-[13px]">
              <span>{a.label}</span>
              <span className="whitespace-nowrap font-medium tabular-nums">{a.value}</span>
            </dt>
            <dd className="mt-0.5 text-[11px] leading-snug text-ink-500">{a.note}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 max-w-[70ch] text-[12px] leading-relaxed text-ink-500">
        Композитам вымени и ног цена намеренно не назначена: их экономика уже учтена через
        здоровье вымени и долголетие. Вторая цена была бы двойным счётом.
      </p>
    </details>
  )
}
