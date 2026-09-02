import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteFooter } from '@/components/SiteFooter'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { Logo } from '@/components/Logo'
import { EAEU_MESSAGES } from '@/lib/i18n/eaeu-messages'
import { LOCALE_CODES, isLocale, localeInfo, type Locale } from '@/lib/i18n/locales'

/**
 * Страница-предложение для стран ЕАЭС.
 *
 * ## Почему отдельная страница, а не перевод главной
 *
 * Главная обращается к членам Ассоциации, которые уже внутри: у неё
 * поиск по книге, вход в кабинет, новости. Эта — к тем, кто снаружи
 * и в другой стране, и отвечает на другие вопросы: что это, что решает,
 * на чём построено, как посмотреть. Переводить ради этого главную
 * значило бы получить страницу, которая ни одному из двух читателей
 * не годится.
 *
 * ## Почему заголовок и подвал не свои
 *
 * Подвал общий — в нём адрес, контакты и правовые документы, и они
 * одни на всю систему. Он по-русски, и это осознанно: реквизиты
 * российского юридического лица переводить нельзя, их сверяют
 * по буквам. А вот шапка своя, короткая: полное меню книги человеку
 * снаружи ничего не говорит и уводит его в разделы, куда он всё равно
 * не войдёт.
 *
 * ## Почему `lang` на обёртке, а не на `<html>`
 *
 * Корневой раскладке `(frontend)` язык неоткуда взять: она общая
 * для всего приложения и не видит параметров маршрута, а второй корневой
 * раскладки под языковую ветку в этом дереве не завести без переноса
 * всех остальных страниц. Атрибут `lang` допустим на любом элементе
 * и именно так и толкуется — программы чтения с экрана и переводчики
 * браузера берут ближайший. Расплата одна: в `<html>` остаётся `ru`,
 * и это стоит поправить, когда язык получит вся система.
 *
 * ## Оговорка о непроверенном переводе
 *
 * Четыре языка из шести переведены без носителя. Показывать их молча
 * было бы тем же самым, что показывать посчитанное число, не сказав,
 * из чего оно посчитано: специалист опознает машинный перевод термина
 * с первой строки, а мы — нет. Строка внизу говорит об этом прямо
 * и исчезает сама, когда в `locales.ts` язык помечен проверенным.
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
     * Перекрёстные ссылки на переводы. Без них поисковик считает шесть
     * страниц дублями и выбирает одну на свой вкус — обычно не ту.
     * `x-default` указывает на развилку: она сама разберётся.
     */
    alternates: {
      canonical: `/eaeu/${locale}`,
      languages: {
        ...Object.fromEntries(LOCALE_CODES.map((c) => [c, `/eaeu/${c}`])),
        'x-default': '/eaeu',
      },
    },
  }
}

export default async function EaeuPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const m = EAEU_MESSAGES[locale]
  const info = localeInfo(locale)

  return (
    <div lang={locale}>
      {/*
         Своя шапка: знак Ассоциации, переключатель языка и одна ссылка
         обратно. Всё остальное меню обращено к тем, кто уже внутри книги.
      */}
      <header className="container-page flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-6">
        <Link href="/" aria-label={m.nav.home}>
          <Logo />
        </Link>

        {/*
           Адреса собраны здесь и уходят готовым объектом: через границу
           «сервер → клиент» проходят только данные, функции — нет.
        */}
        <LocaleSwitcher
          active={locale}
          label={m.nav.language}
          hrefs={Object.fromEntries(LOCALE_CODES.map((l) => [l, `/eaeu/${l}`])) as Record<Locale, string>}
        />
      </header>

      <main className="container-page pb-8">
        <section className="max-w-[68ch] pt-6">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">{m.hero.eyebrow}</p>

          <h1 className="mt-3 text-[38px] font-medium leading-tight sm:text-[52px]">
            {m.hero.title}
          </h1>

          <p className="mt-6 text-[17px] leading-relaxed text-ink-700">{m.hero.lead}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="mailto:info@holstein-russia.ru"
              className="rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
            >
              {m.hero.cta}
            </a>
            <Link
              href="/icar"
              className="text-[15px] underline underline-offset-4 hover:text-forest-500"
            >
              {m.hero.ctaSecondary}
            </Link>
          </div>
        </section>

        <section className="mt-16 max-w-[68ch]">
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

        <section className="mt-16 max-w-[68ch]">
          <h2 className="text-[26px] font-medium leading-tight">{m.standards.title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.standards.body}</p>
          <Link
            href="/icar"
            className="mt-4 inline-block text-[15px] underline underline-offset-4 hover:text-forest-500"
          >
            {m.standards.link}
          </Link>
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

        <section className="mt-16 max-w-[68ch] rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
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
          <p className="mt-10 max-w-[68ch] text-[13px] leading-relaxed text-ink-500">
            {m.draft.notice}{' '}
            <Link href="/eaeu/ru" className="underline underline-offset-4 hover:text-forest-500">
              Русский
            </Link>
            {' · '}
            <Link href="/eaeu/en" className="underline underline-offset-4 hover:text-forest-500">
              English
            </Link>
          </p>
        )}
      </main>

      {/*
         Подвал по-русски внутри страницы на другом языке. Разметка `lang`
         на нём отдельная: реквизиты российского юридического лица
         не переводятся, но синтезатор речи должен знать, на каком языке
         их читать.
      */}
      <div lang="ru">
        <SiteFooter />
      </div>
    </div>
  )
}
