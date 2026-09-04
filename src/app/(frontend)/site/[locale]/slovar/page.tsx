import type { Metadata } from 'next'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { pageMetadata } from '@/lib/seo'
import { JsonLd } from '@/components/JsonLd'
import { breadcrumbLd, glossaryLd, graph } from '@/lib/jsonld'
import { TermIndex, type IndexGroup } from '@/components/site/TermIndex'
import { TERMS, TERM_GROUPS, TERM_PAGES, termsIn } from '@/lib/terms'

const TITLE = 'Словарь терминов племенного дела'
const LEAD =
  'Что каждое слово значит здесь, каким числом книга его считает и чего оно не означает. ' +
  'Определения с порогами из работающего кода, а не пересказ учебника.'

export const metadata: Metadata = pageMetadata({
  title: TITLE,
  description: LEAD,
  path: '/ru/slovar',
})

/**
 * Указатель словаря.
 *
 * ## Почему счёт статей на странице считается, а не пишется
 *
 * Первое, что устаревает в таком разделе, — фраза «здесь тридцать
 * определений». Она устаревает на следующем же пополнении и врёт молча:
 * читатель верит ей, потому что она короче списка. То же правило,
 * по которому число пробелов ICAR подставляется из разбора.
 *
 * ## Почему раздел русский
 *
 * Тот же довод, что у разборов: восемьдесят семь определений на шесть
 * языков — это пять сотен машинных переводов зоотехнической
 * терминологии (`docs/lokalizatsiya.md`). Ссылка на словарь стоит
 * в подвале только на русском.
 */
export default function GlossaryPage() {
  const groups: IndexGroup[] = TERM_GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    lead: g.lead,
    terms: termsIn(g.key).map((t) => ({
      slug: t.slug,
      title: t.title,
      short: t.short,
      also: t.also,
      hasPage: t.body !== undefined,
    })),
  })).filter((g) => g.terms.length > 0)

  return (
    <>
      <JsonLd
        data={graph(
          glossaryLd({ name: TITLE, description: LEAD }),
          breadcrumbLd([{ name: 'Словарь', path: '/ru/slovar' }]),
        )}
      />

      <ProductHeader locale="ru" />

      <main className="container-page pb-16">
        <section className="max-w-[75ch]">
          <p className="text-[14px] uppercase tracking-wide text-forest-500">Словарь</p>

          <h1 className="mt-3 text-[34px] font-medium leading-tight sm:text-[44px]">{TITLE}</h1>

          <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{LEAD}</p>

          <p className="mt-5 text-[15px] leading-relaxed text-ink-500">
            Терминов в указателе {TERMS.length}, из них {TERM_PAGES.length} с отдельной
            статьёй. У остальных ответ помещается в строку — заводить под него страницу
            значило бы обещать больше, чем сказано.
          </p>
        </section>

        <TermIndex groups={groups} />
      </main>

      <ProductFooter lang="ru" />
    </>
  )
}
