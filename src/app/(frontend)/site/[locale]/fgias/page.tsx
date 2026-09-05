import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { siteMetadata } from '@/lib/seo'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import { noticeFor } from '@/lib/i18n/translated'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import { EvolutionFgias } from '@/components/EvolutionFgias'

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
  return siteMetadata(locale, 'fgias', '/fgias')
}

/**
 * Двадцать шаблонов государственного реестра — своей страницей.
 *
 * ## Почему переехала из «Эволюции продукта»
 *
 * Вкладкой её открывал только тот, кто уже пришёл читать про развитие
 * платформы. А спрашивают про реестр раньше и по другому поводу: число
 * «20 из 20» стоит на первом экране витрины, и нажимающий на него хочет
 * увидеть разбор, а не оглавление чужого раздела.
 *
 * Внутри «Эволюции» разбор шаблонов был и не на своём месте по существу.
 * Там рассказ о том, как система менялась; здесь — о том, что она умеет
 * сегодня. Первое читают раз в полгода, второе — перед разговором
 * о внедрении.
 *
 * ## Почему то же самое, а не переписанное заново
 *
 * Содержание не изменилось ни на слово: числа считает тот же список
 * шаблонов, и вторая редакция текста означала бы второй источник правды.
 * Переехала страница, а не смысл.
 */
export default async function FgiasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const frame = PAGE_MESSAGES[locale].pages.fgias
  /*
   * Оговорка здесь всегда об откате, а не о качестве перевода: разбор
   * шаблонов рисует русский компонент `EvolutionFgias`, языка у него нет
   * вовсе. Прежде бралась строка «переведено, но не вычитано» — то есть
   * английскому читателю обещали английский текст и извинялись за термины,
   * а он получал русскую таблицу без единого слова о причине.
   */
  const notice = noticeFor(locale, locale !== 'ru')

  return (
    <>
      <ProductHeader locale={locale} path="/fgias" />

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

        <div className="mt-12">
          <EvolutionFgias />
        </div>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
