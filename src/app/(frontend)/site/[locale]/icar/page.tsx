import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { pick } from '@/lib/i18n/translated'
import {
  ICAR_SECTIONS,
  ICAR_STATE_CLASS,
  ICAR_STATE_LABEL,
  ICAR_STATE_LABEL_EN,
  ICAR_WIKI,
} from '@/lib/icar-map'
import { ICAR_PAGE_TEXT } from '@/lib/icar-page-text'

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
  return siteMetadata(locale, 'icar', '/icar')
}

/**
 * Соответствие руководствам ICAR — карта, а не перевод.
 *
 * ## Почему здесь нет русского текста руководств
 *
 * Соблазн был прямой: перевести нужные разделы и выложить, показав тем самым
 * приверженность мировому опыту. Так делать нельзя, и причина не в лени.
 * Руководства принадлежат ICAR, публикация перевода целиком — нарушение
 * авторских прав, а к нарушению нельзя апеллировать как к доказательству
 * добросовестности: страница, ради которой пришлось нарушить чужое право,
 * доказывает обратное тому, что собиралась доказать.
 *
 * Разрешение у ICAR запрошено отдельно (текст письма — в `docs/icar.md`),
 * и практика у них есть: атлас здоровья копыт переведён на несколько языков
 * с их ведома.
 *
 * ## Почему таблица короткая, а разбор отдельно
 *
 * Первая редакция держала всё на одной странице, и «частично» стояло без
 * объяснений — то есть означало ровно ничего. Дописать объяснение в ту же
 * ячейку не вышло: у одного раздела пробелов три, и каждый требует абзаца
 * про то, чем он опасен и что для него нужно. Таблица от этого перестала
 * бы читаться как таблица.
 *
 * Теперь здесь ответ «где мы», а на `/icar/gaps` — «чего не хватает».
 * Список у обеих страниц один (`lib/icar-map.ts`): разойтись им негде,
 * а расхождение стоило бы дороже всего — читатель поверил бы той странице,
 * которую открыл первой.
 *
 * ## Почему весь текст страницы лежит в наборе строк
 *
 * Набранный прямо в разметке абзац перевода не видит: заголовок
 * и подводка приходили переведёнными, а тело оставалось русским,
 * и английская страница читалась как брошенная на полпути. Слова
 * страницы теперь в `lib/icar-page-text.ts`, а разборы разделов —
 * английскими полями рядом с русскими в `lib/icar-map.ts`.
 *
 * ## Почему знака ICAR здесь нет
 *
 * Марка выдаётся Советом организации по статусу члена или по пройденной
 * проверке, а не за соответствие руководствам. Соответствие — это то, что
 * нужно доказать, чтобы подать заявку, а не то, что даёт право на знак.
 */
export default async function IcarPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.icar

  const picked = pick(ICAR_PAGE_TEXT, locale)
  const text = picked.value.map

  /*
   * Оговорка «текст ниже по-русски» стоит только там, где он и правда
   * русский. Раньше она показывалась на всех нерусских языках без разбора —
   * в том числе на английском, где переведено уже всё, — и извинялась
   * за то, чего нет.
   */
  const notice = picked.fallback ? PAGE_MESSAGES[locale].notice : null

  /*
   * Разборы разделов идут за языком, на котором показан текст страницы,
   * а не за языком в адресе: на казахской странице тело русское, и русские
   * разборы рядом с ним на месте, а английские выглядели бы третьим языком
   * на одной странице.
   */
  const english = picked.shown === 'en'

  return (
    <>
      <ProductHeader locale={locale} path="/icar" />

      <main className="container-page pb-8">
        <p className="text-[14px] uppercase tracking-wide text-forest-500">{frame.eyebrow}</p>

        <h1 className="max-w-[26ch] mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">
          {frame.title}
        </h1>

        <p className="mt-5 max-w-[75ch] text-[17px] leading-relaxed text-ink-700">{frame.lead}</p>

        {notice && (
          <p className="mt-5 max-w-[75ch] rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
            {notice}
          </p>
        )}

        <div className="mt-6 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          {text.intro.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>

        {/*
           Оговорка стоит до таблицы, а не после неё. После — её прочтут
           те немногие, кто дочитал; а знать, что это пересказ, а не перевод,
           нужно до того, как первая строка будет принята за цитату.
        */}
        <div className="card mt-8 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
          <p>{text.disclaimer}</p>
        </div>

        <div className="card mt-6">
          <div className="overflow-x-auto">
            <table className="metric-table">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">{text.table.section}</th>
                  <th>{text.table.about}</th>
                  <th>{text.table.ours}</th>
                  <th className="whitespace-nowrap">{text.table.state}</th>
                </tr>
              </thead>
              <tbody>
                {ICAR_SECTIONS.map((r) => (
                  <tr key={r.section}>
                    <td className="min-w-[13rem] align-top">
                      <a
                        href={`${ICAR_WIKI}${r.wiki}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 hover:text-forest-500"
                      >
                        {english ? r.titleEn : r.title}
                      </a>
                      <span className="block text-[12px] tabular-nums text-ink-500">
                        Section {r.section}
                      </span>
                    </td>
                    <td className="max-w-[34ch] align-top text-[14px] leading-relaxed text-ink-700">
                      {english ? r.aboutEn : r.about}
                    </td>
                    <td className="max-w-[38ch] align-top text-[14px] leading-relaxed text-ink-700">
                      {english ? r.oursEn : r.ours}
                    </td>
                    <td className="align-top">
                      <span
                        className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] ${ICAR_STATE_CLASS[r.state]}`}
                      >
                        {english ? ICAR_STATE_LABEL_EN[r.state] : ICAR_STATE_LABEL[r.state]}
                      </span>
                      {/*
                         Ссылка ведёт к разбору именно этого раздела, а не
                         к началу страницы пробелов. Состояние «частично»
                         без объяснения — то же самое, что его отсутствие,
                         и один клик между ними лишний.
                      */}
                      {r.gaps.length > 0 && (
                        <Link
                          href={`/${locale}/icar/gaps#${r.slug}`}
                          className="mt-1.5 block whitespace-nowrap text-[12px] underline underline-offset-4 hover:text-forest-500"
                        >
                          {text.gapsLink}: {r.gaps.length}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 max-w-[90ch] text-[13px] leading-relaxed text-ink-500">
            {text.outNote.lead}{' '}
            {/*
               Ссылка на разбор ведёт на страницу того же языка. Адрес без
               языка перенаправляется на русскую версию, и читатель
               английской страницы уходил с неё молча.
            */}
            <Link
              href={`/${locale}/icar/gaps`}
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {text.outNote.link}
            </Link>{' '}
            {text.outNote.tail}
          </p>
        </div>

        <div className="mt-8 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <h2 className="text-[22px] font-medium leading-tight">{text.open.title}</h2>
          <p>
            {text.open.lead}{' '}
            <a
              href="https://wiki.icar.org/index.php/Guidelines"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {text.open.wiki}
            </a>{' '}
            {text.open.afterWiki}{' '}
            <a
              href="https://github.com/adewg/ICAR"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {text.open.github}
            </a>{' '}
            {text.open.afterGithub}{' '}
            <a
              href="https://www.icar.org/publications/technical-series-and-proceedings/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {text.open.series}
            </a>{' '}
            {text.open.afterSeries}
          </p>
        </div>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
