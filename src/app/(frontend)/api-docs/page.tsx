import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { SwaggerFrame } from '@/components/SwaggerFrame'

export const metadata: Metadata = { title: 'API' }
export const dynamic = 'force-dynamic'

/**
 * Документация REST API (ТЗ, требование №16).
 *
 * ## Почему страница открыта всем
 *
 * Здесь нет данных — только имена коллекций и полей, то же самое, что
 * видно в любой форме книги. Закрытая документация мешает единственным
 * людям, которым она нужна: тем, кто собирается подключаться и решает,
 * стоит ли. Данные при этом защищены не тем, что о них не рассказали,
 * а правилами доступа.
 *
 * ## Почему на странице есть текст, а не только Swagger UI
 *
 * Swagger UI отвечает на вопрос «какие есть ручки и что они принимают»
 * и не отвечает ни на один из тех, на которых спотыкаются на самом деле:
 * как войти, почему одна и та же ручка отдаёт разное разным, что делать
 * с `where`. Это не недостаток библиотеки — этого нет в самом формате.
 */
export default function ApiDocsPage() {
  return (
    <>
      <SiteHeader />

      <main className="container-page pb-8">
        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">API</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            У книги два интерфейса поверх одной модели: REST и GraphQL. Описание ниже
            собрано из тех же коллекций, из которых построен сам API, и обновляется вместе
            с ними — расходиться им негде. Машинное описание лежит по адресу{' '}
            <Link href="/api-docs/openapi.json" className="underline underline-offset-4">
              /api-docs/openapi.json
            </Link>{' '}
            в формате OpenAPI 3.1: его принимают Postman, Insomnia и генераторы клиентов.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card">
              <h2 className="panel-heading">Как войти</h2>
              <p className="text-[14px] leading-relaxed text-ink-700">
                <code>POST /api/users/login</code> с почтой и паролем возвращает токен.
                Дальше его передают заголовком:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-[#f6f6f6] p-3 text-[12px]">
                Authorization: JWT &lt;токен&gt;
              </pre>
              <p className="mt-3 text-[13px] leading-snug text-ink-500">
                Браузеру проще: та же ручка ставит cookie, и дальше он ходит с ней сам.
              </p>
            </div>

            <div className="card">
              <h2 className="panel-heading">Почему ответы разные</h2>
              <p className="text-[14px] leading-relaxed text-ink-700">
                Одна и та же ручка отдаёт разное разным: хозяйство видит свои записи
                и публичные, Ассоциация — все, аноним — только публичные. Это правила
                доступа, а не схема ответа, и в описании их не выразить.
              </p>
              <p className="mt-3 text-[13px] leading-snug text-ink-500">
                Пустая выдача чаще означает «вам это не видно», чем «этого нет».
              </p>
            </div>

            <div className="card">
              <h2 className="panel-heading">Отбор</h2>
              <p className="text-[14px] leading-relaxed text-ink-700">
                Условия передаются вложенными параметрами:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-[#f6f6f6] p-3 text-[12px]">
                ?where[state][equals]=alive{'\n'}&where[birthDate][greater_than]=2020-01-01
              </pre>
              <p className="mt-3 text-[13px] leading-snug text-ink-500">
                Стандартными средствами OpenAPI этот язык не описывается — в спецификации
                он объявлен строкой, чтобы не выглядеть точнее, чем есть.
              </p>
            </div>
          </div>

          <SwaggerFrame specUrl="/api-docs/openapi.json" />

          <p className="mt-6 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
            Рядом с REST работает GraphQL —{' '}
            <Link href="/api/graphql-playground" className="underline underline-offset-4">
              /api/graphql-playground
            </Link>
            . Это та же модель и те же правила доступа, другой способ спрашивать: за один
            запрос можно взять животное вместе с отёлами и родословной, не собирая его
            из трёх обращений.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
