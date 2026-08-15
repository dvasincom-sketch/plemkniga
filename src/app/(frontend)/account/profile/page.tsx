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
 * Профиль пользователя — отдельная страница с вкладками.
 *
 * Личные данные правят редко, а разделы кабинета — рабочие инструменты,
 * которыми пользуются каждый день, поэтому профиль вынесен из основного меню
 * и открывается кликом по имени в шапке.
 *
 * Вкладка по умолчанию — «Пользователь»: страница открывается по клику
 * на собственное имя, и ожидание здесь — увидеть свои данные.
 */

const TABS = [
  { key: 'notifications', label: 'Уведомления', hint: 'Что присылать на почту' },
  { key: 'user', label: 'Пользователь', hint: 'Персональные данные учётной записи' },
  { key: 'org', label: 'Организация', hint: 'Реквизиты хозяйства' },
  { key: 'billing', label: 'Биллинг', hint: 'Оплата платных услуг' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { tab: tabParam } = await searchParams
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'user'

  const org =
    typeof user.organization === 'object' && user.organization
      ? (user.organization as Organization)
      : null

  const roleLabel = labelOf(ROLES, user.role)

  return (
    <>
      <SiteHeader active="/account/profile" />

      <main className="container-page pb-8">
        <AccountNav />

        <Breadcrumbs
          items={[
            { label: 'Личный кабинет', href: '/account' },
            { label: 'Настройки', href: '/account?tab=settings' },
            { label: 'Профиль пользователя' },
          ]}
        />

        <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
          Профиль пользователя
        </h1>
        <p className="mt-3 text-[15px] text-ink-700">
          {roleLabel}
          {org && <> · {org.name}</>}
        </p>

        {/* ------------------------------ Вкладки ----------------------------- */}
        <nav aria-label="Разделы профиля" className="mt-7">
          <ul className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const isActive = tab === t.key
              return (
                <li key={t.key}>
                  <Link
                    href={`/account/profile?tab=${t.key}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={`block rounded-xl px-4 py-2.5 transition-colors ${
                      isActive
                        ? 'bg-forest-500 text-white'
                        : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                    }`}
                  >
                    <span className="block text-[15px] font-medium">{t.label}</span>
                    <span
                      className={`mt-0.5 block text-[12px] leading-snug ${
                        isActive ? 'text-white/75' : 'text-ink-500'
                      }`}
                    >
                      {t.hint}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="mt-7 max-w-[860px]">
          {tab === 'notifications' && (
            <ProfileForm section="notifications" user={user} org={org} roleLabel={roleLabel} />
          )}

          {tab === 'user' && (
            <ProfileForm section="user" user={user} org={org} roleLabel={roleLabel} />
          )}

          {tab === 'org' && (
            <>
              <ProfileForm section="org" user={user} org={org} roleLabel={roleLabel} />
              <p className="mt-5 text-[14px] leading-relaxed text-ink-500">
                Регион, членство в Ассоциации и признак племенного статуса меняет сотрудник
                Ассоциации — эти поля подтверждают документами, а не заявлением в форме.
              </p>
            </>
          )}

          {tab === 'billing' && <BillingTab />}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

/* ------------------------------------------------------------------ */

/**
 * Биллинг.
 *
 * Платных услуг пока нет, и притворяться, что есть, смысла нет: вкладка
 * честно объясняет, за что здесь будет счёт, чтобы к моменту запуска
 * это не стало сюрпризом.
 */
function BillingTab() {
  const services = [
    {
      title: 'Выпуск племенных документов',
      text: 'Зоотехнический сертификат и племенное свидетельство. Сейчас формируются без ограничений.',
    },
    {
      title: 'Генотипирование',
      text: 'Приём и обработка результатов с чипов, расчёт геномной племенной ценности.',
    },
    {
      title: 'Подбор пар',
      text: 'Автоматическое закрепление быков за коровами с инбридинг-контролем.',
    },
    {
      title: 'Выгрузка и интеграции',
      text: 'Обмен данными с системами управления стадом и государственными реестрами.',
    },
  ]

  return (
    <div className="card">
      <h3 className="panel-heading">Оплата услуг</h3>

      <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
        Раздел появится вместе с платными услугами Ассоциации. Здесь будут счета, история платежей
        и состояние подписки хозяйства. Сейчас все возможности системы доступны без оплаты.
      </p>

      <p className="mt-6 text-[14px] font-medium">Что планируется тарифицировать:</p>
      <ul className="mt-3 space-y-3">
        {services.map((s) => (
          <li key={s.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-brand-500"
            />
            <span>
              <span className="block text-[15px]">{s.title}</span>
              <span className="block text-[13px] leading-snug text-ink-500">{s.text}</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[14px] leading-relaxed text-ink-500">
        Вопросы по членству и взносам — в Ассоциацию: info@holstein-russia.ru, +7 846 931-25-95.
      </p>
    </div>
  )
}
