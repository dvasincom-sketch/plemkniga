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
import {
  PAGE_SIZES,
  buildAnimalWhere,
  currentPage,
  hasAdvancedValues,
  one,
  pageSizeLabel,
  resolvePageSize,
  type SearchParams,
} from '@/lib/animal-query'
import { DOCUMENT_TYPES, EVENT_TYPES, ROLES, labelOf } from '@/lib/dictionaries'
import { SubmissionHistory } from '@/components/SubmissionHistory'
import { dateRu } from '@/lib/format'
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

            {tab === 'animals' && <AnimalsTab sp={sp} orgId={orgId} userId={user.id} />}

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
}: {
  sp: SearchParams
  orgId?: number
  userId: number | string
}) {
  const payload = await getClient()
  const page = currentPage(sp)
  const perPage = resolvePageSize(sp)
  const scope: Where = orgId ? { owner: { equals: orgId } } : { author: { equals: userId } }

  const [result, herdsResult, total] = await Promise.all([
    payload.find({
      collection: 'animals',
      where: buildAnimalWhere(sp, scope),
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
    payload.count({ collection: 'animals', where: scope, overrideAccess: true }),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])
  defaults.tab = 'animals'

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
            {/* Размер страницы: у крупных хозяйств тысячи голов, и листать
                по 25 штук им незачем */}
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
                  className={`rounded-lg px-2.5 py-2 transition-colors ${
                    isActive
                      ? 'bg-brand-50 font-medium text-forest-600'
                      : 'text-ink-700 hover:bg-[#ededed]'
                  }`}
                >
                  {pageSizeLabel(size)}
                </Link>
              )
            })}
            <span aria-hidden="true" className="mx-1 text-ink-300">
              ·
            </span>
            <span className="text-ink-500">Всего в стаде: {total.totalDocs}</span>
            <span aria-hidden="true" className="mx-1 text-ink-300">
              ·
            </span>
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
            <Link href="/account/import" className="btn btn-brand">
              Загрузить данные
            </Link>
          </div>
        </div>

        <AnimalTable
          animals={result.docs as Animal[]}
          startIndex={(page - 1) * (perPage || 0)}
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
