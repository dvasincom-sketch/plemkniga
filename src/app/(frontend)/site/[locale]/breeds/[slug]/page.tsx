import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { isLocale, type Locale } from '@/lib/i18n/locales'
import {
  BREED_PAGES,
  BREED_SOURCE,
  breedFactsBySlug,
  breedPageBySlug,
} from '@/lib/breed-pages'
import { breedCatalog } from '@/lib/breeds-catalog-server'
import { STATE_CLASS, STATE_HINT, STATE_LABEL } from '@/lib/breeds-catalog'
import { demoUrl, PRODUCT_MAIL } from '@/lib/hosts'

export const dynamic = 'force-dynamic'

/**
 * Страница одной породы.
 *
 * ## Порядок разделов — не произвольный
 *
 * Сперва состояние в учёте, потом всё остальное. Справку про
 * происхождение читатель найдёт в десяти местах; ответ на вопрос
 * «ведётся ли по ней книга и чего не хватает» — только здесь.
 * Поставить справку первой значило бы спрятать единственное, ради чего
 * стоило заводить страницу.
 *
 * ## Почему числа подписаны так подробно
 *
 * «Поголовье 23 тысячи» без уточнения «племенное» — неправда в пользу
 * породы: всего животных этой породы в стране заметно больше. А без
 * оговорки про год — неправда в пользу свежести: год источник
 * не называет, и подставлять его нельзя.
 *
 * ## Почему только по-русски
 *
 * Разбор в `docs/kontent-plan.md`: пятьдесят пять пород на шесть языков
 * дали бы триста тридцать страниц машинного перевода. Нерусские адреса
 * отвечают той же страницей по-русски и помечены `canonical`
 * на русскую — так поисковая система не считает их дублями.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = breedPageBySlug(slug)
  if (!page) return { title: 'Порода' }

  return {
    title: `${page.title} — характеристика, поголовье, племенная книга`,
    description: page.lead,
    alternates: { canonical: `/ru/breeds/${slug}` },
  }
}

export function generateStaticParams() {
  return BREED_PAGES.map((b) => ({ slug: b.slug }))
}

export default async function BreedPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) notFound()

  const locale: Locale = raw
  const page = breedPageBySlug(slug)
  const facts = breedFactsBySlug(slug)
  if (!page || !facts) notFound()

  /*
   * Состояние берётся из того же каталога, что и общая таблица.
   * Вторая, «своя» оценка состояния на странице породы разошлась бы
   * с таблицей на первой же правке — и читатель поверил бы той, что
   * удобнее.
   */
  const row = breedCatalog().find((b) => b.name === page.registryName)
  const demo = demoUrl()

  const NUMBERS: { value: string; label: string }[] = [
    { value: facts.stock.toLocaleString('ru-RU'), label: 'тыс. голов в племенном учёте' },
    { value: facts.cows.toLocaleString('ru-RU'), label: 'из них коров, тыс. голов' },
    { value: facts.milk.toLocaleString('ru-RU'), label: 'удой, кг' },
    { value: `${facts.fat.toLocaleString('ru-RU')} / ${facts.protein.toLocaleString('ru-RU')}`, label: 'жир / белок, %' },
  ]

  return (
    <>
      <ProductHeader locale={locale} />

      <main className="container-page pb-16">
        <nav className="text-[14px] text-ink-500">
          <Link
            href={`/${locale}/breeds`}
            className="underline underline-offset-4 hover:text-forest-500"
          >
            Породы
          </Link>
        </nav>

        <section className="mt-6 max-w-[75ch]">
          <h1 className="text-[34px] font-medium leading-tight sm:text-[44px]">{page.title}</h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{page.lead}</p>
        </section>

        {/* --------------------------- Состояние в учёте ------------------------ */}
        <section className="mt-12 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Состояние в учёте
          </h2>

          {row ? (
            <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-4">
                <span
                  className={`inline-block rounded-md px-2.5 py-1 text-[13px] ${STATE_CLASS[row.state]}`}
                >
                  {STATE_LABEL[row.state]}
                </span>
                <span className="text-[14px] text-ink-500">{STATE_HINT[row.state]}</span>
              </div>

              <dl className="mt-6 divide-y divide-ink-100 border-y border-ink-100">
                {[
                  ['Код ICAR', row.icar ?? 'нет в международном справочнике'],
                  ['Ключ государственного реестра', row.fgiasUuid ? 'есть' : 'нет'],
                  [
                    'Книга',
                    row.bookUrl ? 'ведётся, открыта для просмотра' : 'не ведётся ни одним объединением',
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
                    <dt className="w-[28ch] shrink-0 text-[14px] text-ink-500">{k}</dt>
                    <dd className="text-[15px]">{v}</dd>
                  </div>
                ))}
              </dl>

              {row.bookUrl ? (
                <a
                  href={row.bookUrl}
                  className="mt-6 inline-block rounded-xl bg-forest-500 px-6 py-3 text-[15px] text-white transition-colors hover:bg-forest-600"
                >
                  Открыть книгу породы
                </a>
              ) : (
                <p className="mt-6 text-[15px] leading-relaxed text-ink-700">
                  Книгу по этой породе можно завести:{' '}
                  <a
                    href={`mailto:${PRODUCT_MAIL}`}
                    className="font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
                  >
                    напишите нам
                  </a>
                  {demo && (
                    <>
                      {' '}или{' '}
                      <a href={demo} className="underline underline-offset-4">
                        посмотрите показательную книгу
                      </a>
                    </>
                  )}
                  .
                </p>
              )}
            </div>
          ) : (
            <p className="mt-5 text-[16px] leading-relaxed text-ink-700">
              Породы нет в нашей выписке из справочника государственного реестра — значит,
              и состояние по ней мы не считаем.
            </p>
          )}

          <p className="mt-5 text-[15px] leading-relaxed text-ink-500">{page.note}</p>
        </section>

        {/* ------------------------------- Числа -------------------------------- */}
        <section className="mt-14">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">
            Поголовье и продуктивность
          </h2>

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {NUMBERS.map((n) => (
              <div key={n.label} className="rounded-2xl border border-ink-100 bg-white p-5">
                <div
                  className={`stat-value text-[26px] leading-none text-forest-600 sm:text-[30px]`}
                >
                  {n.value}
                </div>
                <p className="mt-3 max-w-[22ch] text-[13px] leading-snug text-ink-500">{n.label}</p>
              </div>
            ))}
          </div>

          {facts.variants && facts.variants.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="data-table w-full min-w-[560px] text-[14px]">
                <thead>
                  <tr>
                    <th className="text-left">Внутрипородный тип</th>
                    <th className="w-[150px] text-right">Поголовье, тыс.</th>
                    <th className="w-[130px] text-right">Удой, кг</th>
                    <th className="w-[150px] text-right">Жир / белок, %</th>
                  </tr>
                </thead>
                <tbody>
                  {facts.variants.map((v) => (
                    <tr key={v.name}>
                      <td>{v.name}</td>
                      <td className="text-right tabular-nums">{v.stock.toLocaleString('ru-RU')}</td>
                      <td className="text-right tabular-nums">{v.milk.toLocaleString('ru-RU')}</td>
                      <td className="text-right tabular-nums">
                        {v.fat.toLocaleString('ru-RU')} / {v.protein.toLocaleString('ru-RU')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/*
             Оговорки стоят под числами, а не в примечании внизу страницы:
             читатель, взявший число, до примечания не доходит.
          */}
          <p className="mt-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
            Это <strong className="font-medium">племенное</strong> поголовье — животные, стоящие
            на племенном учёте, а не всё поголовье породы в стране. Источник —{' '}
            <a
              href={facts.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-forest-500"
            >
              {BREED_SOURCE.name}
            </a>
            , прочитано {new Date(BREED_SOURCE.readAt).toLocaleDateString('ru-RU')}. {BREED_SOURCE.note}
          </p>
        </section>

        {/* ----------------------------- Происхождение -------------------------- */}
        <section className="mt-14 max-w-[75ch]">
          <h2 className="text-[24px] font-medium leading-tight sm:text-[28px]">Происхождение</h2>

          <div className="mt-5 space-y-4">
            {page.origin.map((p) => (
              <p key={p.slice(0, 40)} className="text-[16px] leading-relaxed text-ink-700">
                {p}
              </p>
            ))}
          </div>

          <h3 className="mt-8 text-[19px] font-medium leading-tight">Где разводят</h3>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-700">{page.where}</p>
        </section>

        {/* ------------------------------ Соседи -------------------------------- */}
        <section className="mt-14">
          <h2 className="text-[20px] font-medium leading-tight">Другие породы</h2>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BREED_PAGES.filter((b) => b.slug !== page.slug).map((b) => (
              <Link
                key={b.slug}
                href={`/${locale}/breeds/${b.slug}`}
                className="rounded-xl border border-ink-100 bg-white px-4 py-3 transition-colors hover:border-forest-500"
              >
                <span className="text-[15px] font-medium">{b.title}</span>
              </Link>
            ))}
          </div>

          <Link
            href={`/${locale}/breeds`}
            className="mt-6 inline-block text-[15px] font-medium text-forest-600 underline underline-offset-4 hover:text-forest-500"
          >
            Все породы каталога →
          </Link>
        </section>
      </main>

      <ProductFooter lang={locale} />
    </>
  )
}
