import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
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

  const [result, herdsResult, totalAll, totalBulls, totalVerified] = await Promise.all([
    payload.find({
      collection: 'animals',
      where,
      depth: 1,
      page,
      limit: PER_PAGE,
      sort: '-ipc',
      overrideAccess: false,
      user,
    }),
    payload.find({ collection: 'herds', limit: 100, sort: 'name', overrideAccess: true }),
    payload.count({ collection: 'animals', overrideAccess: false, user }),
    payload.count({
      collection: 'animals',
      where: { kind: { equals: 'bull' } },
      overrideAccess: false,
      user,
    }),
    payload.count({
      collection: 'animals',
      where: { trustLevel: { greater_than_equal: 2 } },
      overrideAccess: false,
      user,
    }),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])

  return (
    <>
      <SiteHeader active="/" />

      <main className="container-page pb-4">
        {/* ------------------------------- Hero ------------------------------- */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.12fr]">
          <div className="rounded-card bg-brand-500 p-8 text-white sm:p-10">
            <h1 className="mb-5 text-[40px] font-medium leading-[1.05] sm:text-[52px]">
              Племенная книга
            </h1>
            <p className="max-w-[46ch] text-[15px] leading-[1.55] text-white/95">
              Информационная система для сбора, хранения и анализа данных о крупном рогатом скоте
              (КРС) с целью определения наиболее перспективных быков-производителей для селекции. На
              основе статистики продуктивности, здоровья и других параметров система должна помогать
              принимать решения о дальнейшем использовании животных (племенное разведение или
              отправка на мясо).
            </p>
          </div>
          <div className="flex flex-col justify-between rounded-card bg-white p-8 sm:p-10">
            <p className="text-[13px] uppercase tracking-[0.09em] text-ink-500">
              Книга в цифрах
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-8">
              {[
                { label: 'Животных в книге', value: totalAll.totalDocs },
                { label: 'Быков-производителей', value: totalBulls.totalDocs },
                { label: 'Хозяйств', value: herdsResult.totalDocs },
                { label: 'Записей подтверждено', value: totalVerified.totalDocs },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="stat-value text-[38px] leading-none sm:text-[46px]">
                    {s.value.toLocaleString('ru-RU')}
                  </dd>
                  <p className="mt-2 text-[14px] leading-snug text-ink-700">{s.label}</p>
                </div>
              ))}
            </dl>
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
