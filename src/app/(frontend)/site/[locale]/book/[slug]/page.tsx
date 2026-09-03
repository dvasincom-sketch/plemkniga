import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { BOOK_FEATURES, featureBySlug } from '@/lib/book-features'
import { CertificateArt } from '@/components/site/CertificateArt'
import { AnimalStates, PedigreeScreen, QualityScreen } from '@/components/site/BookScreens'
import { BOOK_URL, PRODUCT_MAIL } from '@/lib/hosts'

export const metadata: Metadata = { title: 'Раздел книги' }

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
  const feature = featureBySlug(slug)
  if (!feature) notFound()

  const others = BOOK_FEATURES.filter((f) => f.slug !== feature.slug)

  return (
    <>
      <ProductHeader locale={locale} path={`/book/${feature.slug}`} />

      <main className="container-page pb-16">
        <nav className="pt-2 text-[14px] text-ink-500">
          <Link href={`/${locale}`} className="underline underline-offset-4 hover:text-forest-500">
            Что внутри книги
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

           Не у всех он есть, и рисовать «что-нибудь» ради полноты
           не следует: пустой рисунок обесценивает те, что несут смысл.
           Карточка животного, родословная и качество данных показывают
           то, чего текст не передаёт, — чем своё отличается от чужого,
           где книга предупреждает, а где утверждает.
        */}
        {feature.slug === 'animal' && (
          <section className="mt-10">
            <AnimalStates />
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Одна карточка, три прочтения. Разница не в оформлении, а в правах: посторонний
              видит то, что хозяйство открыло, владелец — работу, а у быка другой предмет
              разговора. Нарисовано вёрсткой; значения показаны для примера.
            </p>
          </section>
        )}

        {feature.slug === 'pedigree' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <PedigreeScreen />
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Подтверждённое ДНК помечено, неизвестный предок показан пунктиром. Скрывать
              пропуск нельзя: он меняет смысл коэффициента родства.
            </p>
          </section>
        )}

        {feature.slug === 'quality' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <QualityScreen />
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Находка называет животное и поле — иначе её нельзя исправить. Отказ реестра
              приходит через неделю и говорит про файл.
            </p>
          </section>
        )}

        {feature.slug === 'documents' && (
          <section className="mt-10">
            <div className="max-w-[75ch]">
              <CertificateArt />
            </div>
            <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Разделы, подписи и единицы — из настоящего бланка; значения показаны для примера.
              Рисунок, а не снимок: в выпущенном документе стоят настоящие животные
              и настоящие хозяйства, и на витрине им не место.
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
          <h2 className="text-[18px] font-medium leading-tight">Пределы</h2>
          <ul className="mt-4 space-y-3">
            {feature.limits.map((l) => (
              <li key={l.slice(0, 40)} className="text-[15px] leading-relaxed text-ink-500">
                {l}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-[20px] font-medium leading-tight">Другие разделы</h2>

          {/*
             Подсвечивается вся плашка, а не черта над ней.

             Раньше наведение окрашивало верхнюю границу — полоску
             в один пиксель, отделявшую строку от предыдущей. Отклик
             появлялся не там, куда смотрит человек: указатель стоит
             на слове, а загорается край, причём край **над** словом,
             то есть визуально ближе к соседней строке сверху. В среднем
             столбце это читалось как подчёркивание чужого пункта.

             Плашка с заливкой отвечает на другой вопрос: не «где
             проходит граница», а «что откроется, если нажать». Граница
             остаётся, но перестаёт быть единственным признаком —
             и служит только разделителем, каким и была.
          */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((f) => (
              <Link
                key={f.slug}
                href={`/${locale}/book/${f.slug}`}
                className="rounded-xl border border-ink-100 px-4 py-3 transition-colors hover:border-forest-500 hover:bg-white"
              >
                <span className="text-[15px] font-medium">{f.title}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-12 max-w-[75ch] rounded-2xl bg-forest-500 p-8 text-white sm:p-10">
          <h2 className="text-[22px] font-medium leading-tight sm:text-[26px]">
            Посмотреть, как это работает
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-white/85">
            Голштинская книга открыта: разделы можно открыть и прочитать на живых данных.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a
              href={BOOK_URL}
              className="rounded-xl bg-white px-6 py-3 text-[15px] text-forest-600 transition-colors hover:bg-white/90"
            >
              Открыть племенную книгу
            </a>
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
            >
              Написать нам
            </a>
          </div>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
