'use client'

import { useEffect, useRef, useState } from 'react'
import { searchHerdAction, type HerdMatch } from '@/actions/herd-lookup'

/**
 * Выбор животного из своего стада по номеру или кличке.
 *
 * ## Почему не `Select` и не `ComboBox`
 *
 * Оба берут готовый список вариантов. У хозяйства их три тысячи: список
 * пришлось бы грузить целиком на каждое открытие формы, и человек всё равно
 * искал бы в нём глазами. Здесь наоборот — сначала печатают, потом видят
 * несколько подходящих.
 *
 * ## Что важнее вида
 *
 * **В форму уходит идентификатор, а не текст.** Скрытое поле появляется
 * только когда животное выбрано из списка. Набранный, но не выбранный
 * номер не отправляется вовсе: «похоже на 4821» — это не выбор, и записать
 * событие на догадку нельзя.
 *
 * **Выбор видно и после выбора.** Выбранное животное показано строкой
 * с кнопкой «изменить», а не молча оставшимся в поле текстом. Форма,
 * по которой нельзя понять, что именно выбрано, — обычная причина событий,
 * записанных не на то животное.
 *
 * Порядок ответов сторожится счётчиком, как в `ParentNumber`: серверное
 * действие отменить нельзя, а ответы приходят не в том порядке, в каком
 * ушли, и показывать последний **пришедший** значит иногда показывать
 * позавчерашний.
 */

const DEBOUNCE_MS = 300

export function AnimalPicker({
  name,
  label,
  sex,
  exclude,
  hint,
  required = false,
}: {
  name: string
  label: string
  sex?: 'male' | 'female'
  exclude?: number
  hint?: string
  required?: boolean
}) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<HerdMatch[]>([])
  const [chosen, setChosen] = useState<HerdMatch | null>(null)
  const [searching, setSearching] = useState(false)
  const [touched, setTouched] = useState(false)

  const latest = useRef(0)

  useEffect(() => {
    if (chosen) return

    const q = query.trim()
    if (q.length < 2) {
      setMatches([])
      setSearching(false)
      return
    }

    setSearching(true)
    const ticket = ++latest.current

    const timer = setTimeout(async () => {
      try {
        const res = await searchHerdAction({ query: q, sex, exclude })
        if (ticket === latest.current) {
          setMatches(res)
          setSearching(false)
        }
      } catch {
        if (ticket === latest.current) {
          setMatches([])
          setSearching(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, sex, exclude, chosen])

  if (chosen) {
    return (
      <div className="block text-[14px]">
        <span className="mb-1.5 block text-ink-700">{label}</span>
        <input type="hidden" name={name} value={chosen.id} />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-canvas px-3 py-2.5">
          <span className="font-medium">{chosen.title}</span>
          {chosen.hint && <span className="text-[13px] text-ink-500">{chosen.hint}</span>}
          <button
            type="button"
            onClick={() => {
              setChosen(null)
              setQuery('')
              setMatches([])
            }}
            className="ml-auto text-[13px] text-ink-500 underline underline-offset-4"
          >
            изменить
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="block text-[14px]">
      <span className="mb-1.5 block text-ink-700">{label}</span>

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setTouched(true)
        }}
        placeholder="Номер или кличка"
        autoComplete="off"
        className="field field-on-light"
      />

      {matches.length > 0 && (
        <ul className="mt-1.5 overflow-hidden rounded-lg bg-white shadow-[0_2px_10px_rgb(23_24_26_/_0.10)]">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setChosen(m)}
                className="flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors hover:bg-[#f6f6f6]"
              >
                <span>{m.title}</span>
                {m.hint && <span className="text-[13px] text-ink-500">{m.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 min-h-[18px] text-[13px] leading-snug text-ink-500">
        {searching && 'Ищем в стаде…'}
        {!searching && touched && query.trim().length >= 2 && matches.length === 0 && (
          <>В вашем стаде такого номера нет. Проверьте номер или заведите карточку.</>
        )}
        {!searching && (!touched || query.trim().length < 2) && hint}
      </div>

      {/*
         Пустое обязательное поле ловится браузером до отправки. Скрытого
         input с идентификатором ещё нет, поэтому проверять нечего — эта
         заглушка и есть проверка: пока животное не выбрано, форма
         не отправится.
      */}
      {required && !chosen && (
        <input
          tabIndex={-1}
          required
          value=""
          onChange={() => {}}
          aria-hidden="true"
          className="h-0 w-0 border-0 p-0 opacity-0"
        />
      )}
    </div>
  )
}
