import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import {
  StudyBody,
  StudyFooter,
  StudyHeader,
  StudyNeighbours,
} from '@/components/site/StudyFrame'
import { JsonLd } from '@/components/JsonLd'
import { breadcrumbLd, graph, studyLd } from '@/lib/jsonld'
import { STUDIES, studyBySlug } from '@/lib/studies'
import { pageMetadata } from '@/lib/seo'

/*
 * Собирается на каждый запрос. Здесь стоял `generateStaticParams`
 * со слагами работ, и раздел падал на любом адресе: у маршрута два
 * изменяемых куска, `[locale]` и `[slug]`, а перечислялся один — язык
 * не назван, и собрать страницу заранее нечем. Указатель открывался,
 * и поломка выглядела бедой отдельных страниц.
 *
 * Перечислять шесть языков было бы неправдой: раздел русский. Разбор
 * подробнее — в соседней странице словаря, где то же самое и по той же
 * причине.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const study = studyBySlug(slug)
  if (!study) return { title: 'Исследование' }

  return pageMetadata({
    title: study.title,
    description: study.lead,
    path: `/ru/issledovaniya/${slug}`,
  })
}

/**
 * Страница одной работы.
 *
 * ## Почему одна страница на весь раздел, а не по файлу на работу
 *
 * У разборов наоборот: каждый разбор — свой файл, потому что там текст
 * ходит в код за числами и рисует таблицы, каких нет больше нигде.
 * Здесь текст один и тот же по устройству: шесть частей, список полей
 * и счёт. Заведи мы по файлу на работу — шесть заголовков разошлись бы
 * на третьей странице, а порядок частей на пятой, и жанр перестал бы
 * быть жанром.
 *
 * ## Почему адрес всегда русский
 *
 * Раздел написан по-русски и переводиться не будет; `/kk/issledovaniya`
 * обещал бы казахский текст. Адрес в разметке и в пути поэтому жёстко
 * русский — как у разборов, словаря и страниц пород.
 */
export default async function StudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const study = studyBySlug(slug)
  if (!study) notFound()

  return (
    <>
      {/*
         Разметка для поисковых систем собирается из той же записи,
         из которой напечатана страница: второй правды об одной работе
         не заводится. Стоит она здесь, а не в обвязке, потому что
         обвязка разбита на четыре куска и любой из них можно забыть
         поставить — а страница в разделе одна, и забыть её нельзя.
      */}
      <JsonLd
        data={graph(
          studyLd(study),
          breadcrumbLd([
            { name: 'Исследования', path: '/ru/issledovaniya' },
            { name: study.title, path: `/ru/issledovaniya/${study.slug}` },
          ]),
        )}
      />

      <ProductHeader locale="ru" />

      <main className="container-page pb-16">
        <StudyHeader study={study} />
        <StudyBody study={study} />
        <StudyFooter study={study} />
        <StudyNeighbours studies={STUDIES} current={study.slug} />
      </main>

      <ProductFooter lang="ru" />
    </>
  )
}
