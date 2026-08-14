import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountTabs, ACCOUNT_TABS, type AccountTabKey } from '@/components/AccountTabs'
import { ImportCard } from '@/components/ImportCard'
import { ExportCard } from '@/components/ExportCard'
import { SearchPanel } from '@/components/SearchPanel'
import { AnimalTable } from '@/components/AnimalTable'
import { Pagination } from '@/components/Pagination'
import { ProfileForm } from '@/components/ProfileForm'
import { VisibilityForm } from '@/components/VisibilityForm'
import { LogoutButton } from '@/components/LogoutButton'
import { getClient, getCurrentUser } from '@/lib/payload'
import { buildAnimalWhere, currentPage, hasAdvancedValues, one, type SearchParams } from '@/lib/animal-query'
import { DOCUMENT_TYPES, EVENT_TYPES, ROLES, labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import type { Where } from 'payload'
import type { Animal, Organization } from '@/payload-types'

export const metadata: Metadata = { title: 'Личный кабинет' }
export const dynamic = 'force-dynamic'

const PER_PAGE = 12

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const tabParam = one(sp.tab) as AccountTabKey
  const tab: AccountTabKey = ACCOUNT_TABS.some((t) => t.key === tabParam) ? tabParam : 'animals'

  const org =
    typeof user.organization === 'object' && user.organization
      ? (user.organization as Organization)
      : null
  const orgId = org?.id

  const fullName = [user.lastName, user.firstName].filter(Boolean).join(' ') || user.email

  return (
    <>
      <SiteHeader />

      <main className="container-page pb-4">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[38px] font-medium sm:text-[46px]">Личный кабинет</h1>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-900 text-white">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="6.5" r="3.5" fill="currentColor" />
                <path d="M3.5 17c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" fill="currentColor" />
              </svg>
            </span>
            <span className="text-[17px]">{fullName}</span>
            <LogoutButton compact />
          </div>
        </div>

        <AccountTabs active={tab} />

        {!user.confirmed && (
          <p className="mt-6 rounded-xl bg-brand-50 px-5 py-4 text-sm text-forest-600">
            Регистрация завершена. Заявка отправлена на проверку в Ассоциацию — до подтверждения
            данные видны только вам.
          </p>
        )}

        {tab === 'animals' && (
          <AnimalsTab sp={sp} orgId={orgId} userId={user.id} />
        )}

        {tab === 'profile' && (
          <section className="mt-10">
            <h2 className="section-title mb-7">Личные данные</h2>
            <ProfileForm
              user={user}
              org={org}
              roleLabel={labelOf(ROLES, user.role)}
            />
          </section>
        )}

        {tab === 'events' && <EventsTab orgId={orgId} />}
        {tab === 'documents' && <DocumentsTab orgId={orgId} />}

        {tab === 'settings' && (
          <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <h2 className="section-title lg:col-span-2">Настройки</h2>
            <VisibilityFormWrapper orgId={orgId} />
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
        )}
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
}: {
  sp: SearchParams
  orgId?: number
  userId: number | string
}) {
  const payload = await getClient()
  const page = currentPage(sp)
  const scope: Where = orgId ? { owner: { equals: orgId } } : { author: { equals: userId } }

  const [result, herdsResult, total] = await Promise.all([
    payload.find({
      collection: 'animals',
      where: buildAnimalWhere(sp, scope),
      depth: 1,
      page,
      limit: PER_PAGE,
      sort: 'identNumber',
      overrideAccess: true,
    }),
    payload.find({
      collection: 'herds',
      where: orgId ? { organization: { equals: orgId } } : {},
      limit: 100,
      sort: 'name',
      overrideAccess: true,
    }),
    payload.count({ collection: 'animals', where: scope, overrideAccess: true }),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])
  defaults.tab = 'animals'

  return (
    <>
      <section className="mt-12">
        <h2 className="section-title">Действия</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ImportCard />
          <ExportCard />
        </div>
      </section>

      <section className="mt-8">
        <SearchPanel
          action="/account"
          total={total.totalDocs}
          herds={herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))}
          defaults={defaults}
          openAdvanced={hasAdvancedValues(sp)}
          hidden={{ tab: 'animals' }}
        />
      </section>

      <section className="mt-14">
        <h2 className="section-title mb-7">Животные</h2>
        <AnimalTable
          animals={result.docs as Animal[]}
          startIndex={(page - 1) * PER_PAGE}
          canOpenAll
          emptyText="В вашем стаде пока нет записей. Загрузите данные через «Импорт данных»."
        />
        <Pagination
          page={result.page ?? 1}
          totalPages={result.totalPages ?? 1}
          searchParams={{ ...sp, tab: 'animals' }}
          basePath="/account"
        />
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                              Вкладка «События»                       */
/* ------------------------------------------------------------------ */

async function EventsTab({ orgId }: { orgId?: number }) {
  const payload = await getClient()
  const events = await payload.find({
    collection: 'events',
    depth: 1,
    limit: 40,
    sort: '-date',
    overrideAccess: true,
    where: orgId ? { 'animal.owner': { equals: orgId } } : {},
  })

  return (
    <section className="mt-10">
      <h2 className="section-title mb-7">События</h2>
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
                <td>{labelOf(EVENT_TYPES, e.type)}</td>
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
                <td>{e.status === 'accepted' ? 'Принято' : e.status === 'sent' ? 'Отправлено' : 'Черновик'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
    <section className="mt-10">
      <h2 className="section-title mb-7">Документы</h2>
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
