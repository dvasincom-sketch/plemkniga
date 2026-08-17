'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { lookupAnimalAction, type AnimalLookup } from '@/actions/lookup'

/**
 * Номер родителя с проверкой по книге на лету.
 *
 * Родителей переписывают со свидетельства номерами. Карточка предка может
 * быть в книге, а может и не быть — и то и другое нормально: связь
 * устанавливается по номеру, когда карточка появится.
 *
 * Ненормально другое: до сих пор человек не узнавал, нашёлся ли предок,
 * вообще никогда. Он вводил номер, сохранял, и дальше два исхода выглядели
 * одинаково — «карточки предка пока нет, свяжется потом» и «в номере
 * опечатка, не свяжется никогда». Второе обнаруживалось через месяцы,
 * когда родословная не строилась.
 *
 * Поэтому проверка идёт по ходу ввода и отвечает тремя разными состояниями,
 * а не двумя. «Не найдено» здесь не ошибка и не подсвечивается красным:
 * заводить животное с предком, которого нет в книге, — обычное дело.
 * Красным подсвечивать нечего, а сказать стоит.
 */

/**
 * Пауза после последнего нажатия.
 *
 * Полсекунды: меньше — и запрос уходит на каждой цифре пятнадцатизначного
 * номера, больше — и человек успевает перейти к следующему полю раньше
 * ответа. Проверка на лету, которая отвечает после ухода из поля,
 * бесполезна.
 */
const DEBOUNCE_MS = 500

/** Номер похож на законченный — раньше спрашивать не о чем. */
const looksComplete = (v: string): boolean => v.trim().length >= 6

export function ParentNumber({
  name,
  label,
  placeholder,
}: {
  name: string
  label: string
  placeholder?: string
}) {
  const [value, setValue] = useState('')
  const [state, setState] = useState<AnimalLookup | null>(null)
  const [checking, setChecking] = useState(false)

  /*
   * Номер запроса, а не отмена по AbortController.
   *
   * Серверное действие отменить нельзя, а ответы могут прийти не в том
   * порядке, в котором ушли: набрали номер, стёрли цифру, и ответ
   * на длинный номер приходит после ответа на короткий. Показывать
   * последний **пришедший** ответ значит иногда показывать позавчерашний.
   * Поэтому считается последний **отправленный**.
   */
  const latest = useRef(0)

  useEffect(() => {
    const ident = value.trim()

    if (!looksComplete(ident)) {
      setState(null)
      setChecking(false)
      return
    }

    setChecking(true)
    const ticket = ++latest.current

    const timer = setTimeout(async () => {
      try {
        const res = await lookupAnimalAction(ident)
        if (ticket === latest.current) {
          setState(res)
          setChecking(false)
        }
      } catch {
        if (ticket === latest.current) {
          setState(null)
          setChecking(false)
        }
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [value])

  return (
    <div className="block text-[14px]">
      <span className="mb-1.5 block text-ink-700">{label}</span>

      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="field field-on-light"
      />

      <div className="mt-1.5 min-h-[18px] text-[13px] leading-snug">
        {checking && <span className="text-ink-500">Ищем в книге…</span>}

        {!checking && state?.found && state.open && (
          <span className="text-forest-600">
            Есть в книге:{' '}
            {state.id ? (
              <Link
                href={`/animals/${state.id}`}
                target="_blank"
                className="underline underline-offset-4"
              >
                {state.name || state.identNumber}
              </Link>
            ) : (
              (state.name ?? state.identNumber)
            )}
            {state.owner && <span className="text-ink-500"> · {state.owner}</span>}
            {state.mine && <span className="text-ink-500"> · ваше</span>}
            {'. Связь установится сразу.'}
          </span>
        )}

        {!checking && state?.found && !state.open && (
          <span className="text-ink-700">
            Запись с таким номером в книге есть, но она закрыта владельцем. Связь
            установится — кличку покажет владелец, если откроет доступ.
          </span>
        )}

        {!checking && state && !state.found && (
          <span className="text-ink-500">
            В книге такого номера нет. Это не ошибка: запишем текстом, и связь
            установится сама, если карточка появится позже. Сверьте номер
            со свидетельством — опечатка не свяжется никогда.
          </span>
        )}
      </div>
    </div>
  )
}
