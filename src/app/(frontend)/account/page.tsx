import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav, ACCOUNT_TABS, type AccountTabKey } from '@/components/AccountNav'
import { SearchPanel } from '@/components/SearchPanel'
import { AnimalTable } from '@/components/AnimalTable'
import { Pagination } from '@/components/Pagination'
import { ProfileForm } from '@/components/ProfileForm'
import { VisibilityForm } from '@/components/VisibilityForm'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { viewerOf, type Viewer } from '@/lib/visibility'
import {
  NOT_ARCHIVED,
  PAGE_SIZES,
  buildAnimalWhere,
  currentPage,
  hasActiveFilters,
  hasAdvancedValues,
  one,
  pageSizeLabel,
  resolvePageSize,
  type SearchParams,
} from '@/lib/animal-query'
import { DOCUMENT_TYPES, ROLES, eventTypeLabel, labelOf } from '@/lib/dictionaries'
import { SubmissionHistory } from '@/components/SubmissionHistory'
import { dateRu } from '@/lib/format'
import { RANKING_CAP, rankByProfile } from '@/lib/index-column'
import { indexValuesLag } from '@/lib/index-values'
import { ASSOCIATION_PROFILE } from '@/lib/breeding-index'
import { loadOwnProfiles, selectProfile } from '@/lib/index-profiles'
import type { Where } from 'payload'
import type { Animal, Organization } from '@/payload-types'

export const metadata: Metadata = { title: 'Личный кабинет' }
export const dynamic = 'force-dynamic'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  const viewer = viewerOf(user)
  if (!user) redirect('/login')

  const tabParam = one(sp.tab)
  // «Личные данные» переехали в настройки отдельным блоком — старые ссылки не ломаем
  const normalized = tabParam === 'profile' ? 'settings' : tabParam
  const tab: AccountTabKey = ACCOUNT_TABS.some((t) => t.key === normalized)
    ? (normalized as AccountTabKey)
    : 'animals'

  const tabTitle = ACCOUNT_TABS.find((t) => t.key === tab)?.label ?? 'Личный кабинет'

  const org =
    typeof user.organization === 'object' && user.organization
      ? (user.organization as Organization)
      : null
  const orgId = org?.id

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        {/*
          Два уровня навигации разведены: в шапке — меню сайта простыми
          ссылками, здесь — разделы кабинета вертикальным списком плашек.
          Список остаётся на месте при переходе между разделами, поэтому
          всегда видно, где вы находитесь.
        */}
        <AccountNav active={tab} />

        <div>
          <div className="min-w-0">
            <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">{tabTitle}</h1>

            {!user.confirmed && (
              <p className="mt-5 rounded-xl bg-brand-50 px-5 py-4 text-sm text-forest-600">
                Регистрация завершена. Заявка отправлена на проверку в Ассоциацию — до подтверждения
                данные видны только вам.
              </p>
            )}

            {tab === 'animals' && <AnimalsTab sp={sp} orgId={orgId} userId={user.id} viewer={viewer} />}

            {tab === 'events' && <EventsTab orgId={orgId} />}
            {tab === 'documents' && <DocumentsTab orgId={orgId} />}

            {tab === 'settings' && (
              <>
                <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <h2 className="section-title lg:col-span-2">Видимость и доступ</h2>
            <VisibilityFormWrapper orgId={orgId} />
            <div className="card">
              <h3 className="panel-heading">Личные данные</h3>
              <p className="text-sm leading-relaxed text-ink-700">
                Фамилия, телефон, реквизиты организации и роль в системе вынесены на отдельную
                страницу — она открывается кликом по имени в шапке.
              </p>
              <Link
                href="/account/profile"
                className="mt-4 inline-block underline underline-offset-4 hover:text-forest-500"
              >
                Открыть профиль пользователя
              </Link>
            </div>

            {/*
              Профили весов — настройка уровня хозяйства, а не личная: её делает
              главный генетик, и она меняет порядок животных для всех сотрудников.
              Поэтому блок стоит рядом с видимостью данных, а не в профиле
              пользователя.
            */}
            <IndexProfilesCard orgId={orgId} />

            <div className="card">
              <h3 className="panel-heading">Интеграции и API</h3>
              <p className="text-sm leading-relaxed text-ink-700">
                REST API системы доступен по адресу{' '}
                <code className="rounded bg-canvas px-1.5 py-0.5">/api</code>, GraphQL — по адресу{' '}
                <code className="rounded bg-canvas px-1.5 py-0.5">/api/graphql</code>. Авторизация —
                по тому же токену, что и в веб-интерфейсе.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-ink-700">
                Административная панель Payload:{' '}
                <Link href="/admin" className="underline underline-offset-4">
                  /admin
                </Link>
              </p>
            </div>
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                            Вкладка «Мои животные»                    */
/* ------------------------------------------------------------------ */

async function AnimalsTab({
  sp,
  orgId,
  userId,
  viewer,
}: {
  sp: SearchParams
  orgId?: number
  userId: number | string
  viewer: Viewer
}) {
  const payload = await getClient()
  const page = currentPage(sp)
  const perPage = resolvePageSize(sp)
  const scope: Where = orgId ? { owner: { equals: orgId } } : { author: { equals: userId } }
  const where = buildAnimalWhere(sp, scope)

  /*
   * В своём стаде порядок строит основной профиль хозяйства — в этом и смысл
   * слова «основной». Переключателя здесь нет намеренно: книга открыта для
   * сравнения животных под разными наборами весов, а свой список — рабочий,
   * и он должен отвечать на вопрос «кого оставлять» одним ответом,
   * тем самым, который хозяйство себе назначило.
   */
  const profile = await selectProfile(one(sp.profile), orgId)

  const [result, herdsResult, total] = await Promise.all([
    profile
      ? rankByProfile({
          payload,
          where,
          profile,
          offset: (page - 1) * (perPage || 0),
          limit: perPage,
          overrideAccess: true,
        })
      : payload.find({
          collection: 'animals',
          where,
          depth: 1,
          page,
          // 0 означает «без разбивки»: Payload отдаёт всё найденное одним ответом
          limit: perPage,
          sort: '-ipcRank',
          overrideAccess: true,
        }),
    payload.find({
      collection: 'herds',
      where: orgId ? { organization: { equals: orgId } } : {},
      limit: 100,
      sort: 'name',
      overrideAccess: true,
    }),
    payload.count({
      collection: 'animals',
      where: { and: [NOT_ARCHIVED, scope] },
      overrideAccess: true,
    }),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])
  defaults.tab = 'animals'

  // Сверка хранимых значений с книгой — только когда порядок построен по ним
  const lagMissing =
    profile && 'stored' in result && result.stored
      ? (await indexValuesLag(payload, profile.key)).missing
      : 0

  /*
   * Пустая таблица объясняется по-разному.
   *
   * Раньше в обоих случаях стояло «в вашем стаде пока нет записей»: человек
   * искал по стаду из полутора сотен голов, ничего не находил и читал, что
   * стадо пустое. Теперь ответ зависит от того, задан ли отбор.
   */
  const filtered = hasActiveFilters(sp)
  const emptyText = filtered ? (
    <>
      По заданным условиям в вашем стаде ничего не найдено.{' '}
      <Link href="/account?tab=animals" className="underline underline-offset-4">
        Сбросить отбор
      </Link>
    </>
  ) : (
    <>
      В вашем стаде пока нет записей. Загрузите их через{' '}
      <Link href="/account/import" className="underline underline-offset-4">
        «Загрузку данных»
      </Link>
      .
    </>
  )

  return (
    <>
      {/*
         Раньше здесь одновременно жили два несовместимых сценария: крупные
         карточки импорта-экспорта и поиск по стаду. Действия ушли на свою
         страницу и в строку кнопок, а раздел занят одним делом — работой
         со списком животных.
      */}
      <section className="mt-6">
        <SearchPanel
          action="/account"
          total={total.totalDocs}
          totalLabel="Животных в хозяйстве"
          herds={herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))}
          defaults={defaults}
          openAdvanced={hasAdvancedValues(sp)}
          hidden={{ tab: 'animals' }}
        />
      </section>

      <section className="mt-8">
        {/*
           Панель действий стоит в одной строке с заголовком раздела:
           это настройка таблицы, а не отдельный сценарий, и занимать
           собственную полосу ей незачем.
        */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 className="section-title mb-0">Животные</h2>

          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <a
              href="/account/export?format=csv"
              className="rounded-lg bg-white px-3 py-2 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
            >
              Выгрузить CSV
            </a>
            <a
              href="/account/export?format=json"
              className="rounded-lg bg-white px-3 py-2 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
            >
              JSON
            </a>
            {/*
               Ручной ввод стоит рядом с загрузкой, но кнопкой послабее:
               файлом заводят стадо, руками — одиночные случаи, и порядок
               кнопок должен подсказывать именно это.
            */}
            <Link href="/account/animals/new" className="btn">
              Добавить животное
            </Link>
            <Link href="/account/import" className="btn btn-brand">
              Загрузить данные
            </Link>
          </div>
        </div>

        {profile && (
          <p className="mb-4 text-[14px] leading-relaxed text-ink-500">
            Порядок и колонка «{profile.name}» — по основному профилю хозяйства.{' '}
            <Link href="/account/indices" className="underline underline-offset-4">
              Настроить профили
            </Link>
            {'capped' in result && result.capped && (
              <>
                {' '}· значения по профилю ещё не рассчитаны, поэтому порядок построен
                по {RANKING_CAP.toLocaleString('ru-RU')} записям с наибольшим ИПЦ
                из {(result.totalDocs ?? 0).toLocaleString('ru-RU')}
              </>
            )}
            {lagMissing > 0 && (
              <>
                {' '}· пересчёт не охватил {lagMissing.toLocaleString('ru-RU')} записей —
                выполните <code className="rounded bg-canvas px-1.5 py-0.5">npm run backfill:index</code>
              </>
            )}
          </p>
        )}

        <AnimalTable
          animals={result.docs as Animal[]}
          startIndex={(page - 1) * (perPage || 0)}
          viewer={viewer}
          emptyText={emptyText}
          indexLabel={profile?.name}
          indexValues={'values' in result ? result.values : undefined}
        />
        {/*
           Подвал таблицы: слева — сколько показано и по сколько показывать,
           справа — страницы. Оба управляют одной таблицей, поэтому стоят
           под ней, а не в шапке раздела.
        */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="text-ink-500">
              Показано {result.docs.length} из {result.totalDocs ?? 0}
              {result.totalDocs !== total.totalDocs && ' (с учётом отбора)'}
            </span>
            <span aria-hidden="true" className="mx-1 text-ink-300">
              ·
            </span>
            <span className="text-ink-500">Показывать по:</span>
            {PAGE_SIZES.map((size) => {
              const isActive = perPage === size
              const params = new URLSearchParams()
              for (const [k, v] of Object.entries(sp)) {
                if (k === 'perPage' || k === 'page') continue
                const value = one(v)
                if (value) params.set(k, value)
              }
              params.set('tab', 'animals')
              if (size !== PAGE_SIZES[0]) params.set('perPage', String(size))

              return (
                <Link
                  key={size}
                  href={`/account?${params.toString()}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                    isActive
                      ? 'bg-brand-50 font-medium text-forest-600'
                      : 'text-ink-700 hover:bg-[#ededed]'
                  }`}
                >
                  {pageSizeLabel(size)}
                </Link>
              )
            })}
          </div>

          <Pagination
            page={result.page ?? 1}
            totalPages={result.totalPages ?? 1}
            searchParams={{ ...sp, tab: 'animals' }}
            basePath="/account"
          />
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                              Вкладка «События»                       */
/* ------------------------------------------------------------------ */

async function EventsTab({ orgId }: { orgId?: number }) {
  const payload = await getClient()

  const [submissions, events] = await Promise.all([
    payload.find({
      collection: 'data-submissions',
      where: orgId ? { organization: { equals: orgId } } : {},
      sort: '-submittedAt',
      limit: 30,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'events',
      depth: 1,
      limit: 30,
      sort: '-date',
      overrideAccess: true,
      where: orgId ? { 'animal.owner': { equals: orgId } } : {},
    }),
  ])

  return (
    <>
      <section className="mt-8">
        <h2 className="section-title mb-6">История загрузок</h2>
        <SubmissionHistory submissions={submissions.docs} />
      </section>

      {/*
         Верификация стоит рядом с загрузками, потому что это второй путь
         к тому же результату — уровню «Верифицировано ассоциацией».
         Загрузкой его получают записи из проверенного файла; заявкой —
         любые свои, независимо от того, когда они попали в систему.
      */}
      <section className="mt-10">
        <h2 className="section-title mb-6">Верификация записей</h2>
        <div className="card">
          <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Подайте свои записи в Ассоциацию, чтобы она подтвердила их по документам. Это
            не загрузка данных: подавать можно любые записи стада, в том числе те, что лежат
            в системе давно. Подтверждение требуется перед выпуском племенного свидетельства.
          </p>
          <Link href="/account/verification" className="btn btn-accent mt-5">
            Подать на верификацию
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="section-title mb-7">События животных</h2>
        <div className="card overflow-x-auto">
          <table className="metric-table min-w-[720px]">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Животное</th>
                <th>Описание</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {events.docs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink-500">
                    Событий пока нет
                  </td>
                </tr>
              )}
              {events.docs.map((e) => (
                <tr key={e.id}>
                  <td>{dateRu(e.date)}</td>
                  <td>{eventTypeLabel(e.type)}</td>
                  <td>
                    {typeof e.animal === 'object' && e.animal ? (
                      <Link href={`/animals/${e.animal.id}`} className="underline underline-offset-2">
                        {e.animal.identNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{e.title || '—'}</td>
                  <td>
                    {e.status === 'accepted'
                      ? 'Принято'
                      : e.status === 'sent'
                        ? 'Отправлено'
                        : 'Черновик'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                             Вкладка «Документы»                      */
/* ------------------------------------------------------------------ */

async function DocumentsTab({ orgId }: { orgId?: number }) {
  const payload = await getClient()
  const docs = await payload.find({
    collection: 'documents',
    depth: 1,
    limit: 40,
    sort: '-issuedAt',
    overrideAccess: true,
    where: orgId ? { organization: { equals: orgId } } : {},
  })

  return (
    <section className="mt-8">
      <div className="card overflow-x-auto">
        <table className="metric-table min-w-[720px]">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Номер</th>
              <th>Название</th>
              <th>Животное</th>
            </tr>
          </thead>
          <tbody>
            {docs.docs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-500">
                  Документов пока нет
                </td>
              </tr>
            )}
            {docs.docs.map((d) => (
              <tr key={d.id}>
                <td>{dateRu(d.issuedAt)}</td>
                <td>{labelOf(DOCUMENT_TYPES, d.type)}</td>
                <td>{d.number || '—'}</td>
                <td>{d.title}</td>
                <td>
                  {typeof d.animal === 'object' && d.animal ? (
                    <Link href={`/animals/${d.animal.id}`} className="underline underline-offset-2">
                      {d.animal.identNumber}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

async function VisibilityFormWrapper({ orgId }: { orgId?: number }) {
  const payload = await getClient()
  if (!orgId) return null
  const sample = await payload.find({
    collection: 'animals',
    where: { owner: { equals: orgId } },
    limit: 1,
    overrideAccess: true,
  })
  const first = sample.docs[0]
  return (
    <VisibilityForm
      defaultVisible={Boolean(first?.publicVisible)}
      defaultDetails={Boolean(first?.publicDetails)}
    />
  )
}

/* ------------------------------------------------------------------ */
/*                        Профили индекса — карточка                    */
/* ------------------------------------------------------------------ */

/**
 * Короткая справка о том, по какому профилю сейчас считается индекс.
 *
 * Настройка живёт на отдельной странице: там одиннадцать весов, сравнение
 * с профилем Ассоциации и пересчёт порядка животных — в карточку настроек
 * это не помещается, да и заходят туда раз в сезон.
 */
async function IndexProfilesCard({ orgId }: { orgId?: number }) {
  const { docs, defaultDoc } = await loadOwnProfiles(orgId)
  const activeName = defaultDoc ? defaultDoc.name : ASSOCIATION_PROFILE.name

  return (
    <div className="card">
      <h3 className="panel-heading">Профиль индекса племенной ценности</h3>
      <p className="text-sm leading-relaxed text-ink-700">
        Индекс считается по профилю{' '}
        <span className="font-medium">{activeName}</span>
        {defaultDoc ? ' — вашему собственному набору весов.' : ' — стандартному набору весов Ассоциации.'}{' '}
        Свой профиль нужен, когда экономика хозяйства расходится со средней по отрасли:
        белок дороже жира при сдаче на сыр, выбытие первотёлок, переполненный роддом.
      </p>

      {docs.length > 0 && (
        <p className="mt-3 text-sm text-ink-500">
          Профилей хозяйства: {docs.length}
        </p>
      )}

      <Link
        href="/account/indices"
        className="mt-4 inline-block underline underline-offset-4 hover:text-forest-500"
      >
        {docs.length > 0 ? 'Настроить профили' : 'Создать свой профиль'}
      </Link>
    </div>
  )
}
