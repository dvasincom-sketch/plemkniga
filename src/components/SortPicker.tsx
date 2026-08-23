'use client'

import { useRouter } from 'next/navigation'
import { Select } from './Select'
import {
  PROFILE_SORT,
  SORT_OPTIONS,
  queryWithSort,
  type SearchParams,
  type SortValue,
} from '@/lib/animal-query'

/**
 * Порядок строк — выпадающим списком, а не рядом ссылок.
 *
 * Ссылок было пять; в строку они не помещались и переносились на вторую,
 * где выглядели уже не переключателем, а случайным набором слов. Выбранная
 * подсвечивалась бледной плашкой — единственный признак того, что это вообще
 * элемент управления.
 *
 * Список решает три вещи сразу: занимает одну строку независимо от числа
 * вариантов, показывает выбранное значение крупно и парно смотрится
 * с соседним выбором профиля — обе настройки об одном и том же, о способе
 * смотреть на выдачу.
 */
export function SortPicker({
  sp,
  value,
  withProfile,
}: {
  sp: SearchParams
  value: SortValue
  /** Профиль выбран — появляется порядок по нему. */
  withProfile: boolean
}) {
  const router = useRouter()

  const options = [
    ...(withProfile ? [{ value: PROFILE_SORT.value, label: PROFILE_SORT.label }] : []),
    ...SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  ]

  return (
    /*
       `key` по выбранному значению — не украшение, а лечение.

       Выбор здесь заканчивается переходом (`router.push`), и после перехода
       список оставался раскрытым поверх уже пересортированной таблицы:
       страница перерисовывается из нового ответа сервера, а клиентский
       компонент переживает это вместе со своим состоянием, и «закрыт»
       до экрана не доходит. Списки, которые никуда не ведут — «Пол»,
       «Возраст», — закрывались правильно; разница была ровно в переходе.

       Меняющийся ключ заставляет React пересоздать список заново, а новый
       начинается закрытым. Заодно снимается вторая беда того же корня:
       `defaultValue` у пересозданного совпадает с тем, что в адресе.
    */
    <Select
      key={value}
      name="sort"
      ariaLabel="Порядок строк"
      onLight
      className="min-w-[230px]"
      placeholder=""
      defaultValue={value}
      options={options}
      onChange={(v) => router.push(`${queryWithSort(sp, v as SortValue)}#results`)}
    />
  )
}
