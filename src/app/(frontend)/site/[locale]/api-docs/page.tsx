import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { ApiReference } from '@/components/ApiReference'

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
 * ## Почему на странице есть текст, а не только справочник
 *
 * Справочник отвечает на вопрос «какие есть ручки и что они принимают»
 * и не отвечает ни на один из тех, на которых спотыкаются на самом деле:
 * как войти, почему одна и та же ручка отдаёт разное разным, что делать
 * с `where`, с чего вообще начать. Это не недостаток библиотеки — этого
 * нет в самом формате OpenAPI.
 *
 * ## Почему сценарии, а не только справочник
 *
 * Список из девяноста ручек отвечает тому, кто знает, что ищет. А приходят
 * с задачей: «выгрузить своё стадо», «залить дойки за месяц», «найти
 * дочерей быка». Между задачей и ручкой лежит шаг, который справочник
 * не делает, — и он же тот самый, на котором бросают. Три сценария ниже
 * закрывают, по нашему опыту переписки с хозяйствами, почти все первые
 * обращения.
 */

/**
 * Готовый пример — одинаково выглядит во всех карточках страницы.
 *
 * ## Почему команда не переносится, а адрес переносится
 *
 * В карточку помещается сорок знаков, и строки длиннее обрезались правым
 * краем: «BASE=https://… # адрес этой сис». Прокрутка внутри блока была
 * и раньше, но обрезанная строка читается как поломка, а не как
 * приглашение листать вбок.
 *
 * Чинится это по-разному для двух разных вещей. Команду переносить нельзя:
 * её копируют целиком, и перенос по ширине окна в шелле означает совсем
 * не то, что перенос по обратному слэшу, — читатель перестаёт отличать
 * настоящее продолжение строки от нарисованного. Поэтому команды
 * укорочены так, чтобы влезать, а прокрутка осталась запасным выходом
 * для узкого экрана.
 *
 * Адрес с условиями отбора — не команда, а строка запроса, и её перенос
 * ничего не искажает: читают её глазами, а не вставляют в терминал.
 */
function Snippet({ children, wrap = false }: { children: React.ReactNode; wrap?: boolean }) {
  return (
    <pre
      className={`mt-3 rounded-lg bg-[#f6f6f6] p-3 text-[12px] leading-relaxed ${
        wrap ? 'whitespace-pre-wrap break-all' : 'overflow-x-auto'
      }`}
    >
      {children}
    </pre>
  )
}

export default async function ApiDocsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.api
  const notice = PAGE_MESSAGES[locale].notice

  return (
    <>
      <ProductHeader locale={locale} path="/api-docs" />

      <main className="container-page pb-8">
        <div className="min-w-0">
          <p className="text-[13px] uppercase tracking-[0.09em] text-ink-500">{frame.eyebrow}</p>

          <h1 className="mt-3 text-[30px] font-medium leading-tight sm:text-[36px]">
            {frame.title}
          </h1>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">{frame.lead}</p>

          {notice && (
            <p className="mt-4 max-w-[75ch] rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
              {notice}
            </p>
          )}

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
              <Snippet>Authorization: JWT &lt;токен&gt;</Snippet>
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
              <Snippet wrap>
                ?where[state][equals]=alive{'\n'}&where[birthDate][greater_than]=2020-01-01
              </Snippet>
              <p className="mt-3 text-[13px] leading-snug text-ink-500">
                Стандартными средствами OpenAPI этот язык не описывается — в спецификации
                он объявлен строкой, чтобы не выглядеть точнее, чем есть.
              </p>
            </div>
          </div>

          {/* ------------------------- Сценарии ------------------------- */}

          <section className="mt-14">
            <h2 className="section-title mb-3">С чего начать</h2>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Три задачи, с которыми к нам приходят чаще всего. Дальше справочник:
              в нём девяносто ручек, и он отвечает тому, кто уже знает, что ищет.
            </p>

            <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="card">
                <h3 className="panel-heading">1. Войти и получить токен</h3>
                <p className="text-[14px] leading-relaxed text-ink-700">
                  С него начинается всё остальное: без токена ручки отдают только
                  публичное.
                </p>
                <Snippet>
                  {`BASE=https://…

curl -X POST \\
  "$BASE/api/users/login" \\
  -H content-type:application/json \\
  -d '{"email":"…","password":"…"}'`}
                </Snippet>
                <p className="mt-3 text-[13px] leading-snug text-ink-500">
                  В <code>BASE</code> — адрес этой системы. В ответе поле{' '}
                  <code>token</code>, срок жизни — в поле <code>exp</code>.
                </p>
              </div>

              <div className="card">
                <h3 className="panel-heading">2. Выгрузить своё стадо</h3>
                <p className="text-[14px] leading-relaxed text-ink-700">
                  Владельца в условии называть не нужно: выдача и так ограничена вашим
                  хозяйством — правилами доступа, а не параметром запроса.
                </p>
                <Snippet>
                  {`curl "$BASE/api/animals\\
?where[archived][not_equals]=true\\
&limit=200&depth=0" \\
  -H "Authorization: JWT $TOKEN"`}
                </Snippet>
                <p className="mt-3 text-[13px] leading-snug text-ink-500">
                  <code>depth=0</code> отдаёт связи идентификаторами — быстрее
                  и предсказуемее, если сами связанные записи не нужны.
                </p>
              </div>

              <div className="card">
                <h3 className="panel-heading">3. Записать контрольную дойку</h3>
                <p className="text-[14px] leading-relaxed text-ink-700">
                  То, ради чего API чаще всего и подключают: дойки приходят каждый месяц
                  и тысячами строк.
                </p>
                {/* -X POST не нужен: с -d curl и так шлёт POST, а строка короче */}
                <Snippet>
                  {`curl "$BASE/api/milk-tests" \\
  -H "Authorization: JWT $TOKEN" \\
  -H content-type:application/json \\
  -d '{"animal":123,
      "date":"2026-08-01",
      "milkYield":28.4}'`}
                </Snippet>
                <p className="mt-3 text-[13px] leading-snug text-ink-500">
                  Записать можно только животное своего хозяйства — это проверяется
                  на сервере, а не в форме.
                </p>
              </div>
            </div>

            <p className="mt-6 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
              В примерах два подставляемых значения: <code>$BASE</code> — адрес,
              по которому открыта эта страница, и <code>$TOKEN</code> — то, что вернул
              вход. В справочнике ниже подставлять не нужно ничего: адрес там уже наш,
              а токен вводится один раз кнопкой авторизации.
            </p>
          </section>

          <ApiReference specUrl="/api-docs/openapi.json" />

          <p className="mt-8 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
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

      <ProductFooter lang={locale} />
    </>
  )
}
