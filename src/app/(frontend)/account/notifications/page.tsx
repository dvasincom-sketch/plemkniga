import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { PersonalNav } from '@/components/PersonalNav'
import { AssociationNav } from '@/components/AssociationNav'
import { isAssociationUser } from '@/lib/association'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { AccessDecision } from '@/components/AccessDecision'
import { MarkNotificationsSeen } from '@/components/MarkNotificationsSeen'
import { getClient, getCurrentUser } from '@/lib/payload'
import { loadNotifications, type Notification, type NotificationKind } from '@/lib/notifications'
import { dateTimeRu } from '@/lib/format'

export const metadata: Metadata = { title: 'Уведомления' }
export const dynamic = 'force-dynamic'

/**
 * Лента уведомлений.
 *
 * Колокольчик в шапке до сих пор ничего не открывал. Теперь за ним лента,
 * собранная из настоящих записей: запросов доступа к животным хозяйства,
 * ответов на собственные запросы и результатов проверки загруженных данных.
 *
 * Порядок один — по времени, без разбивки на разделы: человек приходит сюда
 * с вопросом «что нового», а не «что нового в категории пакетов». Разделять
 * ленту помогает фильтр, а не заголовки.
 */

const KIND_LABEL: Record<NotificationKind, string> = {
  'access-in': 'Запрос доступа',
  'access-out': 'Ответ на запрос',
  submission: 'Загрузка данных',
  verification: 'Верификация',
  document: 'Документ',
}

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'pending', label: 'Требуют решения' },
  { key: 'access-in', label: 'Запросы ко мне' },
  { key: 'access-out', label: 'Ответы мне' },
  { key: 'submission', label: 'Загрузки' },
  { key: 'verification', label: 'Верификация' },
  { key: 'document', label: 'Документы' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

const match = (n: Notification, f: FilterKey): boolean =>
  f === 'all' ? true : f === 'pending' ? Boolean(n.pending) : n.kind === f

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const user = await getCurrentUser()
  const association = isAssociationUser(user)
  if (!user) redirect('/login?next=/account/notifications')

  const { filter: filterParam } = await searchParams
  const filter: FilterKey = FILTERS.some((f) => f.key === filterParam)
    ? (filterParam as FilterKey)
    : 'all'

  const payload = await getClient()
  const { items, unread } = await loadNotifications(payload, user)

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, items.filter((n) => match(n, f.key)).length]),
  ) as Record<FilterKey, number>

  const shown = items.filter((n) => match(n, filter))

  return (
    <>
      <SiteHeader active="/account/notifications" />

      <main className="container-page pb-8">
        {/*
           Уведомления — личная страница, и ряд разделов хозяйства над ней
           больше не рисуется.

           Раньше рисовался — и подсветить в нём было нечего: пять плашек,
           ни одна не выделена. Такой ряд сообщает «вы вне разделов», стоя
           при этом внутри кабинета, и человек начинает искать, куда попал.
           Лента уведомлений и правда не раздел хозяйства: она уйдёт вместе
           с человеком, когда он сменит работу.

           Вместо него — ряд личных страниц. Вернуться в хозяйство есть чем:
           пункт «Моё хозяйство» стоит в шапке первым.

           У сотрудника Ассоциации ряд свой: его разделы — очередь проверки
           и прочее, и лента у него та же, а хозяйства нет.
        */}
        {association ? <AssociationNav /> : <PersonalNav active="feed" />}

        <Breadcrumbs
          items={
            association
              ? [{ label: 'Кабинет Ассоциации', href: '/association' }, { label: 'Уведомления' }]
              : [{ label: 'Личные страницы' }, { label: 'Уведомления' }]
          }
        />

        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Уведомления</h1>
            <p className="mt-3 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
              {unread > 0
                ? `${unread} ${plural(unread, 'новое событие', 'новых события', 'новых событий')} с прошлого посещения.`
                : 'Новых событий с прошлого посещения нет.'}{' '}
              Что из этого дублировать на почту — в{' '}
              <Link
                href="/account/profile?tab=notifications"
                className="underline underline-offset-4"
              >
                настройках профиля
              </Link>
              .
            </p>
          </div>
        </div>

        {/* ------------------------------ Фильтр ----------------------------- */}
        <nav aria-label="Фильтр уведомлений" className="mt-7">
          <ul className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const isActive = filter === f.key
              const n = counts[f.key]
              return (
                <li key={f.key}>
                  <Link
                    href={f.key === 'all' ? '/account/notifications' : `/account/notifications?filter=${f.key}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[15px] transition-colors ${
                      isActive
                        ? 'bg-forest-500 text-white'
                        : 'bg-white text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                    }`}
                  >
                    {f.label}
                    <span
                      className={`tabular-nums text-[13px] ${isActive ? 'text-white/70' : 'text-ink-500'}`}
                    >
                      {n}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ------------------------------- Лента ----------------------------- */}
        {shown.length === 0 ? (
          <p className="mt-7 rounded-card bg-white p-8 text-[15px] leading-relaxed text-ink-500 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
            {items.length === 0
              ? 'Уведомлений пока нет. Здесь появятся запросы доступа к вашим животным, ответы на ваши запросы и результаты проверки загруженных данных.'
              : 'В этой категории пусто — посмотрите остальные.'}
          </p>
        ) : (
          <ul className="mt-7 space-y-3">
            {shown.map((n) => (
              <li
                key={n.id}
                className={`rounded-card bg-white p-6 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] ${
                  n.unread ? 'border-l-4 border-brand-500 pl-5' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
                  <span className="rounded-md bg-[#eeeeee] px-2 py-0.5 text-ink-700">
                    {KIND_LABEL[n.kind]}
                  </span>
                  {n.pending && (
                    <span className="rounded-md bg-[#fff6e5] px-2 py-0.5 text-ink-900">
                      Требует решения
                    </span>
                  )}
                  {n.unread && (
                    <span className="rounded-md bg-brand-50 px-2 py-0.5 text-forest-600">Новое</span>
                  )}
                  <span className="text-ink-500">{dateTimeRu(n.at)}</span>
                </div>

                <p className="mt-2.5 text-[17px] font-medium leading-snug">{n.title}</p>
                <p className="mt-1.5 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                  {n.text}
                </p>

                {n.request?.comment && (
                  <p className="mt-3 rounded-xl bg-canvas px-4 py-3 text-[14px] leading-relaxed">
                    <span className="block text-ink-500">
                      Сообщение от {n.request.fromPerson}
                    </span>
                    {n.request.comment}
                  </p>
                )}

                {n.request ? (
                  <AccessDecision
                    requestId={n.request.id}
                    purposeValue={n.request.purposeValue}
                    requestedScopes={n.request.scopes}
                    animalLabel={n.request.animalLabel}
                    granteeName={n.request.fromOrg}
                  />
                ) : (
                  n.href && (
                    <Link
                      href={n.href}
                      className="mt-3 inline-block text-[15px] underline underline-offset-4 hover:text-forest-500"
                    >
                      {n.linkLabel ?? 'Открыть'} →
                    </Link>
                  )
                )}

                {n.request && n.href && (
                  <Link
                    href={n.href}
                    className="mt-3 inline-block text-[14px] text-ink-500 underline underline-offset-4 hover:text-forest-500"
                  >
                    Посмотреть запись, о которой речь →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      <MarkNotificationsSeen />
      <SiteFooter />
    </>
  )
}

/** Русское склонение числительных — три формы. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}
