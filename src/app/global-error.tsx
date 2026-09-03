'use client'

/**
 * Последняя страница, которая может показаться.
 *
 * ## Когда её видят
 *
 * Когда рухнула сама раскладка — до того, как появились шрифты, стили
 * и шапка. Обычная страница ошибки живёт внутри раскладки и в этот
 * момент показаться не может, поэтому Next заменяет собой всё дерево:
 * отсюда и `html` с `body`, которых нет в других файлах.
 *
 * ## Почему без единого класса оформления
 *
 * Оформление собирается той же сборкой, которая только что не собралась.
 * Класс, не доехавший до браузера, оставил бы чёрный текст на белом фоне
 * без отступов — то есть страницу, выглядящую как поломка поверх
 * поломки. Здесь всё стилями в разметке: они не зависят ни от чего.
 *
 * ## Почему так мало слов
 *
 * Отказ этого уровня означает, что не работает ничего, и советовать
 * «зайдите в раздел» бессмысленно — разделов сейчас нет. Остаются
 * две полезные вещи: отпечаток для журнала и кнопка повтора.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f2f2f0',
          color: '#17181a',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        <div style={{ maxWidth: '46rem', padding: '2rem' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 500, margin: 0 }}>
            Система не запустилась
          </h1>

          <p style={{ fontSize: '16px', lineHeight: 1.6, marginTop: '1rem' }}>
            Отказ произошёл раньше, чем собралась страница. Данные книги при этом целы:
            они лежат в базе и не зависят от того, показалась страница или нет.
          </p>

          {error.digest && (
            <p
              style={{
                marginTop: '1.25rem',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                background: '#e7e7e4',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: '13px',
              }}
            >
              {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.75rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              border: 0,
              background: '#2e7d52',
              color: '#fff',
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  )
}
