import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { SubmissionPublishForm } from '@/components/SubmissionPublishForm'
import { getClient, getCurrentUser } from '@/lib/payload'
import { SUBMISSION_KINDS, SUBMISSION_STATUSES } from '@/collections/DataSubmissions'
import { labelOf } from '@/lib/dictionaries'

export const metadata: Metadata = { title: 'Пакет загрузки данных' }
export const dynamic = 'force-dynamic'

const dateTimeRu = (v?: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

const fileSize = (bytes?: number | null) => {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} Мб` : `${Math.round(bytes / 1024)} Кб`
}

const FileBadge = ({ ext }: { ext: string }) => (
  <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[11px] font-medium uppercase text-white">
    {ext}
  </span>
)

const userName = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as { lastName?: string; firstName?: string; email?: string }
    const n = [o.lastName, o.firstName].filter(Boolean).join(' ')
    return n || o.email || '—'
  }
  return '—'
}

export default async function SubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ history?: string }>
}) {
  const { id } = await params
  const { history: showHistory } = await searchParams

  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const payload = await getClient()

  let submission
  try {
    submission = await payload.findByID({
      collection: 'data-submissions',
      id,
      depth: 2,
      overrideAccess: true,
    })
  } catch {
    notFound()
  }
  if (!submission) notFound()

  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)
  const subOrg =
    typeof submission.organization === 'object' && submission.organization
      ? submission.organization.id
      : submission.organization

  if (user.role !== 'admin' && subOrg !== orgId) notFound()

  const protocol =
    typeof submission.review?.errorProtocol === 'object' ? submission.review.errorProtocol : null

  const isChecked = submission.status === 'checked'
  const isAccepted = submission.status === 'accepted'

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pt-8 pb-6">
        <AccountNav active="events" />

        <div>
          <div className="min-w-0">
        <Breadcrumbs
          items={[
            { label: 'Личный кабинет', href: '/account' },
            { label: 'События', href: '/account?tab=events' },
            { label: 'Пакет данных' },
          ]}
        />

        <Link
          href="/account?tab=events"
          className="inline-flex items-center gap-2 text-[15px] hover:text-forest-500"
        >
          <svg width="18" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true">
            <path
              d="M19 7H1m0 0 5.5-5.5M1 7l5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Назад
        </Link>

        <section className="mt-6">
          <div className="card px-8 py-9 sm:px-10">
            <h2 className="text-[26px] font-semibold">№ {submission.number}</h2>
            <p className="mt-2 text-[19px]">{labelOf(SUBMISSION_KINDS, submission.kind)}</p>

            <hr className="my-7 border-ink-100" />

            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="text-[15px]">{labelOf(SUBMISSION_STATUSES, submission.status)}</p>
              <p className="text-[15px] text-ink-500">
                {dateTimeRu(submission.review?.checkedAt ?? submission.submittedAt)}
              </p>
            </div>

            {submission.review?.comment && (
              <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed">
                <span className="text-ink-900">Комментарий: </span>
                <span className="text-ink-500">{submission.review.comment}</span>
              </p>
            )}

            {(submission.review?.totalRows ?? 0) > 0 && (
              <p className="mt-3 text-sm text-ink-700">
                Обработано записей: {submission.review?.totalRows}, принято{' '}
                {submission.review?.acceptedRows ?? 0}, с ошибками{' '}
                {submission.review?.rejectedRows ?? 0}.
              </p>
            )}

            {protocol && (
              <div className="mt-7 rounded-xl bg-[#f0f0f0] p-6">
                <h3 className="text-[17px] font-medium">Документы для ознакомления</h3>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <span className="flex items-center gap-3 text-[15px]">
                    <FileBadge ext={(protocol.filename ?? 'xlsx').split('.').pop() ?? 'xlsx'} />
                    Протокол ошибок
                    <span className="text-ink-500">| {fileSize(protocol.filesize)}</span>
                  </span>
                  <a
                    href={protocol.url ?? '#'}
                    download
                    className="text-[15px] text-forest-500 underline underline-offset-4 hover:text-forest-600"
                  >
                    Скачать
                  </a>
                </div>
              </div>
            )}

            <SubmissionPublishForm
              id={String(submission.id)}
              disabled={!isChecked}
              alreadyPublished={isAccepted}
            />

            <hr className="my-8 border-ink-100" />

            {showHistory === '1' ? (
              <>
                <h3 className="mb-4 text-[17px] font-medium">История</h3>
                <ul className="text-sm">
                  {(submission.history ?? []).length === 0 && (
                    <li className="text-ink-500">Записей пока нет</li>
                  )}
                  {(submission.history ?? []).map((h, i) => (
                    <li
                      key={h.id ?? i}
                      className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#ededed] py-3 last:border-0"
                    >
                      <span>
                        <span className="text-ink-900">
                          {labelOf(SUBMISSION_STATUSES, h.status)}
                        </span>
                        {h.actor && (
                          <span className="text-ink-500"> · {userName(h.actor)}</span>
                        )}
                        {h.note && <span className="text-ink-500"> · {h.note}</span>}
                      </span>
                      <span className="text-ink-500">{dateTimeRu(h.at)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/account/submissions/${submission.id}`}
                  className="mt-5 inline-block text-[15px] text-forest-500 underline underline-offset-4"
                >
                  Скрыть историю
                </Link>
              </>
            ) : (
              <Link
                href={`/account/submissions/${submission.id}?history=1`}
                className="text-[15px] text-forest-500 underline underline-offset-4 hover:text-forest-600"
              >
                Показать историю
              </Link>
            )}
          </div>
        </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
