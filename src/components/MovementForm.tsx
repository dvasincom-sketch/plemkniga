'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { AnimalPicker } from '@/components/AnimalPicker'
import { DateField } from '@/components/DateField'
import { Select } from '@/components/Select'
import {
  recordMovementAction,
  searchCounterpartyAction,
  type CounterpartyMatch,
  type MovementFormState,
} from '@/actions/movements'
import { MOVEMENT_KINDS, type MovementKind } from '@/lib/movements'
import { REGIONS } from '@/lib/dictionaries'

/**
 * Запись перемещения животного.
 *
 * ## Почему вид выбирается первым
 *
 * От вида зависит всё остальное: у продажи есть покупатель, у выбраковки
 * его нет, у перевода вместо хозяйства площадка. Форма, показывающая
 * все поля сразу, заставляет человека решать, какие из них к нему
 * относятся, — а он пришёл записать продажу, а не разбираться в модели
 * данных.
 *
 * ## Почему сказано, что произойдёт
 *
 * Продажа меняет владельца, и после неё карточку правит покупатель.
 * Это необратимо силами хозяйства: вернуть животное себе можно будет
 * только через Ассоциацию. Правило книги — последствия называются
 * до нажатия (docs/interfeys.md), и здесь оно важнее, чем где-либо:
 * ошибиться видом перемещения легко, а откатить трудно.
 */
export function MovementForm({
  herds,
  defaultAnimal,
}: {
  herds: { value: string; label: string }[]
  defaultAnimal?: number
}) {
  const [state, formAction, pending] = useActionState<MovementFormState, FormData>(
    recordMovementAction,
    {},
  )
  const [kind, setKind] = useState<MovementKind>('sale')

  const needsCounterparty = kind === 'sale' || kind === 'import' || kind === 'lease'
  const changesOwner = kind === 'sale' || kind === 'import'

  const today = new Date().toISOString().slice(0, 10)

  return (
    <form action={formAction} className="card">
      <h2 className="panel-heading">Что произошло</h2>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <label className="block text-[14px]">
          Вид перемещения
          <Select
            name="kind"
            ariaLabel="Вид перемещения"
            onLight
            placeholder=""
            defaultValue={kind}
            className="mt-1.5 min-w-[280px]"
            options={MOVEMENT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            onChange={(v) => setKind(v as MovementKind)}
          />
          <span className="mt-1.5 block max-w-[42ch] text-[13px] leading-snug text-ink-500">
            {MOVEMENT_KINDS.find((k) => k.value === kind)?.hint}
          </span>
        </label>

        <label className="block text-[14px]">
          Дата
          <DateField
            name="date"
            required
            ariaLabel="Дата перемещения"
            max={today}
            rangeHint="Перемещение нельзя записать будущей датой"
            className="mt-1.5 w-[22ch]"
          />
        </label>
      </div>

      <div className="mt-6 max-w-[52ch]">
        {defaultAnimal ? (
          <input type="hidden" name="animal" value={defaultAnimal} />
        ) : (
          <AnimalPicker name="animal" label="Животное" required />
        )}
      </div>

      {needsCounterparty && (
        <div className="mt-6">
          <CounterpartyPicker
            label={kind === 'import' ? 'От кого поступило' : 'Кому'}
            hint={
              kind === 'import'
                ? 'Хозяйство, из которого пришло животное. Если его нет в книге — впишите название.'
                : 'Найдите хозяйство по названию или ИНН. Если его нет в книге — впишите название, карточка заведётся сама.'
            }
          />
        </div>
      )}

      {(kind === 'transfer' || kind === 'sale' || kind === 'import') && herds.length > 0 && (
        <label className="mt-6 block text-[14px]">
          {kind === 'transfer' ? 'В какое стадо' : 'В стадо (если известно)'}
          <Select
            name="toHerd"
            ariaLabel="Стадо назначения"
            onLight
            placeholder="Не указано"
            className="mt-1.5 min-w-[240px]"
            options={herds}
          />
        </label>
      )}

      <label className="mt-6 block text-[14px]">
        Основание
        <input
          name="basis"
          placeholder="Накладная № 114 от 12.08.2026"
          className="field field-on-light mt-1.5 block w-full max-w-[42ch]"
        />
        <span className="mt-1.5 block text-[13px] leading-snug text-ink-500">
          Номер договора, накладной или ветеринарного свидетельства. По нему через год
          отличат сделку от опечатки.
        </span>
      </label>

      <label className="mt-5 block text-[14px]">
        Примечание
        <textarea
          name="note"
          rows={2}
          className="field field-on-light mt-1.5 block w-full max-w-[52ch]"
        />
      </label>

      {changesOwner && (
        /*
           Не предупреждение об опасности, а описание последствия. Красным
           здесь было бы нечестно: продажа — обычная операция, а не ошибка.
        */
        <p className="mt-6 max-w-[70ch] rounded-md bg-[#f6f6f6] p-4 text-[14px] leading-relaxed text-ink-700">
          {kind === 'sale' ? (
            <>
              После записи карточку ведёт покупатель: вы перестанете её править и она уйдёт
              из вашего списка стада. Всё, что вы внесли до этой даты, — отёлы, дойки,
              осеменения — останется вам видимым навсегда. Вернуть животное себе можно
              будет только через Ассоциацию.
            </>
          ) : (
            <>
              После записи животное станет вашим: карточку ведёте вы, история прежнего
              хозяйства остаётся при ней и видна вам целиком — ради неё животное
              и покупают.
            </>
          )}
        </p>
      )}

      {state.error && <p className="mt-4 text-[14px] text-red-700">{state.error}</p>}
      {state.message && (
        <div className="mt-4">
          <p className="text-[14px] text-forest-600">{state.message}</p>
          {state.createdCounterparty && (
            <p className="mt-1 max-w-[70ch] text-[13px] leading-snug text-ink-500">
              Хозяйства «{state.createdCounterparty}» в книге не было — карточка заведена
              и отправлена в Ассоциацию на проверку. Если это хозяйство уже есть под другим
              написанием, Ассоциация сольёт карточки, и перемещение переедет на основную.
            </p>
          )}
        </div>
      )}

      <button type="submit" className="btn btn-accent mt-6" disabled={pending}>
        {pending ? 'Записываем…' : 'Записать перемещение'}
      </button>
    </form>
  )
}

/**
 * Выбор контрагента с возможностью завести карточку.
 *
 * ## Почему поиск, а не список
 *
 * Хозяйств в книге сотни, а через год будут тысячи, и половина из них —
 * карточки, заведённые такими же продавцами. Список из тысячи строк
 * не выбирают, в нём не находят — и заводят тысяча первую.
 *
 * ## Почему создание спрятано за «не нашлось»
 *
 * Кнопка «завести новое хозяйство», стоящая рядом с полем поиска, нажимается
 * раньше, чем поиск успевает ответить, — и справочник наполняется дублями
 * не по злому умыслу, а по скорости руки. Здесь завести карточку предлагается
 * только после того, как поиск ничего не нашёл.
 */
function CounterpartyPicker({ label, hint }: { label: string; hint: string }) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<CounterpartyMatch[]>([])
  const [chosen, setChosen] = useState<CounterpartyMatch | null>(null)
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    if (chosen) return
    const q = query.trim()
    if (q.length < 2) {
      setMatches([])
      return
    }
    const ticket = ++latest.current
    setSearching(true)
    const timer = setTimeout(() => {
      searchCounterpartyAction(q)
        .then((r) => {
          /* Ответы приходят не в том порядке, в каком ушли: показываем последний
             отправленный, а не последний пришедший — иначе список моргает
             позавчерашним запросом. Тот же приём в `AnimalPicker`. */
          if (ticket !== latest.current) return
          setMatches(r)
        })
        .finally(() => {
          if (ticket === latest.current) setSearching(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [query, chosen])

  if (chosen) {
    return (
      <div className="text-[14px]">
        <span className="block">{label}</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="font-medium">{chosen.name}</span>
          {chosen.inn && <span className="text-[13px] text-ink-500 tabular-nums">ИНН {chosen.inn}</span>}
          {chosen.referenced && (
            <span className="text-[13px] text-ink-500">карточку завёл контрагент</span>
          )}
          <button
            type="button"
            onClick={() => {
              setChosen(null)
              setQuery('')
            }}
            className="text-[13px] underline underline-offset-4"
          >
            изменить
          </button>
        </div>
        <input type="hidden" name="counterparty" value={chosen.id} />
      </div>
    )
  }

  if (creating) {
    return (
      <div className="max-w-[52ch] text-[14px]">
        <span className="block">{label} — новое хозяйство</span>
        <input
          name="counterpartyName"
          defaultValue={query}
          placeholder="ООО «Заря»"
          className="field field-on-light mt-1.5 block w-full"
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <input
            name="counterpartyInn"
            placeholder="ИНН"
            inputMode="numeric"
            className="field field-on-light w-[20ch]"
          />
          <select name="counterpartyRegion" className="field field-on-light w-[26ch]">
            <option value="">Регион не указан</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-500">
          ИНН стоит вписать: по нему Ассоциация отличит новое хозяйство от того,
          что уже есть в книге под другим написанием. Без него разбирать придётся руками.
        </p>
        <button
          type="button"
          onClick={() => setCreating(false)}
          className="mt-3 text-[13px] underline underline-offset-4"
        >
          вернуться к поиску
        </button>
      </div>
    )
  }

  const nothing = query.trim().length >= 2 && !searching && matches.length === 0

  return (
    <div className="max-w-[52ch] text-[14px]">
      <label className="block">
        {label}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название или ИНН"
          className="field field-on-light mt-1.5 block w-full"
          autoComplete="off"
        />
      </label>
      <span className="mt-1.5 block text-[13px] leading-snug text-ink-500">{hint}</span>

      {matches.length > 0 && (
        <ul className="mt-2 divide-y divide-[#e6e6e6] rounded-md border border-[#e6e6e6]">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setChosen(m)}
                className="block w-full px-3 py-2 text-left hover:bg-[#f6f6f6]"
              >
                <span className="block">{m.name}</span>
                <span className="block text-[13px] text-ink-500">
                  {[m.inn ? `ИНН ${m.inn}` : null, m.region, m.referenced ? 'книгу не ведёт' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {nothing && (
        <div className="mt-2 rounded-md bg-[#f6f6f6] p-3">
          <p className="text-[13px] leading-snug text-ink-700">
            Такого хозяйства в книге нет.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-2 text-[13px] underline underline-offset-4"
          >
            Завести карточку «{query.trim()}»
          </button>
        </div>
      )}
    </div>
  )
}
