import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { BOOK_HOST, SITE_HOSTS, isSiteHost } from '@/lib/hosts'
import { LOCALE_CODES } from '@/lib/i18n/locales'
import { BOOK_FEATURES } from '@/lib/book-features'
import { BREED_PAGES } from '@/lib/breed-pages'

/**
 * Карта сайта.
 *
 * ## Почему у доменов она разная
 *
 * Витрина и книга — разные сайты по содержанию: на витрине страницы
 * о продукте на шести языках, в книге список животных и правовые
 * документы. Одна карта на оба домена звала бы робота на страницы,
 * которых на этом домене нет, и он получал бы перенаправления вместо
 * содержимого.
 *
 * ## Почему у страниц разный вес
 *
 * `priority` — не оценка важности для нас, а подсказка о том, что
 * обходить в первую очередь при ограниченном бюджете обхода. Первый
 * экран и разборы, ради которых страницы и заводились, стоят выше
 * служебных.
 *
 * ## Почему у породных страниц нет языковых копий
 *
 * Их нет и на самом деле: разбор в `docs/kontent-plan.md` — пятьдесят
 * пять пород на шесть языков дали бы триста тридцать страниц машинного
 * перевода. В карте они стоят по-русски, и это совпадает с тем, что
 * помечено `canonical` на самих страницах.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host')
  const site = isSiteHost(host)
  const base = `https://${site ? SITE_HOSTS[0] : BOOK_HOST}`
  const now = new Date()

  if (!site) {
    /*
     * У книги в карте только то, что открыто постороннему. Карточки
     * животных сюда не попадают намеренно: их сотни тысяч, они меняются
     * каждый день, и открытость каждой решает хозяйство — а карта,
     * зовущая робота на запись, которую завтра закроют, обещает за него.
     */
    return [
      { url: base, lastModified: now, priority: 1 },
      { url: `${base}/privacy`, lastModified: now, priority: 0.3 },
      { url: `${base}/data-policy`, lastModified: now, priority: 0.3 },
      { url: `${base}/bulls/compare`, lastModified: now, priority: 0.6 },
    ]
  }

  /** Страницы витрины, у которых есть все шесть языков. */
  const MULTILINGUAL = [
    { path: '', priority: 1 },
    { path: '/breeds', priority: 0.9 },
    { path: '/fgias', priority: 0.8 },
    { path: '/rules', priority: 0.8 },
    { path: '/economics', priority: 0.8 },
    { path: '/compliance', priority: 0.7 },
    { path: '/ade', priority: 0.7 },
    { path: '/icar', priority: 0.6 },
    { path: '/api-docs', priority: 0.5 },
    { path: '/org', priority: 0.5 },
    ...BOOK_FEATURES.map((f) => ({ path: `/book/${f.slug}`, priority: 0.6 })),
  ]

  const pages: MetadataRoute.Sitemap = MULTILINGUAL.flatMap(({ path, priority }) =>
    LOCALE_CODES.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: now,
      priority,
      /*
       * Языковые копии перечислены друг у друга: это подсказка «то же
       * самое на другом языке», без неё казахская версия конкурирует
       * с русской вместо того, чтобы её дополнять.
       */
      alternates: {
        languages: Object.fromEntries(
          LOCALE_CODES.map((l) => [l, `${base}/${l}${path}`]),
        ),
      },
    })),
  )

  return [
    ...pages,
    ...BREED_PAGES.map((b) => ({
      url: `${base}/ru/breeds/${b.slug}`,
      lastModified: now,
      priority: 0.7,
    })),
    { url: `${base}/evolution`, lastModified: now, priority: 0.4 },
  ]
}
