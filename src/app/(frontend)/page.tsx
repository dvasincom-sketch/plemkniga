import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ImageSlot } from '@/components/ImageSlot'
import { HerdbookFilterBar } from '@/components/HerdbookFilterBar'
import { ResultsBar } from '@/components/ResultsBar'
import { EmptyResults } from '@/components/EmptyResults'
import { AnimalTable } from '@/components/AnimalTable'
import { AnimalCards } from '@/components/AnimalCards'
import { Pagination } from '@/components/Pagination'
import { getClient, getCurrentUser } from '@/lib/payload'
import {
  FILTER_KEYS,
  PRESETS,
  activePreset,
  buildAnimalWhere,
  currentPage,
  hasActiveFilters,
  one,
  presetHref,
  resolveSort,
  type SearchParams,
} from '@/lib/animal-query'
import { describeFilter } from '@/lib/filter-labels'
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
  const sort = resolveSort(sp)
  const hasActive = hasActiveFilters(sp)

  const [result, herdsResult, totalAll, orgsResult, presetCounts] = await Promise.all([
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
    payload.find({ collection: 'herds', limit: 500, sort: 'name', overrideAccess: true }),
    payload.count({ collection: 'animals', overrideAccess: false, user }),
    payload.find({ collection: 'organizations', limit: 500, sort: 'name', overrideAccess: true }),
    /*
     * Чипы с `probe` гаснут, когда под них нет ни одной записи.
     *
     * Ошибка здесь намеренно проглатывается: это украшение чипа, и оно
     * не должно ронять страницу. Так бывает, например, сразу после добавления
     * нового поля, пока запущенный процесс держит прежнюю схему коллекции
     * в памяти — тогда чип просто погаснет, а книга откроется.
     */
    Promise.all(
      PRESETS.map(async (p) => {
        if (!('probe' in p) || !p.probe) return null
        try {
          const { totalDocs } = await payload.count({
            collection: 'animals',
            where: p.probe,
            overrideAccess: false,
            user,
          })
          return totalDocs
        } catch {
          return 0
        }
      }),
    ),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])

  const herds = herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))
  const herdOptions = herds.map((h) => ({ value: String(h.id), label: h.name }))
  // Значение — название хозяйства: отбор идёт по нему, и в «фишке» видно то же
  const ownerOptions = orgsResult.docs.map((o) => ({ value: o.name, label: o.name }))

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
  const preset = activePreset(sp)

  return (
    <>
      <SiteHeader active="/" />

      <main className="container-page pt-8 pb-6">
        {/*
          Шапка и заставка стоят в две колонки: так они занимают одну высоту
          вместо двух и каталог оказывается ближе к верху экрана. Как только
          задан отбор, заставка убирается — страница переходит в рабочий режим,
          и между условиями и результатами не должно стоять ничего
          декоративного. Текст в этом случае перестраивается в две колонки
          внутри плашки, чтобы она не растягивалась во всю ширину пустотой.
        */}
        <section
          className={`grid grid-cols-1 gap-5 ${hasActive ? '' : 'lg:grid-cols-[1.05fr_1fr]'}`}
        >
          <div
            className={`rounded-card bg-brand-500 p-8 text-white sm:p-10 ${
              hasActive
                ? 'grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-12'
                : 'flex flex-col justify-between gap-8'
            }`}
          >
            <div>
              <h1 className="text-[40px] font-medium leading-[1.05] sm:text-[48px]">
                Племенная книга
              </h1>
              <p className="mt-4 text-[15px] text-white/85">
                {totalAll.totalDocs.toLocaleString('ru-RU')} записей доступно для просмотра
              </p>
            </div>

            <p className="max-w-[58ch] text-[15px] leading-[1.55] text-white/95">
              Информационная система для сбора, хранения и анализа данных о крупном рогатом скоте
              (КРС) с целью определения наиболее перспективных быков-производителей для селекции. На
              основе статистики продуктивности, здоровья и других параметров система должна помогать
              принимать решения о дальнейшем использовании животных (племенное разведение или
              отправка на мясо).
            </p>
          </div>

          {!hasActive && (
            <ImageSlot
              name="images/hero-plemkniga"
              alt="Голштинская порода"
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              minHeight={260}
              className="h-full w-full"
            />
          )}
        </section>

        {/* ------------------------------ Каталог ----------------------------- */}
        <section id="results" className="mt-10 scroll-mt-6">
          {/*
             Отбор стоит над таблицей, а не сбоку: колонка фильтров съедала
             ширину, а таблице на четырнадцать колонок ширина нужнее.
             Развёрнутый фильтр по продуктивности живёт в личном кабинете —
             там он нужен для работы со своим стадом.
          */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[14px] text-ink-500">Быстрый отбор:</span>
            {PRESETS.map((p, i) => {
              const isActive = preset === p.key
              const muted = presetCounts[i] === 0

              if (muted) {
                return (
                  <span
                    key={p.key}
                    aria-disabled="true"
                    title={'emptyHint' in p ? p.emptyHint : 'Данных пока нет'}
                    className="cursor-default rounded-lg bg-[#ededed] px-3 py-1.5 text-[14px] text-ink-300"
                  >
                    {p.label}
                  </span>
                )
              }

              return (
                <Link
                  key={p.key}
                  href={isActive ? '/#results' : presetHref(p)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`rounded-lg px-3 py-1.5 text-[14px] transition-colors ${
                    isActive
                      ? 'bg-forest-500 font-medium text-white'
                      : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                  }`}
                >
                  {p.label}
                </Link>
              )
            })}
          </div>

          <HerdbookFilterBar
            defaults={defaults}
            owners={ownerOptions}
            herds={herdOptions}
            sort={one(sp.sort)}
          />

          <div className="mt-7">
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
                , чтобы видеть полные карточки своего стада и развёрнутый фильтр по продуктивности.
              </p>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
