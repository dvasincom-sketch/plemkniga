import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { getClient } from '@/lib/payload'
import {
  WAITING_LATE_DAYS,
  WAITING_WARN_DAYS,
  requireAssociation,
  waitingDays,
  waitingLabel,
} from '@/lib/association'
import { VERIFICATION_PURPOSES, VERIFICATION_STATUSES } from '@/collections/VerificationRequests'
import { labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'

export const metadata: Metadata = { title: 'Заявки на верификацию' }
export const dynamic = 'force-dynamic'

/**
 * Очередь заявок на верификацию.
 *
 * Отдельно от очереди пакетов, хотя устроена так же. Причина не в технике:
 * это разные поводы для работы. Пакет — «посмотрите, что мы прислали»,
 * заявка — «подтвердите, что у нас уже есть». Смешать их в одну очередь
 * значит заставить эксперта каждый раз вспоминать, что он сейчас делает.
 */

const nameOf = (v: unknown): string =>
  v && typeof v === 'object' && 'name' in v ? String((v as { name?: string }).name ?? '—') : '—'

const personOf = (v: unknown): string => {
  if (!v || typeof v !== 'object') return '—'
  const u = v as { lastName?: string; firstName?: string; email?: string }
  return [u.lastName, u.firstName].filter(Boolean).join(' ') || u.email || '—'
}

export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  await requireAssociation()
  const { show } = await searchParams
  const closed = show === 'closed'

  const payload = await getClient()

  const { docs, totalDocs } = await payload.find({
    collection: 'verification-requests',
    where: closed
      ? { status: { in: ['approved', 'rejected'] } }
      : { status: { in: ['new', 'checking'] } },
    sort: closed ? '-requestedAt' : 'requestedAt',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="verifications" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Заявки на верификацию
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Хозяйство просит подтвердить записи, которые уже лежат в системе. Это не проверка
            загрузки: данные могли попасть сюда полгода назад и с тех пор не меняться.
            Подтверждение требуется перед выпуском племенного свидетельства.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-[14px]">
            <Link
              href="/association/verifications"
              className={`rounded-lg px-3 py-2 transition-colors ${
                !closed
                  ? 'bg-forest-500 text-white'
                  : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              Открытые
            </Link>
            <Link
              href="/association/verifications?show=closed"
              className={`rounded-lg px-3 py-2 transition-colors ${
                closed
                  ? 'bg-forest-500 text-white'
                  : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              Закрытые
            </Link>
          </div>

          <div className="card mt-6">
            <div className="overflow-x-auto">
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>Ждёт</th>
                    <th>Заявка</th>
                    <th>Хозяйство</th>
                    <th>Зачем</th>
                    <th className="text-right">Записей</th>
                    <th>Состояние</th>
                    <th>Кто разбирает</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-ink-500">
                        {closed ? 'Закрытых заявок нет' : 'Заявок в работе нет'}
                      </td>
                    </tr>
                  )}

                  {docs.map((r) => {
                    const days = waitingDays(r.requestedAt)
                    const late = days >= WAITING_LATE_DAYS
                    const warn = !late && days >= WAITING_WARN_DAYS

                    return (
                      <tr key={r.id}>
                        <td
                          className={`whitespace-nowrap ${
                            late
                              ? 'font-medium text-red-700'
                              : warn
                                ? 'text-amber-700'
                                : 'text-ink-500'
                          }`}
                          title={`Подана ${dateRu(r.requestedAt)}`}
                        >
                          {closed ? dateRu(r.requestedAt) : waitingLabel(days)}
                        </td>
                        <td>
                          <Link
                            href={`/association/verifications/${r.id}`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {r.number ?? `#${r.id}`}
                          </Link>
                        </td>
                        <td>{nameOf(r.organization)}</td>
                        <td>{labelOf(VERIFICATION_PURPOSES, r.purpose)}</td>
                        <td className="text-right tabular-nums">{(r.animals ?? []).length}</td>
                        <td>{labelOf(VERIFICATION_STATUSES, r.status)}</td>
                        <td className="text-ink-500">
                          {r.review?.assignee ? personOf(r.review.assignee) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalDocs > docs.length && (
              <p className="mt-3 text-[13px] text-ink-500">
                Показаны первые {docs.length} из {totalDocs.toLocaleString('ru-RU')}.
              </p>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
