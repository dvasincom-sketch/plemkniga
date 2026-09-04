'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'
import { TRAIT_BASE, type TraitKey } from '@/lib/breeding-index'
import {
  saveProfileAction,
  deleteProfileAction,
  type FormState,
} from '@/actions/index-profiles'

/**
 * Редактор весов профиля.
 *
 * Веса задаются процентами влияния — так же, как их даёт хозяйствам Lactanet
 * в персональном LPI. Экономический способ (рубли на единицу признака) оставлен
 * переключателем: он честнее, но требует цифр, которых у хозяйства обычно нет
 * под рукой — цены молока с надбавками, стоимости нетели, цены случая мастита.
 *
 * Рядом с каждым признаком стоит официальный вес Ассоциации. Это не украшение:
 * без точки отсчёта «двадцать процентов на белок» ни о чём не говорит, а рядом
 * с «четырнадцатью у Ассоциации» сразу видно, что давление усилено в полтора
 * раза. Тот же приём в pLPI.
 *
 * Сумма считается на лету и не блокирует сохранение: при расчёте веса всё
 * равно приводятся к ста процентам, и запрещать сохранение из-за суммы 98
 * значило бы придираться к арифметике вместо помощи.
 */

export type EditorProfile = {
  id: number | string
  name: string
  hint: string
  kind: 'selection' | 'economic'
  weights: Partial<Record<TraitKey, number>>
  isDefault: boolean
}

export function ProfileEditor({
  profile,
  official,
}: {
  profile: EditorProfile
  /** Официальные веса Ассоциации для сравнения, в процентах. */
  official: Partial<Record<TraitKey, number>>
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveProfileAction, {})
  const [kind, setKind] = useState(profile.kind)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TRAIT_BASE.map((t) => [t.key, String(profile.weights[t.key] ?? 0)])),
  )

  const nums = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => {
          const n = Number(String(v).replace(',', '.'))
          return [k, Number.isFinite(n) ? n : 0]
        }),
      ) as Record<TraitKey, number>,
    [values],
  )

  const sum = useMemo(
    () => Object.values(nums).reduce((a, n) => a + Math.abs(n), 0),
    [nums],
  )
  const max = Math.max(...Object.values(nums).map(Math.abs), 1)

  /** Привести к сотне, сохранив пропорции: обычная просьба после правки двух весов. */
  const rescale = () => {
    if (!sum) return
    setValues(
      Object.fromEntries(
        Object.entries(nums).map(([k, n]) => [k, String(Math.round((n / sum) * 100))]),
      ),
    )
  }

  const off = kind === 'selection'
  const rounded = Math.round(sum)

  return (
    <form action={formAction} className="mt-8">
      <input type="hidden" name="id" value={String(profile.id)} />
      <input type="hidden" name="kind" value={kind} />

      {/* ----------------------------- Название ---------------------------- */}
      <section className="card">
        <h2 className="panel-heading">Название и назначение</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-500">Название профиля</span>
            <input name="name" defaultValue={profile.name} required className="field field-on-light w-full" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-ink-500">Какое узкое место закрывает</span>
            <input
              name="hint"
              defaultValue={profile.hint}
              placeholder="Например: сдаём на сыр, белок дороже жира"
              className="field field-on-light w-full"
            />
          </label>
        </div>

        <fieldset className="mt-6">
          <legend className="mb-2 text-sm text-ink-500">Вид весов</legend>
          <div className="flex flex-wrap gap-3">
            {(
              [
                {
                  value: 'selection' as const,
                  title: 'Проценты влияния',
                  hint: 'Доли давления на признаки, в сумме 100. Так устроены TPI и LPI',
                },
                {
                  value: 'economic' as const,
                  title: 'Рубли на единицу',
                  hint: 'Индекс получается в деньгах. Требует цен: молоко с надбавками, нетель, случай мастита',
                },
              ]
            ).map((o) => (
              <label
                key={o.value}
                className={`max-w-[330px] flex-1 cursor-pointer rounded-xl border p-4 transition-colors ${
                  kind === o.value
                    ? 'border-forest-500 bg-brand-50'
                    : 'border-ink-100 hover:border-ink-300'
                }`}
              >
                <input
                  type="radio"
                  name="kindChoice"
                  className="sr-only"
                  checked={kind === o.value}
                  onChange={() => setKind(o.value)}
                />
                <span className="block text-[15px] font-medium">{o.title}</span>
                <span className="mt-1 block text-[13px] leading-snug text-ink-500">{o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* ------------------------------- Веса ------------------------------ */}
      <section className="card mt-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <h2 className="panel-heading !mb-1">Веса признаков</h2>
            <p className="max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
              Отрицательный вес допустим и означает давление в обратную сторону. У Ассоциации
              такой стоит на композите тела: крупная корова дороже в содержании, и селекция
              на рост тела снижает пожизненную прибыль.
            </p>
          </div>

          {off && (
            <div className="flex-none rounded-xl bg-canvas px-4 py-3 text-right">
              <p className="text-[12px] text-ink-500">Сумма влияний</p>
              <p
                className={`text-[20px] font-medium tabular-nums ${
                  rounded === 100 ? 'text-forest-600' : 'text-ink-900'
                }`}
              >
                {rounded} %
              </p>
              {rounded !== 100 && (
                <button
                  type="button"
                  onClick={rescale}
                  className="mt-1 text-[13px] underline underline-offset-4 hover:text-forest-500"
                >
                  привести к 100
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="data-table w-full min-w-[620px]">
            <thead>
              <tr>
                <th className="text-left">Признак</th>
                <th className="w-[110px] text-right">{off ? 'Влияние, %' : 'Рублей'}</th>
                <th className="w-[40%] text-left">Соотношение</th>
                <th className="w-[110px] text-right">У Ассоциации</th>
              </tr>
            </thead>
            <tbody>
              {TRAIT_BASE.map((t) => {
                const n = nums[t.key] ?? 0
                const width = (Math.abs(n) / max) * 100
                const o = official[t.key] ?? 0
                return (
                  <tr key={t.key}>
                    <td>
                      <span className="text-[15px]">{t.label}</span>
                      <span className="ml-1.5 text-[13px] text-ink-500">{t.unit}</span>
                      {t.inverted && (
                        <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-500">
                          рост — ухудшение
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <input
                        name={`w_${t.key}`}
                        inputMode="decimal"
                        value={values[t.key] ?? '0'}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [t.key]: e.target.value }))
                        }
                        className="field field-on-light w-[92px] text-right tabular-nums"
                      />
                    </td>
                    <td>
                      <div className="row-bar h-[8px] rounded-full bg-ink-100">
                        <div
                          style={{ width: `${width}%` }}
                          className={`h-full rounded-full ${n < 0 ? 'bg-[#c0392b]' : 'bg-forest-500'}`}
                        />
                      </div>
                    </td>
                    <td className="text-right tabular-nums text-ink-500">
                      {o ? `${o > 0 ? '+' : ''}${o.toFixed(0)} %` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {state.error && <p className="mt-5 text-sm text-red-700">{state.error}</p>}
        {state.message && <p className="mt-5 text-sm text-forest-600">{state.message}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <button type="submit" className="btn btn-accent" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить профиль'}
          </button>
          <Link
            href="/account/indices"
            className="text-[15px] underline underline-offset-4 hover:text-forest-500"
          >
            Ко всем профилям
          </Link>
        </div>
      </section>

      {/* ------------------------------ Удаление --------------------------- */}
      <section className="mt-6 rounded-card bg-white p-6 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
        <h2 className="text-[16px] font-medium">Удалить профиль</h2>
        <p className="mt-1.5 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
          {profile.isDefault
            ? 'Профиль основной: после удаления индекс начнёт считаться по стандартному профилю Ассоциации, и порядок животных в книге изменится.'
            : 'Выпущенные документы, где указан этот профиль, останутся — в них хранится сам набор весов, а не ссылка.'}
        </p>
        <button
          type="submit"
          formAction={deleteProfileAction}
          formNoValidate
          className="mt-4 text-[14px] text-[#c0392b] underline underline-offset-4"
        >
          Удалить
        </button>
      </section>
    </form>
  )
}
