import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { isAssociationUser } from '@/lib/association'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ProfileForm } from '@/components/ProfileForm'
import { SubTabs } from '@/components/SubTabs'
import { FarmNav } from '@/components/FarmNav'
import { PersonalNav, type PersonalSub } from '@/components/PersonalNav'
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
 *
 * ## Одна страница, два ряда над ней
 *
 * Вкладки этой страницы принадлежат двум разным местам, и это не небрежность,
 * а свойство содержимого. «Реквизиты» — про хозяйство: название, адрес,
 * документы; уволится зоотехник, реквизиты останутся. Остальные три — про
 * человека: его фамилия, его подписка на письма, его счёт.
 *
 * Поэтому ряд над страницей зависит от вкладки: на реквизитах стоит ряд
 * разделов хозяйства, на прочих — ряд личных страниц. Соблазн развести это
 * на два маршрута был; отвергнут потому, что форма одна — `ProfileForm`
 * с одним серверным действием, — и делить её пришлось бы по живому, ради
 * стройности адресов.
 */

const TABS = [
  /*
   * Вкладка отвечает на вопрос «что мне присылать», а не «что случилось»,
   * и потому называется «Письма». Слово «уведомления» в системе занято
   * лентой на `/account/notifications`, и пока обе назывались одинаково,
   * один и тот же пункт меню вёл то в список событий, то в переключатели.
   * Ключ оставлен прежним: адрес `?tab=notifications` разошёлся по письмам
   * и закладкам.
   */
  { key: 'notifications', label: 'Письма', hint: 'Что из уведомлений дублировать на почту' },
  { key: 'user', label: 'Профиль', hint: 'Фамилия, телефон, должность' },
  { key: 'org', label: 'Реквизиты', hint: 'Название, адрес и документы хозяйства' },
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
  const association = isAssociationUser(user)

  /*
   * У сотрудника Ассоциации нет ни организации, ни платных услуг: реквизиты
   * хозяйства и биллинг ему показывать нечем. Вкладки не прячутся «на всякий
   * случай» — они просто не про него.
   */
  const tabs = association ? TABS.filter((t) => t.key === 'notifications' || t.key === 'user') : TABS

  return (
    <>
      <SiteHeader active="/account/profile" />

      <main className="container-page pb-8">
        {/*
           Ряд разделов хозяйства стоит только над реквизитами: они и есть
           настройка хозяйства. Над личными вкладками его нет — подсветить
           в нём было бы нечего, а ряд без подсветки сообщает «вы вне
           разделов», стоя внутри кабинета.

           У сотрудника Ассоциации то же самое, и это пришлось признать
           дважды. Сначала над его профилем рисовались разделы хозяйства —
           приглашение, которое никуда не ведёт. Потом их заменили разделами
           кабинета Ассоциации, и стало хуже: ряд двухуровневый, подсветить
           в нём нечего, а подсвечивается всё равно первый раздел. Человек
           на странице «Профиль» видел выбранным «Разбор» и под ним «Очередь
           проверки» — то есть меню утверждало, что он стоит там, где
           не стоит.

           Личная страница вне разделов кабинета по устройству: профиль
           уходит вместе с человеком, а разделы остаются Ассоциации.
           Вернуться отсюда есть чем — «Проверка данных» стоит в шапке
           первым пунктом.
        */}
        {!association && tab === 'org' && <AccountNav active="farm" />}

        {/*
           Ряд второго уровня стоит там же, где везде: сразу под меню
           разделов, выше пути и заголовка. Выглядит вторым уровнем —
           плашки в полтора раза ниже и без подписи под названием; раньше
           они повторяли верхний ряд, и два уровня читались как один
           двухэтажный переключатель.

           Разметка живёт в общем `SubTabs`; там же записано, почему это
           ссылки, а не кнопки с состоянием.
        */}
        {association ? (
          <SubTabs
            label="Разделы профиля"
            active={tab}
            /*
             * Своего ряда разделов над этим нет, значит и отрицательного
             * отступа быть не должно: умолчание `-mt-4` рассчитано на то,
             * что выше стоит меню кабинета со своим нижним отступом.
             */
            className="mb-8"
            items={tabs.map((t) => ({
              key: t.key,
              label: t.label,
              hint: t.hint,
              href: `/account/profile?tab=${t.key}`,
            }))}
          />
        ) : tab === 'org' ? (
          <FarmNav active="org" />
        ) : (
          <PersonalNav active={tab as PersonalSub} association={association} />
        )}

        <Breadcrumbs
          items={
            association
              ? [
                  { label: 'Кабинет Ассоциации', href: '/association' },
                  { label: 'Профиль пользователя' },
                ]
              : tab === 'org'
                ? [
                    { label: 'Личный кабинет', href: '/account' },
                    { label: 'Хозяйство', href: '/account?tab=farm' },
                    { label: 'Реквизиты' },
                  ]
                : [
                    { label: 'Личные страницы' },
                    { label: TABS.find((t) => t.key === tab)?.label ?? 'Профиль' },
                  ]
          }
        />

        <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
          Профиль пользователя
        </h1>
        {/*
           «Тип участника» вместо голого «Фермер/Заводчик».

           Стояло одно название без пояснения, чтó это за название, — а таких
           в системе три: должность из трудовой, права в хозяйстве и вот это.
           Человек читал «Фермер/Заводчик» в профиле, «Зоотехник-селекционер»
           на странице сотрудников и «Руководитель» строкой под ним, и ни одно
           из трёх не говорило, на какой вопрос оно отвечает. Это отвечает
           на вопрос «в каком качестве вы в книге»: тип участника один
           на учётную запись и решает, какие разделы системы вам вообще
           видны. Права внутри хозяйства — отдельно, они на странице
           сотрудников.
        */}
        <p className="mt-3 text-[15px] text-ink-700">
          тип участника: {roleLabel}
          {org && <> · {org.name}</>}
        </p>

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
