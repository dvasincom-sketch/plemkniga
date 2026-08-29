import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav, ACCOUNT_TABS, type AccountTabKey } from '@/components/AccountNav'
import { SearchPanel } from '@/components/SearchPanel'
import { filterQueryOf, loadSavedSearches } from '@/lib/saved-searches'
import { ResultsBar } from '@/components/ResultsBar'
import { SavedSearches } from '@/components/SavedSearches'
import { HerdSelection } from '@/components/HerdSelection'
import { farmTodo } from '@/lib/todo'
import { AnimalTable } from '@/components/AnimalTable'
import { Pagination } from '@/components/Pagination'
import { ProfileForm } from '@/components/ProfileForm'
import { VisibilityForm } from '@/components/VisibilityForm'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { viewerOf, type Viewer } from '@/lib/visibility'
import {
  NOT_ARCHIVED,
  PAGE_SIZES,
  buildAnimalWhere,
  currentPage,
  hasActiveFilters,
  hasAdvancedValues,
  one,
  pageSizeLabel,
  resolvePageSize,
  resolveSort,
  type SearchParams,
} from '@/lib/animal-query'
import { eventTypeLabel, labelOf } from '@/lib/dictionaries'
import { DocumentsPanel } from '@/components/DocumentsPanel'
import {
  buildDocumentWhere,
  hasDocumentFilters,
  one as oneDoc,
  type SearchParams as DocSearchParams,
} from '@/lib/document-query'
import { SubmissionHistory } from '@/components/SubmissionHistory'
import { DATA_SUBTABS, DataNav, type DataSub } from '@/components/DataNav'
import { HERD_SUBTABS, HerdNav, type HerdSub } from '@/components/HerdNav'
import { FarmNav } from '@/components/FarmNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { herdSummary } from '@/lib/herd-summary'
import {
  culling,
  geneticTrend,
  heiferAges,
  lactationStructure,
  milkByLactation,
  reproduction,
  udderHealth,
} from '@/lib/herd-analytics'
import { herdSignals } from '@/lib/herd-signals'
import { HerdAnalytics } from '@/components/HerdAnalytics'
import {
  FileUploadIcon,
  HerdScanIcon,
  RulesIcon,
  SingleRecordIcon,
} from '@/components/CardIcons'
import { dateRu, nf } from '@/lib/format'
import { ARCHIVE_RETENTION_DAYS } from '@/lib/archive-retention'
import { RANKING_CAP, rankByProfile } from '@/lib/index-column'
import { indexValuesLag } from '@/lib/index-values'
import { ASSOCIATION_PROFILE } from '@/lib/breeding-index'
import { loadOwnProfiles, selectProfile } from '@/lib/index-profiles'
import type { Where } from 'payload'
import type { Animal, Organization, User } from '@/payload-types'

export const metadata: Metadata = { title: 'Личный кабинет' }
export const dynamic = 'force-dynamic'

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  const viewer = viewerOf(user)
  if (!user) redirect('/login')

  const tabParam = one(sp.tab)

  /*
   * Личные страницы отсюда ушли совсем: профиль, письма и биллинг —
   * не разделы хозяйства, а страницы человека. Адрес `?tab=profile`
   * при этом жив и уводит туда, где они теперь лежат.
   */
  if (tabParam === 'profile') redirect('/account/profile?tab=user')

  /*
   * Старые адреса разделов не ломаем.
   *
   * «Мои животные» стали «Стадом», «Настройки» — «Хозяйством», а «Документы»
   * из раздела верхнего уровня стали подразделом стада: таблица там была
   * из двух строк, и обе про животное. «События» стали «Данными» ещё раньше.
   *
   * Ссылок на прежние адреса снаружи много — в письмах, в закладках,
   * в наших же страницах, — и встречать их не тем разделом значит наказывать
   * человека за нашу правку.
   */
  const renamed: Record<string, AccountTabKey> = {
    animals: 'herd',
    documents: 'herd',
    settings: 'farm',
    events: 'data',
  }
  const normalized = renamed[tabParam] ?? tabParam
  const tab: AccountTabKey = ACCOUNT_TABS.some((t) => t.key === normalized)
    ? (normalized as AccountTabKey)
    : 'overview'

  /*
   * Вкладки, у которых теперь свой адрес, здесь не показываются — отсюда
   * уводит редирект.
   *
   * Прежде такой раздел оставался именем вкладки на этой странице, а
   * содержимого у него тут не было: оно переехало. Без редиректа
   * `/account?tab=access` открывался пустым экраном с заголовком — и
   * открывался не по ошибке пользователя, а по ссылке из закладок, писем
   * и старых страниц. Ссылки в меню чинит `accountTabHref`, но чинить
   * только их мало: адрес уже разошёлся по чужим закладкам, и оттуда его
   * не забрать.
   *
   * Список перечислен руками, а не выведен из состава вкладок. Раньше он
   * выводился — искали вкладку с полем `href`, — и это работало, пока
   * такая вкладка была. Теперь её нет: каждый из этих разделов стал
   * подразделом «Хозяйства» со своим маршрутом, а вывод «найди вкладку
   * с href» превратился в проверку, которая всегда ложна, то есть
   * в мёртвый код, выглядящий работающим.
   */
  const relocated: Record<string, string> = {
    access: '/account/access',
    team: '/account/team',
    journal: '/account/journal',
    indices: '/account/indices',
  }
  if (relocated[tabParam]) redirect(relocated[tabParam])

  const tabTitle = ACCOUNT_TABS.find((t) => t.key === tab)?.label ?? 'Личный кабинет'

  /*
   * Подраздел разбирается здесь, а не внутри вкладки: ряд подразделов стоит
   * выше заголовка страницы — там же, где на страницах третьего уровня, —
   * и знать выбранный подраздел нужно до того, как начнётся содержимое.
   *
   * Своё умолчание у каждого раздела, и оба выбраны, а не взяты первыми
   * по списку: «Стадо» открывается списком, потому что за списком сюда
   * и приходят, а «Данные» — формой записи, потому что запись — это работа,
   * а проверка и лента — оглядка на сделанное.
   */
  const subParam = one(sp.sub)
  const dataSub: DataSub = DATA_SUBTABS.some((s) => s.key === subParam)
    ? (subParam as DataSub)
    : 'write'
  const herdSub: HerdSub = HERD_SUBTABS.some((s) => s.key === subParam)
    ? (subParam as HerdSub)
    : 'list'

  /*
   * «Документы» были разделом верхнего уровня и стали подразделом стада.
   * Прежний адрес `?tab=documents` подраздела не называл, поэтому имя
   * ему подставляется здесь: без этого ссылка из закладок открывала бы
   * список животных, то есть уводила бы не туда молча.
   */
  const herdSubResolved: HerdSub = tabParam === 'documents' ? 'documents' : herdSub

  const org =
    typeof user.organization === 'object' && user.organization
      ? (user.organization as Organization)
      : null
  const orgId = org?.id

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        {/*
          Два уровня навигации разведены: в шапке — меню сайта простыми
          ссылками, здесь — разделы кабинета вертикальным списком плашек.
          Список остаётся на месте при переходе между разделами, поэтому
          всегда видно, где вы находитесь.
        */}
        <AccountNav active={tab} />

        {/*
           Ряд подразделов стоит одинаково на всех страницах раздела:
           сразу под меню кабинета и выше заголовка. Раньше на самой
           странице раздела он стоял под заголовком, а на страницах
           третьего уровня — над ним, и один и тот же переключатель
           приходилось искать глазами в двух разных местах.

           Порядок сверху вниз: чем шире охват, тем выше. Меню сайта,
           разделы кабинета, разделы внутри раздела, путь, заголовок
           страницы, содержимое.
        */}
        {/*
           Ряд подразделов стоит и на первой странице раздела тоже: ряд,
           появляющийся только на внутренних страницах, читается как
           «вы куда-то ушли», а не как «вы в разделе».

           У «Обзора» подразделов нет, и это не упущение: он отвечает
           на один вопрос — что сегодня, — и делить его не на что.
        */}
        {tab === 'herd' && <HerdNav active={herdSubResolved} />}
        {tab === 'data' && <DataNav active={dataSub} />}
        {tab === 'farm' && <FarmNav active="visibility" />}

        <div>
          <div className="min-w-0">
            {/*
               Путь стоит и здесь, на первой странице раздела.
               Раньше он был только на страницах третьего уровня, и от этого
               три ряда — плашки, подразделы, путь — отвечали на вопрос
               «где я» вразнобой: на одной странице путь был, на соседней
               нет. Теперь правило одно: плашки и подразделы отвечают,
               куда идти, путь — где вы.
            */}
            <Breadcrumbs
              items={[
                { label: 'Личный кабинет', href: '/account' },
                ...(tab === 'overview'
                  ? [{ label: tabTitle }]
                  : [
                      { label: tabTitle, href: `/account?tab=${tab}` },
                      {
                        label:
                          tab === 'herd'
                            ? (HERD_SUBTABS.find((s) => s.key === herdSubResolved)?.label ?? '')
                            : tab === 'data'
                              ? (DATA_SUBTABS.find((s) => s.key === dataSub)?.label ?? '')
                              : 'Видимость',
                      },
                    ]),
              ]}
            />

            <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">{tabTitle}</h1>

            {!user.confirmed && (
              <p className="mt-5 rounded-xl bg-brand-50 px-5 py-4 text-sm text-forest-600">
                Регистрация завершена. Заявка отправлена на проверку в Ассоциацию — до подтверждения
                данные видны только вам.
              </p>
            )}

            {/*
               Состояние членства — с последствиями, а не просто отметкой.
               Раньше здесь висела только плашка про заявку, и она говорила
               правду по случайности: данные были закрыты не из-за
               нерассмотренной заявки, а потому что публичный показ выключен
               по умолчанию. Теперь членство действительно решает, можно ли
               показывать животных в общей книге и подавать их на верификацию,
               и человек должен знать об этом до того, как упрётся.
            */}
            {org && org.membership !== 'member' && (
              <div className="mt-5 rounded-xl bg-[#f6f6f6] px-5 py-4 text-sm leading-relaxed text-ink-700">
                <p>
                  <span className="font-medium text-ink-900">
                    {org.membership === 'suspended'
                      ? 'Членство в Ассоциации приостановлено.'
                      : org.membership === 'pending'
                        ? 'Заявка на членство рассматривается Ассоциацией.'
                        : 'Хозяйство не состоит в Ассоциации.'}
                  </span>{' '}
                  Вы можете вести, править и выгружать свои данные как обычно. Недоступны
                  две вещи: показ животных в общей книге и подача записей на верификацию —
                  и то и другое означает подпись Ассоциации, а её ставят своим членам.
                </p>
                {org.membershipReview?.comment && (
                  <p className="mt-2 text-ink-500">
                    Решение Ассоциации: {org.membershipReview.comment}
                  </p>
                )}
              </div>
            )}

            {tab === 'overview' && <OverviewTab orgId={orgId} />}

            {tab === 'herd' && (
              <>
                {herdSubResolved === 'list' && (
                  <AnimalsTab sp={sp} orgId={orgId} user={user} viewer={viewer} />
                )}
                {herdSubResolved === 'reports' && <HerdReports orgId={orgId} />}
                {herdSubResolved === 'documents' && <DocumentsTab orgId={orgId} sp={sp} />}
              </>
            )}

            {tab === 'data' && <DataTab sub={dataSub} orgId={orgId} />}

            {tab === 'farm' && (
              <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <h2 className="section-title lg:col-span-2">Видимость в общей книге</h2>
                <VisibilityFormWrapper orgId={orgId} />

                {/*
                   Карточек в этом разделе было четыре: видимость, личные
                   данные, профили весов и API. Две ушли в меню — личное
                   под имя, профили весов подразделом, — и ушли не ради
                   стройности: карточка с абзацем и ссылкой на другую страницу
                   это дверь, а двери место в меню, где их ищут. Пока
                   «Профили ИПЦ» были карточкой в глубине настроек, на них
                   вела единственная ссылка во всей системе.
                */}
                <div className="card">
                  <h3 className="panel-heading">Интеграции и API</h3>
                  <p className="text-sm leading-relaxed text-ink-700">
                    REST API системы доступен по адресу{' '}
                    <code className="rounded bg-canvas px-1.5 py-0.5">/api</code>, GraphQL — по адресу{' '}
                    <code className="rounded bg-canvas px-1.5 py-0.5">/api/graphql</code>. Авторизация —
                    по тому же токену, что и в веб-интерфейсе.
                  </p>
                  <p className="mt-4 text-sm leading-relaxed text-ink-700">
                    Описание ручек —{' '}
                    <Link href="/api-docs" className="underline underline-offset-4">
                      /api-docs
                    </Link>
                    . Административная панель Payload:{' '}
                    <Link href="/admin" className="underline underline-offset-4">
                      /admin
                    </Link>
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                              Вкладка «Обзор»                         */
/* ------------------------------------------------------------------ */

/**
 * Что сегодня.
 *
 * ## Зачем раздел
 *
 * Кабинет открывался списком стада, а панели состояния хозяйства не было
 * вовсе. Полоса дел — «60 записей не подтверждены», «25 неполны» — лежала
 * внутри списка животных: она отвечала на вопрос всего кабинета, стоя внутри
 * одного его раздела, и первое, что видел человек, было таблицей на семьдесят
 * строк. Между двумя заходами в кабинет меняется не состав стада, а состояние
 * дел.
 *
 * Числа по стаду жили ещё дальше — на странице «Аналитика», в верхнем меню,
 * рядом с общей книгой. Оттуда они и расходились с кабинетом: считали вместе
 * с архивом, кабинет без, и хозяйство видело «74 животных» в одном разделе
 * и «86 в стаде» в другом.
 *
 * ## Чего здесь нет
 *
 * Ленты событий. Соблазн показать «последние десять записей» велик и вреден:
 * лента уже есть в «Данных», и вторая её копия здесь означала бы два места,
 * которые обязаны показывать одно и то же и однажды разойдутся — ровно так,
 * как разошлись числа стада. «Обзор» называет состояние и уводит туда, где
 * с ним работают.
 *
 * Советов по стаду тоже нет, и по той же причине, что в `todo.ts`: возраст
 * осеменения без живой массы советует неправильно, а массы в модели нет.
 */
async function OverviewTab({ orgId }: { orgId?: number }) {
  const payload = await getClient()

  /*
   * Без организации нет ни стада, ни дел. Такой пользователь в системе
   * бывает — например, человек, который зарегистрировался и ещё не подал
   * заявку, — и показывать ему шесть прочерков вместо чисел значит
   * показывать поломку там, где её нет.
   */
  if (!orgId) {
    return (
      <p className="mt-8 max-w-[70ch] rounded-xl bg-[#f6f6f6] px-5 py-4 text-[15px] leading-relaxed text-ink-700">
        Ваша учётная запись пока не привязана к хозяйству. Числа по стаду
        и дела появятся здесь, как только Ассоциация подтвердит вашу заявку.
      </p>
    )
  }

  /*
   * Всё, что нужно «Обзору», запрашивается одним заходом.
   *
   * Четыре отчёта из семи нужны здесь ради полосы сигналов. Считать их
   * своим, более узким запросом было бы дешевле, но однажды два запроса
   * разошлись бы, и «Обзор» тревожил бы о том, чего в отчёте нет: ровно
   * так уже расходились числа стада. Три остальных отчёта сюда
   * не запрашиваются — сигналов по ним нет.
   */
  const [todo, summary, profiles, heifers, trend, cull, udder] = await Promise.all([
    farmTodo(payload, orgId),
    herdSummary(payload, orgId),
    loadOwnProfiles(orgId),
    heiferAges(payload, orgId),
    geneticTrend(payload, orgId),
    culling(payload, orgId),
    udderHealth(payload, orgId),
  ])

  const signals = herdSignals({ heifers, trend, udder, cull })

  const activeProfile = profiles.defaultDoc ? profiles.defaultDoc.name : ASSOCIATION_PROFILE.name

  /*
   * Прочерк вместо нуля. Ноль — это утверждение «средний удой равен нулю»,
   * которого система не проверяла; когда считать не по чему, честный ответ
   * один — нечего показать.
   */
  const stats: { label: string; value: string; note?: string }[] = summary
    ? [
        {
          label: 'Животных в работе',
          value: nf(summary.total, 0),
          note: summary.archived > 0 ? `в архиве ещё ${nf(summary.archived, 0)}` : undefined,
        },
        { label: 'Коров в стаде', value: nf(summary.cows, 0) },
        { label: 'Быков-производителей', value: nf(summary.bulls, 0) },
        {
          label: 'Средний удой, кг',
          value: summary.milkYield === null ? '—' : nf(summary.milkYield, 0),
          note:
            summary.milkYield === null
              ? 'нет ни одной записи с удоем'
              : `по ${nf(summary.milkBasis, 0)} из ${nf(summary.cows, 0)} коров`,
        },
        {
          label: 'Жир / белок, %',
          value:
            summary.fatPercent === null && summary.proteinPercent === null
              ? '—'
              : `${summary.fatPercent === null ? '—' : nf(summary.fatPercent, 2)} / ${
                  summary.proteinPercent === null ? '—' : nf(summary.proteinPercent, 2)
                }`,
        },
        {
          label: 'Средний ИПЦ',
          value: summary.ipc === null ? '—' : nf(summary.ipc, 1),
          note: `профиль «${activeProfile}»`,
        },
      ]
    : []

  return (
    <>
      {/*
         Дела — первым, до чисел. Числа описывают состояние, дела называют
         работу, и работа важнее: числа за сутки не меняются, а заключение
         Ассоциации приходит именно за эти сутки. Когда дел нет, полосы нет
         вовсе: строка «всё хорошо» занимает место и ничего не сообщает.
      */}
      {todo.length > 0 && (
        <section className="mt-6">
          <div className="flex flex-wrap gap-3">
            {todo.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={`min-w-[190px] flex-1 rounded-xl px-4 py-3 transition-colors ${
                  t.urgent
                    ? 'bg-[#fdecea] hover:bg-[#fbe0dc]'
                    : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                }`}
              >
                <span className="block text-[15px] font-medium">
                  {t.count > 0 && <span className="tabular-nums">{t.count} </span>}
                  {t.label}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">{t.hint}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/*
         Частые дела подняты наверх, к делам и числам.

         Стояли последними — за семью отчётами, то есть за пятью экранами
         прокрутки. А в кабинет заходят чаще всего именно за ними: записать
         отёл, залить файл, отправить на верификацию. Отчёты читают, дела
         делают, и делать не должно требовать доскроллить.

         Ряд кнопок, а не карточек: полными карточками с описаниями они
         стоят в «Данных», там человек выбирает способ. Здесь он уже знает,
         чего хочет.
      */}
      <section className="mt-8">
        <div className="flex flex-wrap gap-3">
          <Link href="/account/events/new" className="btn btn-accent">
            Записать событие
          </Link>
          <Link href="/account/import" className="btn">
            Загрузить файл
          </Link>
          <Link href="/account/verification" className="btn">
            Подать на верификацию
          </Link>
          <Link href="/account/checks/herd" className="btn">
            Проверить моё стадо
          </Link>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="mt-9">
          <h2 className="section-title mb-5">Стадо в числах</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="card">
                <p className="text-sm text-ink-500">{s.label}</p>
                <p className="stat-value mt-3 text-[34px] text-forest-500">{s.value}</p>
                {/*
                   Подпись под числом называет, из чего оно посчитано.
                   Средний удой по двенадцати коровам из семидесяти
                   и по семидесяти из семидесяти выглядят одинаково
                   убедительно, а означают разное — тот же довод, что
                   у числа дочерей в сравнении быков.
                */}
                {s.note && <p className="mt-1 text-[12px] text-ink-500">{s.note}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/*
         Сигналы: не состояние стада, а то, с чем нужно что-то делать.

         Сами отчёты переехали в «Стадо → Отчёты» — там их и ищут, судя
         по названию раздела. Но терять ежедневность было нельзя:
         передержанная тёлка стоит корма каждый день, а раздел, куда надо
         зайти, открывают раз в квартал. Поэтому здесь остались те же
         числа, но только тревожные, и каждое ведёт прямо в список
         животных. Разбор — в `herd-signals.ts`.
      */}
      {signals.length > 0 && (
        <section className="mt-9">
          <h2 className="section-title mb-5">Требует решения</h2>
          <div className="flex flex-wrap gap-3">
            {signals.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className={`min-w-[220px] flex-1 rounded-xl px-4 py-3 transition-colors ${
                  s.urgent
                    ? 'bg-[#fdecea] hover:bg-[#fbe0dc]'
                    : 'bg-white shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] hover:bg-[#f6f6f6]'
                }`}
              >
                <span className="block text-[15px] font-medium">
                  <span className="tabular-nums">{nf(s.count, 0)} </span>
                  {s.label}
                </span>

                {/*
                   База и доля — второй строкой, а не рядом с числом.
                   «4033 из 4790 коров выше порога» в одну строку читается
                   как одно длинное число; разведённые, они читаются
                   как утверждение и его масштаб.
                */}
                {s.of !== null && s.share !== null && (
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-700">
                    из {nf(s.of, 0)}
                    {s.ofLabel ? ` ${s.ofLabel}` : ''} — это{' '}
                    <span className={s.mass ? 'font-medium' : undefined}>
                      {s.share < 0.01 ? 'менее 1' : nf(s.share * 100, 0)} %
                    </span>
                  </span>
                )}

                <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">{s.hint}</span>
              </Link>
            ))}
          </div>

          <p className="mt-3 text-[13px] text-ink-500">
            Полностью —{' '}
            <Link
              href="/account?tab=herd&sub=reports"
              className="underline underline-offset-2 hover:text-forest-500"
            >
              отчёты по стаду
            </Link>
            : структура, воспроизводство, выбытие, генетический тренд.
          </p>
        </section>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                          Отчёты по стаду                             */
/* ------------------------------------------------------------------ */

/**
 * Подраздел «Стадо → Отчёты».
 *
 * ## Что здесь изменилось и почему
 *
 * Отчётов было два, а семь отчётов по стаду стояли на «Обзоре». Раздел,
 * названный «Отчёты», отчётов не содержал, и это дороже, чем кажется:
 * человек, которому нужен отчёт, ищет его там, где написано «Отчёты»,
 * не находит и заключает, что отчёта нет.
 *
 * Довод, по которому семь отчётов стояли на «Обзоре», был верным: отчёт,
 * за которым надо идти в отдельный раздел, смотрят раз в квартал, то есть
 * когда решать уже поздно. Он не отброшен, а решён иначе — полосой
 * сигналов на «Обзоре»: тревожные числа остались на виду и ведут прямо
 * в список животных.
 *
 * ## Число и животные за ним
 *
 * Каждое число, за которым стоят конкретные животные, стало дверью
 * в их список (`/account/reports/[code]`, разбор — `herd-drilldown.ts`).
 * До этого кабинет умел сказать «инбридинг выше порога у двенадцати»
 * и не умел показать, у каких, — а сделать что-то можно только
 * с двенадцатью коровами, не с числом.
 *
 * Не у всякого числа дверь есть. У среднего инбридинга её нет и быть
 * не может: среднее не относится ни к одному животному, и список
 * «по среднему» означал бы всё стадо, притворяясь разбором.
 *
 * ## Почему сравнение быков стоит здесь
 *
 * Быки — не только свои, но смотрят на них ради колонки «родство
 * с вашим стадом», а она считается из родословной покупателя. То есть
 * это ответ про стадо, а не про каталог.
 */
async function HerdReports({ orgId }: { orgId?: number }) {
  const payload = await getClient()

  /*
   * Те же семь запросов одним заходом. На «Обзоре» из них берутся
   * четыре — ради сигналов, — а здесь нужны все: раздел про стадо
   * целиком, а не только про его беды.
   */
  const [structure, heifers, trend, cull, repro, udder, milk] = orgId
    ? await Promise.all([
        lactationStructure(payload, orgId),
        heiferAges(payload, orgId),
        geneticTrend(payload, orgId),
        culling(payload, orgId),
        reproduction(payload, orgId),
        udderHealth(payload, orgId),
        milkByLactation(payload, orgId),
      ])
    : [null, null, null, null, null, null, null]

  return (
    <>
      <HerdAnalytics
        structure={structure}
        heifers={heifers}
        trend={trend}
        cull={cull}
        repro={repro}
        udder={udder}
        milk={milk}
      />

      {/*
         Две отдельные страницы — ниже отчётов, считающихся здесь же.
         Дверь в другую страницу и отчёт на этой выглядят по-разному
         намеренно: первая уводит, второй уже показан.
      */}
      <section className="mt-9">
        <h2 className="section-title mb-5">Отдельные разборы</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card">
            <h3 className="panel-heading">Подбор быков</h3>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Инбридинг будущего потомка для каждой пары «корова × бык». Посчитать его
              может только тот, у кого есть обе родословные разом: у системы управления
              стадом есть ваша, у каталога быков — его, и ни у кого нет обеих.
            </p>
            <Link href="/account/reports/mating" className="btn btn-accent mt-5">
              Подобрать
            </Link>
          </div>

          <div className="card">
            <h3 className="panel-heading">Быки в моём стаде</h3>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Что каждый бык дал именно у вас: дочери против ровесниц того же стада,
              удой, жир, белок, возраст первого отёла, соматика. Каталожная оценка
              посчитана по десяткам хозяйств с другим кормлением — она не отвечает
              на вопрос «а у меня он что дал».
            </p>
            <Link href="/account/reports/sires" className="btn btn-accent mt-5">
              Открыть разбор
            </Link>
          </div>

          <div className="card">
            <h3 className="panel-heading">Календарь стада</h3>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Кого запускать, кто телится в ближайший месяц, кого проверять на стельность.
              Три списка на неделю вперёд, посчитанные из отёлов и осеменений, которые
              вы и так записываете. Единственный отчёт здесь, который смотрят каждое утро.
            </p>
            <Link href="/account/reports/calendar" className="btn btn-accent mt-5">
              Открыть календарь
            </Link>
          </div>

          <div className="card">
            <h3 className="panel-heading">Кандидаты на выбраковку</h3>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Коровы, к которым есть претензии: не стельная после двухсот дней, много
              осеменений, высокая соматика, нижняя четверть стада по индексу или по удою.
              Рейтинга нет намеренно — у каждой перечислено, чем именно она сюда попала,
              а решает зоотехник.
            </p>
            <Link href="/account/reports/cull" className="btn btn-accent mt-5">
              Открыть список
            </Link>
          </div>

          <div className="card">
            <h3 className="panel-heading">Возраст первого отёла</h3>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Считается по датам, которые вы уже внесли, — рождение и первый отёл.
              Показывает, как телились ваши коровы, что с ними было дальше и дочери
              каких быков телятся раньше. Вводить для этого ничего не нужно.
            </p>
            <Link href="/account/afc" className="btn btn-accent mt-5">
              Посмотреть отчёт
            </Link>
          </div>

          <div className="card">
            <h3 className="panel-heading">Сравнение быков</h3>
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              До шести производителей рядом: разница со сверстницами, число дочерей,
              на которых она посчитана, и родство с вашим стадом. Последнее не даст
              ни один каталог — для него нужны разом родословная быка и родословная
              вашего хозяйства.
            </p>
            <Link href="/bulls/compare" className="btn btn-accent mt-5">
              Открыть сравнение
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                              Вкладка «Стадо»                         */
/* ------------------------------------------------------------------ */

async function AnimalsTab({
  sp,
  orgId,
  user,
  viewer,
}: {
  sp: SearchParams
  orgId?: number
  /*
   * Раньше сюда приходил только `userId`. Список сохранённых отборов
   * читается правилами доступа от имени читателя, а правилу нужен
   * пользователь целиком — с ролью в хозяйстве и с организацией.
   * Собирать его здесь заново из одного идентификатора значило бы
   * сходить в базу за тем, что вызывающий уже держит в руках.
   */
  user: User
  viewer: Viewer
}) {
  const userId = user.id
  const payload = await getClient()
  const page = currentPage(sp)
  const perPage = resolvePageSize(sp)
  const scope: Where = orgId ? { owner: { equals: orgId } } : { author: { equals: userId } }

  /*
   * Список архива — тот же список, только наоборот.
   *
   * Отдельная страница была бы честнее по названию и хуже по делу:
   * в архиве ищут тем же, чем в стаде («где та корова с номером на 51»),
   * и заводить ради этого вторую форму поиска, вторую таблицу и вторую
   * разбивку по страницам значило бы содержать две копии одного экрана.
   *
   * Без этого списка архив был бы ловушкой: запись, отправленная туда,
   * исчезает отовсюду, а вернуть её можно только с её же карточки —
   * до которой уже не добраться.
   */
  const archiveMode = one(sp.archive) === '1'
  const where = buildAnimalWhere(sp, scope, { archive: archiveMode })

  /*
   * В своём стаде порядок строит основной профиль хозяйства — в этом и смысл
   * слова «основной». Переключателя здесь нет намеренно: книга открыта для
   * сравнения животных под разными наборами весов, а свой список — рабочий,
   * и он должен отвечать на вопрос «кого оставлять» одним ответом,
   * тем самым, который хозяйство себе назначило.
   */
  const profile = await selectProfile(one(sp.profile), orgId)

  /*
   * Отборы читаются правилами доступа от имени читателя: правило
   * видимости записано один раз, в `savedSearchRead`, и повторять его
   * здесь своим условием значило бы завести вторую копию, которая
   * разойдётся с первой при первой же правке.
   */
  const savedSearches = await loadSavedSearches(payload, user, 'herd')

  const [result, herdsResult, total, archivedTotal] = await Promise.all([
    profile
      ? rankByProfile({
          payload,
          where,
          profile,
          offset: (page - 1) * (perPage || 0),
          limit: perPage,
          overrideAccess: true,
        })
      : payload.find({
          collection: 'animals',
          where,
          depth: 1,
          page,
          // 0 означает «без разбивки»: Payload отдаёт всё найденное одним ответом
          limit: perPage,
          sort: '-ipcRank',
          overrideAccess: true,
        }),
    payload.find({
      collection: 'herds',
      where: orgId ? { organization: { equals: orgId } } : {},
      limit: 100,
      sort: 'name',
      overrideAccess: true,
    }),
    payload.count({
      collection: 'animals',
      where: { and: [NOT_ARCHIVED, scope] },
      overrideAccess: true,
    }),
    payload.count({
      collection: 'animals',
      where: { and: [{ archived: { equals: true } }, scope] },
      overrideAccess: true,
    }),
  ])

  const defaults: Record<string, string> = {}
  for (const key of Object.keys(sp)) defaults[key] = one(sp[key])
  defaults.tab = 'herd'
  /*
   * Подраздел из формы поиска убирается. Искать можно только в списке,
   * и человек, пришедший из «Документов» и нажавший «Искать», должен
   * оказаться в списке — иначе найденное осталось бы за кадром, на странице
   * документов, и поиск выглядел бы сломанным.
   */
  delete defaults.sub

  // Сверка хранимых значений с книгой — только когда порядок построен по ним
  const lag =
    profile && 'stored' in result && result.stored
      ? await indexValuesLag(payload, profile.key)
      : { missing: 0, stale: 0 }
  const lagMissing = lag.missing
  const lagStale = lag.stale

  /*
   * Пустая таблица объясняется по-разному.
   *
   * Раньше в обоих случаях стояло «в вашем стаде пока нет записей»: человек
   * искал по стаду из полутора сотен голов, ничего не находил и читал, что
   * стадо пустое. Теперь ответ зависит от того, задан ли отбор.
   */
  const filtered = hasActiveFilters(sp)
  const emptyText = archiveMode ? (
    <>
      В архиве пусто.{' '}
      <Link href="/account?tab=herd" className="underline underline-offset-4">
        Вернуться к стаду
      </Link>
    </>
  ) : filtered ? (
    <>
      По заданным условиям в вашем стаде ничего не найдено.{' '}
      <Link href="/account?tab=herd" className="underline underline-offset-4">
        Сбросить отбор
      </Link>
    </>
  ) : (
    <>
      В вашем стаде пока нет записей. Загрузите их через{' '}
      <Link href="/account/import" className="underline underline-offset-4">
        «Загрузку данных»
      </Link>
      .
    </>
  )

  return (
    <>
      {/*
         Полоса дел отсюда ушла в «Обзор».

         Она отвечала на вопрос всего кабинета — что сегодня не так, —
         стоя внутри одного его раздела, и от этого раздел «Стадо»
         начинался не тем, зачем в него приходят. Приходят за списком.
      */}

      {/*
         Раньше здесь одновременно жили два несовместимых сценария: крупные
         карточки импорта-экспорта и поиск по стаду. Действия ушли на свою
         страницу и в строку кнопок, а раздел занят одним делом — работой
         со списком животных.
      */}
      <section className="mt-6">
        <SearchPanel
          action="/account"
          total={archiveMode ? archivedTotal.totalDocs : total.totalDocs}
          totalLabel={archiveMode ? 'Записей в архиве' : 'Животных в хозяйстве'}
          herds={herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))}
          defaults={defaults}
          openAdvanced={hasAdvancedValues(sp)}
          /* Поиск внутри архива обязан остаться внутри архива: иначе форма
             молча возвращает в стадо, и человек решает, что архив пропал */
          hidden={archiveMode ? { tab: 'herd', archive: '1' } : { tab: 'herd' }}
        />
      </section>

      <section className="mt-8">
        {/*
           Шапка списка отвечает на три вопроса подряд: сколько нашлось,
           почему именно столько, что с этим делать. Тот же порядок,
           что в книге на главной, и тот же компонент.

           Раньше здесь стоял заголовок «Животные» и ряд из пяти кнопок.
           Заголовок повторял название раздела строкой выше, а число
           найденного не показывалось вовсе — при заданном отборе человек
           видел таблицу и не знал, сколько в ней записей и почему именно
           эти. Условия отбора приходилось искать в свёрнутой форме.
        */}
        {/*
           Отборы кабинета отделены от отборов книги признаком места.
           Условия у них общие, а смысл разный: в книге отбор идёт по всем
           хозяйствам, здесь — по своему стаду, и часть полей («Автор
           записи») в книге не существует вовсе. Показать «свой» набор
           в книге технически можно, и он дал бы не то, чего от него ждут.
        */}
        <SavedSearches
          items={savedSearches}
          place="herd"
          currentQuery={filterQueryOf(sp)}
          hasActive={filtered}
          basePath="/account?tab=herd"
        />

        <ResultsBar
          sp={sp}
          total={result.totalDocs ?? 0}
          sort={resolveSort(sp, Boolean(profile)).value}
          hasActive={filtered}
          herds={herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))}
          title={archiveMode ? 'Архив' : 'Мои животные'}
          resetHref={archiveMode ? '/account?tab=herd&archive=1' : '/account?tab=herd'}
          /*
             Пояснение сжато до нескольких слов: оно стоит в одной строке
             с заголовком, и абзац про тридцать дней снова растянул бы
             панель на ярус. Полный разбор — на самой карточке, в блоке
             архива, где он и нужен: там его читают перед нажатием.
          */
          note={
            archiveMode ? (
              <>
                хранятся {ARCHIVE_RETENTION_DAYS} дней, потом удаляются{' '}
                <Link href="/account?tab=herd" className="underline underline-offset-4">
                  к стаду
                </Link>
              </>
            ) : archivedTotal.totalDocs > 0 ? (
              <>
                в архиве {archivedTotal.totalDocs.toLocaleString('ru-RU')}{' '}
                <Link
                  href="/account?tab=herd&archive=1"
                  className="underline underline-offset-4"
                >
                  открыть
                </Link>
              </>
            ) : null
          }
          actions={
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              {/*
                 Одна кнопка выгрузки вместо двух.

                 Здесь стояли «Выгрузить CSV» и «JSON» — и панель этим
                 молча утверждала, что форматов два. Их пять: к CSV и JSON
                 добавились XML и TXT, и все они живут на странице загрузки
                 и выгрузки. Две кнопки из пяти — не сокращение, а неправда
                 о собственных возможностях.
              */}
              <Link
                href="/account/import#export"
                className="rounded-lg bg-white px-3 py-2 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)] transition-colors hover:bg-[#f6f6f6]"
                title="CSV, JSON, XML, TXT"
              >
                Выгрузка
              </Link>
              {/*
                 Ручной ввод стоит рядом с загрузкой, но кнопкой послабее:
                 файлом заводят стадо, руками — одиночные случаи, и порядок
                 кнопок должен подсказывать именно это.
              */}
              <Link href="/account/events/new" className="btn">
                Записать событие
              </Link>
              <Link href="/account/animals/new" className="btn">
                Добавить животное
              </Link>
              <Link href="/account/import" className="btn btn-brand">
                Загрузить данные
              </Link>
            </div>
          }
        />

        {profile && !archiveMode && (
          <p className="mb-4 text-[14px] leading-relaxed text-ink-500">
            Порядок и колонка «{profile.name}» — по основному профилю хозяйства.{' '}
            <Link href="/account/indices" className="underline underline-offset-4">
              Настроить профили
            </Link>
            {'capped' in result && result.capped && (
              <>
                {' '}· значения по профилю ещё не рассчитаны, поэтому порядок построен
                по {RANKING_CAP.toLocaleString('ru-RU')} записям с наибольшим ИПЦ
                из {(result.totalDocs ?? 0).toLocaleString('ru-RU')}
              </>
            )}
            {lagMissing > 0 && (
              <>
                {' '}· пересчёт не охватил {lagMissing.toLocaleString('ru-RU')} записей —
                выполните <code className="rounded bg-canvas px-1.5 py-0.5">npm run backfill:index</code>
              </>
            )}
            {/* Устаревшее значение — не то же, что пропущенное: запись в списке
                есть, но стоит по признакам, которых у животного уже нет */}
            {lagStale > 0 && (
              <>
                {' '}· у {lagStale.toLocaleString('ru-RU')} записей индекс посчитан раньше
                последней правки животного — они стоят по прежним признакам
              </>
            )}
          </p>
        )}

        {/*
           Отметки — только в своём стаде и только вне архива.

           В архиве отмечать нечего: поделиться убранной записью нельзя,
           а всё остальное, что делают с отмеченным, к архиву не относится.
        */}
        <HerdSelection>
          <AnimalTable
            animals={result.docs as Animal[]}
            startIndex={(page - 1) * (perPage || 0)}
            viewer={viewer}
            emptyText={emptyText}
            indexLabel={profile?.name}
            indexValues={'values' in result ? result.values : undefined}
            selectable={!archiveMode}
            ownHerd
          />
        </HerdSelection>
        {/*
           Подвал таблицы: слева — сколько показано и по сколько показывать,
           справа — страницы. Оба управляют одной таблицей, поэтому стоят
           под ней, а не в шапке раздела.
        */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="text-ink-500">
              Показано {result.docs.length} из {result.totalDocs ?? 0}
              {result.totalDocs !== total.totalDocs && ' (с учётом отбора)'}
            </span>
            <span aria-hidden="true" className="mx-1 text-ink-300">
              ·
            </span>
            <span className="text-ink-500">Показывать по:</span>
            {PAGE_SIZES.map((size) => {
              const isActive = perPage === size
              const params = new URLSearchParams()
              for (const [k, v] of Object.entries(sp)) {
                if (k === 'perPage' || k === 'page') continue
                const value = one(v)
                if (value) params.set(k, value)
              }
              params.set('tab', 'animals')
              if (size !== PAGE_SIZES[0]) params.set('perPage', String(size))

              return (
                <Link
                  key={size}
                  href={`/account?${params.toString()}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                    isActive
                      ? 'bg-brand-50 font-medium text-forest-600'
                      : 'text-ink-700 hover:bg-[#ededed]'
                  }`}
                >
                  {pageSizeLabel(size)}
                </Link>
              )
            })}
          </div>

          <Pagination
            page={result.page ?? 1}
            totalPages={result.totalPages ?? 1}
            searchParams={{ ...sp, tab: 'herd' }}
            basePath="/account"
          />
        </div>
      </section>

      {/*
         Отчёты отсюда ушли в свой подраздел.

         Они стояли карточкой под таблицей — то есть ниже семидесяти строк
         и трёх экранов прокрутки. Отчёт, до которого нужно доскроллить, —
         это отчёт, о существовании которого не знают: ссылка на «Возраст
         первого отёла» была единственной во всей системе.
      */}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                              Раздел «Данные»                         */
/* ------------------------------------------------------------------ */

/**
 * Раздел собран не по видам содержимого, а по тому, зачем человек пришёл.
 *
 * ## Что было
 *
 * Пять блоков подряд одной портянкой: записать событие, история загрузок,
 * верификация, возраст первого отёла, лента событий. Три из пяти — не
 * содержимое, а двери: карточка с абзацем и кнопкой на другую страницу.
 * Читалось это как список того, что здесь есть, а не как ответ на вопрос,
 * с которым сюда пришли.
 *
 * ## Как разложено теперь
 *
 * Три раздела, и каждый отвечает на свой вопрос:
 *
 *  - «Записать» — как внести данные: форма события и загрузка файлом;
 *  - «Проверка» — что с отданным: разбор своих ошибок, заявки, пакеты;
 *  - «Лента» — что записано за последнее время.
 *
 * Загрузка файлом получила здесь своё место. Раньше она жила только
 * кнопкой на панели таблицы животных — как настройка списка, а не как
 * способ внести данные. Кнопка там и осталась, она удобна; но человек,
 * пришедший «внести данные», искал их не в таблице стада, и правильно
 * делал: файлом грузят прежде всего события — тысячами строк из доильного
 * зала. Карточки животных заводят раз, а дойки приходят каждый месяц.
 *
 * «Возраст первого отёла» отсюда убран: это не работа с данными, а отчёт
 * по стаду, посчитанный из уже введённого. Его место рядом со стадом.
 *
 * ## Что нашлось попутно
 *
 * «Проверить моё стадо» и каталог проверок не имели в кабинете ни одной
 * кнопки: на них вели только текстовые ссылки внутри страницы верификации.
 * То есть самое полезное — «покажи, что у меня не так, до того как я подам
 * заявку» — лежало там, куда попадают, уже решив подать заявку. Теперь
 * проверка стоит первой в своём разделе: чинить данные надо до подачи,
 * а не после отказа.
 *
 * ## Почему запросы внутри разделов, а не общие
 *
 * Раньше открытие вкладки тянуло из базы и пакеты, и ленту событий —
 * даже если человек пришёл нажать одну кнопку. Теперь каждый раздел
 * спрашивает своё: у «Записать» запросов нет вовсе.
 */

/*
 * Список разделов и сам переключатель переехали в `DataNav`: он же стоит
 * на страницах третьего уровня, куда эти разделы ведут. Пока список жил
 * здесь, за пределами этой страницы меню второго уровня просто исчезало.
 */

async function DataTab({ sub, orgId }: { sub: DataSub; orgId?: number }) {
  return (
    <>
      {sub === 'write' && <DataWrite />}
      {sub === 'check' && <DataCheck orgId={orgId} />}
      {sub === 'feed' && <DataFeed orgId={orgId} />}
    </>
  )
}

/* ----------------------------- Записать ----------------------------- */

function DataWrite() {
  return (
    /*
       Карточки построены как на странице загрузки: слева текст и кнопка,
       справа рисунок. Это не украшение и не единообразие ради него —
       карточка «Файлом» ведёт ровно в ту карточку, которая на той странице
       выглядит так же и с тем же рисунком. Дверь и комната должны быть
       узнаваемы друг по другу, иначе переход читается как переход
       в незнакомое место.

       Форма — первой, файл — вторым, и порядок не случаен. Файлом грузят
       раз в месяц отчётом, а отёл записывают в тот день, когда он случился.
       Частое действие стоит ближе.
    */
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="card flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[21px] font-medium">По одному</h2>
          <p className="mt-1.5 text-[13px] text-ink-500">
            Одно событие руками, сразу после того, как оно случилось
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
            Отёл, осеменение, контрольная дойка, запуск. Сначала
            выбираете, что произошло, потом ищете животное по номеру или кличке. Номера
            отёла и лактации проставляются сами, а после записи форма остаётся открытой —
            пять отёлов подряд вводятся подряд.
          </p>
          <Link href="/account/events/new" className="btn btn-accent mt-5">
            Записать событие
          </Link>
        </div>

        <SingleRecordIcon />
      </div>

      <div className="card flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[21px] font-medium">Файлом</h2>
          <p className="mt-1.5 text-[13px] text-ink-500">
            Тысяча строк из доильного зала или программы техника
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
            Животные, отёлы, осеменения и контрольные дойки — по одному набору за раз,
            CSV или TXT. На странице загрузки лежат шаблоны и таблица принимаемых колонок;
            строки, которые не удалось принять, называются сразу и с причиной.
          </p>
          <Link href="/account/import" className="btn btn-accent mt-5">
            Загрузить файл
          </Link>
        </div>

        <FileUploadIcon />
      </div>

      {/*
         Перемещение отделено от прочих событий намеренно.

         Отёл и дойка описывают, что произошло с животным, и правятся
         тем же хозяйством за минуту. Продажа описывает, что произошло
         с правом на него: карточка уходит в чужие руки, и вернуть её
         своими силами уже нельзя. Соседство в одном списке ровняло бы
         эти два действия и делало продажу на один клик ближе, чем она
         должна быть.
      */}
      <div className="card flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[21px] font-medium">Перемещение</h2>
          <p className="mt-1.5 text-[13px] text-ink-500">
            Смена владельца или площадки
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
            Продажа, аренда, перевод между площадками, выбраковка, падёж, поступление
            извне. Покупателя не обязательно искать в книге: если его там нет, впишите
            название — карточка заведётся с пометкой «книгу не ведёт», и Ассоциация
            разберёт её потом.
          </p>
          <Link href="/account/movements/new" className="btn btn-accent mt-5">
            Записать перемещение
          </Link>
        </div>

        <SingleRecordIcon />
      </div>
    </div>
  )
}

/* ----------------------------- Проверка ----------------------------- */

async function DataCheck({ orgId }: { orgId?: number }) {
  const payload = await getClient()

  const submissions = await payload.find({
    collection: 'data-submissions',
    where: orgId ? { organization: { equals: orgId } } : {},
    sort: '-submittedAt',
    limit: 30,
    depth: 1,
    overrideAccess: true,
  })

  return (
    <>
      {/*
         Раздел открывается не карточкой, а порядком действий.

         До этого здесь стояли три блока подряд, и по ним нельзя было
         догадаться, что первый нужно делать раньше второго. Хозяйство
         видело кнопку «Подать на верификацию» и нажимало её — а разбор
         своих данных, который снял бы половину замечаний за минуту
         и ничего никуда не отправляет, оставался незамеченным. Цена
         этой незаметности не наша: заявка с ошибками занимает эксперта
         на день и возвращается в хозяйство через неделю.

         Поэтому шаги пронумерованы словами, а не подразумеваются
         порядком блоков. Порядок блоков читают не сверху вниз,
         а по кнопкам.
      */}
      <p className="mt-7 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
        Путь у данных один: сначала разберите их сами — это ничего никуда не отправляет, —
        потом подайте в Ассоциацию, потом следите за отданным. Ошибка, найденная на первом
        шаге, чинится за минуту; та же ошибка, найденная Ассоциацией, возвращается
        к вам через неделю ожидания и занимает эксперта на день.
      </p>

      <section className="mt-9">
        <StepTitle n={1} title="Проверить самим" note="ничего никуда не отправляется" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[21px] font-medium">Разбор стада</h3>
              <p className="mt-1.5 text-[13px] text-ink-500">Найти противоречия у себя</p>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
                Система пройдёт по вашим записям теми же правилами, которыми пользуется
                эксперт Ассоциации, и покажет противоречия: невозможные даты, кровность
                вразрез с родителями, смешанные единицы измерения. Результат видите
                только вы.
              </p>
              <Link href="/account/checks/herd" className="btn btn-accent mt-5">
                Проверить моё стадо
              </Link>
            </div>

            <HerdScanIcon />
          </div>

          <div className="card flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-[21px] font-medium">Каталог правил</h3>
              <p className="mt-1.5 text-[13px] text-ink-500">По чему сверяют записи</p>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
                Полный список того, что проверяется, с объяснением, почему каждое правило
                заведено и при каких значениях срабатывает. Пороги устанавливает
                Ассоциация — они одни на всю книгу, иначе записи разных хозяйств
                несравнимы.
              </p>
              <Link href="/account/checks" className="btn btn-accent mt-5">
                Открыть каталог
              </Link>
            </div>

            <RulesIcon />
          </div>
        </div>
      </section>

      {/*
         Верификация — второй путь к уровню «Верифицировано ассоциацией».
         Загрузкой его получают записи из проверенного файла; заявкой —
         любые свои, независимо от того, когда они попали в систему.
      */}
      <section className="mt-12">
        <StepTitle n={2} title="Подать в Ассоциацию" note="разбирает человек" />

        <div className="card">
          <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Подайте свои записи, чтобы Ассоциация подтвердила их по документам. Это
            не загрузка данных: подавать можно любые записи стада, в том числе те, что лежат
            в системе давно. Подтверждение требуется перед выпуском племенного свидетельства.
          </p>
          <p className="mt-3 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Одни и те же записи дважды подавать не нужно: если они уже ждут решения,
            система скажет об этом и предложит отозвать прежнюю заявку.
          </p>
          <Link href="/account/verification" className="btn btn-accent mt-5">
            Подать на верификацию
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <StepTitle n={3} title="Следить за отданным" note="пакеты загрузок" />

        <p className="mb-6 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
          Здесь пакеты — то, что ушло файлом. Состояние поданных заявок видно
          на{' '}
          <Link href="/account/verification" className="underline underline-offset-4">
            странице верификации
          </Link>
          , в списке «Ваши заявки».
        </p>

        <SubmissionHistory submissions={submissions.docs} />
      </section>
    </>
  )
}

/**
 * Заголовок шага.
 *
 * Номер вынесен в отдельный кружок, а не вписан в текст заголовка:
 * «1. Проверить самим» читается как пункт списка, из которого можно
 * выбрать любой, а вынесенный номер — как порядок, в котором идут.
 * Разница мелкая на вид и существенная по смыслу: весь этот раздел
 * переписан ровно затем, чтобы первый шаг перестали пропускать.
 */
function StepTitle({ n, title, note }: { n: number; title: string; note: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-forest-500 text-[14px] font-medium text-white"
      >
        {n}
      </span>
      {/*
         Здесь `section-title` без своей точки: у класса есть маркер
         `::before` — оранжевый кружок перед заголовком, — и рядом
         с номером шага он давал два маркера подряд, зелёный и оранжевый.
         Точка означает «начало раздела»; номер означает то же самое
         и вдобавок порядок. Два знака одного смысла спорят друг с другом,
         остаётся тот, который говорит больше.
      */}
      <h2 className="section-title mb-0 before:hidden">
        <span className="sr-only">Шаг {n}. </span>
        {title}
      </h2>
      <span className="text-[14px] text-ink-500">— {note}</span>
    </div>
  )
}

/* ------------------------------- Лента ------------------------------- */

async function DataFeed({ orgId }: { orgId?: number }) {
  const payload = await getClient()

  const events = await payload.find({
    collection: 'events',
    depth: 1,
    limit: 30,
    sort: '-date',
    overrideAccess: true,
    where: orgId ? { 'animal.owner': { equals: orgId } } : {},
  })

  return (
    <section className="mt-8">
      <h2 className="section-title mb-2">События животных</h2>
      {/*
         Оговорка про состав ленты обязательна. Отёлы, осеменения и дойки
         живут в своих таблицах, а не в коллекции `events`, и человек,
         записавший утром отёл и не увидевший его здесь, решит, что запись
         пропала. Она не пропала — она в карточке животного.
      */}
      <p className="mb-7 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
        Последние тридцать записей журнала: перемещения, выбытие, ветеринарные обработки
        и прочее, для чего нет отдельной таблицы. Отёлы, осеменения и контрольные дойки
        сюда не попадают — они лежат в карточке животного, во вкладке «События».
      </p>
      <div className="card overflow-x-auto">
        <table className="metric-table min-w-[720px]">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Животное</th>
              <th>Описание</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {events.docs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-500">
                  Событий пока нет
                </td>
              </tr>
            )}
            {events.docs.map((e) => (
              <tr key={e.id}>
                <td>{dateRu(e.date)}</td>
                <td>{eventTypeLabel(e.type)}</td>
                <td>
                  {typeof e.animal === 'object' && e.animal ? (
                    <Link href={`/animals/${e.animal.id}`} className="underline underline-offset-2">
                      {e.animal.identNumber}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{e.title || '—'}</td>
                <td>
                  {e.status === 'accepted'
                    ? 'Принято'
                    : e.status === 'sent'
                      ? 'Отправлено'
                      : 'Черновик'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*                             Вкладка «Документы»                      */
/* ------------------------------------------------------------------ */

/**
 * Подраздел «Стадо → Документы».
 *
 * Отбор, разбивка и разметка — в `DocumentsPanel`; здесь только запрос.
 * Разделение не ради красоты: раздел вырос из таблицы на сорок строк
 * без условий в архив с семью условиями и постраничной навигацией,
 * а страница кабинета и без него полторы тысячи строк.
 */
async function DocumentsTab({ orgId, sp }: { orgId?: number; sp: DocSearchParams }) {
  const payload = await getClient()

  const page = Math.max(1, Number(oneDoc(sp.page)) || 1)
  const perPage = 25

  const where = buildDocumentWhere(sp, orgId)

  /*
   * Общий счёт берётся из выдачи (`totalDocs`), а не отдельным запросом:
   * условие у них одно и то же, и разойтись они не могут. Это не тот
   * случай, что со списками отчётов, — там число и список считались
   * разными запросами по разным условиям.
   */
  const docs = await payload.find({
    collection: 'documents',
    depth: 1,
    page,
    limit: perPage,
    sort: '-issuedAt',
    overrideAccess: true,
    where,
  })

  return (
    <DocumentsPanel
      docs={docs.docs}
      total={docs.totalDocs ?? 0}
      page={page}
      totalPages={docs.totalPages ?? 1}
      sp={sp}
      hasFilters={hasDocumentFilters(sp)}
    />
  )
}

/* ------------------------------------------------------------------ */

async function VisibilityFormWrapper({ orgId }: { orgId?: number }) {
  const payload = await getClient()
  if (!orgId) return null
  const sample = await payload.find({
    collection: 'animals',
    where: { owner: { equals: orgId } },
    limit: 1,
    overrideAccess: true,
  })
  const first = sample.docs[0]
  return (
    <VisibilityForm
      defaultVisible={Boolean(first?.publicVisible)}
      defaultDetails={Boolean(first?.publicDetails)}
    />
  )
}

/*
 * Карточка «Профиль индекса племенной ценности» отсюда убрана.
 *
 * Она была дверью: абзац текста и ссылка на `/account/indices`, лежавшая
 * в глубине настроек, — и это была единственная ссылка на профили весов
 * во всей системе. Дверям место в меню, где их ищут, поэтому «Профили ИПЦ»
 * стали подразделом «Хозяйства».
 *
 * Единственное, что карточка сообщала помимо ссылки, — по какому профилю
 * сейчас считается индекс. Это не настройка, а состояние стада, и оно
 * переехало в «Обзор», подписью под средним ИПЦ: там она стоит рядом
 * с числом, к которому относится.
 */
