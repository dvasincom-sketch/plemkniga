'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from '@/lib/i18n/locales'

/**
 * Переключатель языка — свой раскрывающийся список.
 *
 * ## Как мы сюда пришли
 *
 * Сперва был ряд кнопок: шесть языков разными письмами, своё слово
 * находят глазами. Ряд переносился во вторую строку на телефоне
 * и отжимал вниз то, ради чего страницу открыли.
 *
 * Потом был родной `select` с убранным оформлением. Он решил ширину,
 * но решил наполовину: у `select` браузеру можно отдать только закрытую
 * часть, а **раскрытый список рисует система**. На нашей странице
 * посреди фирменных цветов открывалось серое окно операционки —
 * и выглядело оно чужим ровно в тот момент, когда на него смотрят.
 *
 * ## Чего это стоило
 *
 * Всего, что у родного `select` было даром. Ниже переписано руками
 * и перечислено поимённо, потому что забыть здесь легко, а проверить
 * трудно:
 *
 * - раскрытие по Enter, пробелу, стрелкам вниз и вверх;
 * - перебор стрелками, переход в начало и конец по Home и End;
 * - поиск набором первых букв («қа» находит «Қазақша»);
 * - закрытие по Esc с возвратом внимания на кнопку;
 * - закрытие при нажатии мимо и при уходе внимания со списка;
 * - объявление вслух как список: `listbox`, `option`, `aria-selected`;
 * - связь кнопки со списком через `aria-controls` и `aria-expanded`.
 *
 * Каждое из этого делают неправильно чаще, чем правильно, — потому
 * родной `select` и стоял здесь до сих пор. Меняем сознательно: список
 * из шести строк открывается на витрине, и чужое системное окно
 * на ней заметнее, чем неудобство, которого никто не заметит,
 * пока всё перечисленное работает.
 *
 * ## Почему `lang` на каждой строке
 *
 * Раскрытый список читается вслух подряд. Без пометки все шесть слов
 * пойдут одним произношением — тем, что у страницы, — и пять из шести
 * прозвучат неразборчиво. Это единственное место, где на одном экране
 * соседствуют шесть языков.
 *
 * ## Почему cookie, а не только адрес
 *
 * Адрес помнит язык этой страницы, cookie помнит выбор человека. Нужны
 * оба: по адресу ссылку пересылают коллеге, по cookie узнают язык
 * при следующем заходе на корень. `SameSite=Lax` и без `Secure`
 * в разработке: на localhost по http браузер молча выбросил бы
 * `Secure`-cookie, и выбор не сохранялся бы именно там, где его проверяют.
 */
export function LocaleSwitcher({
  active,
  label,
  hrefs,
  on = 'light',
}: {
  active: Locale
  /**
   * На чём стоит переключатель: на светлой странице или на тёмной полосе.
   *
   * Меняется только закрытая часть — подпись и кнопка. Раскрытый список
   * остаётся белым намеренно: шесть слов шестью письменностями читают
   * глазами, и тёмная подложка под мелким текстом разных алфавитов
   * читается хуже. Список к тому же всплывает поверх страницы, а не
   * лежит в полосе, и белым он принадлежит странице, а не шапке.
   */
  on?: 'light' | 'dark'
  /** Подпись на языке страницы: «Язык», «Language», «Тіл». */
  label: string
  /**
   * Куда вести для каждого языка — готовыми адресами, а не функцией.
   *
   * Здесь стояло `hrefOf: (locale) => string`, и сборка на этом падала:
   * функцию нельзя передать из серверного компонента в клиентский.
   * Ошибка вылезала только на `next build`, при предварительной
   * отрисовке, — в разработке серверный и клиентский компоненты живут
   * в одном процессе, и всё работало.
   */
  hrefs: Record<Locale, string>
}) {
  const router = useRouter()
  const id = useId()

  const [open, setOpen] = useState(false)
  /** На чём стоит подсветка в раскрытом списке — не то же, что выбранный. */
  const [cursor, setCursor] = useState(() => LOCALES.findIndex((l) => l.code === active))

  const boxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  /** Набранное для поиска по первым буквам и когда его забыть. */
  const typed = useRef({ text: '', at: 0 })

  const activeInfo = LOCALES.find((l) => l.code === active) ?? LOCALES[0]!

  /*
   * Закрытие при нажатии мимо. Слушатель вешается только на раскрытый
   * список: постоянный обработчик на всём документе ради шести строк —
   * плата, которую платят все страницы, а польза бывает изредка.
   */
  useEffect(() => {
    if (!open) return

    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  /* Внимание переводится на список: без этого стрелки некому ловить. */
  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  const choose = (locale: Locale) => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie =
      `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}` +
      `; SameSite=Lax${secure}`
    setOpen(false)
    router.push(hrefs[locale])
  }

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  /**
   * Поиск набором первых букв.
   *
   * Копит нажатые буквы полторы секунды и ищет по началу названия.
   * Полторы — не круглое число: меньше не хватает на «қа» вторым
   * пальцем, больше означает, что новая попытка дописывается к старой,
   * и человек не понимает, почему «а» находит не то.
   */
  const typeAhead = (key: string) => {
    const now = Date.now()
    typed.current.text = now - typed.current.at > 1500 ? key : typed.current.text + key
    typed.current.at = now

    const found = LOCALES.findIndex((l) =>
      l.native.toLowerCase().startsWith(typed.current.text.toLowerCase()),
    )
    if (found >= 0) setCursor(found)
  }

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setCursor((c) => Math.min(c + 1, LOCALES.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
        break
      case 'Home':
        e.preventDefault()
        setCursor(0)
        break
      case 'End':
        e.preventDefault()
        setCursor(LOCALES.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(LOCALES[cursor]!.code)
        break
      case 'Escape':
      case 'Tab':
        e.preventDefault()
        close()
        break
      default:
        if (e.key.length === 1) typeAhead(e.key)
    }
  }

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setCursor(LOCALES.findIndex((l) => l.code === active))
      setOpen(true)
    }
  }

  const dark = on === 'dark'

  return (
    <div className="flex items-center gap-2">
      <span
        id={`${id}-label`}
        className={`text-[13px] ${dark ? 'text-white/50' : 'text-ink-500'}`}
      >
        {label}
      </span>

      <div ref={boxRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-labelledby={`${id}-label ${id}-value`}
          onClick={() => {
            setCursor(LOCALES.findIndex((l) => l.code === active))
            setOpen((v) => !v)
          }}
          onKeyDown={onButtonKey}
          className={
            'flex items-center gap-2 rounded-lg border py-1.5 pl-3 pr-2.5 text-[14px] ' +
            'transition-colors focus:outline-none focus:ring-2 ' +
            (dark
              ? 'border-white/20 bg-white/10 text-white hover:border-white/40 ' +
                'focus:border-white/60 focus:ring-white/25'
              : 'border-ink-200 bg-white text-ink-900 hover:border-forest-500 ' +
                'focus:border-forest-500 focus:ring-forest-500/30')
          }
        >
          <span id={`${id}-value`} lang={active}>
            {activeInfo.native}
          </span>

          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`h-4 w-4 transition-transform ${dark ? 'text-white/60' : 'text-ink-400'} ${
              open ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <ul
            ref={listRef}
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            aria-activedescendant={`${id}-opt-${cursor}`}
            tabIndex={-1}
            onKeyDown={onListKey}
            onBlur={(e) => {
              /* Уход внимания наружу закрывает; внутрь — нет. */
              if (!boxRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
            }}
            className={
              'absolute right-0 z-20 mt-1 min-w-[11rem] overflow-hidden rounded-xl border ' +
              'border-ink-200 bg-white py-1 shadow-[0_8px_24px_rgb(23_24_26_/_0.12)] ' +
              'focus:outline-none'
            }
          >
            {LOCALES.map((l, i) => {
              const selected = l.code === active
              const under = i === cursor

              return (
                <li
                  key={l.code}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  lang={l.code}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => choose(l.code)}
                  className={
                    'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[14px] ' +
                    (under ? 'bg-brand-50 text-forest-600 ' : 'text-ink-700 ') +
                    (selected ? 'font-medium' : '')
                  }
                >
                  {l.native}

                  {/*
                     Галочка у выбранного, а не только подсветка: подсветка
                     показывает, где курсор, и в раскрытом списке эти две
                     вещи почти никогда не совпадают. Без галочки человек,
                     переставивший курсор стрелкой, теряет из виду, какой
                     язык стоит сейчас.
                  */}
                  {selected && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="h-4 w-4 flex-none text-forest-500"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M5 10.5l3.5 3.5L15 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
