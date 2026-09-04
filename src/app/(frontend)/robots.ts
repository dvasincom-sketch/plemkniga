import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { BOOK_HOST, SITE_HOSTS, isSiteHost } from '@/lib/hosts'

/**
 * Что можно обходить, а что нет.
 *
 * ## Почему файл собирается, а не лежит в `public`
 *
 * Доменов два, и правила у них разные: на витрине нет ни кабинета,
 * ни машинного обмена, а в книге есть. Один статический файл на оба
 * домена либо запрещал бы витрине лишнее, либо разрешал бы книге
 * то, чего не следует.
 *
 * Заодно адрес карты сайта здесь всегда свой: карта, названная чужим
 * доменом, уводит робота на соседний сайт и оставляет этот
 * неразобранным.
 *
 * ## Что закрыто и почему
 *
 * Кабинеты — потому что за ними вход, и строка в выдаче, ведущая
 * в закрытую дверь, читается как поломка. Машинный обмен `/ade/v1` —
 * потому что это не страницы, а ответы для программ: робот получит
 * там сотни почти одинаковых записей и потратит на них обход, которого
 * не хватит настоящим страницам.
 *
 * Панель управления закрыта по той же причине, что кабинеты.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host')
  const site = isSiteHost(host)
  const domain = site ? SITE_HOSTS[0]! : BOOK_HOST

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/account/', '/association/', '/admin/', '/ade/v1/', '/api/', '/healthz'],
      },
    ],
    sitemap: `https://${domain}/sitemap.xml`,
    host: domain,
  }
}
