import type { Metadata } from 'next'
import { PAGE_MESSAGES, type PageKey } from '@/lib/i18n/page-messages'
import { isLocale, LOCALE_CODES, type Locale } from '@/lib/i18n/locales'

/**
 * Разметка внутренних страниц витрины для поисковых систем.
 *
 * ## Почему одним местом
 *
 * Полей четыре, и все четыре легко забыть по одному: у страницы был
 * заголовок и не было описания, у другой описание и не было указания
 * основной страницы. Из тридцати пяти страниц описание стояло у пяти,
 * и это не небрежность отдельного автора — это то, что происходит
 * с повторяющейся работой без общего места.
 *
 * ## Откуда берётся описание
 *
 * Из подводки самой страницы. Она уже написана, уже переведена
 * на шесть языков и уже отвечает на вопрос «о чём это» — то есть
 * ровно то, что показывает поисковая система под заголовком. Писать
 * второе описание для робота значило бы завести текст, который никто
 * не читает и потому никто не правит.
 *
 * Обрезаем до ста шестидесяти знаков по границе слова: длиннее выдача
 * всё равно не покажет, а оборванное на середине слова описание
 * выглядит поломкой.
 *
 * ## Про указание основной страницы и языки
 *
 * `canonical` называет адрес самой страницы на своём языке — иначе
 * шесть языковых копий выглядят шестью дублями одного текста,
 * и поисковая система выбирает главную сама, обычно неудачно.
 *
 * `languages` перечисляет остальные пять: это подсказка «то же самое
 * на другом языке», а не «другая страница». Без неё казахская версия
 * конкурирует с русской вместо того, чтобы её дополнять.
 */

/** Сколько знаков описания показывает выдача. */
const LIMIT = 160

const clamp = (text: string): string => {
  if (text.length <= LIMIT) return text
  const cut = text.slice(0, LIMIT)
  const space = cut.lastIndexOf(' ')
  return `${cut.slice(0, space > 80 ? space : LIMIT).trimEnd()}…`
}

export function siteMetadata(locale: string, key: PageKey, path: string): Metadata {
  const safe: Locale = isLocale(locale) ? locale : 'ru'
  const frame = PAGE_MESSAGES[safe].pages[key]

  return {
    title: frame.title,
    description: clamp(frame.lead),
    alternates: {
      canonical: `/${safe}${path}`,
      languages: Object.fromEntries(LOCALE_CODES.map((c) => [c, `/${c}${path}`])),
    },
    openGraph: {
      title: frame.title,
      description: clamp(frame.lead),
      url: `/${safe}${path}`,
      type: 'article',
    },
  }
}

/**
 * Разметка страницы, у которой нет рамки в наборе строк.
 *
 * Заголовок и описание приходят словами. Отдельная функция, а не
 * необязательные поля у первой: там описание берётся из подводки,
 * здесь пишется руками, и смешивать два источника в одном вызове
 * значит прятать, откуда взялся текст.
 */
export function pageMetadata(opts: {
  title: string
  description: string
  /**
   * Адрес страницы.
   *
   * Без `locale` — готовый адрес страницы, у которой языковых копий нет:
   * разбор, страница породы. Вместе с `locale` — адрес **без языка**
   * (`/book/pedigree`), и тогда сюда же встают шесть языковых копий.
   */
  path?: string
  /**
   * Язык страницы, у которой есть копии на всех шести.
   *
   * Появился после того, как обнаружилось, что двенадцать разделов книги
   * объявляют основной адрес и молчат про языковые копии, — а карта сайта
   * эти копии обещает. Семьдесят два адреса из ста пятидесяти трёх, то
   * есть почти половина сайта, отдавали поисковой системе два разных
   * ответа на один вопрос.
   *
   * Ошибка была не в странице, а здесь: `siteMetadata` копии перечисляет,
   * `pageMetadata` не умела, и разница между ними ничем не объявлялась.
   * Забыть про копии было проще, чем вспомнить.
   */
  locale?: Locale
  /** Страницы за входом поисковой системе не нужны и ей не отдаются. */
  private?: boolean
}): Metadata {
  const url = opts.locale && opts.path ? `/${opts.locale}${opts.path}` : opts.path

  const alternates =
    opts.locale && opts.path
      ? {
          canonical: url,
          languages: Object.fromEntries(
            LOCALE_CODES.map((c) => [c, `/${c}${opts.path}`]),
          ),
        }
      : url
        ? { canonical: url }
        : undefined

  return {
    title: opts.title,
    description: clamp(opts.description),
    ...(alternates ? { alternates } : {}),
    ...(opts.private ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: opts.title,
      description: clamp(opts.description),
      ...(url ? { url } : {}),
    },
  }
}
