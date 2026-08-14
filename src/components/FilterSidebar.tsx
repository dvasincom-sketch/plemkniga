'use client'

import { useState } from 'react'
import { AGE_GROUPS, ID_FORMATS, RELATIONS, SEXES, STATES } from '@/lib/dictionaries'
import { ADVANCED_FIELDS } from '@/lib/animal-query'
import { Select } from './Select'

/**
 * Колонка условий отбора слева от результатов.
 *
 * Форма вертикальная и стоит рядом с таблицей намеренно: пользователь меняет
 * условие и сразу видит, что стало с выдачей, не прокручивая страницу вверх.
 * Отправка — обычным GET, поэтому любое состояние отбора адресуемо ссылкой
 * и работает кнопка «назад».
 */

type Herd = { id: number; name: string }

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="9" cy="9" r="6.2" stroke="currentColor" strokeWidth="1.8" />
    <path d="m13.6 13.6 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    className={`transition-transform ${open ? '' : 'rotate-180'}`}
    aria-hidden="true"
  >
    <polyline
      points="6 15 12 9 18 15"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-white/85">{label}</span>
      {children}
    </label>
  )
}

export function FilterSidebar({
  herds,
  defaults,
  sort,
  hasActive,
  openAdvanced = false,
}: {
  herds: Herd[]
  defaults: Record<string, string>
  /** Текущая сортировка переносится в форму, чтобы не сбрасываться при поиске. */
  sort: string
  hasActive: boolean
  openAdvanced?: boolean
}) {
  const [advanced, setAdvanced] = useState(openAdvanced)
  const [openOnMobile, setOpenOnMobile] = useState(false)
  const d = (k: string) => defaults[k] ?? ''

  return (
    <div className="lg:sticky lg:top-6">
      {/* На узком экране колонка сворачивается — иначе до результатов не долистать */}
      <button
        type="button"
        onClick={() => setOpenOnMobile((v) => !v)}
        aria-expanded={openOnMobile}
        className="mb-3 flex w-full items-center justify-between rounded-xl bg-forest-500 px-5 py-3.5 text-[15px] font-medium text-white lg:hidden"
      >
        Условия отбора
        <Chevron open={openOnMobile} />
      </button>

      <form
        method="GET"
        action="/#results"
        className={`rounded-card bg-forest-500 px-5 py-6 text-white ${
          openOnMobile ? 'block' : 'hidden'
        } lg:block`}
      >
        {sort && <input type="hidden" name="sort" value={sort} />}

        <p className="mb-5 hidden text-[19px] font-medium lg:block">Условия отбора</p>

        <div className="space-y-4">
          <Field label="Индивидуальный номер">
            <input name="id" defaultValue={d('id')} placeholder="Например, 20197" className="field" />
          </Field>

          <Field label="Кличка">
            <input name="name" defaultValue={d('name')} placeholder="Например, Атлант" className="field" />
          </Field>

          <Field label="Формат номера">
            <Select
              name="idFormat"
              ariaLabel="Формат номера"
              placeholder="Любой"
              defaultValue={d('idFormat')}
              options={ID_FORMATS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Пол">
              <Select
                name="sex"
                ariaLabel="Пол"
                placeholder="Любой"
                defaultValue={d('sex')}
                options={SEXES.map((o) => ({ value: o.value, label: o.full }))}
              />
            </Field>
            <Field label="Возраст">
              <Select
                name="ageGroup"
                ariaLabel="Возраст"
                placeholder="Любой"
                defaultValue={d('ageGroup')}
                options={AGE_GROUPS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </Field>
          </div>

          <Field label="Состояние">
            <Select
              name="state"
              ariaLabel="Состояние"
              placeholder="Любое"
              defaultValue={d('state')}
              options={STATES.map((o) => ({ value: o.value, label: o.full }))}
            />
          </Field>

          <Field label="Родословная">
            <Select
              name="relation"
              ariaLabel="Родословная"
              placeholder="Не важно"
              defaultValue={d('relation')}
              options={RELATIONS.filter((r) => r.value !== 'any').map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Field>

          <Field label="Владелец">
            <input name="owner" defaultValue={d('owner')} placeholder="Название хозяйства" className="field" />
          </Field>

          <Field label="Стадо">
            <Select
              name="herd"
              ariaLabel="Стадо"
              placeholder="Любое"
              defaultValue={d('herd')}
              options={herds.map((h) => ({ value: String(h.id), label: h.name }))}
            />
          </Field>

          <Field label="Автор записи">
            <input name="author" defaultValue={d('author')} placeholder="Фамилия или e-mail" className="field" />
          </Field>
        </div>

        {/* ---------------------------- Показатели --------------------------- */}
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          aria-expanded={advanced}
          className="mt-5 flex w-full items-center justify-between border-t border-white/20 pt-5 text-[15px] text-white/90 hover:text-white"
        >
          Продуктивность и оценка
          <Chevron open={advanced} />
        </button>

        {advanced && (
          <div className="mt-4 space-y-4">
            <p className="text-[13px] leading-snug text-white/70">
              Значение больше указанного
            </p>

            <div className="grid grid-cols-2 gap-3">
              {ADVANCED_FIELDS.map((f) => (
                <Field key={f.name} label={f.label}>
                  <span className="flex items-center overflow-hidden rounded-lg bg-white">
                    <span className="pl-3 pr-1 text-sm text-ink-500">&gt;</span>
                    <span className="my-2 w-px self-stretch bg-ink-100" />
                    <input
                      name={f.name}
                      defaultValue={d(f.name)}
                      inputMode="decimal"
                      className="h-[46px] w-full bg-transparent px-2.5 text-sm text-ink-900 outline-none"
                    />
                  </span>
                </Field>
              ))}
            </div>

            <div>
              <span className="mb-1.5 block text-[13px] text-white/85">
                Индекс племенной ценности
              </span>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { name: 'ipcFrom', prefix: 'от', ph: '−0000' },
                    { name: 'ipcTo', prefix: 'до', ph: '+0000' },
                  ] as const
                ).map((f) => (
                  <span key={f.name} className="flex items-center overflow-hidden rounded-lg bg-white">
                    <span className="pl-3 pr-1 text-sm text-ink-500">{f.prefix}</span>
                    <span className="my-2 w-px self-stretch bg-ink-100" />
                    <input
                      name={f.name}
                      defaultValue={d(f.name)}
                      placeholder={f.ph}
                      inputMode="decimal"
                      className="h-[46px] w-full bg-transparent px-2.5 text-sm text-ink-900 outline-none placeholder:text-ink-300"
                    />
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-3">
          <button type="submit" className="btn btn-accent w-full">
            Показать животных
            <SearchIcon />
          </button>

          {hasActive && (
            <a
              href="/"
              className="block rounded-lg py-2 text-center text-[14px] text-white/85 underline underline-offset-4 hover:text-white"
            >
              Сбросить все условия
            </a>
          )}
        </div>
      </form>
    </div>
  )
}
