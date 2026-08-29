import Link from 'next/link'
import { FILTER_KEYS, one, queryWithout, type SearchParams, type SortValue } from '@/lib/animal-query'
import { describeFilter } from '@/lib/filter-labels'
import { ProfilePicker } from './ProfilePicker'
import { SortPicker } from './SortPicker'
import type { ProfileChoice } from '@/lib/index-profiles'
import { plural } from '@/lib/format'

/**
 * Шапка результатов: сколько найдено, по каким условиям и как показано.
 *
 * Три вопроса стоят в одном порядке сверху вниз: сколько нашлось, почему
 * именно столько, как на это смотреть. Раньше настройки показа — профиль
 * индекса и порядок строк — были разной природы: один выпадающим списком,
 * другой рядом из пяти ссылок, который переносился на вторую строку. Теперь
 * это два одинаковых списка в одном ряду: обе настройки отвечают на один
 * вопрос и должны выглядеть одинаково.
 *
 * Условия отбора показаны «фишками» с крестиком — пользователь видит, почему
 * выдача именно такая, и снимает любое условие одним кликом, не разыскивая
 * его в форме. Это же делает состояние поиска очевидным при переходе
 * по ссылке.
 */

const CrossIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export function ResultsBar({
  sp,
  total,
  sort,
  hasActive,
  herds,
  profiles = [],
  profileKey = '',
  title,
  resetHref = '/#results',
  actions,
  note,
}: {
  sp: SearchParams
  total: number
  sort: SortValue
  hasActive: boolean
  herds: { id: number; name: string }[]
  /** Профили расчёта индекса; пустой список — переключатель не показывается. */
  profiles?: ProfileChoice[]
  profileKey?: string
  /**
   * Заголовок вместо «Найдено» / «Все животные книги».
   *
   * Нужен кабинету: там же, где в книге стоит «Все животные книги»,
   * у хозяйства стоит «Мои животные» или «Архив», и подменять их общей
   * формулировкой значит терять ответ на вопрос «чей это список».
   */
  title?: string
  /** Куда ведёт «Сбросить всё». В книге это корень, в кабинете — свой раздел. */
  resetHref?: string
  /**
   * Кнопки раздела — выгрузка, ввод, загрузка.
   *
   * Стоят здесь, а не отдельной полосой над таблицей, потому что отвечают
   * на тот же вопрос, что и сама шапка: что я делаю с этим списком.
   * Отдельная полоса из пяти кнопок читалась как самостоятельный раздел
   * и перебивала главное — сколько нашлось и почему.
   */
  actions?: React.ReactNode
  /** Строка под заголовком: пояснение к списку. */
  note?: React.ReactNode
}) {
  const chips = FILTER_KEYS.map((key) => {
    const value = one(sp[key])
    if (!value) return null
    const described = describeFilter(key, value, herds)
    if (!described) return null
    return { key, ...described }
  }).filter(Boolean) as { key: string; label: string; value: string }[]

  return (
    <div className="mb-5">
      {/*
         Одна строка, а не три.

         Здесь стояло три элемента подряд с `justify-between`: заголовок,
         кнопки, списки. Флексбокс развёл их по краям и середине, кнопки
         оказались посреди строки, а списки — на своей собственной; вместе
         с пояснением под заголовком получалось три яруса над таблицей
         и добрых двести пикселей до первой записи.

         Теперь ярус один: слева — что за список и сколько в нём,
         справа — как на него смотреть и что с ним делать. Переносится
         строка только когда не помещается по-настоящему.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="min-w-0 text-[22px] font-medium sm:text-[26px]">
          {title ?? (hasActive ? 'Найдено' : 'Все животные книги')}
          <span className="ml-3 text-[15px] font-normal text-ink-500">
            {total.toLocaleString('ru-RU')} {plural(total, 'запись', 'записи', 'записей')}
          </span>
          {/*
             Пояснение — в той же строке, отделённое точкой, а не абзацем
             под заголовком. Строка «В архиве записей: 398» занимала ярус
             целиком ради семи слов.
          */}
          {note && (
            <span className="ml-3 text-[15px] font-normal text-ink-500">
              <span aria-hidden="true" className="mr-3 text-ink-300">
                ·
              </span>
              {note}
            </span>
          )}
        </h2>

        {/*
           `ml-auto` держит правую группу у правого края и тогда, когда
           она перенеслась на свою строку: `justify-between` действует
           внутри строки, и перенесённая начиналась бы слева — кнопка
           «Загрузить данные» оказывалась посреди пустоты, а не там,
           где её ищут глазами.
        */}
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
          {total > 0 && profiles.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="text-ink-500">Индекс</span>
              <ProfilePicker sp={sp} profiles={profiles} value={profileKey} />
            </label>
          )}

          {total > 0 && (
            <label className="flex items-center gap-2">
              <span className="text-ink-500">Порядок</span>
              <SortPicker sp={sp} value={sort} withProfile={profiles.length > 0 && Boolean(profileKey) && profileKey !== 'none'} />
            </label>
          )}

          {actions}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-500">Условия:</span>
          {chips.map((c) => (
            <Link
              key={c.key}
              href={`${queryWithout(sp, c.key)}#results`}
              className="group inline-flex items-center gap-2 rounded-lg bg-white py-1.5 pl-3 pr-2.5 text-[13px] shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
              title={`Убрать условие «${c.label}»`}
            >
              <span className="text-ink-500">{c.label}:</span>
              <span className="font-medium text-ink-900">{c.value}</span>
              <span className="text-ink-300 group-hover:text-ink-900">
                <CrossIcon />
              </span>
            </Link>
          ))}

          <Link
            href={resetHref}
            className="rounded-lg px-2 py-1.5 text-[13px] text-ink-500 underline underline-offset-4 hover:text-ink-900"
          >
            Сбросить всё
          </Link>
        </div>
      )}
    </div>
  )
}
