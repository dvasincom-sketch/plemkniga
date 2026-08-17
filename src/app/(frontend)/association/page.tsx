import type { Metadata } from 'next'
import type { Where } from 'payload'
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
import { SUBMISSION_KINDS, SUBMISSION_STATUSES } from '@/collections/DataSubmissions'
import { labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'

export const metadata: Metadata = { title: 'Очередь проверки' }
export const dynamic = 'force-dynamic'

/**
 * Очередь проверки — главный экран кабинета Ассоциации.
 *
 * Порядок по умолчанию — старые сверху, и это не мелочь оформления.
 * Единственная метрика, которая волнует хозяйство, — сколько его продержали;
 * если она стоит первой и в порядке, и в таблице, объяснять её отдельно
 * не нужно.
 *
 * Закрытые пакеты (принятые и отклонённые) в очереди не показываются:
 * очередь — это список работы, а не журнал. Посмотреть закрытые можно
 * переключателем.
 */

const OPEN = ['uploaded', 'checking'] as const

const nameOf = (v: unknown): string =>
  v && typeof v === 'object' && 'name' in v ? String((v as { name?: string }).name ?? '—') : '—'

const personOf = (v: unknown): string => {
  if (!v || typeof v !== 'object') return '—'
  const u = v as { lastName?: string; firstName?: string; email?: string }
  const name = [u.lastName, u.firstName].filter(Boolean).join(' ')
  return name || u.email || '—'
}

export default async function AssociationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; mine?: string }>
}) {
  const user = await requireAssociation()
  const { show, mine } = await searchParams
  const closed = show === 'closed'

  const payload = await getClient()

  /*
   * Отбор идёт только по состоянию пакета — по пути внутри группы
   * (`review.assignee`) здесь не спрашиваем ничего, и это осознанно.
   *
   * Такой путь Payload разбирает по своей копии схемы, построенной при
   * запуске. Пока сервер разработки живёт с прежней копией — а живёт он
   * долго, — только что добавленное поле для него не существует, и страница
   * падает с «The following path cannot be queried». Лечится перезапуском,
   * но лечить нечего: очередь и без этого запроса знает всё, что нужно.
   * «Мои» отбираются из уже полученного списка, в памяти.
   */
  const where: Where = closed
    ? { status: { in: ['accepted', 'rejected', 'checked'] } }
    : { status: { in: [...OPEN] } }

  const { docs: found, totalDocs } = await payload.find({
    collection: 'data-submissions',
    where,
    // Старые сверху: очередь, а не лента новостей
    sort: closed ? '-submittedAt' : 'submittedAt',
    limit: 200,
    depth: 1,
    overrideAccess: true,
  })

  const assigneeOf = (s: { review?: { assignee?: unknown } | null }): number | string | null => {
    const a = s.review?.assignee
    if (!a) return null
    return typeof a === 'object' ? ((a as { id?: number | string }).id ?? null) : (a as number)
  }

  const myOpen = closed ? [] : found.filter((s) => assigneeOf(s) === user.id)
  const docs = mine === '1' ? myOpen : found

  const counts = await Promise.all([
    payload.count({ collection: 'data-submissions', where: { status: { equals: 'uploaded' } }, overrideAccess: true }),
    payload.count({ collection: 'data-submissions', where: { status: { equals: 'checking' } }, overrideAccess: true }),
  ])

  const [waiting, inWork] = counts.map((c) => c.totalDocs)
  const myWork = myOpen.length

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="queue" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Очередь проверки</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Пакеты, загруженные хозяйствами и ждущие заключения Ассоциации. Пока пакет
            не проверен, хозяйство не может опубликовать данные — очередь и есть то место,
            где эта работа стоит.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-[14px]">
            <Link
              href="/association"
              className={`rounded-lg px-3 py-2 transition-colors ${
                !closed && mine !== '1'
                  ? 'bg-forest-500 text-white'
                  : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              Все открытые · {waiting + inWork}
            </Link>
            <Link
              href="/association?mine=1"
              className={`rounded-lg px-3 py-2 transition-colors ${
                mine === '1'
                  ? 'bg-forest-500 text-white'
                  : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              Мои · {myWork}
            </Link>
            <Link
              href="/association?show=closed"
              className={`rounded-lg px-3 py-2 transition-colors ${
                closed
                  ? 'bg-forest-500 text-white'
                  : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
              }`}
            >
              Закрытые
            </Link>
            <span className="ml-2 text-ink-500">
              не взято в работу: {waiting}, в работе: {inWork}
            </span>
          </div>

          <div className="card mt-6">
            <div className="overflow-x-auto">
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>Ждёт</th>
                    <th>Пакет</th>
                    <th>Хозяйство</th>
                    <th>Что загружено</th>
                    <th className="text-right">Записей</th>
                    <th>Состояние</th>
                    <th>Кто разбирает</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-ink-500">
                        {closed
                          ? 'Закрытых пакетов пока нет'
                          : mine === '1'
                            ? 'Вы не взяли ни одного пакета'
                            : 'Очередь пуста — все загрузки разобраны'}
                      </td>
                    </tr>
                  )}

                  {docs.map((s) => {
                    const days = waitingDays(s.submittedAt)
                    const late = days >= WAITING_LATE_DAYS
                    const warn = !late && days >= WAITING_WARN_DAYS
                    const rows = (s.animals ?? []).length || s.intake?.rows || 0

                    return (
                      <tr key={s.id}>
                        <td
                          className={`whitespace-nowrap ${
                            late ? 'font-medium text-red-700' : warn ? 'text-amber-700' : 'text-ink-500'
                          }`}
                          title={`Загружено ${dateRu(s.submittedAt)}`}
                        >
                          {closed ? dateRu(s.submittedAt) : waitingLabel(days)}
                        </td>
                        <td>
                          <Link
                            href={`/association/submissions/${s.id}`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {s.number ?? `#${s.id}`}
                          </Link>
                        </td>
                        <td>{nameOf(s.organization)}</td>
                        <td>{labelOf(SUBMISSION_KINDS, s.kind)}</td>
                        <td className="text-right tabular-nums">{rows || '—'}</td>
                        <td>{labelOf(SUBMISSION_STATUSES, s.status)}</td>
                        <td className="text-ink-500">
                          {s.review?.assignee ? personOf(s.review.assignee) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalDocs > found.length && (
              <p className="mt-3 text-[13px] text-ink-500">
                Показаны первые {found.length} из {totalDocs.toLocaleString('ru-RU')}; «мои»
                считаются по этой же части списка.
              </p>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
