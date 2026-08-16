import { ECONOMIC_ASSUMPTIONS } from '@/lib/economics'

/**
 * Цены, из которых собран экономический профиль.
 *
 * Стоит ячейкой сетки рядом с самой карточкой профиля — не отдельным разделом
 * внизу страницы и не свёрнутым блоком внутри карточки. Внизу страницы это
 * читалось как примечание ко всему списку профилей; внутри карточки шириной
 * в треть колонки таблица цен в два столбца разваливалась.
 *
 * Развёрнуто, а не под кликом: у экономического индекса цена — это и есть
 * содержание. «Прибыль 93 тысячи» без понимания, по чём считали молоко,
 * ничего не значит и проверке не поддаётся.
 */
export function EconomicAssumptions({ wide }: { wide?: boolean }) {
  return (
    <div className={`rounded-2xl border border-ink-100 p-5 ${wide ? 'xl:col-span-2' : ''}`}>
      <h3 className="text-[15px] font-medium leading-tight">Из каких цен считается</h3>
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-ink-500">
        Индекс верен ровно настолько, насколько верны цены под ним. Это допущения по рынку
        2026 года, а не истина: у хозяйства цифры свои, и под них заводят свой профиль.
      </p>

      {/*
         Две колонки только на широком экране. На среднем блок занимает
         половину ряда, и пара цена + пояснение в нём уже не помещается:
         подпись ломается на три строки и читается хуже длинного списка.
      */}
      <dl className={`mt-4 ${wide ? 'grid gap-x-8 gap-y-2 xl:grid-cols-2' : 'space-y-2'}`}>
        {ECONOMIC_ASSUMPTIONS.map((a) => (
          <div key={a.label} className="border-b border-ink-100 pb-2 last:border-0 last:pb-0">
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
    </div>
  )
}
