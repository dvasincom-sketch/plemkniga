import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { NotFoundContent } from '@/components/NotFound'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { ProductNotFound } from '@/components/site/ProductError'
import { currentTenant } from '@/lib/tenant-server'
import { isSiteHost } from '@/lib/hosts'

export const metadata: Metadata = { title: 'Страница не найдена' }

/**
 * «Не найдено» — одно на два домена, и разное по обе стороны.
 *
 * ## Почему один файл, а не два
 *
 * Неудавшийся адрес не попадает ни в какой раздел по определению,
 * и разложить отказ по папкам нельзя: Next для несопоставленного пути
 * берёт корневой `not-found`. Значит выбор стороны делается здесь,
 * по тому же признаку, по которому разводится всё остальное, — по хосту.
 *
 * ## Почему это вообще понадобилось
 *
 * На витрине показывалась книжная страница: знак голштинской
 * ассоциации, самарский адрес, поиск животного по номеру. Человек,
 * пришедший почитать про продукт и ошибшийся адресом, получал две
 * ошибки подряд — не та страница и не та организация.
 *
 * ## Про шапку витрины без переключателя языка
 *
 * `path` не передаётся намеренно: переключатель обязан вести на ту же
 * страницу на другом языке, а этой страницы нет ни на одном. Кнопка,
 * ведущая с несуществующего адреса на несуществующий, — насмешка,
 * а не помощь.
 */
export default async function FrontendNotFound() {
  const host = (await headers()).get('host')

  if (isSiteHost(host)) {
    return (
      <>
        <ProductHeader />
        <main className="container-page pb-16">
          <ProductNotFound />
        </main>
        <ProductFooter />
      </>
    )
  }

  const { org } = await currentTenant()

  return (
    <>
      <SiteHeader />
      <main className="container-page pb-8">
        <NotFoundContent mail={org.mail} />
      </main>
      <SiteFooter />
    </>
  )
}
