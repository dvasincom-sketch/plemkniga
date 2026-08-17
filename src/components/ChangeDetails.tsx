'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Закрытие боковой панели по Escape.
 *
 * Панель живёт в адресной строке, поэтому закрыть её — это перейти по ссылке
 * без параметра. Крестик и подложка это делают сами; Escape без обработчика
 * не работает, а нажимают его первым — привычка сильнее подсказки.
 *
 * Переход без прокрутки: панель открывают из середины длинного списка,
 * и возврат к началу страницы при закрытии выглядит как потеря места.
 */
export function CloseOnEscape({ href }: { href: string }) {
  const router = useRouter()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.push(href, { scroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [href, router])

  return null
}
