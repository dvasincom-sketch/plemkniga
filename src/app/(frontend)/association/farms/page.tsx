import type { Metadata } from 'next'
import Link from 'next/link'
import type { Where } from 'payload'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { ConfirmUser, MembershipDecision } from '@/components/MembershipDecision'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { farmStats, verifiedShare } from '@/lib/farm-stats'
import { dateRu } from '@/lib/format'
import type { Organization, User } from '@/payload-types'

export const metadata: Metadata = { title: 'Хозяйства' }
export const dynamic = 'force-dynamic'

/**
 * Хозяйства и членство.
 *
 * Два вопроса на одной странице, и они соседние, но не одинаковые.
 * Членство — про организацию: состоит ли хозяйство в Ассоциации.
 * Подтверждение — про человека: тот ли он, за кого себя выдаёт. Одно
 * хозяйство и пятеро сотрудников — обычное дело, и подтверждают их
 * по одному.
 *
 * Первыми идут те, кто чего-то ждёт: заявка на рассмотрении или
 * неподтверждённые сотрудники. Список, где ждущие перемешаны с давно
 * решёнными, — это не очередь, а справочник.
 */

const MEMBERSHIP_LABEL: Record<string, string> = {
  none: 'не член',
  pending: 'заявка на рассмотрении',
  member: 'действующий член',
  suspended: 'приостановлено',
}

const MEMBERSHIP_TONE: Record<string, string> = {
  none: 'text-ink-500',
  pending: 'text-amber-700',
  member: 'text-forest-500',
  suspended: 'text-red-700',
}

const TABS = [
  { key: 'waiting', label: 'Ждут решения' },
  { key: 'members', label: 'Члены Ассоциации' },
  { key: 'all', label: 'Все хозяйства' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default async function FarmsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireAssociation()
  const { tab: tabParam } = await searchParams
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'waiting'

  const payload = await getClient()

  const where: Where | undefined =
    tab === 'members'
      ? { membership: { equals: 'member' } }
      : tab === 'waiting'
        ? { membership: { in: ['pending', 'suspended'] } }
        : undefined

  const [orgs, stats, unconfirmed] = await Promise.all([
    payload.find({
      collection: 'organizations',
      where,
      limit: 200,
      sort: 'name',
      depth: 0,
      overrideAccess: true,
    }),
    farmStats(payload),
    payload.find({
      collection: 'users',
      where: { confirmed: { not_equals: true } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const waitingUsers = new Map<number, User[]>()
  for (const u of unconfirmed.docs as User[]) {
    const org = typeof u.organization === 'object' && u.organization ? u.organization.id : u.organization
    if (typeof org !== 'number') continue
    waitingUsers.set(org, [...(waitingUsers.get(org) ?? []), u])
  }

  /*
   * На вкладке «Ждут решения» показываются и организации с заявкой,
   * и те, у кого просто есть неподтверждённые сотрудники: ожидание
   * человека ничем не лучше ожидания хозяйства.
   */
  let docs = orgs.docs as Organization[]
  if (tab === 'waiting') {
    const extra = await payload.find({
      collection: 'organizations',
      where: { id: { in: [...waitingUsers.keys()] } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    const seen = new Set(docs.map((o) => o.id))
    docs = [...docs, ...(extra.docs as Organization[]).filter((o) => !seen.has(o.id))].sort((a, b) =>
      String(a.name).localeCompare(String(b.name), 'ru'),
    )
  }

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="farms" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Хозяйства</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Кто ведёт данные в книге и на каком основании. Членство решает две вещи: показывать
            ли животных хозяйства в общей книге и принимать ли от него заявки на верификацию.
            Собственные данные хозяйство ведёт независимо от решения — оно их владелец,
            а Ассоциация только ручается за них перед другими.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-[14px]">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`/association/farms?tab=${t.key}`}
                className={`rounded-lg px-3 py-2 transition-colors ${
                  tab === t.key
                    ? 'bg-forest-500 text-white'
                    : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                }`}
              >
                {t.label}
                {t.key === 'waiting' && docs.length > 0 && tab === 'waiting' && ` · ${docs.length}`}
              </Link>
            ))}
          </div>

          <div className="card mt-6">
            <div className="overflow-x-auto">
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>Хозяйство</th>
                    <th>Регион</th>
                    <th>Членство</th>
                    <th className="text-right">Животных</th>
                    <th className="text-right">Подтверждено</th>
                    <th className="text-right">В книге</th>
                    <th>Последняя загрузка</th>
                    <th>Решение</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-ink-500">
                        {tab === 'waiting'
                          ? 'Никто не ждёт решения'
                          : tab === 'members'
                            ? 'Членов Ассоциации пока нет'
                            : 'Хозяйств нет'}
                      </td>
                    </tr>
                  )}

                  {docs.map((o) => {
                    const s = stats.get(o.id as number)
                    const share = verifiedShare(s)
                    const membership = o.membership ?? 'none'
                    const pending = waitingUsers.get(o.id as number) ?? []

                    return (
                      <tr key={o.id}>
                        <td className="min-w-[16rem]">
                          <Link
                            href={`/?owner=${encodeURIComponent(o.name)}#results`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {o.shortName || o.name}
                          </Link>
                          {pending.length > 0 && (
                            <div className="mt-2 rounded-lg bg-[#f6f6f6] px-3 py-2">
                              <p className="mb-1 text-[12px] text-ink-500">
                                Ждут подтверждения учётные записи:
                              </p>
                              {pending.map((u) => (
                                <ConfirmUser
                                  key={u.id}
                                  userId={u.id as number}
                                  confirmed={Boolean(u.confirmed)}
                                  label={
                                    [u.lastName, u.firstName].filter(Boolean).join(' ') || u.email
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="text-ink-500">{o.region || '—'}</td>
                        <td className={MEMBERSHIP_TONE[membership] ?? 'text-ink-500'}>
                          {MEMBERSHIP_LABEL[membership] ?? membership}
                          {o.membershipReview?.since && membership === 'member' && (
                            <span className="block text-[12px] text-ink-500">
                              с {dateRu(o.membershipReview.since)}
                            </span>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{s?.animals ?? 0}</td>
                        <td className="text-right tabular-nums">
                          {share === null ? '—' : `${share}%`}
                        </td>
                        <td className="text-right tabular-nums">{s?.published ?? 0}</td>
                        <td className="whitespace-nowrap text-ink-500">
                          {s?.lastSubmission ? dateRu(s.lastSubmission) : 'не было'}
                        </td>
                        <td>
                          <MembershipDecision
                            organizationId={o.id as number}
                            organizationName={o.name}
                            membership={membership}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
              «Подтверждено» — доля записей с уровнем «Верифицировано ассоциацией». Это
              не оценка хозяйства: ноль у стада в тысячу голов означает, что разговор ещё
              не начинали, а не что данные плохи.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
