import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ImageSlot } from '@/components/ImageSlot'
import { HerdbookFilterBar } from '@/components/HerdbookFilterBar'
import { ResultsBar } from '@/components/ResultsBar'
import { EmptyResults } from '@/components/EmptyResults'
import { AnimalTable } from '@/components/AnimalTable'
import { AnimalCards } from '@/components/AnimalCards'
import { getClient, getCurrentUser } from '@/lib/payload'
import { viewerOf } from '@/lib/visibility'
import {
  NOT_ARCHIVED,
  ANON_SHOW_LIMIT,
  FILTER_KEYS,
  PRESETS,
  SHOW_STEP,
  shownCount,
  showMoreHref,
  activePreset,
  buildAnimalWhere,
  hasActiveFilters,
  one,
  presetHref,
  resolveSort,
  type SearchParams,
} from '@/lib/animal-query'
import { describeFilter } from '@/lib/filter-labels'
import type { Animal } from '@/payload-types'

export const dynamic = 'force-dynamic'

export default async function HerdbookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const shown = shownCount(sp)
  const user = await getCurrentUser()
  const viewer = viewerOf(user)
  const payload = await getClient()

  const where = buildAnimalWhere(sp)
  const sort = resolveSort(sp)
  const hasActive = hasActiveFilters(sp)

  const [result, herdsResult, totalAll, orgsResult, presetCounts] = await Promise.all([
    payload.find({
      collection: 'animals',
      where,
      depth: 1,
      page: 1,
      limit: shown,
      sort: sort.payload,
      overrideAccess: false,
      user,
    }),
    payload.find({ collection: 'herds', limit: 500, sort: 'name', overrideAccess: true }),
    payload.count({ collection: 'animals', where: NOT_ARCHIVED, overrideAccess: false, user }),
    payload.find({
      collection: 'organizations',
      limit: 500,
      sort: 'name',
      overrideAccess: true,
    }),
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
            where: { and: [NOT_ARCHIVED, p.probe] },
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
  const farmCount = orgsResult.docs.filter((o) => o.type === 'farm').length

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
  const hasMore = found > animals.length
  // Гостю книга открыта на три экрана, дальше предлагаем бесплатную регистрацию
  const canShowMore = Boolean(user) || shown < ANON_SHOW_LIMIT
  const preset = activePreset(sp)

  return (
    <>
      <SiteHeader active="/" />

      <main className="container-page pb-8">
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
          {/*
             Блок тёмно-зелёный, а не светлый: белый текст на светлой зелени
             давал контраст около 2,6:1 — ниже порога читаемости, а это первое,
             что читает человек, впервые попавший на сайт. На тёмном фоне
             контраст выше 4,9:1, и текст читается без дополнительной плашки.
          */}
          <div
            className={`rounded-card bg-forest-500 p-8 text-white sm:p-10 ${
              hasActive
                ? 'grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-12'
                : 'flex flex-col justify-between gap-8'
            }`}
          >
            <div>
              <h1 className="text-[40px] font-medium leading-[1.05] sm:text-[48px]">
                Племенная книга
              </h1>
              <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-white/85">
                <span>
                  <span className="font-medium text-white">
                    {totalAll.totalDocs.toLocaleString('ru-RU')}
                  </span>{' '}
                  животных
                </span>
                <span aria-hidden="true" className="text-white/40">·</span>
                <span>
                  <span className="font-medium text-white">{farmCount}</span> хозяйств
                </span>
                <span aria-hidden="true" className="text-white/40">·</span>
                <span>
                  <span className="font-medium text-white">{herds.length}</span> стад
                </span>
              </p>
            </div>

            <div className="max-w-[60ch] space-y-4 text-[16px] leading-[1.6]">
              <p>
                Единая книга Ассоциации: хозяйства-участники ведут здесь свои стада, а записи
                проверяет Ассоциация — происхождение, продуктивность, здоровье каждого животного
                в одном месте.
              </p>
              <p className="text-white/85">
                По этим данным считают племенную ценность, подбирают быков-производителей и решают,
                оставить животное на племя или вывести из стада.
              </p>
            </div>
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
                    className="cursor-default rounded-lg bg-white px-3 py-1.5 text-[14px] text-ink-300 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]"
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
                {/*
                   Под таблицей — градиент, если записи ещё есть.
                   Он делает продолжение списка видимым до того, как человек
                   прочитает подпись: строки уходят под мягкую заливку,
                   а не обрываются на границе таблицы.
                */}
                <div className={`relative ${hasMore ? 'pb-2' : ''}`}>
                  <div className="hidden lg:block">
                    <AnimalTable animals={animals} viewer={viewer} />
                  </div>

                  <div className="lg:hidden">
                    <AnimalCards animals={animals} viewer={viewer} />
                  </div>

                  {hasMore && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-canvas"
                    />
                  )}
                </div>

                <div id="more" className="mt-6 scroll-mt-6 text-center">
                  {hasMore && canShowMore && (
                    <>
                      <Link
                        href={showMoreHref(sp, shown + SHOW_STEP)}
                        scroll={false}
                        className="btn btn-brand"
                      >
                        Показать ещё {Math.min(SHOW_STEP, found - shown)}
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path
                            d="M10 4v12m0 0 5-5m-5 5-5-5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </Link>
                      <p className="mt-3 text-[13px] text-ink-500">
                        Показано {animals.length} из {found.toLocaleString('ru-RU')}
                      </p>
                    </>
                  )}

                  {hasMore && !canShowMore && (
                    <div className="mx-auto max-w-[560px] rounded-card bg-white p-7 shadow-[0_2px_10px_rgb(23_24_26_/_0.06)]">
                      <p className="text-[19px] font-medium leading-snug">
                        Дальше — ещё {(found - shown).toLocaleString('ru-RU')} записей
                      </p>
                      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-700">
                        Регистрация в системе бесплатная. Она снимает ограничение на просмотр книги,
                        открывает полные карточки животных и развёрнутый фильтр по продуктивности.
                      </p>
                      <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <Link href="/register" className="btn btn-brand">
                          Зарегистрироваться бесплатно
                        </Link>
                        <Link
                          href="/login"
                          className="btn bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]"
                        >
                          У меня уже есть учётная запись
                        </Link>
                      </div>
                    </div>
                  )}

                  {!hasMore && found > SHOW_STEP && (
                    <p className="text-[13px] text-ink-500">
                      Показаны все {found.toLocaleString('ru-RU')} записей
                    </p>
                  )}
                </div>
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
