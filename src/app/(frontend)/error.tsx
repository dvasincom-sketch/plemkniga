'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Экран ошибки для публичной части.
 * Показывает код (digest), по которому ошибку можно найти в логах сервера.
 */
export default function FrontendError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[plemkniga]', error)
  }, [error])

  return (
    <main className="container-page flex min-h-[60vh] items-center justify-center py-20">
      <div className="card max-w-[70ch]">
        <h1 className="text-[28px] font-medium">Страница не загрузилась</h1>

        <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
          Произошла ошибка на сервере. Чаще всего это значит, что приложение не может подключиться
          к базе данных: не задана переменная <code>DATABASE_URI</code>, не совпадает режим SSL или
          база ещё не создана.
        </p>

        <p className="mt-4 text-sm text-ink-500">
          Проверить подключение можно по адресу{' '}
          <Link href="/healthz" className="underline underline-offset-2">
            /healthz
          </Link>{' '}
          — он показывает состояние базы данных.
        </p>

        {error.digest && (
          <p className="mt-4 rounded-lg bg-canvas px-4 py-3 text-sm">
            Код ошибки для поиска в логах: <code className="font-medium">{error.digest}</code>
          </p>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn btn-accent">
            Попробовать снова
          </button>
          <Link href="/" className="btn">
            На главную
          </Link>
        </div>
      </div>
    </main>
  )
}
