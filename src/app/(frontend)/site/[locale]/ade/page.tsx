import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import {
  ADE_MAP,
  ADE_OURS,
  ADE_SCHEMAS,
  themeCounts,
  usedByDir,
} from '@/lib/ade-schema-map'
import { ADE_COLLECTIONS, ADE_VERSION } from '@/lib/ade/core'
import { ADE_WRITABLE } from '@/lib/ade/parse'
import { plural } from '@/lib/format'

/**
 * Чем проверяется наш обмен.
 *
 * ## Почему страница вообще нужна
 *
 * «Соответствует ICAR» говорят все. Проверить это со стороны нельзя:
 * ни сертификации, ни реестра внедрений у стандарта нет. Единственное,
 * что отличает утверждение от слов, — показать, **чем именно** оно
 * проверяется и что при этом не проверяется тоже.
 *
 * ## Главное: числа здесь честные, а не крупные
 *
 * Соблазн был написать «303 схемы на каждом прогоне». Формально в дереве
 * их столько, и цифра красивая. Но сверяются по ним одиннадцать наших
 * ресурсов, и участвует в этой сверке 77 схем — замкнутый круг ссылок
 * от наших ресурсов к общим предкам, типам и перечислениям.
 *
 * Разница между 303 и 77 — ровно та, из-за которой заводилась страница
 * соответствия. Написать большее число значило бы сделать эту страницу
 * тем, от чего она защищает.
 *
 * Остальные 226 названы прямо и с причиной: они лежат в дереве, чтобы
 * ссылки разрешались целиком и чтобы обновление стандарта было видно
 * построчным сравнением — включая то, чего мы не делаем.
 *
 * ## Почему всё считается, а не пишется
 *
 * Каждое число берётся из выписки `src/data/ade-schemas.json`, собранной
 * из самих файлов копии. Написанное словами отстало бы при первом же
 * обновлении схем — и отстало бы именно на странице, которая обещает
 * точность.
 */

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
  return siteMetadata(locale, 'ade', '/ade')
}

/* ------------------------------------------------------------------ */

function Num({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className={`stat-value text-[30px] leading-none text-forest-600`}>
        {value}
      </div>
      <p className="mt-2 max-w-[26ch] text-[13px] leading-snug text-ink-500">{label}</p>
    </div>
  )
}

export default async function AdePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.ade
  const notice = PAGE_MESSAGES[locale].notice

  const used = usedByDir()
  const themes = themeCounts()
  const outside = ADE_SCHEMAS.length - ADE_MAP.used

  /*
   * Дата и версия того, о чём страница говорит.
   *
   * Страница про соответствие стандарту стареет молча: стандарт правят
   * в чужом репозитории, наша копия обновляется отдельной командой,
   * а числа на странице считаются из копии. Читатель, поймавший здесь
   * прошлогоднее состояние, дальше проверяет каждое наше число — и правильно
   * делает. Поэтому версия стандарта, ветка, коммит и день, когда копия
   * снята, стоят на самой странице, а не в истории изменений.
   */
  const copied = new Date(ADE_MAP.fetchedAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <ProductHeader locale={locale} path="/ade" />

      <main className="container-page pb-8">
        <p className="text-[13px] uppercase tracking-[0.09em] text-ink-500">{frame.eyebrow}</p>

        <h1 className="mt-3 max-w-[24ch] text-[38px] font-medium leading-tight sm:text-[46px]">
          {frame.title}
        </h1>

        <p className="mt-5 max-w-[75ch] text-[17px] leading-relaxed text-ink-700">{frame.lead}</p>

        {notice && (
          <p className="mt-5 max-w-[75ch] rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
            {notice}
          </p>
        )}

        <div className="mt-6 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <p>
            «Соответствует ICAR» говорят все, и проверить это со стороны нельзя: ни сертификации,
            ни реестра внедрений у стандарта нет. Единственное, что отличает утверждение от слов, —
            показать, чем именно оно проверяется.
          </p>
        {/*
           Полоса версий стоит сразу под заголовком: это первое, что
           обязан узнать человек, пришедший проверять наше соответствие.
        */}
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-ink-100 bg-white p-5 text-[14px] sm:grid-cols-4 sm:p-6">
          <div>
            <dt className="text-ink-500">Версия стандарта</dt>
            <dd className="mt-1 font-medium tabular-nums">ICAR ADE {ADE_VERSION}</dd>
          </div>
          {/*
             Ветка и коммит — **чужие**, из открытого репозитория ICAR,
             и подписаны так прямо.

             Подпись «Ветка репозитория» без хозяина читалась как наша,
             и вопрос «зачем на витрине внутренности нашего репозитория»
             возникал справедливо. Убрать эти два поля было бы легче
             всего и неверно: именно они делают проверяемым заявление
             «схемы взяты у ICAR и не изменялись». Читатель может открыть
             тот же коммит и сверить файлы побайтно — а без координат
             ему остаётся верить на слово.
          */}
          <div>
            <dt className="text-ink-500">Ветка у ICAR</dt>
            <dd className="mt-1 font-medium">{ADE_MAP.branch}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Копия снята</dt>
            <dd className="mt-1 font-medium tabular-nums">{copied}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Коммит у ICAR</dt>
            <dd className="mt-1 font-medium tabular-nums">{ADE_MAP.commit.slice(0, 10)}</dd>
          </div>
        </dl>

          <p>
            Схемы стандарта лежат копией в дереве проекта, и каждый прогон сверяет с ними то,
            что книга отдаёт наружу. Ниже — что участвует в этой сверке, что не участвует
            и почему.
          </p>
        </div>

        {/*
           Три числа, и среднее из них — главное. Крупное 303 стоит
           первым только потому, что его назовут первым и без нас;
           рядом сразу сказано, сколько из него работает.
        */}
        <div className="card mt-8 flex flex-wrap gap-x-12 gap-y-6">
          <Num value={String(ADE_SCHEMAS.length)} label="файлов схем стандарта в дереве проекта" />
          <Num
            value={String(ADE_MAP.used)}
            label="из них участвуют в сверке наших ресурсов"
          />
          <Num value={String(ADE_OURS.length)} label="ресурсов книги проверяется на каждом прогоне" />
        </div>

        <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
          Разница между {ADE_SCHEMAS.length} и {ADE_MAP.used} — не оговорка. Сверяются
          одиннадцать наших ресурсов; участвуют в сверке те схемы, без которых она не состоится:
          общие предки, типы, перечисления. Остальные {outside} лежат в дереве, чтобы ссылки
          разрешались целиком и чтобы обновление стандарта было видно построчным сравнением —
          включая то, чего книга не делает.
        </p>

        {/* ---------------------------------------------------------- */}

        <section className="mt-16">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
            Что книга отдаёт и принимает
          </h2>
          <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            {ADE_COLLECTIONS.length}{' '}
            {plural(ADE_COLLECTIONS.length, 'коллекция', 'коллекции', 'коллекций')} по адресам
            стандарта; {ADE_WRITABLE.length} из них принимают данные. Остальные закрыты на запись
            намеренно: постановка животного на учёт и переход прав — утверждения, за которые
            отвечает Ассоциация, и они идут заявкой с проверкой.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[12px] uppercase tracking-wide text-ink-400">
                  <th className="py-2 pr-4 font-medium">Что это в книге</th>
                  <th className="py-2 pr-4 font-medium">Схема ICAR</th>
                  <th className="py-2 pr-4 font-medium">Содержание</th>
                  <th className="py-2 font-medium">Приём</th>
                </tr>
              </thead>
              <tbody>
                {ADE_OURS.map((r) => (
                  <tr key={r.schema} className="border-b border-ink-100 align-top">
                    <td className="py-2.5 pr-4 font-medium text-ink-900">{r.title}</td>
                    <td className="py-2.5 pr-4 font-mono text-[13px] text-ink-500">{r.schema}</td>
                    <td className="py-2.5 pr-4 text-ink-700">{r.what}</td>
                    <td className="py-2.5 whitespace-nowrap">
                      {r.write ? (
                        <span className="text-forest-600">принимается</span>
                      ) : (
                        <span className="text-ink-400">только отдача</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}

        <section className="mt-16">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
            Схемы, участвующие в сверке
          </h2>
          <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Наши ресурсы ссылаются на общие предки, те — на типы, типы — на перечисления.
            Замкнутый круг этих ссылок и есть то, чем ответ книги проверяется на самом деле.
            Имена приведены как в репозитории: по ним схему находят за один поиск.
          </p>

          {used.map((g) => (
            <div key={g.dir} className="mt-8">
              <h3 className="text-[15px] font-medium">
                {g.title}{' '}
                <span className="font-normal tabular-nums text-ink-400">— {g.names.length}</span>
              </h3>

              <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 font-mono text-[13px] text-ink-700 sm:grid-cols-2 lg:grid-cols-3">
                {g.names.map((n) => (
                  <div key={n} className="truncate border-b border-ink-100 py-1" title={n}>
                    {n}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ---------------------------------------------------------- */}

        <section className="mt-16">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
            Что в стандарте есть, а в книге нет
          </h2>
          <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            {outside} {plural(outside, 'схема', 'схемы', 'схем')} в сверке не участвуют, и это
            не пробел. Стандарт описывает всю ферму — от кормового стола до убойного цеха, —
            а племенная книга отвечает за происхождение и продуктивность. Границу видно здесь.
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-ink-200 text-left text-[12px] uppercase tracking-wide text-ink-400">
                  <th className="py-2 pr-4 font-medium">Тема стандарта</th>
                  <th className="py-2 pr-4 font-medium">Схем</th>
                  <th className="py-2 font-medium">Почему не у нас</th>
                </tr>
              </thead>
              <tbody>
                {themes.map((t) => (
                  <tr key={t.title} className="border-b border-ink-100 align-top">
                    <td className="py-2.5 pr-4 font-medium text-ink-900">{t.title}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-ink-500">{t.count}</td>
                    <td className="py-2.5 text-ink-700">{t.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Разбор по темам — по ключевому слову в имени схемы. Правило грубое и годится ровно
            для того, ради чего заведено: показать размер стандарта и границы книги.
          </p>
        </section>

        {/* ---------------------------------------------------------- */}

        <section className="mt-16 border-t border-ink-100 pt-10">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
            Что сверка уже нашла
          </h2>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="text-[16px] font-medium">Нашу ошибку</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
                Перечень приплода у отёла уезжал без обязательных полей, которых требует общий
                предок ресурса. Собственная проверка книги пройти мимо была обязана — она про
                предка не знала. Любой партнёр, сверяющий по схеме, отверг бы каждый наш отёл
                с приплодом.
              </p>
            </div>

            <div className="card">
              <h3 className="text-[16px] font-medium">Ошибку в самом стандарте</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
                <code className="rounded bg-ink-100 px-1 text-[13px]">
                  icarTypeClassificationEventResource
                </code>{' '}
                объявляет обязательными два поля, которых не определяет ни сам, ни его предки:
                список обязательных скопирован из соседнего типа при разделении ресурса надвое.
                Выполнить такую схему нельзя ничем. У нас это снято исключением под конкретную
                поломку и печатается отдельной строкой, чтобы не растворилось в зелёном.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}

        <section className="mt-16 max-w-[80ch] border-t border-ink-100 pt-10">
          <h2 className="text-[22px] font-medium leading-tight">Источник и обновление</h2>

          <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
            Схемы взяты из репозитория{' '}
            <a
              href="https://github.com/adewg/ICAR"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-forest-500"
            >
              adewg/ICAR
            </a>{' '}
            под лицензией Apache 2.0, ветка{' '}
            <code className="rounded bg-ink-100 px-1 text-[13px]">{ADE_MAP.branch}</code>, коммит{' '}
            <code className="rounded bg-ink-100 px-1 text-[13px]">
              {ADE_MAP.commit.slice(0, 12)}
            </code>
            . Файлы не изменялись.
          </p>

          <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
            Копия лежит в дереве намеренно. Проверка, ходящая в сеть, падает, когда чужой сервер
            недоступен, и — хуже — проходит, когда он недоступен незаметно. Обновление копии
            видно построчным сравнением: расхождение со стандартом становится событием, которое
            кто-то прочитал и принял.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/${locale}/compliance`}
              className="rounded-full border border-ink-200 px-4 py-2 text-[14px] transition-colors hover:border-ink-400"
            >
              Реестр соответствия
            </Link>
            <Link
              href={`/${locale}/icar`}
              className="rounded-full border border-ink-200 px-4 py-2 text-[14px] transition-colors hover:border-ink-400"
            >
              Разбор по разделам ICAR
            </Link>
            <Link
              href={`/${locale}/api-docs`}
              className="rounded-full border border-ink-200 px-4 py-2 text-[14px] transition-colors hover:border-ink-400"
            >
              Описание интерфейса
            </Link>
          </div>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
