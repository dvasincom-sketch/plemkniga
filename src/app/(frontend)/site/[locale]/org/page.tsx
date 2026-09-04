import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { pick } from '@/lib/i18n/translated'
import { PLATFORM } from '@/lib/platform'
import { ORG_PAGE_TEXT } from '@/lib/org-page-text'
import { BOOK_URL, PRODUCT_MAIL } from '@/lib/hosts'

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
  return siteMetadata(locale, 'org', '/org')
}

/**
 * Кто содержит платформу.
 *
 * ## Почему страница, а не строка в подвале
 *
 * Строка в подвале называет лицо, но не отвечает ни на один вопрос,
 * который из неё следует: что это за организация, кому она подчиняется,
 * что будет с записями, если она исчезнет, и на какие деньги живёт
 * система, за которую хозяйство не платит. Все четыре вопроса задают
 * до того, как передать книге данные, а не после.
 *
 * ## Почему тут же сказано, чьи данные
 *
 * Самое частое опасение при первом разговоре звучит так: «вы получите
 * доступ ко всему нашему стаду». Ответ на него — не обещание, а
 * устройство: книгу ведёт объединение, платформа её обслуживает,
 * и это разные роли. Разделение уже описано в коде (`lib/tenant.ts`
 * отвечает «чья книга», `lib/platform.ts` — «кто содержит систему»),
 * и страница просто говорит вслух то, по чему система построена.
 *
 * ## Чего здесь нарочно нет
 *
 * Слов о миссии и о будущем отрасли. Организация оценивается уставной
 * целью, устройством управления и источником средств — остальное
 * читатель проверить не может, а значит и верить ему не обязан.
 *
 * ## Почему весь текст страницы лежит в наборе строк
 *
 * Набранный прямо в разметке абзац перевода не видит: заголовок
 * и подводка приходили переведёнными, а карточки о форме, разбор
 * «чьи данные» и подписи реквизитов оставались русскими, и английская
 * страница читалась как брошенная на полпути. Слова страницы теперь
 * в `lib/org-page-text.ts`, а факты — имя, номера, год — в `lib/platform.ts`:
 * первое переводится, второе одно на все языки.
 */
export default async function OrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.org

  const picked = pick(ORG_PAGE_TEXT, locale)
  const text = picked.value

  /*
   * Оговорка «текст ниже по-русски» стоит только там, где он и правда
   * русский. Раньше она показывалась на всех нерусских языках без
   * разбора — в том числе на английском, где переведено уже всё, — и
   * извинялась за то, чего нет. Строка, извиняющаяся напрасно,
   * обесценивает ту же строку там, где она сказана по делу.
   */
  const notice = picked.fallback ? PAGE_MESSAGES[locale].notice : null

  /*
   * Название организации идёт за языком, на котором показан текст,
   * а не за языком в адресе: на казахской странице текст русский,
   * и русское название рядом с ним на месте, а английское выглядело бы
   * третьим языком на одной странице.
   */
  const english = picked.shown === 'en'

  /*
   * Реквизиты показываются по одному и только заполненные. Строка
   * «ИНН —» хуже отсутствующей строки: она сообщает, что номер должен
   * быть, но его почему-то не написали.
   */
  const details: [string, string][] = [
    [text.details.name, english ? PLATFORM.fullEn : PLATFORM.full],
    ...(PLATFORM.inn ? ([[text.details.inn, PLATFORM.inn]] as [string, string][]) : []),
    ...(PLATFORM.ogrn ? ([[text.details.ogrn, PLATFORM.ogrn]] as [string, string][]) : []),
    [text.details.mail, PRODUCT_MAIL],
  ]

  return (
    <>
      <ProductHeader locale={locale} path="/org" />

      <main className="container-page pb-16">
        <section className="max-w-[75ch]">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">{frame.eyebrow}</p>

          <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">
            {frame.title}
          </h1>

          {notice && (
            <p className="mt-5 rounded-xl bg-ink-50 px-4 py-3 text-[14px] leading-relaxed text-ink-500">
              {notice}
            </p>
          )}

          <p className="mt-6 text-[17px] leading-relaxed text-ink-700">{frame.lead}</p>
        </section>

        {/* ------------------------------ Устройство --------------------------- */}
        <section className="mt-12">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.formTitle}
          </h2>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {text.form.map((p) => (
              <div key={p.title} className="rounded-2xl border border-ink-100 bg-white p-6">
                <h3 className="text-[16px] font-medium leading-snug">{p.title}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-ink-500">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------- Чьи это данные -------------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.ownTitle}
          </h2>

          <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{text.ownBody}</p>

          <p className="mt-4 text-[17px] leading-relaxed text-ink-700">
            {text.dataLead}{' '}
            <Link href={`/${locale}/ade`} className="underline underline-offset-4">
              {text.dataLink}
            </Link>{' '}
            {text.dataTail}
          </p>
        </section>

        {/* ------------------------------ Реквизиты ---------------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            {text.detailsTitle}
          </h2>

          <dl className="mt-6 divide-y divide-ink-100 border-y border-ink-100">
            {details.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
                <dt className="w-[22ch] shrink-0 text-[14px] text-ink-500">{k}</dt>
                <dd className="text-[15px]">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-[15px] leading-relaxed text-ink-500">
            {text.bookLead}{' '}
            <a href={BOOK_URL} className="underline underline-offset-4">
              {BOOK_URL.replace('https://', '')}
            </a>
            . {text.bookTail}
          </p>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
