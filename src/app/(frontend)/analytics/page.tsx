import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { getClient, getCurrentUser } from '@/lib/payload'
import type { Where } from 'payload'
import { nf } from '@/lib/format'

export const metadata: Metadata = { title: 'Аналитика' }
export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getClient()
  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)

  const scope: Where = orgId ? { owner: { equals: orgId } } : {}
  const animals = await payload.find({
    collection: 'animals',
    where: scope,
    limit: 2000,
    overrideAccess: true,
  })

  const cows = animals.docs.filter((a) => a.sex === 'female')
  const avg = (get: (a: (typeof cows)[number]) => number | null | undefined) => {
    const vals = cows.map(get).filter((v): v is number => typeof v === 'number')
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }

  const stats = [
    { label: 'Животных в стаде', value: nf(animals.totalDocs, 0) },
    { label: 'Средний удой, л', value: nf(avg((a) => a.summary?.milkYield), 0) },
    { label: 'Средний жир, %', value: nf(avg((a) => a.summary?.fatPercent), 2) },
    { label: 'Средний белок, %', value: nf(avg((a) => a.summary?.proteinPercent), 2) },
    { label: 'Средний ИПЦ', value: nf(avg((a) => a.ipc), 1) },
    { label: 'Быков-производителей', value: nf(animals.docs.filter((a) => a.sex === 'male').length, 0) },
  ]

  return (
    <>
      <SiteHeader active="/analytics" />
      <main className="container-page">
        <h1 className="text-[38px] font-medium sm:text-[46px]">Аналитика</h1>
        <p className="mt-3 max-w-[70ch] text-[15px] text-ink-700">
          Сводные показатели по стаду. В полной версии сюда добавляются динамика удоя по месяцам,
          распределение ИПЦ, сравнение с породным стандартом и подбор быков.
        </p>

        <section className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="card">
              <p className="text-sm text-ink-500">{s.label}</p>
              <p className="mt-3 text-[34px] font-medium tabular-nums text-forest-500">{s.value}</p>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
