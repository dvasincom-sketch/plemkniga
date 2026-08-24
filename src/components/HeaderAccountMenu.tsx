'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PERSONAL_SUBTABS } from './PersonalNav'

/**
 * Меню под именем пользователя — личные страницы человека.
 *
 * Список рисуется порталом в <body> с координатами от блока имени: внутри
 * потока он оказывался под содержимым страницы, и подбирать z-index здесь
 * бесполезно — на соседнем экране всё повторилось бы.
 *
 * Пока меню раскрыто, сам блок имени тоже становится зелёным и смыкается
 * с выпадающим списком в одну плашку: так видно, что это одно целое,
 * а не две случайно наложившиеся поверхности.
 */
/**
 * ## Почему по щелчку, а не по наведению
 *
 * Раскрывалось наведением, и пока это меню было единственной дверью
 * в кабинет, на телефоне двери не было вовсе: наведения там не существует.
 * Дверь в кабинет теперь стоит в самом меню шапки — пункт «Моё хозяйство», —
 * но и после этого наведение остаётся неверным способом: список открывается
 * от случайного движения курсора мимо, а закрывается по таймеру, который
 * приходилось заводить именно для того, чтобы курсор успел доехать.
 * Щелчок ничего не открывает случайно, работает одинаково на телефоне
 * и на столе и не требует таймера.
 *
 * ## Почему здесь только личное
 *
 * Раньше здесь повторялись разделы кабинета — те же пять плашек, что
 * и в самом кабинете. Два меню на один список — это два места, где записано
 * одно правило; они разошлись, и «Доступы» из этого меню вели на пустой
 * экран (решение №119). Разделы хозяйства остались в кабинете, здесь —
 * то, что уходит вместе с человеком: профиль, лента уведомлений, подписка
 * на письма, биллинг.
 *
 * Сотруднику Ассоциации показывается тот же список: его разделы стоят
 * в шапке пунктом «Проверка данных», и повторять их здесь значило бы
 * заново завести те самые две копии.
 */
/**
 * Минимальная ширина списка — по самой длинной подписи.
 *
 * То же число стоит минимальной шириной у блока с именем (класс
 * `sm:min-w-[232px]`). Совпадение обязательно: на широком экране список
 * и блок имени смыкаются в одну плашку, и стоит списку оказаться хоть
 * немного шире, как он вылезает слева ступенькой.
 */
const MIN_WIDTH = 232

/** Отступ от края экрана, чтобы список не прилипал к нему на телефоне. */
const SCREEN_GAP = 8

export function HeaderAccountMenu({
  displayName,
  orgName,
  active,
  unread = 0,
  association = false,
  associationLabel,
}: {
  displayName: string
  orgName: string | null
  active?: string
  unread?: number
  /**
   * Сотрудник Ассоциации.
   *
   * Под именем вместо организации стоит «Ассоциация»: человек должен
   * видеть, от чьего лица он сейчас действует, не открывая профиль.
   */
  association?: boolean
  associationLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; right: number; width: number } | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    /*
     * На широком экране список повторяет ширину блока имени: любое расхождение
     * даёт ступеньку на стыке, и силуэт перестаёт читаться как одна плашка.
     *
     * На телефоне имя и организация скрыты, от блока остаётся один кружок
     * с аватаром — сорок с небольшим пикселей. Список такой ширины обрезал
     * подписи по буквам: «Уведомл…». Поэтому ширина не меньше MIN_WIDTH
     * и не шире экрана: смыкание в одну плашку — приём для просторного
     * экрана, читаемость важнее.
     */
    const width = Math.min(Math.max(r.width, MIN_WIDTH), window.innerWidth - 2 * SCREEN_GAP)
    const right = Math.min(
      Math.max(window.innerWidth - r.right, SCREEN_GAP),
      window.innerWidth - width - SCREEN_GAP,
    )
    setRect({ top: r.bottom - 1, right, width })
  }, [])

  const toggle = useCallback(() => {
    setOpen((was) => {
      if (!was) place()
      return !was
    })
  }, [place])

  /*
   * Закрытие по щелчку вне меню. Слушатель стоит на всём документе,
   * а не на подложке: подложка поверх страницы съедала бы первый щелчок
   * по любой ссылке — человек закрывал бы меню вместо того, чтобы перейти
   * туда, куда нажал.
   */
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  const isPersonal = active === '/account/profile' || active === '/account/notifications'

  const subtitle = association ? (associationLabel ?? 'Ассоциация') : orgName

  return (
    <div ref={anchorRef} className="sm:min-w-[232px]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Личные страницы: ${displayName}`}
        /*
           Скругление сверху только в раскрытом состоянии: в шапке блок
           выглядит как обычная кнопка, а при открытии смыкается со списком
           в одну плашку. В закрытом виде — лёгкая подсветка фона при наведении.
        */
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-[background-color,color,box-shadow] duration-150 ${
          open
            ? 'rounded-t-2xl bg-forest-500 text-white shadow-[0_8px_24px_rgb(23_24_26_/_0.12)]'
            : `rounded-xl ${isPersonal ? 'text-forest-500' : 'text-ink-900'} hover:bg-ink-50`
        }`}
      >
        <span
          className={`flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors duration-150 ${
            open ? 'bg-white text-forest-500' : 'bg-ink-900 text-white'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="6.5" r="3.5" fill="currentColor" />
            <path d="M3.5 17c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" fill="currentColor" />
          </svg>
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-[15px]">{displayName}</span>
          {subtitle && (
            <span className={`block text-[12px] ${open ? 'text-white/75' : 'text-ink-500'}`}>
              {subtitle}
            </span>
          )}
        </span>
      </button>

      {open &&
        rect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={listRef}
            style={{ top: rect.top, right: rect.right, width: rect.width }}
            /*
               Правый верхний угол всегда прямой: этой стороной список
               примыкает к блоку с аватаром, и любое скругление там читается
               как щель между двумя разными плашками.
               Левый верхний скругляется только на телефоне — там список шире
               блока и торчит влево; на широком экране ширины совпадают,
               и оба верхних угла должны быть прямыми.
            */
            className="account-menu fixed z-[100] overflow-hidden rounded-b-2xl rounded-tl-2xl bg-forest-500 py-1.5 shadow-[0_16px_40px_rgb(23_24_26_/_0.22)] sm:rounded-tl-none"
          >
            <ul>
              {PERSONAL_SUBTABS.map((t) => (
                <li key={t.key}>
                  <Link
                    href={t.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-[15px] text-white/95 transition-colors hover:bg-white/10 active:bg-white/15"
                  >
                    {t.label}
                    {/* Число новых стоит только у ленты: у остальных пунктов
                        считать нечего, а пустое место справа от подписи
                        читалось бы как «ноль» */}
                    {t.key === 'feed' && unread > 0 && (
                      <span className="min-w-[18px] rounded-full bg-white px-1 text-center text-[11px] font-medium leading-[18px] text-forest-500">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  )
}
