'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { requestVerificationAction, type VerificationState } from '@/actions/verification'
import { VERIFICATION_LIMIT } from '@/lib/verification-limit'
import { trustLabel } from '@/lib/dictionaries'

type Row = {
  id: number
  identNumber: string
  name?: string | null
  birthDate?: string | null
  trustLevel?: number | null
  ready: boolean
  missing: string[]
}

/**
 * Подача животных на верификацию.
 *
 * Список не «все мои животные», а те, которым есть куда расти: уже
 * подтверждённые сюда не попадают — подавать их незачем, а в длинном списке
 * они мешают.
 *
 * Рядом с каждой записью — готова ли она. Готовность считается тем же
 * расчётом, что и для свидетельства: если у животного нет даты рождения
 * и породы, эксперт всё равно вернёт заявку, и лучше это увидеть здесь,
 * чем через неделю ожидания. Подать неготовое можно — запрета нет: бывает,
 * что хозяйство знает про свои данные больше, чем система.
 */
export function VerificationForm({ rows }: { rows: Row[] }) {
  const [state, formAction, pending] = useActionState<VerificationState, FormData>(
    requestVerificationAction,
    {},
  )
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const pickReady = () => setPicked(new Set(rows.filter((r) => r.ready).map((r) => r.id)))

  if (state.createdId) {
    return (
      <div className="card">
        <h2 className="panel-heading">Заявка подана</h2>
        <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Ассоциация разберёт её и вынесет заключение. Записи, по которым будут замечания
          «требует исправления», останутся с прежним уровнем достоверности — вы увидите список
          с причинами. Остальные получат уровень «Верифицировано ассоциацией».
        </p>
        <Link href="/account?tab=events" className="btn btn-accent">
          К списку заявок
        </Link>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="card">
        <h2 className="panel-heading">Подавать нечего</h2>
        <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Все записи вашего стада уже имеют уровень «Верифицировано ассоциацией» — либо
          в стаде пока нет животных.
        </p>
      </div>
    )
  }

  const overLimit = picked.size > VERIFICATION_LIMIT

  return (
    <form action={formAction} className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="panel-heading">Выберите записи</h2>
        <button
          type="button"
          onClick={pickReady}
          className="text-[14px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
        >
          отметить все готовые
        </button>
      </div>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Выбрано: {picked.size} из {rows.length}. За раз можно подать до {VERIFICATION_LIMIT}{' '}
        записей — заявку разбирает человек, и слишком длинная просто встанет в очереди.
      </p>

      <div className="max-h-[32rem] overflow-auto">
        <table className="metric-table">
          <thead>
            <tr>
              <th className="w-10"> </th>
              <th>Индивидуальный №</th>
              <th>Кличка</th>
              <th>Достоверность</th>
              <th>Готовность</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    name="animals"
                    value={r.id}
                    checked={picked.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Подать ${r.identNumber}`}
                  />
                </td>
                <td>
                  <Link
                    href={`/animals/${r.id}`}
                    className="underline underline-offset-4 hover:text-forest-500"
                  >
                    {r.identNumber}
                  </Link>
                </td>
                <td>{r.name || '—'}</td>
                <td className="text-ink-500">{trustLabel(r.trustLevel)}</td>
                <td className={r.ready ? 'text-forest-500' : 'text-amber-700'}>
                  {r.ready ? 'готова' : `не хватает: ${r.missing.join(', ')}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">Зачем подаёте</span>
          <select name="purpose" defaultValue="trust" className="field field-on-light">
            <option value="trust">Повысить достоверность записей</option>
            <option value="certificate">Подготовить к выпуску свидетельства</option>
            <option value="membership">Подтвердить племенной статус хозяйства</option>
          </select>
        </label>

        <label className="block text-[14px]">
          <span className="mb-1.5 block text-ink-700">
            Сообщение Ассоциации <span className="text-ink-500">— необязательно</span>
          </span>
          <textarea name="comment" rows={2} className="field field-on-light" />
        </label>
      </div>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}
      {overLimit && (
        <p className="mt-4 text-[14px] text-red-700">
          Отмечено {picked.size} — это больше {VERIFICATION_LIMIT}. Снимите лишние или подайте
          двумя заявками.
        </p>
      )}

      <button
        type="submit"
        className="btn btn-accent mt-6"
        disabled={pending || picked.size === 0 || overLimit}
      >
        {pending ? 'Отправляем…' : `Подать на верификацию${picked.size ? ` · ${picked.size}` : ''}`}
      </button>
    </form>
  )
}
