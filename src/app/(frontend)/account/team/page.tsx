import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { SettingsNav } from '@/components/SettingsNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { TeamPanel, type Invite, type Member } from '@/components/TeamPanel'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { can, ORG_ROLES, type OrgRole } from '@/lib/roles'
import { inviteState } from '@/lib/invitations'
import type { User } from '@/payload-types'

export const metadata: Metadata = { title: 'Сотрудники' }
export const dynamic = 'force-dynamic'

/**
 * Кто ведёт данные хозяйства и что каждому можно.
 *
 * ## Почему страница нужна была раньше, чем появилась
 *
 * До сих пор у хозяйства была одна роль на всех: наёмный оператор,
 * заведённый ради ввода доек, мог продать животное, выпустить ссылку
 * на всё стадо и подать заявку в Ассоциацию. Это не гипотетическая
 * опасность, а обычное устройство хозяйства на пятьсот голов —
 * и ТЗ (Приложение №3) требует разделения прямо.
 *
 * ## Почему уволенный блокируется, а не удаляется
 *
 * За учётной записью стоит авторство: кто внёс дойку, кто подал заявку,
 * кто оформил продажу. Удалить запись значило бы стереть ответ на эти
 * вопросы во всей истории хозяйства разом. Заблокированный не входит
 * и ничего не меняет, а сделанное им остаётся подписанным его именем.
 */
export default async function TeamPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: своего хозяйства у него нет
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  if (!orgId) redirect('/account')

  const payload = await getClient()

  const [people, invites] = await Promise.all([
    payload.find({
      collection: 'users',
      where: { organization: { equals: orgId } },
      limit: 200,
      sort: 'lastName',
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'invitations',
      where: { organization: { equals: orgId } },
      limit: 200,
      sort: '-createdAt',
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const members: Member[] = (people.docs as User[]).map((u) => ({
    id: u.id,
    name: [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ') || u.email,
    email: u.email,
    orgRole: (u.orgRole ?? 'head') as OrgRole,
    position: u.position ?? null,
    confirmed: Boolean(u.confirmed),
    blockedAt: u.blockedAt ?? null,
    blockReason: u.blockReason ?? null,
    self: String(u.id) === String(user.id),
  }))

  const list: Invite[] = invites.docs.map((i) => ({
    id: i.id,
    email: i.email,
    orgRole: i.orgRole as OrgRole,
    state: inviteState(i),
    expiresAt: i.expiresAt,
    note: i.note ?? null,
  }))

  const canManage = can(user, 'team')

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="settings" />
        <SettingsNav active="team" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Настройки', href: '/account?tab=settings' },
              { label: 'Сотрудники' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Сотрудники</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Роль отвечает не на вопрос «кто важнее», а на вопрос «что можно отменить».
            Зоотехник вносит и правит данные — ошибку видно, и чините её вы сами.
            Руководитель делает то, чего своими силами не отменить: продажа отдаёт
            карточку чужим рукам, ссылка уходит наружу навсегда, приглашение впускает
            человека в стадо.
          </p>

          <div className="card mt-6">
            <h2 className="panel-heading">Что может каждая роль</h2>
            <dl className="space-y-3 text-[14px]">
              {ORG_ROLES.map((r) => (
                <div key={r.value} className="flex flex-wrap gap-x-3">
                  <dt className="min-w-[10rem] font-medium">{r.label}</dt>
                  <dd className="max-w-[60ch] text-ink-700">{r.hint}</dd>
                </div>
              ))}
            </dl>
          </div>

          {!canManage && (
            <p className="mt-6 max-w-[70ch] rounded-md bg-[#f6f6f6] p-4 text-[14px] leading-relaxed text-ink-700">
              Менять роли и приглашать может руководитель хозяйства. Ваша роль —{' '}
              {ORG_ROLES.find((r) => r.value === (user.orgRole ?? 'head'))?.label}.
            </p>
          )}

          <TeamPanel members={members} invites={list} canManage={canManage} />
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
