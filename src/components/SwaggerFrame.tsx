'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Swagger UI на странице.
 *
 * ## Почему скрипт подключается из кода, а не тегом в разметке
 *
 * Полтора мегабайта библиотеки не должны грузиться у тех, кто зашёл
 * на соседнюю страницу. Тег в разметке страницы Next утащил бы их
 * в общий бандл; здесь они запрашиваются, только когда открыли `/api-docs`.
 *
 * ## Почему не `swagger-ui-react`
 *
 * Тот же Swagger UI, но обёрнутый в React-компонент, попадает в серверную
 * сборку и тянет за собой свои зависимости. У нас контейнер и так живёт
 * на пределе памяти; браузерный бандл, загружаемый по требованию, ничего
 * к серверу не добавляет.
 *
 * ## Что делать, если файлов нет
 *
 * Сказать об этом и увести к описанию в формате JSON. Оно не зависит
 * ни от какой библиотеки, и любой инструмент — Postman, Insomnia, свой
 * генератор клиента — принимает его как есть. Пустой экран вместо этого
 * означал бы, что документации нет вовсе.
 */
export function SwaggerFrame({ specUrl }: { specUrl: string }) {
  const mount = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    let cancelled = false

    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = '/swagger/swagger-ui.css'
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = '/swagger/swagger-ui-bundle.js'

    script.onload = () => {
      if (cancelled) return
      const ui = (window as unknown as { SwaggerUIBundle?: (o: unknown) => void }).SwaggerUIBundle
      if (!ui || !mount.current) {
        setState('missing')
        return
      }
      ui({
        url: specUrl,
        domNode: mount.current,
        docExpansion: 'none',
        defaultModelsExpandDepth: 0,
        /*
         * «Попробовать» оставлено включённым намеренно. Документация,
         * по которой нельзя выполнить запрос, проверяется только чтением,
         * а читают её как раз затем, чтобы выполнить запрос. Опасного
         * в этом нет: ручки те же, права те же, и без входа отдастся
         * ровно то, что и так публично.
         */
        tryItOutEnabled: true,
      })
      setState('ready')
    }

    script.onerror = () => {
      if (!cancelled) setState('missing')
    }

    document.body.appendChild(script)

    return () => {
      cancelled = true
      css.remove()
      script.remove()
    }
  }, [specUrl])

  if (state === 'missing') {
    return (
      <div className="card mt-8">
        <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
          Интерактивная документация не загрузилась: файлы Swagger UI не попали в сборку.
          Само описание при этом на месте и от библиотеки не зависит — откройте{' '}
          <a href={specUrl} className="underline underline-offset-4">
            {specUrl}
          </a>{' '}
          и подключите его в Postman, Insomnia или в генератор клиента.
        </p>
        <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
          Чинится установкой пакета: <code>npm i swagger-ui-dist</code> — файлы
          копируются в <code>public/swagger</code> перед сборкой.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8">
      {state === 'loading' && <p className="text-[14px] text-ink-500">Загружаем документацию…</p>}
      {/*
         Обёртка с белым фоном: Swagger UI рисует по своим правилам,
         и на светлом фоне книги его собственный светлый фон незаметен,
         а на тёмной шапке — наоборот. Карточка ставит его в те же рамки,
         что и остальные блоки страницы.
      */}
      <div className="card overflow-x-auto px-2 py-2">
        <div ref={mount} />
      </div>
    </div>
  )
}
