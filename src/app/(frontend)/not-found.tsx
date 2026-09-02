import { currentTenant } from '@/lib/tenant-server'
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { NotFoundContent } from '@/components/NotFound'

export const metadata: Metadata = { title: 'Страница не найдена' }

/**
 * «Не найдено» внутри приложения: сюда попадают вызовы `notFound()` —
 * несуществующее животное, чужая заявка, удалённый пакет.
 *
 * Здесь есть общая раскладка, поэтому страница несёт шапку и подвал:
 * человек не выпадает из системы, а остаётся в ней и видит, куда идти.
 */
export default async function FrontendNotFound() {
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
