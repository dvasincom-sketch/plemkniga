import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ImageSlot } from '@/components/ImageSlot'
import { FilterSidebar } from '@/components/FilterSidebar'
import { ResultsBar } from '@/components/ResultsBar'
import { EmptyResults } from '@/components/EmptyResults'
import { AnimalTable } from '@/components/AnimalTable'
import { AnimalCards } from '@/components/AnimalCards'
import { Pagination } from '@/components/Pagination'
import { getClient, getCurrentUser } from '@/lib/payload'
import {
  FILTER_KEYS,
  buildAnimalWhere,
  currentPage,
  hasActiveFilters,
  hasAdvancedValues,
  one,
  resolveSort,
  type SearchParams,
} from '@/lib/animal-query'
import { describeFilter } from '@/lib/filter-labels'
import type { Animal } from '@/payload-types'

export const dynamic = 'force-dynamic'

const PER_PAGE = 12

/** Готовый отбор в один клик — самый частый запрос к книге. */
const PRESET = {
  href: '/?sex=female&sort=milk#results',
  label: 'Коровы с высоким удоем',
}

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
  const sort = resolveSort(sp)
  const hasActive = hasActiveFilters(sp)

  const [result, herdsResult, totalAll] = await Promise.all([
    payload.find({
      collection: 'animals',
      where,
      depth: 1,
      page,
      limit: PER_PAGE,
      sort: sort.payload,
      overrideAccess: false,
      user,
    }),
    payload.find({ collection: 'herds', limit: 100, sort: 'name', overrideAccess: true }),
    payload.count({ collection: 'animals', overrideAccess: false, user }),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])

  const herds = herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))

  // Названия активных условий — для подсказок в пустой выдаче
  const filterLabels: Record<string, string> = {}
  for (const key of FILTER_KEYS) {
    const value = one(sp[key])
    if (!value) continue
    const described = describeFilter(key, value, herds)
    if (described) filterLabels[key] = `${described.label}: ${described.value}`
  }

  const animals = result.docs as Animal[]
  const found = result.totalDocs ?? 0
  const presetActive = one(sp.sex) === 'female' && one(sp.sort) === 'milk'

  return (
    <>
      <SiteHeader active="/" />

      <main className="container-page pb-4">
        {/* ------------------------------- Шапка ------------------------------ */}
        <section>
          <div className="grid grid-cols-1 gap-6 rounded-card bg-brand-500 p-8 text-white sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
            <div>
              <h1 className="text-[40px] font-medium leading-[1.05] sm:text-[52px]">
                Племенная книга
              </h1>
              <p className="mt-4 text-[15px] text-white/85">
                {totalAll.totalDocs.toLocaleString('ru-RU')} записей доступно для просмотра
              </p>
            </div>

            <p className="text-[15px] leading-[1.55] text-white/95">
              Информационная система для сбора, хранения и анализа данных о крупном рогатом скоте
              (КРС) с целью определения наиболее перспективных быков-производителей для селекции. На
              основе статистики продуктивности, здоровья и других параметров система должна помогать
              принимать решения о дальнейшем использовании животных (племенное разведение или
              отправка на мясо).
            </p>
          </div>
        </section>

        {/*
          Заставка показывается только на чистой книге. Как только задан отбор,
          страница переходит в рабочий режим: между условиями и результатами
          не должно стоять ничего декоративного.
        */}
        {!hasActive && (
          <section className="mt-5">
            <ImageSlot
              name="images/hero-plemkniga"
              alt="Голштинская порода"
              priority
              sizes="100vw"
              ratio="1440 / 260"
              minHeight={180}
              className="w-full"
            />
          </section>
        )}

        {/* ------------------------------ Каталог ----------------------------- */}
        <section id="results" className="mt-10 scroll-mt-6">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="text-[14px] text-ink-500">Быстрый отбор:</span>
            <Link
              href={presetActive ? '/#results' : PRESET.href}
              aria-current={presetActive ? 'true' : undefined}
              className={`rounded-lg px-3.5 py-2 text-[14px] transition-colors ${
                presetActive
                  ? 'bg-forest-500 font-medium text-white'
                  : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              {PRESET.label}
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
            <FilterSidebar
              herds={herds}
              defaults={defaults}
              sort={one(sp.sort)}
              hasActive={hasActive}
              openAdvanced={hasAdvancedValues(sp)}
            />

            <div className="min-w-0">
              <ResultsBar
                sp={sp}
                total={found}
                sort={sort.value}
                hasActive={hasActive}
                herds={herds}
              />

              {animals.length === 0 ? (
                <EmptyResults sp={sp} hasActive={hasActive} labels={filterLabels} />
              ) : (
                <>
                  <div className="hidden lg:block">
                    <AnimalTable
                      animals={animals}
                      startIndex={(page - 1) * PER_PAGE}
                      canOpenAll={Boolean(user)}
                    />
                  </div>

                  <div className="lg:hidden">
                    <AnimalCards animals={animals} canOpenAll={Boolean(user)} />
                  </div>

                  <Pagination
                    page={result.page ?? 1}
                    totalPages={result.totalPages ?? 1}
                    searchParams={sp}
                    basePath="/"
                  />
                </>
              )}

              {!user && animals.length > 0 && (
                <p className="mt-6 text-[14px] leading-relaxed text-ink-500">
                  Показаны животные, которых владельцы открыли для публичного просмотра.{' '}
                  <Link href="/login" className="underline underline-offset-4 hover:text-ink-900">
                    Войдите
                  </Link>
                  , чтобы видеть полные карточки своего стада.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
