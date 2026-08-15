'use client'

import { useState } from 'react'
import {
  AGE_GROUPS,
  ID_FORMATS,
  RELATIONS,
  SEXES,
  STATES,
  TRUST_LEVELS,
} from '@/lib/dictionaries'
import { ADVANCED_FIELDS } from '@/lib/animal-query'
import { Select } from './Select'

type Herd = { id: number; name: string }

export type SearchPanelProps = {
  action: string
  total: number
  herds: Herd[]
  /** Показывать поле «Владелец» (только в публичной книге). */
  withOwner?: boolean
  defaults: Record<string, string>
  /** Подпись счётчика: в книге это вся база, в кабинете — одно хозяйство. */
  totalLabel?: string
  openAdvanced?: boolean
  /** Скрытые поля, которые нужно сохранить при GET-сабмите (например, вкладка). */
  hidden?: Record<string, string>
}

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

export function SearchPanel({
  action,
  total,
  herds,
  withOwner = false,
  defaults,
  totalLabel = 'Всего животных',
  openAdvanced = false,
  hidden,
}: SearchPanelProps) {
  const [advanced, setAdvanced] = useState(openAdvanced)
  const d = (k: string) => defaults[k] ?? ''

  return (
    <form
      method="GET"
      action={action}
      className="rounded-card bg-forest-500 px-6 py-7 text-white sm:px-8 sm:py-8"
    >
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[28px] font-medium sm:text-[32px]">Поиск среди животных</h2>
        <p className="text-sm text-white/85">
          {totalLabel}: <span className="font-medium">{total.toLocaleString('ru-RU')}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <input
          name="id"
          defaultValue={d('id')}
          placeholder="Поиск по ID"
          className="field md:col-span-5"
        />
        <Select
          name="idFormat"
          ariaLabel="ID-формат"
          placeholder="ID-формат"
          defaultValue={d('idFormat')}
          options={ID_FORMATS.map((o) => ({ value: o.value, label: o.label }))}
          className="md:col-span-3"
        />
        <input
          name="name"
          defaultValue={d('name')}
          placeholder="Поиск по кличке"
          className="field md:col-span-4"
        />

        <Select
          name="sex"
          ariaLabel="Пол"
          placeholder="Пол"
          defaultValue={d('sex')}
          options={SEXES.map((o) => ({ value: o.value, label: o.full }))}
          className="md:col-span-3"
        />
        <Select
          name="ageGroup"
          ariaLabel="Возраст"
          placeholder="Возраст"
          defaultValue={d('ageGroup')}
          options={AGE_GROUPS.map((o) => ({ value: o.value, label: o.label }))}
          className="md:col-span-3"
        />
        <Select
          name="state"
          ariaLabel="Статус"
          placeholder="Статус"
          defaultValue={d('state')}
          options={STATES.map((o) => ({ value: o.value, label: o.full }))}
          className="md:col-span-3"
        />
        <Select
          name="relation"
          ariaLabel="Родственная связь"
          placeholder="Родственная связь"
          defaultValue={d('relation')}
          options={RELATIONS.filter((r) => r.value !== 'any').map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          className="md:col-span-3"
        />

        {withOwner && (
          <input
            name="owner"
            defaultValue={d('owner')}
            placeholder="Владелец"
            className="field md:col-span-3"
          />
        )}
        <Select
          name="herd"
          ariaLabel="Стадо"
          placeholder="Стадо"
          defaultValue={d('herd')}
          options={herds.map((h) => ({ value: String(h.id), label: h.name }))}
          className={withOwner ? 'md:col-span-3' : 'md:col-span-6'}
        />
        <input
          name="author"
          defaultValue={d('author')}
          placeholder="Автор записи"
          className="field md:col-span-3"
        />
        <button type="submit" className="btn btn-accent w-full md:col-span-3">
          Искать
          <SearchIcon />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="mt-5 flex items-center gap-2 text-sm text-white/90 hover:text-white"
        aria-expanded={advanced}
      >
        {advanced ? 'Скрыть расширенный фильтр' : 'Открыть расширенный фильтр'}
        <Chevron open={advanced} />
      </button>

      {advanced && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-6">
            {ADVANCED_FIELDS.map((f) => (
              <label key={f.name} className="block">
                <span className="mb-1.5 block text-xs text-white/90">{f.label}</span>
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
              </label>
            ))}
          </div>

          {/*
             Диапазон ИПЦ и уровень достоверности стоят в одной строке
             намеренно: вопрос «насколько животное ценно» и вопрос «насколько
             этой цифре можно верить» — части одного решения, и разносить их
             по разным блокам значит предлагать отбор по индексу без оглядки
             на то, кем он подтверждён.
          */}
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-4">
            <div>
              <span className="mb-1.5 block text-xs text-white/90">Индекс племенной ценности</span>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    { name: 'ipcFrom', prefix: 'от', ph: '−00000,0' },
                    { name: 'ipcTo', prefix: 'до', ph: '+00000,0' },
                  ] as const
                ).map((f) => (
                  <span
                    key={f.name}
                    className="flex w-[160px] items-center overflow-hidden rounded-lg bg-white"
                  >
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

            <label className="block">
              <span className="mb-1.5 block text-xs text-white/90">
                Уровень достоверности данных
              </span>
              {/*
                 Отбор идёт «не ниже выбранного»: уровни — это ступени проверки,
                 и запись, верифицированная Ассоциацией, отвечает и более мягкому
                 условию. Точное совпадение здесь давало бы пустые списки там,
                 где данные лучше запрошенного.
              */}
              <Select
                name="trust"
                ariaLabel="Уровень достоверности данных"
                placeholder="Любой"
                defaultValue={d('trust')}
                options={[...TRUST_LEVELS]
                  .reverse()
                  .filter((t) => Number(t.value) >= 0)
                  .map((t) => ({
                    value: t.value,
                    label: `${t.value} — ${t.label}${Number(t.value) < 3 ? ' и выше' : ''}`,
                  }))}
                className="w-[320px]"
              />
            </label>
          </div>
        </div>
      )}
    </form>
  )
}
