import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { PlemLogo } from '@/components/PlemLogo'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { FEATURE_ICONS, FlowArt, LayersArt, RankArt } from '@/components/site/SiteArt'
import { PRODUCT_MESSAGES } from '@/lib/i18n/product-messages'
import { SITE_MESSAGES } from '@/lib/i18n/site-messages'
import { LOCALE_CODES, isLocale, localeInfo, type Locale } from '@/lib/i18n/locales'
import { BOOK_URL, PRODUCT_MAIL, SITE_PREFIX, isSiteHost } from '@/lib/hosts'

/**
 * Витрина продукта — то, что видно на `plem.online`.
 *
 * ## Единственное место, где живёт это предложение
 *
 * Прежде такая же страница стояла внутри книги, по адресу `/eaeu/ru`.
 * С появлением своего домена она стала второй копией одного текста —
 * и копией на домене голштинской ассоциации: хозяйство из Казахстана,
 * пришедшее по ссылке, читало предложение продукта с чужим знаком,
 * чужим подвалом и чужими реквизитами. Страница удалена, адрес
 * перенаправлен сюда постоянным перенаправлением.
 *
 * Поэтому здесь **нет подвала Ассоциации вовсе**: на витрине он назвал бы
 * не то лицо — читатель обращается к разработчику системы, а не в Самару.
 *
 * ## Порядок разделов — это порядок сомнений
 *
 * Не «что умеем», а «что вас беспокоит». Сначала четыре числа: они
 * отвечают на «зачем мне это сейчас». У русского набора четвёртое —
 * срок, с которого регистрация в государственном реестре обязательна;
 * у остальных языков там международный довод, потому что чужой срок
 * либо принимают на свой счёт, либо перестают верить и остальным трём
 * числам. Потом три контура учёта — на «а разве у меня этого нет».
 * Потом возможности, путь данных и рейтинг — на «а как это работает».
 * И только в конце «система работает, вот адрес», потому что до этого
 * места читателю нечего было открывать.
 *
 * Список возможностей нарочно стоит не первым. Он убедителен для того,
 * кто уже понял задачу, и бессмыслен для того, кто ещё не понял.
 *
 * ## Почему схемы, а не фотографии
 *
 * Разбор в `components/site/SiteArt.tsx`. Коротко: подписи на схемах —
 * настоящий текст, он переводится вместе со страницей; картинку пришлось
 * бы рисовать шесть раз, по разу на язык.
 *
 * ## Почему адреса собираются от приставки
 *
 * На витринном домене обработчик превращает `/ru` в `/site/ru`, и человек
 * видит короткий адрес; на книжном та же страница живёт по настоящему
 * `/site/ru`. Ссылка обязана вести туда, откуда пришёл читатель, — иначе
 * переключение языка на одном из доменов роняет в «страница не найдена».
 *
 * Ссылки на книгу — абсолютные: `holstein.plem.online` другой домен.
 * А «Соответствие» и описание интерфейса теперь свои: они переехали
 * на витринный домен, потому что отвечают на вопросы о продукте,
 * а не о книге Ассоциации, — и адрес у них собирается от той же
 * приставки, что и переключатель языка.
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

  const m = PRODUCT_MESSAGES[locale]

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
  const m = PRODUCT_MESSAGES[locale]
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
        {/* ---------------------------- Первый экран --------------------------- */}
        <section className="max-w-[70ch] pt-6">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">{s.eyebrow}</p>

          <h1 className="mt-3 text-[38px] font-medium leading-tight sm:text-[54px]">
            {m.hero.title}
          </h1>

          <p className="mt-6 text-[18px] leading-relaxed text-ink-700">{m.hero.lead}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={BOOK_URL}
              className="rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
            >
              {s.book.cta}
            </a>
            <a
              href={`mailto:${PRODUCT_MAIL}`}
              className="rounded-xl border border-ink-200 px-6 py-3 text-[15px] transition-colors hover:border-forest-500 hover:text-forest-500"
            >
              {m.contact.action}
            </a>
          </div>
        </section>

        {/*
           Четыре числа сразу под первым экраном. Числа читают те, кто
           не станет читать абзацы, — а таких большинство. Каждое
           проверяемо прогоном; круглое непроверяемое число здесь было бы
           хуже отсутствия числа.
        */}
        <section className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-y border-ink-100 py-8 lg:grid-cols-4">
          {s.proof.map((p) => (
            <div key={p.label}>
              <div className="text-[28px] font-medium leading-none tabular-nums text-forest-600 sm:text-[32px]">
                {p.value}
              </div>
              <p className="mt-2 max-w-[22ch] text-[13px] leading-snug text-ink-500">{p.label}</p>
            </div>
          ))}
        </section>

        {/* ------------------------------ Проблема ----------------------------- */}
        <section className="mt-16 max-w-[70ch]">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{m.problem.title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.problem.body}</p>
        </section>

        {/* --------------------------- Три контура ----------------------------- */}
        <section className="mt-16">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{s.layers.title}</h2>
          <p className="mt-4 max-w-[70ch] text-[16px] leading-relaxed text-ink-700">
            {s.layers.lead}
          </p>

          <div className="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[320px_1fr]">
            <LayersArt
              title={s.layers.title}
              labels={s.layers.items.map((i) => i.title)}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {s.layers.items.map((item, i) => (
                <div
                  key={item.title}
                  /*
                     Третий слой выделен: он и есть предмет разговора.
                     Остальные два у хозяйства обычно уже есть, и делать
                     вид, что мы их изобрели, значило бы соврать первому же
                     зоотехнику.
                  */
                  className={`rounded-2xl p-6 ${
                    i === 2
                      ? 'bg-forest-500 text-white'
                      : 'border border-ink-100 bg-white text-ink-700'
                  }`}
                >
                  <h3 className="text-[16px] font-medium leading-snug">{item.title}</h3>
                  <p
                    className={`mt-2 text-[14px] leading-relaxed ${
                      i === 2 ? 'text-white/80' : 'text-ink-500'
                    }`}
                  >
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------- Возможности ---------------------------- */}
        <section className="mt-20">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
            {m.features.title}
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {m.features.items.map((item, i) => {
              const Glyph = FEATURE_ICONS[i]
              return (
                <div
                  key={item.title}
                  className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]"
                >
                  {Glyph && <Glyph />}
                  <h3 className="mt-4 text-[17px] font-medium leading-tight">{item.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{item.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ---------------------------- Путь данных ---------------------------- */}
        <section className="mt-20">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{s.flow.title}</h2>
          <p className="mt-4 max-w-[70ch] text-[16px] leading-relaxed text-ink-700">{s.flow.lead}</p>

          {/*
             Прокрутки нет: схема собрана вёрсткой и на узком экране
             разворачивается в столбец сама. Прежняя редакция рисовала
             её в SVG фиксированной ширины и ездила вбок — на телефоне
             это худшее, что можно сделать со страницей.
          */}
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] sm:p-8">
            <FlowArt title={s.flow.title} nodes={s.flow.nodes} />
          </div>

          <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">{s.flow.note}</p>
        </section>

        {/* ------------------------------ Рейтинг ------------------------------ */}
        <section className="mt-20">
          <div className="grid grid-cols-1 items-center gap-10 rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] lg:grid-cols-[1fr_320px]">
            <div className="max-w-[60ch]">
              <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
                {s.ranking.title}
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{s.ranking.body}</p>
            </div>

            <RankArt title={s.ranking.title} />
          </div>
        </section>

        {/* -------------------------------- Кому ------------------------------- */}
        <section className="mt-20">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">{m.who.title}</h2>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[m.who.farms, m.who.associations].map((who) => (
              <div key={who.title} className="rounded-2xl border border-ink-100 p-6">
                <h3 className="text-[17px] font-medium leading-tight">{who.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-500">{who.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------- На чём построено ------------------------ */}
        <section className="mt-20 max-w-[70ch]">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
            {m.standards.title}
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.standards.body}</p>
          <a
            href={`${base}/compliance`}
            className="mt-4 inline-block text-[15px] underline underline-offset-4 hover:text-forest-500"
          >
            {m.standards.link}
          </a>
        </section>

        {/*
           Действующая книга — предпоследним блоком, а не первым.
           Это самое сильное, что можно сказать о продукте: не «умеет»,
           а «работает, вот адрес». Но до этого места читателю нечего
           было там искать.
        */}
        <section className="mt-20 rounded-2xl bg-forest-500 p-8 text-white sm:p-10">
          <h2 className="max-w-[60ch] text-[26px] font-medium leading-tight sm:text-[32px]">
            {s.book.title}
          </h2>
          <p className="mt-4 max-w-[70ch] text-[16px] leading-relaxed text-white/85">
            {s.book.body}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href={BOOK_URL}
              className="rounded-xl bg-white px-6 py-3 text-[15px] text-forest-600 transition-colors hover:bg-white/90"
            >
              {s.book.cta}
            </a>
            {/*
               Экскурсия стоит рядом с кнопкой «открыть книгу», а не вместо
               неё, и только на нерусских языках.

               Причина в том, куда ведёт сама кнопка: книга по-русски.
               Русскому посетителю этого достаточно — он открывает и читает.
               Всем прочим прямая ссылка упирается в непонятный экран
               на втором щелчке, и разбор устройства по-английски для них
               ближе к тому, зачем они сюда пришли, чем сама книга.

               Убирать при этом кнопку нельзя: работающая книга — главный
               довод, и прятать её за пересказом значило бы предлагать
               рассказ вместо доказательства.
            */}
            {s.book.tour && (
              <a
                href={`${base}/tour`}
                className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
              >
                {s.book.tour}
              </a>
            )}
            <a
              href={`${base}/compliance`}
              className="text-[15px] text-white/80 underline underline-offset-4 transition-colors hover:text-white"
            >
              {s.footer.note}
            </a>
          </div>
        </section>

        {/* ------------------------------ Как начать --------------------------- */}
        <section className="mt-20 max-w-[70ch]">
          <h2 className="text-[26px] font-medium leading-tight sm:text-[30px]">
            {m.contact.title}
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-700">{m.contact.body}</p>
          <a
            href={`mailto:${PRODUCT_MAIL}`}
            className="mt-6 inline-block rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
          >
            {m.contact.action}
          </a>
        </section>

        {!info.reviewed && (
          <p className="mt-16 max-w-[70ch] text-[13px] leading-relaxed text-ink-500">
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
         Свой подвал: только ссылки. Знак уже стоит в шапке, а подпись
         разработчика уводила бы от системы — последнее, что видит
         уходящий, должно вести к ней.
      */}
      <footer style={{ marginTop: 'var(--footer-air)' }} className="bg-basement py-10 text-white">
        <nav
          aria-label={m.nav.home}
          className="container-page flex flex-wrap items-center gap-x-8 gap-y-3 text-[14px]"
        >
          <a
            href={BOOK_URL}
            className="text-white/70 underline underline-offset-4 transition-colors hover:text-white"
          >
            {s.book.cta}
          </a>
          <a
            href={`${base}/compliance`}
            className="text-white/50 underline underline-offset-4 transition-colors hover:text-white"
          >
            {s.footer.note}
          </a>
          <a
            href={`${base}/api-docs`}
            className="text-white/50 underline underline-offset-4 transition-colors hover:text-white"
          >
            API
          </a>
          {/*
             Адрес печатается словами, и теперь это можно: у продукта
             свой ящик на своём домене. Прежде здесь стоял адрес
             Ассоциации, в котором имя страны и породы читалось
             как «решение не про вас», — и его приходилось прятать
             за подписью действия.
          */}
          <a
            href={`mailto:${PRODUCT_MAIL}`}
            className="text-white/70 underline underline-offset-4 transition-colors hover:text-white"
          >
            {PRODUCT_MAIL}
          </a>
        </nav>
      </footer>
    </div>
  )
}
