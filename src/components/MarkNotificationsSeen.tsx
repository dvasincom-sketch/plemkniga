'use client'

import { useEffect } from 'react'
import { markNotificationsSeenAction } from '@/actions/access'

/**
 * Отметка «ленту открывали».
 *
 * Ставится после отрисовки, а не во время: страница сначала показывает,
 * что нового, и только потом гасит счётчик. Если сделать это раньше,
 * пометка «новое» исчезнет ровно в тот момент, когда её собирались прочесть.
 *
 * Компонент ничего не рисует и намеренно не обновляет страницу: перерисовка
 * сразу после загрузки убрала бы подсветку новых записей из-под курсора.
 */
export function MarkNotificationsSeen() {
  useEffect(() => {
    const t = setTimeout(() => {
      void markNotificationsSeenAction()
    }, 1200)
    return () => clearTimeout(t)
  }, [])

  return null
}
