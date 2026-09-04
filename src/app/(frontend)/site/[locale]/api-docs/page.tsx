import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { pick } from '@/lib/i18n/translated'
import { API_DOCS_PAGE_TEXT, type CodeParts } from '@/lib/api-docs-page-text'
import { ApiReference } from '@/components/ApiReference'

/*
 * Заголовок, описание и указание основной страницы — из одного места
 * (`lib/seo.ts`). Описание берётся из подводки самой страницы: она уже
 * написана и переведена, а второе описание для робота никто не читает
 * и потому никто не правит.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  return siteMetadata(locale, 'api', '/api-docs')
}
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
 *
 * ## Почему текст страницы лежит в наборе строк
 *
 * Набранный прямо в разметке абзац перевода не видит: заголовок
 * и подводка приходили переведёнными, а три карточки и три сценария
 * оставались русскими, и английская страница читалась как брошенная
 * на полпути. Слова страницы теперь в `lib/api-docs-page-text.ts`,
 * команды — рядом с разметкой: они не переводятся.
 *
 * ## Чего этот перевод не касается
 *
 * Самого описания OpenAPI. Оно собирается из коллекций — названия
 * разделов и ручек, пояснения к полям — и написано по-русски; справочник
 * ниже показывает его как есть. Это отдельная работа, и делать её
 * наполовину хуже, чем не начинать: страница с английской рамкой
 * и русским описанием внутри честнее, чем описание, переведённое
 * до середины.
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
/**
 * Подпись, внутри которой часть слов набрана шрифтом кода.
 *
 * Имена полей и параметров — `token`, `depth=0`, `$BASE` — внутри фразы
 * не переводятся, а фраза вокруг них у каждого языка своя, и порядок слов
 * у неё свой тоже. Поэтому подпись приходит кусками: чётные — текст,
 * нечётные — код (`lib/api-docs-page-text.ts`).
 */
function Coded({ parts }: { parts: CodeParts }) {
  return (
    <>
      {parts.map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}
    </>
  )
}

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

/**
 * Команды трёх сценариев — в том же порядке, что и слова к ним.
 *
 * Здесь они потому, что не переводятся: `curl`, имена ручек и параметры
 * одинаковы на любом языке, и положить их в набор строк значило бы
 * просить перевести то, что при переводе перестанет выполняться.
 *
 * Порядок связывает пример со сценарием (`lib/api-docs-page-text.ts`),
 * и это единственное, чем они связаны, — поэтому список короткий
 * и стоит целиком на виду.
 */
const EXAMPLES: string[] = [
  `BASE=https://…

curl -X POST \\
  "$BASE/api/users/login" \\
  -H content-type:application/json \\
  -d '{"email":"…","password":"…"}'`,

  `curl "$BASE/api/animals\\
?where[archived][not_equals]=true\\
&limit=200&depth=0" \\
  -H "Authorization: JWT $TOKEN"`,

  /* -X POST не нужен: с -d curl и так шлёт POST, а строка короче */
  `curl "$BASE/api/milk-tests" \\
  -H "Authorization: JWT $TOKEN" \\
  -H content-type:application/json \\
  -d '{"animal":123,
      "date":"2026-08-01",
      "milkYield":28.4}'`,
]

export default async function ApiDocsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.api

  const picked = pick(API_DOCS_PAGE_TEXT, locale)
  const text = picked.value

  /*
   * Оговорка «текст ниже по-русски» стоит только там, где он и правда
   * русский. Раньше она показывалась на всех нерусских языках без
   * разбора — в том числе на английском, — и извинялась за то, чего нет.
   *
   * Само описание OpenAPI при этом остаётся русским на всех языках,
   * и на английской странице оговорка молчит о нём намеренно: она
   * относится к тексту страницы. Перевод описания — отдельная работа,
   * и до неё честнее не обещать ничего.
   */
  const notice = picked.fallback ? PAGE_MESSAGES[locale].notice : null

  return (
    <>
      <ProductHeader locale={locale} path="/api-docs" />

      <main className="container-page pb-8">
        <div className="min-w-0">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">{frame.eyebrow}</p>

          <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">
            {frame.title}
          </h1>

          <p className="mt-4 max-w-[75ch] text-[16px] leading-relaxed text-ink-700">{frame.lead}</p>

          {notice && (
            <p className="mt-4 max-w-[75ch] rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
              {notice}
            </p>
          )}

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            {text.introLead}{' '}
            <Link href="/api-docs/openapi.json" className="underline underline-offset-4">
              /api-docs/openapi.json
            </Link>{' '}
            {text.introTail}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="card">
              <h2 className="panel-heading">{text.auth.title}</h2>
              <p className="text-[14px] leading-relaxed text-ink-700">
                <code>POST /api/users/login</code> {text.auth.body}
              </p>
              {/*
                 Заголовок запроса приходит из набора строк целиком:
                 переводится в нём одно слово — заполнитель «токен»,
                 который читатель заменяет своим.
              */}
              <Snippet>{text.auth.snippet}</Snippet>
              <p className="mt-3 text-[13px] leading-snug text-ink-500">{text.auth.note}</p>
            </div>

            <div className="card">
              <h2 className="panel-heading">{text.access.title}</h2>
              <p className="text-[14px] leading-relaxed text-ink-700">{text.access.body}</p>
              <p className="mt-3 text-[13px] leading-snug text-ink-500">{text.access.note}</p>
            </div>

            <div className="card">
              <h2 className="panel-heading">{text.filter.title}</h2>
              <p className="text-[14px] leading-relaxed text-ink-700">{text.filter.body}</p>
              <Snippet wrap>
                ?where[state][equals]=alive{'\n'}&where[birthDate][greater_than]=2020-01-01
              </Snippet>
              <p className="mt-3 text-[13px] leading-snug text-ink-500">{text.filter.note}</p>
            </div>
          </div>

          {/* ------------------------- Сценарии ------------------------- */}

          <section className="mt-14">
            <h2 className="section-title mb-3">{text.start.title}</h2>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              {text.start.lead}
            </p>

            {/*
               Пример и слова к нему стоят рядом по одному списку: команды
               здесь, подписи — в наборе строк, и связывает их порядок,
               а не внимательность. Сценарий без примера или пример
               без сценария невозможны по устройству.
            */}
            <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {text.steps.map((step, i) => (
                <div key={step.title} className="card">
                  <h3 className="panel-heading">{step.title}</h3>
                  <p className="text-[14px] leading-relaxed text-ink-700">{step.body}</p>
                  <Snippet>{EXAMPLES[i]}</Snippet>
                  <p className="mt-3 text-[13px] leading-snug text-ink-500">
                    {typeof step.note === 'string' ? step.note : <Coded parts={step.note} />}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-6 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
              <Coded parts={text.substitutions} />
            </p>
          </section>

          {/*
             Язык передаётся справочнику отдельно: его подписи рисует
             библиотека, и о языке страницы она не знает ничего. Без
             этого английская страница кончалась русским справочником.
          */}
          <ApiReference specUrl="/api-docs/openapi.json" locale={locale} />

          <p className="mt-8 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
            {text.graphqlLead}{' '}
            <Link href="/api/graphql-playground" className="underline underline-offset-4">
              /api/graphql-playground
            </Link>
            . {text.graphqlTail}
          </p>
        </div>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
