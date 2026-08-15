import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ProfileForm } from '@/components/ProfileForm'
import { getCurrentUser } from '@/lib/payload'
import { ROLES, labelOf } from '@/lib/dictionaries'
import type { Organization } from '@/payload-types'

export const metadata: Metadata = { title: 'Профиль пользователя' }
export const dynamic = 'force-dynamic'

/**
 * Профиль пользователя — отдельная страница, а не вкладка кабинета.
 *
 * Личные данные правят редко, а разделы кабинета — рабочие инструменты,
 * которыми пользуются каждый день. Держать их в одном ряду означало отдавать
 * место постоянного меню тому, что нужно раз в полгода. Теперь профиль
 * открывается кликом по имени в шапке.
 */
export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const org =
    typeof user.organization === 'object' && user.organization
      ? (user.organization as Organization)
      : null

  return (
    <>
      <SiteHeader active="/account/profile" />

      <main className="container-page pt-10 pb-8">
        <AccountNav />

        <Breadcrumbs
          items={[{ label: 'Личный кабинет', href: '/account' }, { label: 'Профиль пользователя' }]}
        />

        <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
          Профиль пользователя
        </h1>
        <p className="mt-3 text-[15px] text-ink-700">
          {labelOf(ROLES, user.role)}
          {org && <> · {org.name}</>}
        </p>

        <div className="mt-8">
          <ProfileForm user={user} org={org} roleLabel={labelOf(ROLES, user.role)} />
        </div>

        <p className="mt-8 text-[14px] text-ink-500">
          Видимость стада и параметры доступа — в разделе{' '}
          <Link href="/account?tab=settings" className="underline underline-offset-4">
            «Настройки»
          </Link>
          .
        </p>
      </main>

      <SiteFooter />
    </>
  )
}
