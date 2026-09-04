import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { BOOK_FEATURES, featureFor, featureIsFallback, featuresFor } from '@/lib/book-features'
import { BOOK_PAGE_TEXT } from '@/lib/book-page-text'
import { FALLBACK_NOTICE, pick } from '@/lib/i18n/translated'
import { pageMetadata } from '@/lib/seo'
import { CertificateArt } from '@/components/site/CertificateArt'
import {
  AccessScreen,
  AnimalStates,
  ConformationScreen,
  ExchangeScreen,
  IndexScreen,
  MatingScreen,
  MilkScreen,
  PedigreeScreen,
  QualityScreen,
  ReportsScreen,
  SubmissionsScreen,
} from '@/components/site/BookScreens'
import { WindowFrame } from '@/components/site/WindowFrame'
import { BOOK_URL, PRODUCT_MAIL } from '@/lib/hosts'

/*
 * Заголовок и описание берутся у самого раздела: у него уже есть имя
 * и короткая строка о том, что он делает. Общий заголовок «Раздел
 * книги» на двенадцати страницах означал, что в выдаче они неотличимы
 * друг от друга — и человек, искавший «подбор пар инбридинг», видел
 * двенадцать одинаковых строк.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const safe: Locale = isLocale(locale) ? locale : 'ru'
  const feature = featureFor(slug, safe)
  /*
   * Раздела с таким адресом нет, и страница ниже покажет «не найдено».
   * Заголовок вкладки при этом всё равно нужен, и нужен на языке
   * читателя: русское «Раздел книги» на английском адресе — тот самый
   * шов, из-за которого страница выглядит переведённой наполовину.
   */
  if (!feature) return { title: pick(BOOK_PAGE_TEXT, safe).value.unknown }

  /*
   * Заголовок в выдаче — на языке страницы. Русский заголовок
   * у английской страницы означал бы, что в поиске её не найдут вовсе:
   * искать будут по английским словам, а стоять будет русское.
   */
  const text = pick(BOOK_PAGE_TEXT, safe).value

  return pageMetadata({
    title: `${feature.title} — ${text.titleSuffix}`,
    description: feature.short,
    path: `/${locale}/book/${slug}`,
  })
}

/**
 * Разбор одного раздела книги.
 *
 * ## Почему страница, а не подсказка при наведении
 *
 * Перечень на главной отвечает «что здесь есть». Следующий вопрос —
 * «а что это значит» — требует абзацев, оговорок и пределов. Всплывающая
 * подсказка их не вмещает, а раздутая строка перечня превращает список
 * в стену, которую пролистывают целиком.
 *
 * ## Почему у каждого раздела названы пределы
 *
 * Раздел без пределов читается как реклама, и первый же специалист
 * спрашивает именно про них: сколько поколений, какая точность, что
 * будет, если данных нет. Отвечать до вопроса дешевле, чем после.
 */
export default async function BookFeaturePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const notice = PAGE_MESSAGES[locale].notice
  const feature = featureFor(slug, locale)
  if (!feature) notFound()

  /*
   * Слова страницы и текст раздела берутся по языку читателя, а откат
   * на русский не прячется: строка о нём стоит там же, где оговорка
   * о непроверенном переводе. Молчаливая подмена языка и есть та беда,
   * из-за которой страницы выглядели «переведёнными наполовину».
   */
  const text = pick(BOOK_PAGE_TEXT, locale).value
  const fallback = featureIsFallback(slug, locale)

  const others = featuresFor(locale).filter((f) => f.slug !== feature.slug)

  /*
     Рисунок раздела — там, где у раздела есть визуальный код.

     Прежде каждый рисунок стоял своей веткой `feature.slug === '…'`
     с собственной вёрсткой и собственной подписью. Двенадцать почти
     одинаковых кусков разъезжались оформлением на первой же правке,
     а подписи — русские, набранные прямо здесь — не переводились
     никогда: перевод их попросту не видел.

     Теперь здесь только сами рисунки, а подписи и заголовки окон живут
     в наборе строк по языкам (`lib/book-page-text.ts`).

     `wide` — рисунок шире колонки текста: карточка животного в трёх
     прочтениях и две формы одного доения ставятся рядом, и в семьдесят
     пять знаков они не помещаются.

     Язык у рисунка тот же, что у страницы: подписи внутри экранов лежат
     в своём наборе строк (`lib/book-screens-text.ts`) и откатываются
     на русский там, где перевода нет, — так же, как сам разбор раздела.
     Прежде экраны были русскими на всех шести языках, и английская
     страница выходила текстом на одном языке и картинкой на другом.
  */
  const SCREENS: Record<string, { node: React.ReactNode; wide?: boolean }> = {
    animal: { node: <AnimalStates locale={locale} />, wide: true },
    pedigree: { node: <PedigreeScreen locale={locale} /> },
    quality: { node: <QualityScreen locale={locale} /> },
    milk: { node: <MilkScreen locale={locale} /> },
    index: { node: <IndexScreen locale={locale} /> },
    conformation: { node: <ConformationScreen locale={locale} /> },
    mating: { node: <MatingScreen locale={locale} /> },
    reports: { node: <ReportsScreen locale={locale} /> },
    access: { node: <AccessScreen locale={locale} /> },
    submissions: { node: <SubmissionsScreen locale={locale} /> },
    exchange: { node: <ExchangeScreen locale={locale} />, wide: true },
    documents: { node: <CertificateArt locale={locale} /> },
  }

  const screen = SCREENS[feature.slug]
  const frame = text.frame[feature.slug]

  return (
    <>
      <ProductHeader locale={locale} path={`/book/${feature.slug}`} />

      <main className="container-page pb-16">
        <nav className="text-[14px] text-ink-500">
          <Link href={`/${locale}`} className="underline underline-offset-4 hover:text-forest-500">
            {text.crumb}
          </Link>
        </nav>

        <section className="mt-6 max-w-[75ch]">
          <h1 className="text-[34px] font-medium leading-tight sm:text-[42px]">{feature.title}</h1>

          <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{feature.short}</p>

          {notice && (
            <p className="mt-5 rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
              {notice}
            </p>
          )}

          {/*
             Откат на русский назван вслух и стоит там же, где оговорка
             о непроверенном переводе, — то есть до текста, а не после.
             Читатель, увидевший кириллицу на английской странице, должен
             узнать причину раньше, чем решит, что мы неряшливы.
          */}
          {fallback && (
            <p className="mt-3 rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
              {FALLBACK_NOTICE}
            </p>
          )}
        </section>

        <section className="mt-10 max-w-[75ch] space-y-5">
          {feature.body.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="text-[16px] leading-relaxed text-ink-700">
              {paragraph}
            </p>
          ))}
        </section>

        {/*
           Документ — единственное, что уходит из книги наружу и попадает
           в руки покупателю. Про него спрашивают первым, и словами
           («выдаём свидетельство») этот вопрос не закрывается: выдают все.
           Показанный бланк отвечает сразу — что в нём есть, по какой форме
           он сделан и чем проверяется.
        */}
        {/*
           Экран раздела там, где у раздела есть визуальный код.

           Долгое время три раздела — отчёты, доступы и заявки — стояли
           без рисунка, и довод был такой: рисовать «что-нибудь» ради
           полноты значит обесценить те рисунки, которые несут смысл.
           Довод верный, но вывод из него был сделан поспешный: у всех
           трёх визуальный код нашёлся, просто он не в том, о чём раздел
           говорит первой строкой.

           У отчётов это не показатели, а раскрытая строка: число,
           под которым лежат те самые животные. У доступов — не роли
           (их уже показывает карточка в трёх прочтениях), а выдача
           на одно животное с записью в журнале. У заявок — не загрузка,
           а разбор пакета на три исхода и кнопка с двумя числами.

           Правило от этого не отменяется, а уточняется: сначала ищется
           утверждение, которого нет в тексте, и только потом рисунок.
           Раздел, у которого такого утверждения не нашлось, остаётся
           без картинки — но искать надо не в заголовке.
        */}
        {screen && (
          <section className="mt-10">
            <div className={screen.wide ? undefined : 'max-w-[75ch]'}>
              {frame ? (
                <WindowFrame title={frame.title} subtitle={frame.subtitle}>
                  {screen.node}
                </WindowFrame>
              ) : (
                screen.node
              )}
            </div>

            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              {text.note[feature.slug]}
            </p>
          </section>
        )}

        {/*
           Пределы — отдельным блоком и другим цветом. Смешанные с общим
           текстом, они читаются как оговорка мелким шрифтом; вынесенные,
           они читаются как то, чем и являются: границей, названной
           до вопроса.
        */}
        <section className="mt-10 max-w-[75ch] rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
          <h2 className="text-[18px] font-medium leading-tight">{text.limits}</h2>
          <ul className="mt-4 space-y-3">
            {feature.limits.map((l) => (
              <li key={l.slice(0, 40)} className="text-[15px] leading-relaxed text-ink-500">
                {l}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-[20px] font-medium leading-tight">{text.others}</h2>

          {/*
             Подсвечивается вся плашка, а не черта над ней.

             Раньше наведение окрашивало верхнюю границу — полоску
             в один пиксель, отделявшую строку от предыдущей. Отклик
             появлялся не там, куда смотрит человек: указатель стоит
             на слове, а загорается край, причём край **над** словом,
             то есть визуально ближе к соседней строке сверху. В среднем
             столбце это читалось как подчёркивание чужого пункта.

             Плашка отвечает на другой вопрос: не «где проходит граница»,
             а «что откроется, если нажать».

             Заливка при этом белая всегда, а наведение меняет только цвет
             рамки. Первая редакция делала наоборот — подкрашивала фон
             при наведении, — и плашка вспыхивала ярче всего остального
             на странице. Отклик обязан быть тише содержимого: он
             подтверждает, что попал, а не зовёт нажать. Точно так же
             отвечают карточки разделов на главной, и заводить второй
             способ откликаться было незачем.
          */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((f) => (
              <Link
                key={f.slug}
                href={`/${locale}/book/${f.slug}`}
                className="rounded-xl border border-ink-100 bg-white px-4 py-3 transition-colors hover:border-forest-500"
              >
                <span className="text-[15px] font-medium">{f.title}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12 max-w-[75ch] rounded-2xl bg-forest-500 p-8 text-white sm:p-10">
          <h2 className="text-[22px] font-medium leading-tight sm:text-[26px]">
            {text.ctaTitle}
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-white/85">
            {text.ctaLead}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a
              href={BOOK_URL}
              className="rounded-xl bg-white px-6 py-3 text-[15px] text-forest-600 transition-colors hover:bg-white/90"
            >
              {text.ctaOpen}
            </a>
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
            >
              {text.ctaMail}
            </a>
          </div>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
