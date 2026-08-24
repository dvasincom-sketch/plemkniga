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
 *
 * ## Почему две таблицы стилей и почему в таком порядке
 *
 * Библиотека приносит своё оформление целиком: системный `sans-serif`
 * вместо Onest, серо-синие чернила, синюю кнопку «Execute» и палитру
 * методов от синего, которого в книге нет. Вторая таблица —
 * `/swagger-theme.css` — приводит это к оформлению книги и подключается
 * строго после первой: при равной силе селекторов побеждает подключённая
 * позже, и только так правила совпадают с чужими один в один, без
 * приписывания каждому лишнего класса ради силы.
 *
 * Порядок здесь держится не на удаче: оба тега добавляются подряд,
 * одним и тем же `appendChild`, в одном проходе.
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

    // Оформление книги поверх оформления библиотеки — обязательно после неё
    const theme = document.createElement('link')
    theme.rel = 'stylesheet'
    theme.href = '/swagger-theme.css'
    document.head.appendChild(theme)

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
      theme.remove()
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

         Отступы теперь обычные, карточные. Были урезанные — библиотека
         добавляла свои поверх, и вместе выходило вдвое больше нужного;
         после того как полоса выбора сервера перестала быть второй
         карточкой внутри первой, свои отступы библиотека сняла, и здесь
         остались наши.
      */}
      <div className="card overflow-x-auto">
        <div ref={mount} />
      </div>
    </div>
  )
}
