import { cookies, headers } from 'next/headers'
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { NotFoundContent } from '@/components/NotFound'
import { ProductFooter, ProductHeader } from '@/components/site/ProductShell'
import { ProductNotFound } from '@/components/site/ProductError'
import { currentTenant } from '@/lib/tenant-server'
import { isSiteHost } from '@/lib/hosts'
import { LOCALE_COOKIE } from '@/lib/i18n/locales'
import { resolveLocale } from '@/lib/i18n/negotiate'

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
 *
 * ## Откуда здесь берётся язык
 *
 * Не из адреса. Next вызывает эту страницу для пути, который ни с чем
 * не сопоставился, и языковой приставки в ней нет — а если бы и была,
 * верить ей нельзя: `/еn/breeds` с русской «е» тоже не сопоставился бы.
 * Поэтому язык узнаётся тем же способом, что и на корне витрины
 * (`site/page.tsx`): явный выбор человека, потом заголовок браузера.
 * Читатель, ошибшийся адресом, остаётся на своём языке.
 */
export default async function FrontendNotFound() {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
  const host = headerList.get('host')

  if (isSiteHost(host)) {
    const locale = resolveLocale({
      cookie: cookieStore.get(LOCALE_COOKIE)?.value,
      acceptLanguage: headerList.get('accept-language'),
    })

    return (
      <>
        <ProductHeader locale={locale} />
        <main className="container-page pb-16">
          <ProductNotFound locale={locale} />
        </main>
        <ProductFooter lang={locale} />
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
