'use client'

import { useActionState, useState } from 'react'
import { requestAccessAction, type AccessFormState } from '@/actions/access'
import { ACCESS_REQUEST_PURPOSES } from '@/collections/AccessRequests'
import { SCOPES_BY_PURPOSE } from '@/lib/dictionaries'
import { Select } from '@/components/Select'
import { ScopeChecklist } from '@/components/ScopeChecklist'

/**
 * Запрос доступа к закрытой карточке.
 *
 * Цель спрашивается не для отчётности: владелец решает по ней. «Хочу купить»
 * и «пишу диссертацию» — разные разговоры, и без этой строки хозяйству
 * пришлось бы гадать или отказывать по умолчанию.
 *
 * Области заявитель называет сам, но выбор цели их переставляет: «покупка»
 * отмечает всё, «проверка происхождения» — одну родословную. Это не догадка
 * за человека, а подсказка о соразмерности: просьба «откройте всё» на цели
 * «проверка происхождения» будет заметна обоим.
 *
 * Смена цели перезаписывает отметки, и это осознанно. Порядок в форме
 * сверху вниз: сначала зачем, потом что. Человек, который сперва наставил
 * галочек, а потом поменял цель, скорее всего уточняет замысел, а не теряет
 * работу — галочек четыре, поставить их заново стоит двух секунд.
 */
export function AccessRequestForm({
  animalId,
  ownerName,
}: {
  animalId: number
  ownerName: string
}) {
  const [state, formAction, pending] = useActionState<AccessFormState, FormData>(
    requestAccessAction,
    {},
  )

  const [purpose, setPurpose] = useState('purchase')
  const [scopes, setScopes] = useState<string[]>([...(SCOPES_BY_PURPOSE.purchase ?? [])])

  const sent = Boolean(state.message)

  const changePurpose = (value: string) => {
    setPurpose(value)
    setScopes([...(SCOPES_BY_PURPOSE[value] ?? [])])
  }

  const toggle = (value: string) =>
    setScopes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )

  return (
    <form action={formAction} className="card">
      <h2 className="panel-heading">Запросить доступ у хозяйства</h2>

      <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Запрос уйдёт в личный кабинет {ownerName}. Решение принимает хозяйство — Ассоциация
        не открывает чужие данные за владельца. Ответ придёт в ваши уведомления.
      </p>

      <input type="hidden" name="animal" value={animalId} />

      <label className="block text-[14px]">
        <span className="mb-1.5 block text-ink-700">Зачем нужен доступ</span>
        <Select
          name="purpose"
          options={ACCESS_REQUEST_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
          defaultValue={purpose}
          placeholder=""
          onLight
          ariaLabel="Зачем нужен доступ"
          onChange={changePurpose}
        />
      </label>

      <fieldset className="mt-4">
        <legend className="mb-2 text-[14px] text-ink-700">Что нужно посмотреть</legend>
        <ScopeChecklist selected={scopes} onToggle={toggle} disabled={sent} />
        <p className="mt-2 text-[13px] leading-snug text-ink-500">
          Отмечено то, что обычно нужно для выбранной цели. Просите столько, сколько
          действительно посмотрите: соразмерную просьбу открывают охотнее.
        </p>
      </fieldset>

      <label className="mt-4 block text-[14px]">
        <span className="mb-1.5 block text-ink-700">
          Сообщение хозяйству <span className="text-ink-500">— необязательно</span>
        </span>
        <textarea
          name="comment"
          rows={3}
          maxLength={600}
          disabled={sent}
          placeholder="Например: подбираем быка для стада, интересует оценка экстерьера дочерей"
          className="field field-on-light"
        />
      </label>

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}
      {state.message && (
        <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[14px] text-forest-600">
          {state.message}
        </p>
      )}

      {!sent && (
        <button
          type="submit"
          className="btn btn-accent mt-6"
          disabled={pending || scopes.length === 0}
        >
          {pending ? 'Отправляем…' : 'Отправить запрос'}
        </button>
      )}
    </form>
  )
}
