import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { PlemLogo } from '@/components/PlemLogo'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { EAEU_MESSAGES } from '@/lib/i18n/eaeu-messages'
import { SITE_MESSAGES } from '@/lib/i18n/site-messages'
import { LOCALE_CODES, isLocale, localeInfo, type Locale } from '@/lib/i18n/locales'
import { BOOK_URL, SITE_PREFIX, isSiteHost } from '@/lib/hosts'

/**
 * Витрина продукта — то, что видно на `plem.online`.
 *
 * ## Чем она отличается от страницы для стран ЕАЭС
 *
 * Содержанием — почти ничем, и это осознанно: обе рассказывают, что это
 * за система и какие задачи она закрывает. Тексты берутся из одного
 * набора, и правятся в одном месте.
 *
 * Отличается обращением. Страница союза говорит «вот решение для стран
 * ЕАЭС» и стоит внутри сайта Ассоциации, с её знаком и её подвалом.
 * Витрина говорит «вот продукт», носит собственный знак ПЛЕМ и **не имеет
 * подвала Ассоциации вовсе**.
 *
 * Последнее — не мелочь оформления. В подвале книги стоят адрес, телефон
 * и правовые документы Ассоциации производителей КРС голштинской породы.
 * Показать их на витрине продукта значило бы сказать чужому хозяйству
 * из другой страны, что оно обращается в Самару к голштинской ассоциации,
 * — а оно обращается к разработчику системы. Разные лица, разная
 * ответственность, разные реквизиты.
 *
 * ## Почему адреса собираются от приставки, а не пишутся прямо
 *
 * На витринном домене промежуточный обработчик превращает `/ru`
 * в `/site/ru`, и человек видит короткий адрес. На книжном домене
 * та же страница живёт по настоящему `/site/ru`. Ссылка внутри страницы
 * обязана вести туда, откуда пришёл читатель, — иначе переключение
 * языка на одном из двух доменов роняет в «страница не найдена».
 *
 * ## Ссылка на книгу — абсолютная
 *
 * `holstein.plem.online` — другой домен, и относительный адрес увёл бы
 * на несуществующую страницу витрины. Это единственное место, где адрес
 * пишется целиком.
 */

export function generateStaticParams() {
  return LOCALE_CODES.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}

  const m = EAEU_MESSAGES[locale]

  return {
    title: m.meta.title,
    description: m.meta.description,
    /*
     * Каноничный адрес всегда витринный, даже когда страницу открыли
     * на книжном домене по служебному пути. Иначе поисковик сочтёт две
     * копии дублями и выберет ту, которую людям показывать не надо.
     */
    alternates: {
      canonical: `https://plem.online/${locale}`,
      languages: {
        ...Object.fromEntries(LOCALE_CODES.map((c) => [c, `https://plem.online/${c}`])),
        'x-default': 'https://plem.online/',
      },
    },
  }
}

export default async function SitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const m = EAEU_MESSAGES[locale]
  const s = SITE_MESSAGES[locale]
  const info = localeInfo(locale)

  const host = (await headers()).get('host')
  const base = isSiteHost(host) ? '' : SITE_PREFIX

  return (
    <div lang={locale}>
      <header className="container-page flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-8">
        <PlemLogo />

        <LocaleSwitcher
          active={locale}
          label={m.nav.language}
          hrefs={
            Object.fromEntries(LOCALE_CODES.map((l) => [l, `${base}/${l}`])) as Record<
              Locale,
              string
            >
          }
        />
      </header>

      <main className="container-page pb-8">
        <section className="max-w-[70ch] pt-6">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">{s.eyebrow}</p>

          <h1 className="mt-3 text-[38px] font-medium leading-tight sm:text-[52px]">
            {m.hero.title}
          </h1>

          <p className="mt-6 text-[17px] leading-relaxed text-ink-700">{m.hero.lead}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={BOOK_URL}
              className="rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
            >
              {s.book.cta}
            </a>
            <a
              href={`${BOOK_URL}/compliance`}
              className="text-[15px] underline underline-offset-4 hover:text-forest-500"
            >
              {s.footer.note}
            </a>
          </div>
        </section>

        <section className="mt-16 max-w-[70ch]">
          <h2 className="text-[26px] font-medium leading-tight">{m.problem.title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.problem.body}</p>
        </section>

        <section className="mt-16">
          <h2 className="text-[26px] font-medium leading-tight">{m.features.title}</h2>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {m.features.items.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]"
              >
                <h3 className="text-[17px] font-medium leading-tight">{item.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-[26px] font-medium leading-tight">{m.who.title}</h2>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[m.who.farms, m.who.associations].map((who) => (
              <div key={who.title} className="rounded-2xl border border-ink-100 p-6">
                <h3 className="text-[17px] font-medium leading-tight">{who.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{who.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/*
           Действующая книга — отдельным блоком и ближе к концу.
           Это самое сильное, что можно сказать продукту: не «умеет»,
           а «работает, вот адрес». Ставить такое в начало рано —
           читатель ещё не знает, о чём речь.
        */}
        <section className="mt-16 max-w-[70ch] rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
          <h2 className="text-[26px] font-medium leading-tight">{s.book.title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{s.book.body}</p>
          <a
            href={BOOK_URL}
            className="mt-6 inline-block rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
          >
            {s.book.cta}
          </a>
        </section>

        <section className="mt-16 max-w-[70ch]">
          <h2 className="text-[26px] font-medium leading-tight">{m.standards.title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.standards.body}</p>
          <a
            href={`${BOOK_URL}/compliance`}
            className="mt-4 inline-block text-[15px] underline underline-offset-4 hover:text-forest-500"
          >
            {m.standards.link}
          </a>
        </section>

        <section className="mt-16 max-w-[70ch]">
          <h2 className="text-[26px] font-medium leading-tight">{m.contact.title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.contact.body}</p>
          <a
            href="mailto:info@holstein-russia.ru"
            className="mt-6 inline-block rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
          >
            {m.contact.action}
          </a>
        </section>

        {!info.reviewed && (
          <p className="mt-14 max-w-[70ch] text-[13px] leading-relaxed text-ink-500">
            {m.draft.notice}{' '}
            <Link href={`${base}/ru`} className="underline underline-offset-4 hover:text-forest-500">
              Русский
            </Link>
            {' · '}
            <Link href={`${base}/en`} className="underline underline-offset-4 hover:text-forest-500">
              English
            </Link>
          </p>
        )}
      </main>

      {/*
         Свой подвал, а не общий. В общем стоят адрес, телефон и правовые
         документы Ассоциации — на витрине продукта они назвали бы
         не то лицо. Здесь только знак, авторство и ссылка на книгу.
      */}
      <footer style={{ marginTop: 'var(--footer-air)' }} className="bg-basement py-10 text-white">
        <div className="container-page flex flex-wrap items-center justify-between gap-x-8 gap-y-6">
          <span className="rounded-xl bg-white px-4 py-3">
            <PlemLogo />
          </span>

          <nav
            aria-label={m.nav.language}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]"
          >
            <a
              href={BOOK_URL}
              className="text-white/50 underline underline-offset-4 transition-colors hover:text-white"
            >
              {s.book.cta}
            </a>
            <a
              href={`${BOOK_URL}/compliance`}
              className="text-white/50 underline underline-offset-4 transition-colors hover:text-white"
            >
              {s.footer.note}
            </a>
            <a
              href={`${BOOK_URL}/api-docs`}
              className="text-white/50 underline underline-offset-4 transition-colors hover:text-white"
            >
              API
            </a>
          </nav>
        </div>

        <div className="container-page mt-8 border-t border-white/10 pt-6" lang="ru">
          <p className="text-[13px] text-white/50">
            © 2026 Разработка и платформа:{' '}
            <a
              href="https://t.me/dvasin"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/75 underline underline-offset-4 transition-colors hover:text-brand-400"
            >
              Дмитрий Васин
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
