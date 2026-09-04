import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, LOCALE_CODES, type Locale } from '@/lib/i18n/locales'
import { pick } from '@/lib/i18n/translated'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ICAR_WIKI, ICAR_WITH_GAPS } from '@/lib/icar-map'
import { ICAR_PAGE_TEXT } from '@/lib/icar-page-text'

/*
 * Единственная страница витрины, у которой не было ни описания,
 * ни указания основной версии, — нашёл `check:seo`. Заголовок был,
 * и потому пропажа не бросалась в глаза.
 *
 * Рамки в наборе строк у страницы нет (она не раздел продукта,
 * а разбор внутри раздела), поэтому заголовок и описание берутся
 * из её же слов: они уже написаны и переведены, и второе описание
 * для робота никто не читает и потому никто не правит.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const safe: Locale = isLocale(locale) ? locale : 'ru'
  const meta = pick(ICAR_PAGE_TEXT, safe).value.gaps.meta

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: `/${safe}/icar/gaps`,
      languages: Object.fromEntries(LOCALE_CODES.map((c) => [c, `/${c}/icar/gaps`])),
    },
  }
}

/**
 * Разбор пробелов: чего в книге нет, чем это грозит и что для этого нужно.
 *
 * ## Зачем такая страница вообще
 *
 * На карте соответствия стояло «частично» без объяснений — то есть слово,
 * которое не сообщает ничего. Читатель волен был понять его и как «почти
 * всё готово», и как «почти ничего»; оба прочтения одинаково обоснованы,
 * и значит, слово стояло зря.
 *
 * ## Почему пробелы описаны так подробно и так невыгодно
 *
 * Потому что иначе они описаны не будут. Список недостатков, написанный
 * с оглядкой на то, как он выглядит, превращается в список достоинств
 * с оговорками, и первый же специалист, открывший систему, найдёт то,
 * о чём здесь умолчали, — и дальше не поверит уже ничему.
 *
 * Заводчик или эксперт, читающий эту страницу, узнаёт границы системы
 * за десять минут вместо трёх месяцев внедрения. Это выгодная сделка
 * для обеих сторон, и невыгодной она кажется только до первого разговора,
 * начатого не с обмана.
 *
 * ## Форма: три вопроса на каждый пробел
 *
 * «Чего нет», «почему это важно», «что для этого нужно». Третий пункт
 * обязателен: пробел без ответа на вопрос «что делать» — это жалоба,
 * а не работа. Там, где сделать нельзя (закрыто членством, требует решения
 * Ассоциации, требует научной работы), так и написано — это тоже ответ.
 *
 * ## Где смотреть
 *
 * Список общий с картой: `src/lib/icar-map.ts`. Правится там, а не здесь.
 */
export default async function IcarGapsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw

  const picked = pick(ICAR_PAGE_TEXT, locale)
  const text = picked.value.gaps

  /* Оговорка про русский текст — только там, где он и правда русский. */
  const notice = picked.fallback ? PAGE_MESSAGES[locale].notice : null

  /* Разборы идут за языком показанного текста, а не за языком в адресе. */
  const english = picked.shown === 'en'

  return (
    <>
      <ProductHeader locale={locale} path="/icar/gaps" />

      <main className="container-page pb-8">
        <Breadcrumbs
          items={[
            { label: text.breadcrumbs.map, href: `/${locale}/icar` },
            { label: text.breadcrumbs.here },
          ]}
        />

        <h1 className="text-[38px] font-medium sm:text-[46px]">{text.title}</h1>

        {notice && (
          <p className="mt-5 max-w-[75ch] rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
            {notice}
          </p>
        )}

        <div className="mt-6 max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
          <p>
            {text.intro.before}{' '}
            <Link
              href={`/${locale}/icar`}
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {text.intro.link}
            </Link>{' '}
            {text.intro.after}
          </p>
          <p>{text.lead}</p>
        </div>

        {/*
           Оглавление ссылками на якоря: пробелов полтора десятка, и человек,
           пришедший из таблицы по ссылке на конкретный раздел, должен видеть,
           что рядом есть остальные, — но не должен ради этого прокручивать
           всю страницу обратно.
        */}
        <nav aria-label={text.navLabel} className="mt-8 flex flex-wrap gap-x-4 gap-y-2">
          {ICAR_WITH_GAPS.map((s) => (
            <a
              key={s.slug}
              href={`#${s.slug}`}
              className="text-[14px] text-ink-500 underline underline-offset-4 transition-colors hover:text-forest-500"
            >
              {english ? s.titleEn : s.title}{' '}
              <span className="tabular-nums text-ink-300">({s.gaps.length})</span>
            </a>
          ))}
        </nav>

        {ICAR_WITH_GAPS.map((s) => (
          <section key={s.slug} id={s.slug} className="mt-14 scroll-mt-8">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="text-[26px] font-medium leading-tight">
                {english ? s.titleEn : s.title}
              </h2>
              <a
                href={`${ICAR_WIKI}${s.wiki}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] tabular-nums text-ink-500 underline underline-offset-4 hover:text-forest-500"
              >
                Section {s.section} ↗
              </a>
            </div>

            <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              {english ? s.aboutEn : s.about}
            </p>

            <p className="mt-3 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
              <span className="text-ink-700">{text.labels.ours}</span>{' '}
              {english ? s.oursEn : s.ours}
            </p>

            <div className="mt-6 space-y-4">
              {s.gaps.map((g) => (
                <div key={g.what} className="rounded-2xl border border-ink-100 p-6">
                  <h3 className="max-w-[70ch] text-[17px] font-medium leading-snug">
                    {english ? g.whatEn : g.what}
                  </h3>

                  <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                    <span className="text-ink-500">{text.labels.why}</span>{' '}
                    {english ? g.whyEn : g.why}
                  </p>

                  <p className="mt-3 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                    <span className="text-ink-500">{text.labels.need}</span>{' '}
                    {english ? g.needEn : g.need}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-16 max-w-[80ch] rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
          <h2 className="text-[22px] font-medium leading-tight">{text.outro.title}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
            {text.outro.body}{' '}
            <Link
              href={`/${locale}/icar`}
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {text.outro.link}
            </Link>
            {text.outro.tail}
          </p>
        </div>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
