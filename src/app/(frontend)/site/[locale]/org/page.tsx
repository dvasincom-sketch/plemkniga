import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { PLATFORM, PLATFORM_PURPOSE } from '@/lib/platform'
import { BOOK_URL, PRODUCT_MAIL } from '@/lib/hosts'

export const metadata: Metadata = { title: 'Об организации' }

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
 */
export default async function OrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.org
  const notice = PAGE_MESSAGES[locale].notice

  /*
   * Реквизиты показываются по одному и только заполненные. Строка
   * «ИНН —» хуже отсутствующей строки: она сообщает, что номер должен
   * быть, но его почему-то не написали.
   */
  const details: [string, string][] = [
    ['Полное наименование', PLATFORM.full],
    ...(PLATFORM.inn ? ([['ИНН', PLATFORM.inn]] as [string, string][]) : []),
    ...(PLATFORM.ogrn ? ([['ОГРН', PLATFORM.ogrn]] as [string, string][]) : []),
    ['Почта', PRODUCT_MAIL],
  ]

  return (
    <>
      <ProductHeader locale={locale} path="/org" />

      <main className="container-page pb-16">
        <section className="max-w-[75ch] pt-6">
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
            Почему именно такая форма
          </h2>

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {PLATFORM_PURPOSE.map((p) => (
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
            Организация содержит систему, но не владеет книгами
          </h2>

          <p className="mt-5 text-[17px] leading-relaxed text-ink-700">
            Книгу ведёт объединение, и записи в ней принадлежат ему, а не нам. Мы содержим систему:
            обновляем её вслед за стандартами, отвечаем за сохранность и за то, что выданный
            документ нельзя переписать задним числом. Роли разные, и разделены они не обещанием,
            а устройством — у каждой книги свой домен, свои реквизиты на бланке и свои права
            доступа.
          </p>

          <p className="mt-4 text-[17px] leading-relaxed text-ink-700">
            Из этого следует и обратное обязательство: данные книги должны уходить из системы
            целиком и в читаемом виде, когда объединение этого захочет. Для того и сделан{' '}
            <Link href={`/${locale}/ade`} className="underline underline-offset-4">
              обмен по международному стандарту
            </Link>{' '}
            — он нужен не только партнёрам, но и на случай расставания с нами.
          </p>
        </section>

        {/* ------------------------------ Реквизиты ---------------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">Реквизиты</h2>

          <dl className="mt-6 divide-y divide-ink-100 border-y border-ink-100">
            {details.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
                <dt className="w-[22ch] shrink-0 text-[14px] text-ink-500">{k}</dt>
                <dd className="text-[15px]">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-[15px] leading-relaxed text-ink-500">
            Действующая книга, ведущаяся на платформе, —{' '}
            <a href={BOOK_URL} className="underline underline-offset-4">
              {BOOK_URL.replace('https://', '')}
            </a>
            . Её адрес, телефон и правовые документы принадлежат Ассоциации и стоят в подвале самой
            книги: показывать их здесь значило бы выдавать одно лицо за другое.
          </p>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
