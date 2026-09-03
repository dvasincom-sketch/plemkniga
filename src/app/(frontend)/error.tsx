'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { ProductFailed } from '@/components/site/ProductError'
import { SITE_HOSTS } from '@/lib/hosts'

/**
 * Экран отказа для публичной части.
 *
 * ## Почему хост читается из браузера, а не из заголовка
 *
 * Границы ошибок в Next — клиентские: до этого кода дело доходит уже
 * в браузере, и серверных заголовков здесь нет вовсе. Зато есть адресная
 * строка, и она отвечает на тот же вопрос.
 *
 * Проверка обёрнута в условие существования окна не из осторожности:
 * при отказе на стороне сервера разметка сперва собирается там, и обращение
 * к `window` уронило бы саму страницу ошибки. Ошибка в обработчике ошибок —
 * худший из возможных отказов: человек не видит ни причины, ни выхода.
 *
 * ## Что здесь показывается и чего нет
 *
 * Раньше страница объясняла посетителю, что не задана переменная
 * `DATABASE_URI` и не совпадает режим SSL. Это верно и адресовано
 * не ему: хозяйство не правит переменные окружения нашего сервера.
 * Разбор переехал в пробу состояния (`/healthz`), где его читает тот,
 * кто может починить, а здесь остались отпечаток ошибки и дорога дальше.
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

  const onSite =
    typeof window !== 'undefined' &&
    SITE_HOSTS.includes(window.location.hostname.toLowerCase())

  if (onSite) {
    return (
      <>
        <ProductHeader />
        <main className="container-page pb-16">
          <ProductFailed digest={error.digest} />
          <button
            type="button"
            onClick={reset}
            className="mt-8 rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
          >
            Попробовать снова
          </button>
        </main>
        <ProductFooter />
      </>
    )
  }

  return (
    <main className="container-page flex min-h-[60vh] items-center justify-center py-20">
      <div className="card max-w-[70ch]">
        <h1 className="text-[28px] font-medium">Страница не загрузилась</h1>

        <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
          Отказала наша сторона, а не ваш браузер. Записи книги при этом целы: ломается показ,
          а не данные. Чаще всего помогает обновить страницу через минуту.
        </p>

        {/*
           Отпечаток показан всем, а не только своим. По нему ошибка
           находится в журнале за секунды, и человек, приславший его
           в письме, экономит день переписки «а что именно у вас было».
        */}
        {error.digest && (
          <p className="mt-5 rounded-xl bg-ink-50 px-4 py-3 font-mono text-[13px] text-ink-700">
            {error.digest}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
          >
            Попробовать снова
          </button>
          <Link href="/" className="text-[15px] underline underline-offset-4 hover:text-forest-500">
            На главную книги
          </Link>
        </div>
      </div>
    </main>
  )
}
