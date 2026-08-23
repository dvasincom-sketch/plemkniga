'use client'

import { useActionState, useState } from 'react'
import {
  confirmReferencedOrgAction,
  mergeOrganizationsAction,
  searchCounterpartyAction,
  type CounterpartyMatch,
  type MovementFormState,
} from '@/actions/movements'

/**
 * Разбор карточки, заведённой контрагентом.
 *
 * У Ассоциации здесь ровно два ответа, и третьего быть не должно:
 * либо это настоящее хозяйство, которого в книге не было, либо это
 * то же самое хозяйство под другим написанием. Кнопка «удалить»
 * отсутствует намеренно: на карточку уже ссылается перемещение,
 * а перемещение — утверждение о том, чьё животное. Удалить одну
 * сторону сделки значит стереть половину факта.
 */
export function DirectoryReview({ id, name }: { id: number; name: string }) {
  const [mode, setMode] = useState<'idle' | 'merge'>('idle')

  if (mode === 'merge') return <MergeForm id={id} name={name} onCancel={() => setMode('idle')} />

  return (
    <div className="flex flex-wrap items-center gap-4">
      <ConfirmButton id={id} />
      <button
        type="button"
        onClick={() => setMode('merge')}
        className="text-[14px] underline underline-offset-4"
      >
        Это дубль
      </button>
    </div>
  )
}

function ConfirmButton({ id }: { id: number }) {
  const [state, formAction, pending] = useActionState<MovementFormState, FormData>(
    confirmReferencedOrgAction,
    {},
  )

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="btn btn-brand">
        {pending ? 'Отмечаем…' : 'Самостоятельное хозяйство'}
      </button>
      {state.error && <span className="ml-2 text-[13px] text-red-700">{state.error}</span>}
    </form>
  )
}

/**
 * Слияние: выбрать, с какой карточкой соединить.
 *
 * Поиск здесь тот же, что в форме перемещения, и это не совпадение —
 * задача одна: найти хозяйство среди похожих. Разные поиски в двух местах
 * означали бы, что оператор Ассоциации и хозяйство видят разные книги.
 */
function MergeForm({ id, name, onCancel }: { id: number; name: string; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<MovementFormState, FormData>(
    mergeOrganizationsAction,
    {},
  )
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<CounterpartyMatch[]>([])
  const [target, setTarget] = useState<CounterpartyMatch | null>(null)

  const search = async (q: string) => {
    setQuery(q)
    if (q.trim().length < 2) {
      setMatches([])
      return
    }
    const found = await searchCounterpartyAction(q)
    setMatches(found.filter((m) => m.id !== id))
  }

  return (
    <form action={formAction} className="max-w-[46ch] text-[14px]">
      <p className="text-ink-700">
        С какой карточкой соединить «{name}»? Перемещения и животные переедут на неё,
        а эта останется с отметкой «слито с» и пропадёт из поиска.
      </p>

      <input type="hidden" name="duplicate" value={id} />

      {target ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-medium">{target.name}</span>
          <button
            type="button"
            onClick={() => setTarget(null)}
            className="text-[13px] underline underline-offset-4"
          >
            изменить
          </button>
          <input type="hidden" name="target" value={target.id} />
        </div>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => void search(e.target.value)}
            placeholder="Название или ИНН основной карточки"
            className="field field-on-light mt-3 block w-full"
            autoComplete="off"
          />
          {matches.length > 0 && (
            <ul className="mt-2 divide-y divide-[#e6e6e6] rounded-md border border-[#e6e6e6]">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setTarget(m)}
                    className="block w-full px-3 py-2 text-left hover:bg-[#f6f6f6]"
                  >
                    <span className="block">{m.name}</span>
                    <span className="block text-[13px] text-ink-500">
                      {[m.inn ? `ИНН ${m.inn}` : null, m.region].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {state.error && <p className="mt-3 text-[13px] text-red-700">{state.error}</p>}
      {state.message && <p className="mt-3 text-[13px] text-forest-600">{state.message}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending || !target} className="btn btn-accent">
          {pending ? 'Сливаем…' : 'Слить'}
        </button>
        <button type="button" onClick={onCancel} className="text-[13px] underline underline-offset-4">
          отмена
        </button>
      </div>
    </form>
  )
}
