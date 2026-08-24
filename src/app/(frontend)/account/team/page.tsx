import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { FarmNav } from '@/components/FarmNav'
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
        <AccountNav active="farm" />
        <FarmNav active="team" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Хозяйство', href: '/account?tab=farm' },
              { label: 'Сотрудники' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Сотрудники</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Права отвечают не на вопрос «кто важнее», а на вопрос «что можно отменить».
            Зоотехник вносит и правит данные — ошибку видно, и чините её вы сами.
            Руководитель делает то, чего своими силами не отменить: продажа отдаёт
            карточку чужим рукам, ссылка уходит наружу навсегда, приглашение впускает
            человека в стадо.
          </p>

          {/*
             Три слова, которые в системе означали одно и то же и потому
             ничего не означали.

             На этой странице «Зоотехник-селекционер» (должность из трудовой)
             стоял вплотную к «Руководитель · Ведёт данные» (права
             в хозяйстве), а в профиле того же человека — «Фермер/Заводчик»
             (тип участника в системе). Три ответа на один с виду вопрос
             «кто вы», и ни один из них не назывался своим именем.

             Развести переименованием значений нельзя: «зоотехник» — слово
             предметной области, и выбрано оно в решении №107 именно за это.
             Поэтому разведены вопросы: должность отвечает «что написано
             в трудовой», права — «что вам можно», тип участника — «в каком
             качестве вы в книге». Названы они здесь один раз и рядом:
             человек, который путается, ищет объяснение там, где путается,
             а путается он на странице сотрудников.
          */}
          <div className="card mt-6">
            <h2 className="panel-heading">Права в хозяйстве</h2>
            <dl className="space-y-3 text-[14px]">
              {ORG_ROLES.map((r) => (
                <div key={r.value} className="flex flex-wrap gap-x-3">
                  <dt className="min-w-[10rem] font-medium">{r.label}</dt>
                  <dd className="max-w-[60ch] text-ink-700">{r.hint}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 max-w-[70ch] border-t border-[#e6e6e6] pt-4 text-[13px] leading-relaxed text-ink-500">
              Права — не должность. Должность стоит рядом с именем свободным
              текстом: она называет, кем человек работает, и на то, что ему
              можно в системе, не влияет. Главный зоотехник хозяйства может
              быть здесь наблюдателем, а руководителем — тот, кто отвечает
              за данные. И то и другое не связано с типом участника
              в Ассоциации: он у всей учётной записи один и стоит в профиле.
            </p>
          </div>

          {!canManage && (
            <p className="mt-6 max-w-[70ch] rounded-md bg-[#f6f6f6] p-4 text-[14px] leading-relaxed text-ink-700">
              Менять права и приглашать может руководитель хозяйства. Ваши права —{' '}
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
