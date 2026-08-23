import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { getClient } from '@/lib/payload'
import {
  WAITING_LATE_DAYS,
  WAITING_WARN_DAYS,
  isStaleSchemaError,
  requireAssociation,
  waitingDays,
  waitingLabel,
} from '@/lib/association'
import { StaleSchemaNotice } from '@/components/StaleSchemaNotice'
import { VERIFICATION_PURPOSES, VERIFICATION_STATUSES } from '@/collections/VerificationRequests'
import { labelOf } from '@/lib/dictionaries'
import { dateRu, plural } from '@/lib/format'
import { relId } from '@/lib/visibility'
import { FilterChips } from '@/components/FilterChips'
import type { VerificationRequest } from '@/payload-types'

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

  /*
   * Коллекция молодая, и сервер разработки, запущенный до её появления,
   * о ней не знает. Отвечаем на это инструкцией, а не стеком: см.
   * `isStaleSchemaError`.
   */
  let docs: VerificationRequest[] = []
  let totalDocs = 0
  let stale = false

  try {
    const res = await payload.find({
      collection: 'verification-requests',
      where: closed
        ? { status: { in: ['approved', 'rejected'] } }
        : { status: { in: ['new', 'checking'] } },
      sort: closed ? '-requestedAt' : 'requestedAt',
      limit: 100,
      depth: 1,
      overrideAccess: true,
    })
    docs = res.docs as VerificationRequest[]
    totalDocs = res.totalDocs
  } catch (e) {
    if (!isStaleSchemaError(e)) throw e
    stale = true
  }

  /*
   * Пересечения открытых заявок по животным.
   *
   * Хозяйство теперь не может подать одни и те же записи дважды —
   * но заявки, поданные до этого заслона, никуда не делись, и заслона
   * с этой стороны не было вовсе. Эксперт открывает В-2026-002, разбирает
   * семнадцать записей и не знает, что те же семнадцать лежат в В-2026-001.
   * Это не только двойная работа: по двум заявкам можно вынести разные
   * решения, и каждое будет верным относительно того, что видел эксперт.
   *
   * Считается в памяти по уже полученному списку: открытых заявок сотня,
   * запрос за пересечениями стоил бы дороже самого сравнения.
   */
  const overlaps = new Map<number | string, { number: string; shared: number }[]>()

  if (!closed) {
    const sets = docs.map((r) => ({
      r,
      ids: new Set(
        (r.animals ?? [])
          .map((a) => relId(a))
          .filter((v): v is number => typeof v === 'number'),
      ),
    }))

    for (const a of sets) {
      const list: { number: string; shared: number }[] = []
      for (const b of sets) {
        if (b.r.id === a.r.id) continue
        let shared = 0
        for (const id of a.ids) if (b.ids.has(id)) shared++
        if (shared > 0) list.push({ number: String(b.r.number ?? `#${b.r.id}`), shared })
      }
      if (list.length) overlaps.set(a.r.id, list)
    }
  }

  const overlapping = overlaps.size

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

          <FilterChips
            label="Отбор заявок"
            active={closed ? 'closed' : 'open'}
            items={[
              {
                key: 'open',
                label: 'Открытые',
                href: '/association/verifications',
                count: closed ? null : docs.length,
                hint: 'Поданные и взятые в работу',
              },
              {
                key: 'closed',
                label: 'Закрытые',
                href: '/association/verifications?show=closed',
                hint: 'Подтверждённые, отклонённые и отозванные хозяйством',
              },
            ]}
          />

          {/*
             Предупреждение стоит над таблицей, а не только в строках:
             эксперт решает, за что взяться, глядя на список целиком,
             и узнать о двойной работе он должен до того, как откроет
             первую заявку.
          */}
          {overlapping > 0 && (
            <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] leading-relaxed text-ink-700">
              <span className="font-medium">
                {overlapping} {plural(overlapping, ['заявка', 'заявки', 'заявок'])}{' '}
                {plural(overlapping, ['пересекается', 'пересекаются', 'пересекаются'])} с другими
                по животным.
              </span>{' '}
              Разбирать их по отдельности значит смотреть одни и те же записи дважды и рисковать
              вынести по ним разные решения. Пересечения отмечены в таблице.
            </div>
          )}

          {stale && (
            <div className="mt-6">
              <StaleSchemaNotice what="заявок на верификацию" />
            </div>
          )}

          <div className={`card mt-6 ${stale ? 'hidden' : ''}`}>
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
                          {/*
                             Номер соседней заявки, а не просто значок:
                             «пересекается» без ответа «с чем» заставляет
                             искать пару глазами по всей таблице.
                          */}
                          {overlaps.has(r.id) && (
                            <span className="mt-1 block text-[13px] leading-snug text-amber-700">
                              те же записи в{' '}
                              {overlaps
                                .get(r.id)!
                                .map((o) => `${o.number} (${o.shared})`)
                                .join(', ')}
                            </span>
                          )}
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
