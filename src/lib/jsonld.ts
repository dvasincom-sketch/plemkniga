import { PLATFORM } from '@/lib/platform'
import { PRODUCT_MAIL, SITE_URL } from '@/lib/hosts'
import { LOCALE_CODES, type Locale } from '@/lib/i18n/locales'
import type { Note } from '@/lib/notes'
import type { Study } from '@/lib/studies'

/**
 * Разметка для поисковых систем: то же самое, что показано читателю,
 * но в машинном виде.
 *
 * ## Зачем она, если страница и так вся из текста
 *
 * Поисковая система читает страницу как текст и догадывается: вот это
 * похоже на дату, а вот это на имя автора. Догадка бывает неверной,
 * и тогда в выдаче стоит чужая дата или ничья статья. Разметка убирает
 * догадку: у разбора прямо сказано, кто автор, когда написано и на какие
 * работы он ссылается — то есть ровно то, что стоит в паспорте перед
 * текстом и в списке источников после него.
 *
 * ## Главное правило: ни одного своего слова
 *
 * Всё, что здесь собирается, берётся из тех же данных, из которых
 * нарисована страница: `NOTES`, `PLATFORM`, каталог пород. Написать
 * в разметке заголовок руками означало бы завести вторую правду о том же
 * разборе — и она разошлась бы с первой на первой же правке заголовка,
 * причём молча: читатель видит страницу, а робот — разметку, и сравнить
 * их некому.
 *
 * Отсюда же следует, чего здесь нет. Нет `aggregateRating` и `review`:
 * оценок нам никто не ставил. Нет `wordCount`: считать нечего, текст
 * набран разметкой. Нет `distribution` у набора данных: выгрузки для
 * скачивания не существует, а объявить её значило бы позвать робота
 * туда, где ему ответят отказом. Разметка — это заявление о себе,
 * и ложное заявление здесь стоит дороже отсутствующего: за него
 * снимают показ расширенных сниппетов целиком.
 *
 * ## Почему абсолютные адреса
 *
 * Относительный адрес в разметке для поисковых систем не принимается:
 * у неё нет страницы, относительно которой считать. `SITE_URL` берётся
 * из общего места, а не пишется строкой, — доменов у системы два,
 * и витринный адрес в разметке книги увёл бы робота на соседний сайт.
 */

/** Что уходит в `<script type="application/ld+json">`. */
export type JsonLd = Record<string, unknown>

const abs = (path: string): string => `${SITE_URL}${path}`

/**
 * Кто ведёт витрину.
 *
 * Оператор платформы, а не ассоциация, ведущая книгу: витрина
 * рассказывает о системе. Реквизиты (`inn`, `ogrn`) показываются только
 * тогда, когда они вписаны, — по той же причине, по которой их нет
 * в подвале: выдуманный реквизит на странице о прослеживаемости хуже
 * отсутствующего.
 */
export function organizationLd(): JsonLd {
  return {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: PLATFORM.full,
    alternateName: PLATFORM.legalShort,
    url: SITE_URL,
    email: PRODUCT_MAIL,
    foundingDate: String(PLATFORM.since),
    logo: {
      '@type': 'ImageObject',
      url: abs('/icon-plem-512.png'),
      width: 512,
      height: 512,
    },
    ...(PLATFORM.inn ? { taxID: PLATFORM.inn } : {}),
    ...(PLATFORM.ogrn ? { identifier: PLATFORM.ogrn } : {}),
  }
}

/**
 * Сам сайт.
 *
 * Без `SearchAction`: поиска по сайту нет, и объявлять его значило бы
 * пообещать поисковой системе строку, которой она не найдёт.
 *
 * `inLanguage` перечисляет все шесть языков, а не язык страницы:
 * заявление касается сайта целиком, а языковые копии страницы
 * объявляются отдельно, ссылками `hreflang` (`lib/seo.ts`).
 */
export function websiteLd(locale: Locale): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: 'ПЛЕМ online',
    url: SITE_URL,
    inLanguage: [...LOCALE_CODES],
    publisher: { '@id': `${SITE_URL}/#organization` },
    ...(locale === 'ru' ? {} : { alternateName: 'PLEM online' }),
  }
}

/**
 * Разбор.
 *
 * `TechArticle`, а не `Article`: это разбор устройства, а не новость
 * и не колонка. Разница не косметическая — по типу поисковая система
 * решает, кому страницу показывать.
 *
 * `citation` собирается из того же списка источников, что напечатан
 * под текстом. Источник без адреса тоже попадает: у нас есть работы,
 * которые названы так, чтобы их можно было найти без ссылки, и молчать
 * о них в разметке значило бы показать роботу более бедную опору,
 * чем читателю.
 */
export function noteLd(note: Note): JsonLd {
  const url = abs(`/ru/razbory/${note.slug}`)

  return {
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: note.title,
    description: note.lead,
    inLanguage: 'ru',
    datePublished: note.date,
    isAccessibleForFree: true,
    articleSection: 'Разборы',
    image: abs('/og-plem.png'),
    author: {
      '@type': 'Person',
      name: note.author,
      ...(note.authorUrl ? { url: note.authorUrl } : {}),
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
    citation: note.sources.map((s) => ({
      '@type': 'CreativeWork',
      name: s.title,
      ...(s.url ? { url: s.url } : {}),
    })),
  }
}

/**
 * Страница исследования.
 *
 * `TechArticle`, как у разбора, и по той же причине: это не новость
 * и не колонка, а описание того, что нужно, чтобы работу повторить.
 *
 * Разница с разбором одна, и она существенная. У разбора `citation`
 * собирается из списка источников; здесь первым звеном стоит сама
 * работа — отдельным `ScholarlyArticle` с журналом, годом и авторами,
 * потому что страница заведена ради неё, а не ради опоры на неё.
 * Дальше идут остальные источники: молчать о них значило бы показать
 * роботу более бедную опору, чем читателю.
 *
 * Чего здесь нет — оценки самой работы и её выводов. В разметке
 * повторено ровно то, что стоит в паспорте на экране: название, авторы,
 * журнал, год, адрес. Страница, у которой прочитана только аннотация,
 * и в разметке не утверждает о работе ничего сверх этого.
 */
export function studyLd(study: Study): JsonLd {
  const url = abs(`/ru/issledovaniya/${study.slug}`)

  const work: JsonLd = {
    '@type': 'ScholarlyArticle',
    name: study.work.title,
    url: study.work.url,
    author: study.work.authors,
    isPartOf: { '@type': 'Periodical', name: study.work.journal },
    datePublished: String(study.work.year),
  }

  return {
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: study.title,
    description: study.lead,
    inLanguage: 'ru',
    datePublished: study.date,
    isAccessibleForFree: true,
    articleSection: 'Исследования',
    image: abs('/og-plem.png'),
    author: {
      '@type': 'Person',
      name: study.author,
      ...(study.authorUrl ? { url: study.authorUrl } : {}),
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
    citation: [
      work,
      ...study.sources
        /*
         * Работа уже стоит первым звеном. В списке источников она
         * названа ещё раз — там она нужна читателю, — и звать робота
         * на один адрес дважды значило бы объявить две разные работы
         * с одинаковой ссылкой.
         */
        .filter((s) => s.url !== study.work.url)
        .map((s) => ({
          '@type': 'CreativeWork',
          name: s.title,
          ...(s.url ? { url: s.url } : {}),
        })),
    ],
  }
}

/**
 * Статья словаря.
 *
 * `DefinedTerm` в наборе `DefinedTermSet` — тот случай, когда словарь
 * предметной области описан в схеме прямо и точно, и придумывать вместо
 * него `Article` было бы хуже: статья про термин и определение термина
 * для поисковой системы разные вещи.
 *
 * `inDefinedTermSet` ссылается на указатель, а не повторяет его: набор
 * объявлен один раз на своей странице.
 */
export function termLd(input: { slug: string; title: string; short: string }): JsonLd {
  const url = abs(`/ru/slovar/${input.slug}`)

  return {
    '@type': 'DefinedTerm',
    '@id': `${url}#term`,
    name: input.title,
    description: input.short,
    url,
    inDefinedTermSet: { '@id': `${SITE_URL}/ru/slovar#set` },
    inLanguage: 'ru',
  }
}

/** Сам словарь как набор терминов. Объявляется на указателе. */
export function glossaryLd(input: { name: string; description: string }): JsonLd {
  return {
    '@type': 'DefinedTermSet',
    '@id': `${SITE_URL}/ru/slovar#set`,
    name: input.name,
    description: input.description,
    url: abs('/ru/slovar'),
    inLanguage: 'ru',
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}

/**
 * Путь до страницы.
 *
 * Собирается из тех же звеньев, что нарисованы на странице, и не иначе:
 * путь в разметке, расходящийся с путём на экране, — это ровно то
 * расхождение, ради избавления от которого разметка и заводилась.
 */
export function breadcrumbLd(items: { name: string; path: string }[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: abs(item.path),
    })),
  }
}

/**
 * Каталог пород как набор данных.
 *
 * Честность здесь важнее полноты. Набор описан, источники названы,
 * но `distribution` не объявлен: скачать таблицу нельзя, машинный обмен
 * закрыт от робота (`robots.ts`), и указать адрес выгрузки значило бы
 * позвать его туда, где ему ответят отказом.
 */
export function breedsLd(input: {
  locale: Locale
  name: string
  description: string
  icarSource: string
  icarFetchedAt: string
}): JsonLd {
  return {
    '@type': 'Dataset',
    '@id': abs(`/${input.locale}/breeds#dataset`),
    name: input.name,
    description: input.description,
    url: abs(`/${input.locale}/breeds`),
    inLanguage: input.locale,
    isAccessibleForFree: true,
    creator: { '@id': `${SITE_URL}/#organization` },
    dateModified: input.icarFetchedAt.slice(0, 10),
    /*
     * Числа строк здесь нет намеренно, хотя оно под рукой. У набора
     * данных в словаре есть поле `size` — но означает оно размер файла,
     * а не число записей, и положить туда пятьдесят пять значило бы
     * сказать словарём одно, а иметь в виду другое. Слово, употреблённое
     * не в своём значении, хуже несказанного: разметку читает программа,
     * и догадаться, что мы имели в виду, ей нечем.
     */
    isBasedOn: [
      {
        '@type': 'CreativeWork',
        name: 'ICAR Breed Codes',
        url: input.icarSource,
      },
    ],
  }
}

/**
 * Собрать несколько заявлений в один блок.
 *
 * Один `<script>` на страницу, а не по одному на каждое: они ссылаются
 * друг на друга через `@id`, и разложенные по разным блокам связи
 * читаются хуже.
 */
export const graph = (...nodes: JsonLd[]): JsonLd => ({
  '@context': 'https://schema.org',
  '@graph': nodes,
})
