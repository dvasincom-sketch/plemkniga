import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { getCurrentUser } from '@/lib/payload'

export const metadata: Metadata = { title: 'Аукционы' }
export const dynamic = 'force-dynamic'

export default async function AuctionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <>
      <SiteHeader active="/auctions" />
      <main className="container-page pt-10 pb-8">
        <h1 className="text-[38px] font-medium sm:text-[46px]">Аукционы</h1>
        <div className="card mt-8">
          <p className="text-[15px] leading-relaxed text-ink-700">
            Раздел в разработке. Здесь будут размещаться лоты на племенной молодняк и семя
            быков-производителей: карточка лота, ставки, история торгов и оформление сделки с
            автоматической передачей животного новому владельцу в племенной книге.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
