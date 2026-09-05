import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { pageMetadata } from '@/lib/seo'
import { JsonLd } from '@/components/JsonLd'
import { breadcrumbLd, graph, termLd } from '@/lib/jsonld'
import { TermBody, TermFooter, TermHeader } from '@/components/site/TermFrame'
import { termBySlug } from '@/lib/terms'

/*
 * Страница собирается на каждый запрос, и это не оптимизация наоборот,
 * а условие работоспособности.
 *
 * Здесь стоял `generateStaticParams`, перечислявший слаги терминов,
 * и раздел отдавал «Internal Server Error» на любом адресе — включая
 * несуществующий слаг, то есть падал сам маршрут, а не данные под ним.
 * Причина в том, что у маршрута два изменяемых куска, `[locale]`
 * и `[slug]`, а перечислялся один: язык в списке не назван, и собрать
 * страницу заранее нечем. Указатель при этом открывался, и поломка
 * выглядела как беда отдельных статей.
 *
 * Перечислять языки было бы неправдой: словарь русский, и шесть языковых
 * копий одной статьи — это пять обещаний перевода, которого нет.
 * Поэтому статическая сборка отключена целиком, как у страницы породы,
 * где рядом стоит та же строка по той же причине: раскладка витрины
 * читает домен из заголовка запроса, и до запроса его нет.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const term = termBySlug(slug)
  if (!term) return { title: 'Термин' }

  /*
   * Описание — то же определение, что стоит карточкой на самой странице.
   * Второе описание «для поиска» было бы текстом, который никто не читает
   * и потому никто не правит; а это читают первым.
   */
  return pageMetadata({
    title: `${term.title} — что это`,
    description: term.short,
    path: `/ru/slovar/${slug}`,
  })
}

/**
 * Статья словаря.
 *
 * ## Почему адрес всегда русский
 *
 * Словарь написан по-русски и переводиться не будет: восемь десятков
 * определений на шесть языков — это пять сотен машинных переводов
 * зоотехнической терминологии. Адрес в разметке и в пути поэтому жёстко
 * русский, как у разборов и страниц пород, — иначе казахская ссылка
 * обещала бы казахский текст.
 *
 * ## Почему страница есть только у части терминов
 *
 * Признак — наличие развёрнутой статьи, а не важность слова
 * (`lib/terms.ts`). Термин, о котором нам есть что сказать строкой,
 * строкой и стоит на указателе: страница на сто слов не находится
 * поиском и тянет вниз соседние.
 */
export default async function TermPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const term = termBySlug(slug)
  if (!term || !term.body) notFound()

  return (
    <>
      <JsonLd
        data={graph(
          termLd({ slug: term.slug, title: term.title, short: term.short }),
          breadcrumbLd([
            { name: 'Словарь', path: '/ru/slovar' },
            { name: term.title, path: `/ru/slovar/${term.slug}` },
          ]),
        )}
      />

      <ProductHeader locale="ru" />

      <main className="container-page pb-16">
        <TermHeader term={term} />
        <TermBody term={term} />
        <TermFooter term={term} />
      </main>

      <ProductFooter lang="ru" />
    </>
  )
}
