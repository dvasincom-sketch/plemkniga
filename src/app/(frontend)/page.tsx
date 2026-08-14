import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ImageSlot } from '@/components/ImageSlot'
import { SearchPanel } from '@/components/SearchPanel'
import { AnimalTable } from '@/components/AnimalTable'
import { Pagination } from '@/components/Pagination'
import { getClient, getCurrentUser } from '@/lib/payload'
import {
  buildAnimalWhere,
  currentPage,
  hasAdvancedValues,
  one,
  type SearchParams,
} from '@/lib/animal-query'
import type { Animal } from '@/payload-types'

export const dynamic = 'force-dynamic'

const PER_PAGE = 12

export default async function HerdbookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const page = currentPage(sp)
  const user = await getCurrentUser()
  const payload = await getClient()

  const where = buildAnimalWhere(sp)

  const [result, herdsResult, totalAll] = await Promise.all([
    payload.find({
      collection: 'animals',
      where,
      depth: 1,
      page,
      limit: PER_PAGE,
      sort: '-ipcRank',
      overrideAccess: false,
      user,
    }),
    payload.find({ collection: 'herds', limit: 100, sort: 'name', overrideAccess: true }),
    payload.count({ collection: 'animals', overrideAccess: false, user }),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])

  return (
    <>
      <SiteHeader active="/" />

      <main className="container-page pb-4">
        {/* ------------------------------- Hero ------------------------------- */}
        <section>
          <div className="grid grid-cols-1 gap-6 rounded-card bg-brand-500 p-8 text-white sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
            <h1 className="text-[40px] font-medium leading-[1.05] sm:text-[52px]">
              Племенная книга
            </h1>
            <p className="text-[15px] leading-[1.55] text-white/95">
              Информационная система для сбора, хранения и анализа данных о крупном рогатом скоте
              (КРС) с целью определения наиболее перспективных быков-производителей для селекции. На
              основе статистики продуктивности, здоровья и других параметров система должна помогать
              принимать решения о дальнейшем использовании животных (племенное разведение или
              отправка на мясо).
            </p>
          </div>
        </section>

        {/* ------------------------------ Поиск ------------------------------ */}
        <section className="mt-5">
          <SearchPanel
            action="/"
            total={totalAll.totalDocs}
            herds={herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))}
            withOwner
            defaults={defaults}
            openAdvanced={hasAdvancedValues(sp)}
          />
        </section>

        {/* ----------------------------- Заставка ---------------------------- */}
        <section className="mt-5">
          <ImageSlot
            name="images/hero-plemkniga"
            alt="Голштинская порода"
            priority
            sizes="100vw"
            className="h-[220px] w-full sm:h-[300px]"
          />
        </section>

        {/* ----------------------------- Животные ---------------------------- */}
        <section className="mt-14">
          <h2 className="section-title">Животные</h2>
          <p className="mb-8 mt-5 text-[15px] text-ink-700">
            {user
              ? 'Вам доступны собственные животные и записи, открытые другими владельцами.'
              : 'Ниже информация о животных, владельцы которых разрешили просмотр для анонимных пользователей'}
          </p>

          <AnimalTable
            animals={result.docs as Animal[]}
            startIndex={(page - 1) * PER_PAGE}
            canOpenAll={Boolean(user)}
          />

          <Pagination
            page={result.page ?? 1}
            totalPages={result.totalPages ?? 1}
            searchParams={sp}
            basePath="/"
          />
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
