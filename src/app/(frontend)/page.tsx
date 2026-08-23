import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { WhyJoin } from '@/components/WhyJoin'
import { ImageSlot } from '@/components/ImageSlot'
import { SearchPanel } from '@/components/SearchPanel'
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
  hasAdvancedValues,
  one,
  presetHref,
  resolveSort,
  NO_PROFILE,
  type SearchParams,
} from '@/lib/animal-query'
import { describeFilter } from '@/lib/filter-labels'
import { PresetIcon } from '@/components/PresetIcons'
import { loadProfileChoices, selectProfile } from '@/lib/index-profiles'
import { RANKING_CAP, indexValues, rankByProfile } from '@/lib/index-column'
import { indexValuesLag } from '@/lib/index-values'
import type { Animal, Organization } from '@/payload-types'

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
  const hasActive = hasActiveFilters(sp)

  /*
   * Профиль расчёта: явный выбор в адресе, иначе основной профиль хозяйства.
   *
   * Гость и хозяйство без своего профиля видят книгу ровно как раньше —
   * с одной колонкой официального ИПЦ. Колонка индекса появляется, когда
   * есть чей взгляд показывать, и переключатель над таблицей всегда говорит,
   * чей именно: молчаливой пересортировки быть не должно.
   */
  const orgId =
    typeof user?.organization === 'object' && user.organization
      ? (user.organization as Organization).id
      : (user?.organization as number | undefined)

  const [profile, profileChoices] = await Promise.all([
    selectProfile(one(sp.profile), orgId),
    loadProfileChoices(orgId),
  ])
  const profileKey = profile?.key ?? NO_PROFILE
  const sort = resolveSort(sp, Boolean(profile))
  const orderByProfile = Boolean(profile) && sort.value === 'profile'

  const [result, herdsResult, totalAll, orgsResult, presetCounts] = await Promise.all([
    orderByProfile
      ? rankByProfile({
          payload,
          where,
          profile: profile!,
          limit: shown,
          user,
        })
      : payload.find({
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
    /*
     * Считаются все отборы, а не только те, у кого написан `probe`.
     *
     * Раньше число знал один отбор — «на продажу», ради того чтобы гаснуть
     * при пустоте. Остальные вели в никуда молча: нажал «Быки-производители»
     * в книге без быков и получил пустую страницу вместо ответа «их нет».
     * Условие для счёта берётся оттуда же, откуда строится сама ссылка
     * (`buildAnimalWhere` от параметров отбора), — разойтись числу
     * и выдаче теперь негде.
     *
     * Ошибка здесь намеренно проглатывается: это украшение плашки, и оно
     * не должно ронять страницу.
     */
    Promise.all(
      PRESETS.map(async (p) => {
        const probe =
          'probe' in p && p.probe
            ? p.probe
            : buildAnimalWhere(p.params as unknown as SearchParams)
        try {
          const { totalDocs } = await payload.count({
            collection: 'animals',
            where: { and: [NOT_ARCHIVED, probe] },
            overrideAccess: false,
            user,
          })
          return totalDocs
        } catch {
          return null
        }
      }),
    ),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])

  const herds = herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))
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
  /*
   * Значения колонки. Когда порядок строит база, индекс считается только
   * для показанной страницы — считать его для всей книги ради одной ширмы
   * незачем.
   */
  const columnValues = profile
    ? 'values' in result
      ? result.values
      : indexValues(animals, profile)
    : undefined
  const rankingCapped = 'capped' in result ? result.capped : false

  /*
   * Отставание пересчёта проверяется только когда порядок построен
   * по хранимым значениям: в остальных случаях список и так собран
   * из живых данных, и сверять нечего.
   */
  const lagMissing =
    profile && 'stored' in result && result.stored
      ? (await indexValuesLag(payload, profile.key)).missing
      : 0
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
          {/*
             Поиск первым, готовые подборки под ним.
             Раньше отбор жил в трёх местах: чипы сверху, три поля в зелёной
             панели и настройки показа врассыпную над таблицей. Каждый блок
             отвечал за свой кусок одной задачи — сузить выдачу, — и человек
             не знал, где искать нужное условие. Теперь порядок один: где
             искать, чем сузить, как посмотреть.
          */}
          <SearchPanel
            action="/#results"
            title="Поиск по книге"
            total={totalAll.totalDocs}
            totalLabel="Животных в книге"
            herds={herds}
            withOwner
            owners={orgsResult.docs.map((o) => ({ value: o.name, label: o.name }))}
            withAuthor={false}
            defaults={defaults}
            openAdvanced={hasAdvancedValues(sp)}
            hidden={{
              // Способ смотреть на выдачу переживает поиск: иначе выбранный
              // профиль и порядок строк сбрасывались бы при каждом уточнении
              ...(one(sp.sort) ? { sort: one(sp.sort) } : {}),
              ...(one(sp.profile) ? { profile: one(sp.profile) } : {}),
            }}
          />

          {/*
             Быстрый отбор — плашки со значком, а не чипсы.

             Чипсы читались как продолжение формы поиска, стоящей прямо
             над ними: тот же размер, тот же вид, только текст другой.
             Ряд одинаковых прямоугольников с русскими подписями глаз
             разбирает построчно и к концу ряда забывает начало.
             Значок даёт зацепку: «бык», «удой», «родословная», «знак»,
             «спираль», «доля», «ярлык» узнаются силуэтом раньше, чем
             прочитана подпись.

             Плашки нарочно маленькие. Это не главные действия страницы,
             а сокращение к поиску над ними: вырасти до размера карточек
             им значило бы поспорить с самим поиском.
          */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[14px] text-ink-500">Быстрый отбор:</span>
            {PRESETS.map((p, i) => {
              const isActive = preset === p.key
              const muted = presetCounts[i] === 0

              /*
                 Пустой отбор гаснет, но остаётся на месте: исчезнув, он
                 сообщил бы, что такого отбора нет вовсе, — а он есть,
                 просто данных под ним пока нет. Подсказка объясняет
                 разницу.
              */
              if (muted) {
                return (
                  <span
                    key={p.key}
                    aria-disabled="true"
                    title={'emptyHint' in p ? p.emptyHint : 'Данных пока нет'}
                    className="flex cursor-default items-center gap-2 rounded-lg bg-white px-3 py-2 text-[14px] text-ink-300 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]"
                  >
                    <PresetIcon preset={p.key} />
                    {p.label}
                  </span>
                )
              }

              return (
                <Link
                  key={p.key}
                  href={isActive ? '/#results' : presetHref(p, sp)}
                  aria-current={isActive ? 'true' : undefined}
                  /*
                     Число ушло из плашки в подсказку.

                     В ряду из семи отборов семь чисел рядом с семью
                     подписями складываются в мельтешение: глаз читает
                     цифру раньше слова, а выбирают здесь по слову.
                     Ответ «есть ли там что-нибудь» никуда не делся —
                     пустой отбор по-прежнему гаснет, а точное число
                     показывается при наведении, то есть тому,
                     кто спросил.
                  */
                  title={
                    isActive
                      ? 'Снять этот отбор'
                      : `${p.label}: ${presetCounts[i]?.toLocaleString('ru-RU') ?? 'считается'}`
                  }
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] transition-colors ${
                    isActive
                      ? 'bg-forest-500 font-medium text-white'
                      : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                  }`}
                >
                  <PresetIcon preset={p.key} />
                  {p.label}
                </Link>
              )
            })}
          </div>

          <div className="mt-7">
            <ResultsBar
              sp={sp}
              total={found}
              sort={sort.value}
              hasActive={hasActive}
              herds={herds}
              profiles={profileChoices}
              profileKey={profileKey}
            />

            {/*
               Неполнота проговаривается вслух — в обоих её видах.
               Порядок без хранимых значений строится в памяти по порции,
               и наверху оказываются лучшие из порции, а не из книги. Отставший
               пересчёт означает, что часть животных в список просто не попала.
               Промолчать здесь — показать неполный список как полный.
            */}
            {rankingCapped && (
              <p className="mb-4 rounded-xl bg-[#fff6e5] px-4 py-3 text-[14px] leading-relaxed">
                Порядок по профилю «{profile?.name}» построен по{' '}
                {RANKING_CAP.toLocaleString('ru-RU')} записям отбора с наибольшим ИПЦ — всего
                в отборе {found.toLocaleString('ru-RU')}. Значения по этому профилю ещё
                не рассчитаны; после пересчёта ограничение снимается.
              </p>
            )}

            {lagMissing > 0 && (
              <p className="mb-4 rounded-xl bg-[#fff6e5] px-4 py-3 text-[14px] leading-relaxed">
                Пересчёт по профилю «{profile?.name}» не охватил{' '}
                {lagMissing.toLocaleString('ru-RU')}{' '}
                {plural(lagMissing, 'запись', 'записи', 'записей')} — их нет в этом порядке.
                Полный пересчёт: <code className="rounded bg-canvas px-1.5 py-0.5">npm run backfill:index</code>
              </p>
            )}

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
                    <AnimalTable
                      animals={animals}
                      viewer={viewer}
                      indexLabel={profile?.name}
                      indexValues={columnValues}
                    />
                  </div>

                  <div className="lg:hidden">
                    <AnimalCards
                      animals={animals}
                      viewer={viewer}
                      indexLabel={profile?.name}
                      indexValues={columnValues}
                    />
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

        {/*
           Рассказ о системе — под каталогом и только гостю.

           Порядок и есть главный довод. Сначала человек видит настоящие
           записи настоящих хозяйств и убеждается, что книга живая; и только
           потом читает, что она умеет. Тот же текст над каталогом был бы
           обещанием, под каталогом он — вывод из увиденного.

           Вошедшему хозяйству блок не показывается: выбор оно уже сделало,
           и заставлять его пролистывать рекламу того, чем оно пользуется, —
           плохой способ поблагодарить.
        */}
        {!user && <WhyJoin />}
      </main>

      <SiteFooter />
    </>
  )
}

/** Склонение по числу: 1 запись, 2 записи, 5 записей. */
const plural = (n: number, one_: string, few: string, many: string) => {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one_
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}
