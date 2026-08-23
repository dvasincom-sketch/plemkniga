import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav, ACCOUNT_TABS, type AccountTabKey } from '@/components/AccountNav'
import { SearchPanel } from '@/components/SearchPanel'
import { ResultsBar } from '@/components/ResultsBar'
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
import { DOCUMENT_TYPES, ROLES, eventTypeLabel, labelOf } from '@/lib/dictionaries'
import { SubmissionHistory } from '@/components/SubmissionHistory'
import { DATA_SUBTABS, DataNav, type DataSub } from '@/components/DataNav'
import {
  FileUploadIcon,
  HerdScanIcon,
  RulesIcon,
  SingleRecordIcon,
} from '@/components/CardIcons'
import { dateRu } from '@/lib/format'
import { ARCHIVE_RETENTION_DAYS } from '@/lib/archive-retention'
import { RANKING_CAP, rankByProfile } from '@/lib/index-column'
import { indexValuesLag } from '@/lib/index-values'
import { ASSOCIATION_PROFILE } from '@/lib/breeding-index'
import { loadOwnProfiles, selectProfile } from '@/lib/index-profiles'
import type { Where } from 'payload'
import type { Animal, Organization } from '@/payload-types'

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
   * Старые адреса разделов не ломаем. «Личные данные» переехали в настройки
   * отдельным блоком; «События» стали «Данными». Ссылок на `?tab=events`
   * снаружи много — в письмах, в закладках, в наших же страницах, — и
   * встречать их пустым разделом «Мои животные» значит наказывать человека
   * за нашу правку.
   */
  const normalized =
    tabParam === 'profile' ? 'settings' : tabParam === 'events' ? 'data' : tabParam
  const tab: AccountTabKey = ACCOUNT_TABS.some((t) => t.key === normalized)
    ? (normalized as AccountTabKey)
    : 'animals'

  const tabTitle = ACCOUNT_TABS.find((t) => t.key === tab)?.label ?? 'Личный кабинет'

  /*
   * Подраздел разбирается здесь, а не внутри `DataTab`: ряд его разделов
   * стоит выше заголовка страницы — там же, где на страницах третьего
   * уровня, — и знать выбранный подраздел нужно до того, как начнётся
   * содержимое.
   */
  const subParam = one(sp.sub)
  const sub: DataSub = DATA_SUBTABS.some((s) => s.key === subParam)
    ? (subParam as DataSub)
    : 'write'

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
        {tab === 'data' && <DataNav active={sub} />}

        <div>
          <div className="min-w-0">
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

            {tab === 'animals' && <AnimalsTab sp={sp} orgId={orgId} userId={user.id} viewer={viewer} />}

            {tab === 'data' && <DataTab sub={sub} orgId={orgId} />}
            {tab === 'documents' && <DocumentsTab orgId={orgId} />}

            {tab === 'settings' && (
              <>
                <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <h2 className="section-title lg:col-span-2">Видимость и доступ</h2>
            <VisibilityFormWrapper orgId={orgId} />
            <div className="card">
              <h3 className="panel-heading">Личные данные</h3>
              <p className="text-sm leading-relaxed text-ink-700">
                Фамилия, телефон, реквизиты организации и роль в системе вынесены на отдельную
                страницу — она открывается кликом по имени в шапке.
              </p>
              <Link
                href="/account/profile"
                className="mt-4 inline-block underline underline-offset-4 hover:text-forest-500"
              >
                Открыть профиль пользователя
              </Link>
            </div>

            {/*
              Профили весов — настройка уровня хозяйства, а не личная: её делает
              главный генетик, и она меняет порядок животных для всех сотрудников.
              Поэтому блок стоит рядом с видимостью данных, а не в профиле
              пользователя.
            */}
            <IndexProfilesCard orgId={orgId} />

            <div className="card">
              <h3 className="panel-heading">Интеграции и API</h3>
              <p className="text-sm leading-relaxed text-ink-700">
                REST API системы доступен по адресу{' '}
                <code className="rounded bg-canvas px-1.5 py-0.5">/api</code>, GraphQL — по адресу{' '}
                <code className="rounded bg-canvas px-1.5 py-0.5">/api/graphql</code>. Авторизация —
                по тому же токену, что и в веб-интерфейсе.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-ink-700">
                Административная панель Payload:{' '}
                <Link href="/admin" className="underline underline-offset-4">
                  /admin
                </Link>
              </p>
            </div>
                </section>
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

/* ------------------------------------------------------------------ */
/*                            Вкладка «Мои животные»                    */
/* ------------------------------------------------------------------ */

async function AnimalsTab({
  sp,
  orgId,
  userId,
  viewer,
}: {
  sp: SearchParams
  orgId?: number
  userId: number | string
  viewer: Viewer
}) {
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
  defaults.tab = 'animals'

  // Сверка хранимых значений с книгой — только когда порядок построен по ним
  const lagMissing =
    profile && 'stored' in result && result.stored
      ? (await indexValuesLag(payload, profile.key)).missing
      : 0

  /*
   * Полоса дел. Считается только для хозяйства: у пользователя без
   * организации своего стада нет, и дела ему не про что.
   */
  const todo = orgId ? await farmTodo(payload, orgId) : []

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
      <Link href="/account?tab=animals" className="underline underline-offset-4">
        Вернуться к стаду
      </Link>
    </>
  ) : filtered ? (
    <>
      По заданным условиям в вашем стаде ничего не найдено.{' '}
      <Link href="/account?tab=animals" className="underline underline-offset-4">
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
         Дела — первым, до поиска.

         Раздел открывается таблицей, и таблица отвечает на вопрос «что
         у меня есть». Между двумя заходами в кабинет меняется не состав
         стада, а состояние дел, и увидеть их человек должен раньше, чем
         начнёт листать. Когда дел нет, полосы нет вовсе: пустая строка
         «всё хорошо» занимает место и ничего не сообщает.
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
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-500">
                  {t.hint}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

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
          hidden={archiveMode ? { tab: 'animals', archive: '1' } : { tab: 'animals' }}
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
        <ResultsBar
          sp={sp}
          total={result.totalDocs ?? 0}
          sort={resolveSort(sp, Boolean(profile)).value}
          hasActive={filtered}
          herds={herdsResult.docs.map((h) => ({ id: h.id as number, name: h.name }))}
          title={archiveMode ? 'Архив' : 'Мои животные'}
          resetHref={archiveMode ? '/account?tab=animals&archive=1' : '/account?tab=animals'}
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
                <Link href="/account?tab=animals" className="underline underline-offset-4">
                  к стаду
                </Link>
              </>
            ) : archivedTotal.totalDocs > 0 ? (
              <>
                в архиве {archivedTotal.totalDocs.toLocaleString('ru-RU')}{' '}
                <Link
                  href="/account?tab=animals&archive=1"
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
            searchParams={{ ...sp, tab: 'animals' }}
            basePath="/account"
          />
        </div>
      </section>

      {/*
         Отчёты по стаду — под таблицей, а не в разделе данных.

         «Возраст первого отёла» стоял среди загрузок и заявок, и это была
         ошибка раскладки: там всё про то, как данные попадают в систему
         и что с ними делает Ассоциация, а отчёт — про стадо, и считается
         он из того, что уже введено. Вводить для него нечего.

         Раздел заведён с запасом на будущие отчёты, но пустым бы
         не заводился: один отчёт — уже повод дать ему место, где его
         станут искать.
      */}
      <section className="mt-12">
        <h2 className="section-title mb-6">Отчёты по стаду</h2>
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
      </section>
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

async function DocumentsTab({ orgId }: { orgId?: number }) {
  const payload = await getClient()
  const docs = await payload.find({
    collection: 'documents',
    depth: 1,
    limit: 40,
    sort: '-issuedAt',
    overrideAccess: true,
    where: orgId ? { organization: { equals: orgId } } : {},
  })

  return (
    <section className="mt-8">
      <div className="card overflow-x-auto">
        <table className="metric-table min-w-[720px]">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Номер</th>
              <th>Название</th>
              <th>Животное</th>
              <th>Состояние</th>
            </tr>
          </thead>
          <tbody>
            {docs.docs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-ink-500">
                  Документов пока нет
                </td>
              </tr>
            )}
            {docs.docs.map((d) => (
              <tr key={d.id}>
                <td>{dateRu(d.issuedAt)}</td>
                <td>{labelOf(DOCUMENT_TYPES, d.type)}</td>
                <td>{d.number || '—'}</td>
                <td>{d.title}</td>
                <td>
                  {typeof d.animal === 'object' && d.animal ? (
                    <Link href={`/animals/${d.animal.id}`} className="underline underline-offset-2">
                      {d.animal.identNumber}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {/*
                    Отзыв показывается хозяйству, а не только Ассоциации.
                    Отозванное свидетельство внешне ничем не отличалось
                    от действующего — а сослаться на недействующую бумагу
                    в сделке хуже, чем не иметь её вовсе.
                  */}
                  {d.revoked?.at ? (
                    <span
                      className="rounded-md bg-[#fdecea] px-2 py-0.5 text-[13px]"
                      title={d.revoked.reason ?? undefined}
                    >
                      отозван {dateRu(d.revoked.at)}
                    </span>
                  ) : (
                    <span className="text-ink-500">действует</span>
                  )}
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

/* ------------------------------------------------------------------ */
/*                        Профили индекса — карточка                    */
/* ------------------------------------------------------------------ */

/**
 * Короткая справка о том, по какому профилю сейчас считается индекс.
 *
 * Настройка живёт на отдельной странице: там одиннадцать весов, сравнение
 * с профилем Ассоциации и пересчёт порядка животных — в карточку настроек
 * это не помещается, да и заходят туда раз в сезон.
 */
async function IndexProfilesCard({ orgId }: { orgId?: number }) {
  const { docs, defaultDoc } = await loadOwnProfiles(orgId)
  const activeName = defaultDoc ? defaultDoc.name : ASSOCIATION_PROFILE.name

  return (
    <div className="card">
      <h3 className="panel-heading">Профиль индекса племенной ценности</h3>
      <p className="text-sm leading-relaxed text-ink-700">
        Индекс считается по профилю{' '}
        <span className="font-medium">{activeName}</span>
        {defaultDoc ? ' — вашему собственному набору весов.' : ' — стандартному набору весов Ассоциации.'}{' '}
        Свой профиль нужен, когда экономика хозяйства расходится со средней по отрасли:
        белок дороже жира при сдаче на сыр, выбытие первотёлок, переполненный роддом.
      </p>

      {docs.length > 0 && (
        <p className="mt-3 text-sm text-ink-500">
          Профилей хозяйства: {docs.length}
        </p>
      )}

      <Link
        href="/account/indices"
        className="mt-4 inline-block underline underline-offset-4 hover:text-forest-500"
      >
        {docs.length > 0 ? 'Настроить профили' : 'Создать свой профиль'}
      </Link>
    </div>
  )
}
