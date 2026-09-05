import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { BOOK_HOST, SITE_HOSTS, isSiteHost } from '@/lib/hosts'
import { LOCALE_CODES } from '@/lib/i18n/locales'
import { BOOK_FEATURES } from '@/lib/book-features'
import { BREED_PAGES } from '@/lib/breed-pages'
import { NOTES } from '@/lib/notes'
import { STUDIES } from '@/lib/studies'
import { TERM_PAGES } from '@/lib/terms'
import { FGIAS_PAGES } from '@/lib/fgias-pages'

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
    /*
     * Разбор пробелов ICAR — своя страница, а не якорь: она отвечает
     * на отдельный вопрос («чего именно не хватает») и переведена на все
     * шесть языков. В карте её не было, то есть роботу её никто не звал
     * показывать, и внутренних ссылок на неё немного.
     */
    { path: '/icar/gaps', priority: 0.5 },
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
    /*
     * Разборы — как породные страницы: по-русски и без языковых копий.
     * Дата правки у них своя, а не «сегодня»: разбор это высказывание
     * с датой, и объявлять его свежим каждую ночь значило бы врать
     * роботу ровно так же, как читателю.
     */
    { url: `${base}/ru/razbory`, lastModified: now, priority: 0.7 },
    ...NOTES.map((n) => ({
      url: `${base}/ru/razbory/${n.slug}`,
      lastModified: new Date(n.date),
      priority: 0.7,
    })),
    /*
     * Исследования — по тому же правилу, что и разборы: по-русски,
     * без языковых копий, с датой из реестра. Дата здесь особенно
     * важна: страница утверждает, что у нас есть сегодня, и объявлять
     * такое утверждение свежим каждую ночь значило бы обещать роботу
     * пересчёт, которого не было.
     */
    { url: `${base}/ru/issledovaniya`, lastModified: now, priority: 0.7 },
    ...STUDIES.map((s) => ({
      url: `${base}/ru/issledovaniya/${s.slug}`,
      lastModified: new Date(s.date),
      priority: 0.7,
    })),
    /*
     * Двадцать шаблонов реестра: страницы русские, как разборы и словарь,
     * и адрес у них русский. Обзорная страница `/fgias` стоит выше среди
     * шестиязычных — она про то, сколько шаблонов книга умеет, и это
     * утверждение переводимо; разбор отдельного шаблона нет.
     */
    ...FGIAS_PAGES.map((p) => ({
      url: `${base}/ru/fgias/${p.slug}`,
      lastModified: now,
      priority: 0.7,
    })),
    /*
     * Словарь: указатель и статьи с отдельным адресом. Строки-определения
     * без своей статьи сюда не попадают — у них нет адреса, и звать
     * на них робота некуда.
     */
    { url: `${base}/ru/slovar`, lastModified: now, priority: 0.8 },
    ...TERM_PAGES.map((t) => ({
      url: `${base}/ru/slovar/${t.slug}`,
      lastModified: now,
      priority: 0.6,
    })),
    { url: `${base}/evolution`, lastModified: now, priority: 0.4 },
    /*
     * Английская экскурсия. В карте её не было вовсе, хотя ссылка с первого
     * экрана на неё стоит: страница, которую зовут читать и не показывают
     * роботу, обходится последней или не обходится совсем. Языковых копий
     * у неё нет — она английская по замыслу, и адрес у неё без языка.
     */
    { url: `${base}/tour`, lastModified: now, priority: 0.6 },
  ]
}
