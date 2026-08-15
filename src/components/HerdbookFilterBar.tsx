'use client'

import { ComboBox, type Option } from './ComboBox'

/**
 * Отбор в публичной книге — короткая строка над таблицей.
 *
 * Раньше здесь стояла колонка с полутора десятками полей, повторявшая фильтр
 * личного кабинета. Она съедала ширину у таблицы, а таблице ширина нужнее:
 * четырнадцать колонок при узкой области превращаются в горизонтальный скролл.
 *
 * Анонимному читателю книги нужны три вопроса: чьё это животное, из какого
 * стада и какой у него номер. Всё остальное — работа со своим стадом,
 * и для неё есть развёрнутый фильтр в кабинете.
 */
export function HerdbookFilterBar({
  defaults,
  owners,
  herds,
  sort,
}: {
  defaults: Record<string, string>
  owners: Option[]
  herds: Option[]
  /** Сортировка переносится в форму, чтобы не сбрасываться при поиске. */
  sort: string
}) {
  const d = (k: string) => defaults[k] ?? ''

  return (
    <form method="GET" action="/#results" className="rounded-card bg-forest-500 p-4 sm:p-5">
      {sort && <input type="hidden" name="sort" value={sort} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.2fr_1.2fr_auto]">
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-white/85">Индивидуальный номер</span>
          <input
            name="id"
            defaultValue={d('id')}
            placeholder="Например, 20197"
            className="field"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] text-white/85">Владелец</span>
          <ComboBox
            name="owner"
            ariaLabel="Владелец"
            placeholder="Любое хозяйство"
            defaultValue={d('owner')}
            options={owners}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] text-white/85">Стадо</span>
          <ComboBox
            name="herd"
            ariaLabel="Стадо"
            placeholder="Любое стадо"
            defaultValue={d('herd')}
            options={herds}
          />
        </label>

        <div className="flex items-end">
          <button type="submit" className="btn btn-accent h-[46px] w-full lg:w-auto lg:px-7">
            Найти
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="6.2" stroke="currentColor" strokeWidth="1.8" />
              <path d="m13.6 13.6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  )
}
