'use client'

import { useRouter } from 'next/navigation'
import type { MouseEvent } from 'react'

/**
 * Переход по строке таблицы — обработчиком, а не растянутой ссылкой.
 *
 * Раньше вся строка кликалась за счёт приёма «stretched link»: невидимый
 * `::after` у ссылки в первой ячейке растягивался на всю строку. Приём
 * держится на одном условии — `position: relative` у `<tr>`. У табличных
 * строк это свойство исторически ведёт себя по-разному, и стоит ему
 * не сработать, как слой перестаёт быть слоем строки: он цепляется
 * к ближайшему позиционированному предку и накрывает пол-страницы.
 *
 * Последствия такого срыва выглядят как две несвязанные поломки, и обе
 * ровно те, о которых сообщили: клик по любому месту — хоть по полю
 * поиска — открывает карточку первого животного, а подсветка строки под
 * курсором «пропадает», потому что на самом деле подсвечивается всё та же
 * первая строка.
 *
 * Здесь ничего не растягивается. Один обработчик на всю таблицу читает
 * `data-href` у ближайшей строки и переходит. Настоящая ссылка в ячейке
 * с номером остаётся на месте: она нужна для клавиатуры, средней кнопки
 * мыши, «открыть в новой вкладке» и программ чтения с экрана. Клики
 * по другим ссылкам и кнопкам внутри строки обработчик пропускает мимо.
 */
export function TableRowNav({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const router = useRouter()

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    // Модификаторы и средняя кнопка — работа браузера, не наша
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (e.button !== 0) return

    const target = e.target as HTMLElement | null
    if (!target) return

    // Внутри строки есть собственные ссылки — замок, владелец, номер.
    // У них свои адреса, перехватывать их нельзя
    if (target.closest('a, button, input, select, label')) return

    // Выделение текста мышью не должно уводить со страницы
    if (window.getSelection()?.toString()) return

    const row = target.closest('tr[data-href]') as HTMLElement | null
    const href = row?.dataset.href
    if (href) router.push(href)
  }

  return (
    <div className={className} onClick={onClick}>
      {children}
    </div>
  )
}
