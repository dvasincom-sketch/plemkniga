import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ExteriorChart } from '@/components/ExteriorChart'
import { AnimalEventsTab } from '@/components/AnimalEventsTab'
import { AnimalOriginTab } from '@/components/AnimalOriginTab'
import { TrustBadge } from '@/components/TrustBadge'
import { InfoTip } from '@/components/InfoTip'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { LactationDynamics } from '@/components/LactationDynamics'
import { AnimalPassport } from '@/components/AnimalPassport'
import { AnimalEditBlock } from '@/components/AnimalEditBlock'
import { AnimalEventForms } from '@/components/AnimalEventForms'
import { AnimalRevisionsPanel } from '@/components/AnimalRevisionsPanel'
import { blockValues, type Choice } from '@/lib/animal-edit'
import { CertificateSection } from '@/components/CertificateSection'
import { certificateReadiness } from '@/lib/certification'
import { ClosedAnimal } from '@/components/ClosedAnimal'
import { AccessRequestForm } from '@/components/AccessRequestForm'
import { GrantBanner, ScopeLocked } from '@/components/AccessScope'
import { grantsFor, scopesForAnimal } from '@/lib/grants'
import type { AccessScope } from '@/lib/dictionaries'
import { getClient, getCurrentUser } from '@/lib/payload'
import { isAnimalLocked, viewerOf } from '@/lib/visibility'
import {
  ANIMAL_KINDS,
  DOCUMENT_TYPES,
  EXTERIOR_COMPOSITES,
  EXTERIOR_TRAITS,
  HEALTH_TRAITS,
  PRODUCTION_TRAITS,
  labelOf,
} from '@/lib/dictionaries'
import { dateRu, nf, signed } from '@/lib/format'
import { IndexBreakdown } from '@/components/IndexBreakdown'
import { EvaluationHistory } from '@/components/EvaluationHistory'
import { Collapsible } from '@/components/Collapsible'
import { computeIndex } from '@/lib/breeding-index'
import { loadActiveBase } from '@/lib/index-base'
import { resolveProfile } from '@/lib/index-profiles'
import { percentileFromStored } from '@/lib/index-values'
import type { AccessRequest, Animal } from '@/payload-types'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'general', label: 'Общие данные' },
  { key: 'evaluation', label: 'Оценка' },
  { key: 'events', label: 'События' },
  { key: 'origin', label: 'Происхождение' },
  { key: 'documents', label: 'Документы' },
  { key: 'media', label: 'Фото/Видео' },
] as const

type TabKey = (typeof TABS)[number]['key']

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return { title: `Животное № ${id}` }
}

/** Имя связанной записи справочника. */
const relName = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const n = o.name ?? o.fullName ?? o.title
    if (typeof n === 'string' && n) return n
  }
  return '—'
}

/*
 * Что можно поправить на карточке и в каком блоке.
 *
 * Списки короткие намеренно. Правят руками паспорт и происхождение —
 * то, что переписывают со свидетельства. Оценки сюда не входят: у них своя
 * история (`animal_evaluations`), и правка «на глаз» в обход неё сделала бы
 * снимок и историю разными вещами. Владелец и уровень достоверности тоже
 * не правятся: первое — передача животного, второе — решение ассоциации.
 */
const IDENTITY_FIELDS = [
  'identNumber',
  'idFormat',
  'name',
  'kind',
  'sex',
  'state',
  'ageGroup',
  'birthDate',
  'breed',
  'bloodPercent',
  'coatColor',
  'bloodGroup',
  'purpose',
  'altIds.earTag',
  'altIds.internationalId',
] as const

const ORIGIN_FIELDS = [
  'category',
  'registrationBasis',
  'breedingClass',
  'line',
  'family',
  'inbreeding',
  'pedigreeText.fatherId',
  'pedigreeText.fatherName',
  'pedigreeText.motherId',
  'pedigreeText.motherName',
  'pedigreeText.fatherFatherId',
  'pedigreeText.motherFatherId',
] as const

const CARRIER_LABEL: Record<string, string> = {
  unknown: 'не тестировано',
  free: 'свободен',
  carrier: 'носитель',
}

/**
 * Достоверность самой оценки (шкала 1…5) — это не то же самое, что уровень
 * достоверности записи в шапке (шкала −1…3). Формулировки разведены намеренно,
 * чтобы их не путали.
 */
const ReliabilityNote = ({ value }: { value?: number | null }) => (
  <span className="inline-flex items-center gap-1.5 text-[13px] leading-none text-ink-500">
    Достоверность оценки:{' '}
    <span className="font-medium tabular-nums text-ink-900">{value ?? '—'}</span>
    <span>из 5</span>
    <InfoTip label="Что означает достоверность оценки">
      <p className="mb-2 font-medium text-ink-900">Достоверность оценки</p>
      <p>
        Насколько надёжен прогноз племенной ценности: зависит от числа учтённых потомков,
        лактаций и полноты родословной. 1 — оценка предварительная, 5 — подтверждена большим
        массивом данных. Не путайте с уровнем достоверности записи в шапке карточки: тот
        показывает, кем проверены сами данные.
      </p>
    </InfoTip>
  </span>
)

/** Таблица «Показатель | Прогноз | R,%» */
function MetricTable({
  head,
  rows,
}: {
  head: string[]
  rows: { label: string; unit?: string; forecast?: number | null; r?: number | null; digits?: number }[]
}) {
  return (
    <table className="metric-table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={i === 0 ? '' : 'text-right'} colSpan={i === 0 ? 2 : 1}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label + (r.unit ?? '')}>
            <td>{r.label}</td>
            <td className="w-14 text-ink-500">{r.unit ?? ''}</td>
            <td className="text-right tabular-nums">{nf(r.forecast, r.digits ?? 2)}</td>
            <td className="w-20 text-right tabular-nums">{nf(r.r, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default async function AnimalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab: tabParam } = await searchParams
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'evaluation'

  const user = await getCurrentUser()
  const viewer = viewerOf(user)
  const payload = await getClient()

  let animal: Animal | null = null
  try {
    animal = (await payload.findByID({
      collection: 'animals',
      id,
      depth: 2,
      overrideAccess: false,
      user,
    })) as Animal
  } catch {
    notFound()
  }
  if (!animal) notFound()

  const owner =
    typeof animal.owner === 'object' && animal.owner ? animal.owner.name : '—'

  const kindLabel = labelOf(ANIMAL_KINDS, animal.kind)
  const exteriorRaw = (animal.exterior ?? {}) as Record<string, number | null | undefined>

  // Животное «своё», если принадлежит организации пользователя. От этого
  // зависит, показывать ли навигацию кабинета и куда ведёт цепочка возврата.
  const userOrgId =
    typeof user?.organization === 'object' && user.organization
      ? user.organization.id
      : (user?.organization ?? null)
  const ownerId = typeof animal.owner === 'object' && animal.owner ? animal.owner.id : animal.owner
  const isMine = Boolean(user && userOrgId && ownerId && userOrgId === ownerId)

  /*
   * Списки для выпадающих полей правки грузятся только владельцу: постороннему
   * они ни к чему, а это четыре запроса к справочникам на каждое открытие
   * чужой карточки — а чужих открывают чаще своих.
   */
  const editChoices: Record<string, Choice[]> = {}
  if (isMine) {
    const dicts = [
      ['breed', 'breeds'],
      ['coatColor', 'coat-colors'],
      ['bloodGroup', 'blood-groups'],
      ['purpose', 'animal-purposes'],
      ['category', 'breeding-categories'],
      ['breedingClass', 'breeding-classes'],
      ['line', 'lines'],
      ['family', 'lines'],
    ] as const

    const loaded = await Promise.all(
      dicts.map(([, collection]) =>
        payload.find({
          collection: collection as never,
          limit: 300,
          sort: 'name',
          depth: 0,
          overrideAccess: true,
        }),
      ),
    )

    dicts.forEach(([path], i) => {
      editChoices[path] = (loaded[i]?.docs ?? []).map((d: Record<string, unknown>) => ({
        value: String(d.id),
        label: String(d.name ?? d.title ?? d.id),
      }))
    })
  }

  /*
   * Списки для форм событий — только на вкладке «События» и только владельцу.
   * Стада берутся его собственные: перемещение внутри хозяйства не должно
   * предлагать чужие площадки, а передача животного другому хозяйству —
   * не перемещение, а отдельная операция.
   */
  const eventChoices: Record<string, Choice[]> = {}
  if (isMine && tab === 'events') {
    const [herds, reasons, technicians] = await Promise.all([
      payload.find({
        collection: 'herds',
        where: { organization: { equals: userOrgId } },
        limit: 100,
        sort: 'name',
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'disposal-reasons',
        limit: 100,
        sort: 'name',
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'technicians',
        limit: 200,
        sort: 'fullName',
        depth: 0,
        overrideAccess: true,
      }),
    ])

    const asChoices = (docs: { id: number | string; name?: string; fullName?: string }[]) =>
      docs.map((d) => ({ value: String(d.id), label: String(d.name ?? d.fullName ?? d.id) }))

    eventChoices.herds = asChoices(herds.docs)
    eventChoices.disposalReasons = asChoices(reasons.docs)
    eventChoices.technicians = asChoices(technicians.docs)
  }

  /*
   * Не своё животное оформляется иначе — целиком.
   *
   * Зоотехник открывает карточки вперемешку: своих и чужих. Одинаковый вид
   * приводит к тому, что чужие данные принимают за свои и пытаются править.
   * Поэтому вся страница уходит в бледно-зелёный фон, а шапка с кличкой
   * и номером — на тёмную плашку: отличие видно раньше, чем прочитан
   * владелец.
   *
   * Гостю оформление нужно ровно так же. Раньше оно включалось только после
   * входа, и неавторизованный посетитель видел карточку в том же виде,
   * что фермер — свою собственную: страница выглядела как «моё животное»
   * у человека, у которого животных вообще нет.
   */
  const isForeign = !isMine

  /*
   * Формулировка зависит от того, знаем ли мы, кто смотрит.
   *
   * Вошедшему можно сказать «чужое хозяйство» — мы сравнили организации.
   * Гостю сказать нечего: он вполне может быть сотрудником этого самого
   * хозяйства. Поэтому ему сообщается не про принадлежность, а про режим
   * показа — владелец открыл эти данные публично.
   */
  const foreignNote = user
    ? {
        badge: 'Чужое хозяйство',
        text: `Это животное принадлежит ${owner} — данные доступны только для просмотра.`,
      }
    : {
        badge: 'Открытые данные',
        text: `Это животное принадлежит ${owner} — данные открыты для публичного просмотра владельцем.`,
      }

  /*
   * Закрытая карточка — отдельная страница, а не редирект на вход.
   *
   * Замок ставит владелец, и вход в систему его не снимает. Прежний редирект
   * на /login обещал обратное: человек вводил пароль и попадал на ту же
   * закрытую запись. Теперь страница объясняет, кто закрыл данные, и даёт
   * два выхода — запрос владельцу и похожие открытые животные.
   */
  /*
   * Что открыто этому посетителю точечно.
   *
   * Замок теперь снимается не только флажком `publicDetails`: у карточки
   * появилось третье состояние — открыта частично. Запись при этом отдаётся
   * (правило `animalRead` пропустило её по гранту), но половина вкладок
   * закрыта, и закрыты они по-разному от человека к человеку.
   *
   * Пустое множество означает «грантов нет» и ничего не меняет: страница
   * ведёт себя ровно как прежде.
   */
  const grants = await grantsFor(payload, userOrgId)
  const grantedScopes = scopesForAnimal(grants, animal.id as number, ownerId as number | null)

  const lockedByOwner = isAnimalLocked(animal, viewer)
  /** Раздел показывается: карточка открыта целиком либо область выдана грантом. */
  const maySee = (scope: AccessScope): boolean => !lockedByOwner || grantedScopes.has(scope)
  /** Карточка открылась только благодаря гранту, и открылась не вся. */
  const partial = lockedByOwner && grantedScopes.size > 0

  if (lockedByOwner && grantedScopes.size === 0) {
    const [request, similar] = await Promise.all([
      user
        ? payload
            .find({
              collection: 'access-requests',
              where: {
                and: [{ animal: { equals: animal.id } }, { requester: { equals: user.id } }],
              },
              sort: '-createdAt',
              limit: 1,
              depth: 0,
              overrideAccess: false,
              user,
            })
            .then((r) => (r.docs[0] as AccessRequest | undefined) ?? null)
            .catch(() => null)
        : Promise.resolve(null),
      payload
        .find({
          collection: 'animals',
          where: {
            and: [
              { publicDetails: { equals: true } },
              { id: { not_equals: animal.id } },
              ...(animal.sex ? [{ sex: { equals: animal.sex } }] : []),
              ...(animal.ageGroup ? [{ ageGroup: { equals: animal.ageGroup } }] : []),
            ],
          },
          sort: '-ipcRank',
          limit: 6,
          depth: 1,
          overrideAccess: false,
          user,
        })
        .then((r) => r.docs as Animal[])
        .catch(() => [] as Animal[]),
    ])

    // Ссылка «все похожие» повторяет те же условия в отборе книги, чтобы
    // список можно было продолжить, а не начинать поиск заново
    const params = new URLSearchParams()
    if (animal.sex) params.set('sex', animal.sex)
    if (animal.ageGroup) params.set('ageGroup', animal.ageGroup)

    return (
      <>
        <SiteHeader active="/" />

        {/* Тот же бледно-зелёный фон, что и у чужой карточки: это не своё
            животное, и страница не должна выглядеть как раздел кабинета */}
        <main className="container-page foreign-animal pb-8">
          <Breadcrumbs
            items={[
              { label: 'Племенная книга', href: '/' },
              { label: `№ ${animal.identNumber}` },
            ]}
          />

          <ClosedAnimal
            animal={animal}
            ownerName={owner}
            signedIn={Boolean(user)}
            request={request}
            similar={similar}
            similarHref={`/?${params.toString()}#results`}
          />
        </main>

        <SiteFooter />
      </>
    )
  }

  const readiness = tab === 'documents' ? await certificateReadiness(payload, animal) : null

  /*
   * Индекс считается по профилю смотрящего: хозяйство со своим набором весов
   * должно видеть карточку своими глазами. У гостя и у хозяйства без своего
   * профиля это стандартный профиль Ассоциации.
   *
   * Число считается здесь, а не берётся хранимым, потому что рядом показывается
   * разбор вклада признаков — а он живёт только в расчёте. Хранимое значение
   * даёт другое: место в группе сравнения, для которого нужна вся популяция.
   */
  const indexBlock =
    tab === 'evaluation'
      ? await (async () => {
          const [profile, base] = await Promise.all([
            resolveProfile(undefined, userOrgId ?? undefined),
            loadActiveBase(payload),
          ])
          const result = computeIndex(animal!, profile, base)
          const birthYear = animal!.birthDate ? new Date(animal!.birthDate).getFullYear() : null
          const percentile = await percentileFromStored(
            payload,
            profile.key,
            Math.round(result.value * 100) / 100,
            birthYear,
            animal!.id as number,
          )
          return { result, percentile }
        })()
      : null

  /*
   * Подробности гранта — только для показа и только на редком пути.
   *
   * Срок и охват в горячий загрузчик не попадают намеренно: он отвечает
   * на вопрос «что открыто», и лишние поля в нём платились бы на каждой
   * странице книги. Здесь же путь редкий — так ходят только те, кому
   * действительно что-то выдали, — и один запрос по индексу дешевле,
   * чем таскать эти поля везде.
   */
  const grantForBanner = partial
    ? await payload
        .find({
          collection: 'access-grants',
          where: {
            and: [
              { grantee: { equals: userOrgId } },
              { owner: { equals: ownerId } },
              { revokedAt: { exists: false } },
              { or: [{ animal: { equals: animal.id } }, { animal: { exists: false } }] },
            ],
          },
          sort: '-createdAt',
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        .then((r) => r.docs[0] ?? null)
        .catch(() => null)
    : null

  const crumbs = isMine
    ? [
        { label: 'Личный кабинет', href: '/account' },
        { label: 'Мои животные', href: '/account?tab=animals' },
        { label: animal.name ?? String(animal.identNumber) },
      ]
    : [
        { label: 'Племенная книга', href: '/' },
        { label: animal.name ?? String(animal.identNumber) },
      ]

  return (
    <>
      <SiteHeader active="/" />

      <main className={`container-page pb-8 ${isForeign ? 'foreign-animal' : ''}`}>
        {isMine && <AccountNav active="animals" />}

        {isForeign && (
          <p className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-white px-5 py-3.5 text-[15px] text-ink-900 shadow-[0_1px_3px_rgb(23_24_26_/_0.08)]">
            <span className="rounded-md bg-forest-500 px-2 py-0.5 text-[13px] font-medium text-white">
              {foreignNote.badge}
            </span>
            {foreignNote.text}
          </p>
        )}

        {partial && (
          <GrantBanner
            ownerName={owner}
            scopes={[...grantedScopes]}
            expiresAt={grantForBanner?.expiresAt ?? null}
            wholeHerd={!grantForBanner?.animal}
          />
        )}

        <div>
          <div className="min-w-0">
        <Breadcrumbs items={crumbs} />

        {/* ------------------------------ Шапка ------------------------------ */}
        <section
          className={`flex flex-wrap items-start justify-between gap-x-10 gap-y-6 ${
            isForeign ? 'rounded-card bg-forest-500 p-7 text-white sm:p-8' : ''
          }`}
        >
          <div className="min-w-0">
            <div className="min-w-0">
              <p
                className={`text-[12px] uppercase tracking-[0.09em] ${
                  isForeign ? 'text-white/70' : 'text-ink-500'
                }`}
              >
                Кличка
              </p>

              <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-[30px] font-medium leading-[1.08] sm:text-[36px]">
                <span className="break-words">{animal.name ?? '—'}</span>
                <span
                  className={`rounded-md px-2.5 py-1 text-[13px] font-normal leading-none ${
                    isForeign ? 'bg-white/20 text-white' : 'bg-[#eeeeee] text-ink-700'
                  }`}
                >
                  {kindLabel}
                </span>
              </h1>

              <p className="mt-3 text-[17px] leading-none">
                <span className={isForeign ? 'text-white/70' : 'text-ink-500'}>Инд. №</span>{' '}
                <span className="font-medium tabular-nums">{animal.identNumber}</span>
              </p>

              <p
                className={`mt-2 text-[15px] leading-snug ${
                  isForeign ? 'text-white/90' : 'text-ink-700'
                }`}
              >
                <span className={isForeign ? 'text-white/70' : 'text-ink-500'}>Владелец:</span>{' '}
                {/* Ссылка ведёт в книгу с отбором по этому хозяйству —
                    «а что ещё у них есть» самый частый следующий вопрос */}
                {owner === '—' ? (
                  owner
                ) : (
                  <Link
                    href={`/?owner=${encodeURIComponent(owner)}#results`}
                    className={`underline underline-offset-4 ${
                      isForeign ? 'hover:text-white' : 'hover:text-forest-500'
                    }`}
                    title={`Показать животных хозяйства «${owner}»`}
                  >
                    {owner}
                  </Link>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2.5 lg:items-end">
            <p className={`text-[13px] ${isForeign ? 'text-white/70' : 'text-ink-500'}`}>
              Обновлено {dateRu(animal.updatedAt)}
            </p>
            <TrustBadge level={animal.trustLevel} onDark={isForeign} />
          </div>
        </section>

        {/* ------------------------------ Вкладки ---------------------------- */}
        <p className="mb-3 mt-8 text-[12px] uppercase tracking-[0.09em] text-ink-500">
          Разделы карточки
        </p>
        <nav aria-label="Разделы карточки животного" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/animals/${id}?tab=${t.key}`}
              className={`tab ${tab === t.key ? 'tab-active' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/* ------------------------------ Оценка ----------------------------- */}
        {/* Закрытая область показывает плашку, а не прочерки: прочерк читается
            как «данных нет», и человек уходит искать животное в другом месте */}
        {tab === 'evaluation' && !maySee('evaluation') && (
          <ScopeLocked scope="evaluation" ownerName={owner} canAsk={Boolean(user)} />
        )}
        {tab === 'events' && !maySee('production') && (
          <ScopeLocked scope="production" ownerName={owner} canAsk={Boolean(user)} />
        )}
        {tab === 'origin' && !maySee('origin') && (
          <ScopeLocked scope="origin" ownerName={owner} canAsk={Boolean(user)} />
        )}
        {tab === 'documents' && !maySee('documents') && (
          <ScopeLocked scope="documents" ownerName={owner} canAsk={Boolean(user)} />
        )}

        {tab === 'evaluation' && maySee('evaluation') && (
          <>
            {indexBlock && (
              <section className="mt-8">
                <IndexBreakdown
                  result={indexBlock.result}
                  percentile={indexBlock.percentile}
                  href={isMine ? '/account/indices' : undefined}
                />
              </section>
            )}

            {/*
               Граница между расчётом и первоисточником проведена явно.
               Выше — то, что система посчитала сама и умеет разложить
               на слагаемые. Ниже — то, что пришло извне: из документов,
               выгрузок и протоколов оценки. Смешивать их в один поток
               карточек значило бы уравнять «мы посчитали» и «нам прислали».
            */}
            {/*
               История оценок стоит между расчётом и документами намеренно.
               Она про то же число, что и блок выше, но во времени: сегодняшняя
               оценка без ряда предыдущих не даёт понять, устоялась она
               или ещё ползёт. Блок сам себя прячет, когда истории нет.
            */}
            <section className="mt-8">
              <EvaluationHistory animalId={animal.id} />
            </section>

            <h2 className="section-title mt-10">Данные из документов</h2>
            <p className="-mt-2 mb-6 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
              Оценки по признакам, экстерьер и лактации привезены вместе с животным. Индекс выше
              считается из них.
            </p>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <Collapsible
                  title="Оценка расчётного центра"
                  note="Привезена вместе с данными о животном. Индекс выше система считает сама — числа не совпадают, потому что это разные оценки на разных базах."
                  defaultOpen
                >
                  <table className="metric-table">
                    <thead>
                      <tr>
                        <th>Индекс</th>
                        <th className="text-right">Прогноз</th>
                        <th className="text-right">R, %</th>
                        <th className="text-right">Процентиль</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>ИПЦ</td>
                        <td className="text-right tabular-nums">
                          {signed(animal.ipcDetails?.forecast ?? animal.ipc)}
                        </td>
                        <td className="text-right tabular-nums">{nf(animal.ipcDetails?.r, 1)}</td>
                        <td className="text-right tabular-nums">
                          {nf(animal.ipcDetails?.percentile, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Collapsible>

                <Collapsible
                  title="Продуктивные признаки"
                  aside={<ReliabilityNote value={animal.production?.reliabilityLevel} />}
                  defaultOpen
                >
                  <MetricTable
                    head={['Селекционный признак', 'Прогноз', 'R, %']}
                    rows={PRODUCTION_TRAITS.map((t) => {
                      const v = (animal!.production as Record<string, { forecast?: number | null; r?: number | null }> | undefined)?.[t.key]
                      return {
                        label: t.label,
                        unit: t.unit,
                        forecast: v?.forecast,
                        r: v?.r,
                        digits: t.unit === 'кг' || t.unit === '' ? 1 : 2,
                      }
                    })}
                  />
                </Collapsible>

                <Collapsible title="Воспроизводительные качества" defaultOpen>
                  <MetricTable
                    head={['Индексы', 'Прогноз', 'R, %']}
                    rows={[
                      {
                        label: 'Фертильность',
                        unit: 'балл',
                        forecast: animal.reproduction?.fertility?.forecast,
                        r: animal.reproduction?.fertility?.r,
                        digits: 1,
                      },
                    ]}
                  />
                </Collapsible>

                <Collapsible
                  title="Признаки здоровья животного"
                  aside={<ReliabilityNote value={animal.health?.reliabilityLevel} />}
                  defaultOpen
                >
                  <MetricTable
                    head={['Индексы', 'Прогноз', 'R, %']}
                    rows={HEALTH_TRAITS.map((t) => {
                      const v = (animal!.health as Record<string, { forecast?: number | null; r?: number | null }> | undefined)?.[t.key]
                      return { label: t.label, unit: t.unit, forecast: v?.forecast, r: v?.r, digits: 1 }
                    })}
                  />
                </Collapsible>
              </div>

              <Collapsible title="Экстерьер" note="Двадцать линейных признаков и три композита" defaultOpen>
                <ExteriorChart
                  traits={EXTERIOR_TRAITS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    value: exteriorRaw[t.key],
                  }))}
                  composites={EXTERIOR_COMPOSITES.map((t) => ({
                    key: t.key,
                    label: t.label,
                    value: exteriorRaw[t.key],
                  }))}
                />
              </Collapsible>
            </section>

            {/* ----------------------------- Фенотип ---------------------------- */}
            <section className="mt-6">
              <Collapsible
                title="Фенотип по лактациям"
                note="Фактические показатели, а не оценки: что животное дало в каждую лактацию"
                defaultOpen
              >
                <div className="overflow-x-auto">
                  <table className="metric-table min-w-[900px]">
                    <thead>
                      <tr>
                        <th>№ л</th>
                        <th>Дата отёла</th>
                        <th>Дата осем.</th>
                        <th>Серв-бык</th>
                        <th>ДД</th>
                        <th>У л</th>
                        <th>У_305</th>
                        <th>Ж 305,%</th>
                        <th>Б 305,%</th>
                        <th>КСК</th>
                        <th>Запуск</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(animal.lactations ?? []).length === 0 && (
                        <tr>
                          <td colSpan={11} className="py-8 text-center text-ink-500">
                            Данные о лактациях отсутствуют
                          </td>
                        </tr>
                      )}
                      {(animal.lactations ?? []).map((l, i) => (
                        <tr key={l.id ?? i}>
                          <td>{l.number ?? '—'}</td>
                          <td>{dateRu(l.calvingDate)}</td>
                          <td>{dateRu(l.inseminationDate)}</td>
                          <td>{l.serviceBull ?? '—'}</td>
                          <td className="tabular-nums">{l.dd ?? '—'}</td>
                          <td className="tabular-nums">{l.milkYield ?? '—'}</td>
                          <td className="tabular-nums">{l.milk305 ?? '—'}</td>
                          <td className="tabular-nums">{nf(l.fat305, 2)}</td>
                          <td className="tabular-nums">{nf(l.protein305, 2)}</td>
                          <td className="tabular-nums">{l.scc ?? '—'}</td>
                          <td>{dateRu(l.dryOffDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Collapsible>
            </section>
          </>
        )}

        {/* --------------------------- Общие данные -------------------------- */}
        {tab === 'general' && (
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AnimalPassport animal={animal} />

            {/*
               Идентификация — единственный блок карточки, который правят
               руками чаще прочего: сюда переписывают со свидетельства.
               Поэтому он умеет превращаться в форму на месте, а не уводит
               на отдельную страницу правки. Владельцу видна ссылка
               «Править», остальным блок выглядит как обычная сводка.
            */}
            <AnimalEditBlock
              animalId={animal.id as number}
              title="Идентификация"
              canEdit={isMine}
              values={blockValues(animal, IDENTITY_FIELDS, editChoices)}
              note="Индивидуальный номер меняйте только если в нём ошибка: по нему животное узнают другие системы и бумажные документы."
              extras={[
                { label: 'Чип RFID', value: animal.altIds?.chipNumber || '' },
                { label: 'Номер в ГПК', value: animal.altIds?.gpkNumber || '' },
                { label: 'GUID (ФГИАС ПР)', value: animal.uuid || '' },
              ]}
            />

            <div>
              <LactationDynamics animal={animal} />
              {animal.notes && (
                <p className="mt-4 text-sm leading-relaxed text-ink-700">{animal.notes}</p>
              )}
            </div>

            <div className="card lg:col-span-2">
              <h2 className="panel-heading">Генетика</h2>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                <dl className="divide-y divide-[#ededed] text-sm">
                  {[
                    ['CVM', CARRIER_LABEL[animal.genetics?.cvm ?? 'unknown']],
                    ['BLAD', CARRIER_LABEL[animal.genetics?.blad ?? 'unknown']],
                    ['DUMPS', CARRIER_LABEL[animal.genetics?.dumps ?? 'unknown']],
                    ['Каппа-казеин', animal.genetics?.kappaCasein || '—'],
                    ['Бета-казеин', animal.genetics?.betaCasein || '—'],
                    ['Бета-лактоглобулин', animal.genetics?.betaLactoglobulin || '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between gap-6 py-2.5">
                      <dt className="text-ink-500">{k}</dt>
                      <dd className="text-right">{v as string}</dd>
                    </div>
                  ))}
                </dl>

                <div>
                  <h3 className="mb-2 text-[15px] font-medium text-forest-500">Гаплотипы</h3>
                  {(animal.haplotypes ?? []).length === 0 ? (
                    <p className="text-sm text-ink-500">Не определялись</p>
                  ) : (
                    <ul className="text-sm">
                      {(animal.haplotypes ?? []).map((h, i) => (
                        <li
                          key={h.id ?? i}
                          className="flex justify-between gap-6 border-b border-[#ededed] py-2 last:border-0"
                        >
                          <span>{relName(h.type)}</span>
                          <span className="text-ink-700">{CARRIER_LABEL[h.status ?? 'unknown']}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-[15px] font-medium text-forest-500">ДНК-тесты</h3>
                  {(animal.dnaTests ?? []).length === 0 ? (
                    <p className="text-sm text-ink-500">Не проводились</p>
                  ) : (
                    <ul className="text-sm">
                      {(animal.dnaTests ?? []).map((t, i) => (
                        <li key={t.id ?? i} className="border-b border-[#ededed] py-2 last:border-0">
                          <div className="flex justify-between gap-6">
                            <span>{relName(t.type)}</span>
                            <span className="text-ink-500">{dateRu(t.date)}</span>
                          </div>
                          {t.result && <p className="mt-1 text-ink-700">{t.result}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------ События ---------------------------- */}
        {tab === 'events' && maySee('production') && (
          <>
            <AnimalEventsTab animal={animal} />

            <section className="mt-8 grid grid-cols-1 gap-6">
              {isMine && (
                <AnimalEventForms
                  animalId={animal.id as number}
                  herds={eventChoices.herds ?? []}
                  disposalReasons={eventChoices.disposalReasons ?? []}
                  technicians={eventChoices.technicians ?? []}
                />
              )}
              <AnimalRevisionsPanel animalId={animal.id as number} />
            </section>
          </>
        )}

        {/* -------------------------- Происхождение -------------------------- */}
        {tab === 'origin' && maySee('origin') && (
          <>
            <AnimalOriginTab animal={animal} />

            {/*
               Блок правки стоит под родословной, а не над ней: сначала
               смотрят, что уже известно, и только потом дописывают. Отец
               и мать здесь записываются так, как стоят в свидетельстве, —
               связь с карточками этих животных устанавливается отдельно
               и по номеру, а не выбором из списка: быков в книге тысячи.
            */}
            <section className="mt-8 grid grid-cols-1 gap-6">
              <AnimalEditBlock
                animalId={animal.id as number}
                title="Происхождение по документам"
                canEdit={isMine}
                values={blockValues(animal, ORIGIN_FIELDS, editChoices)}
                note="Записывайте так, как стоит в свидетельстве. Если карточки родителей появятся в книге позже, связь установится по номеру — переписывать не придётся."
              />
            </section>
          </>
        )}

        {/* ---------------------------- Документы ---------------------------- */}
        {tab === 'documents' && maySee('documents') && (
          <>
            {readiness && (
              <CertificateSection
                animalId={animal.id}
                zootechnical={readiness.zootechnical}
                pedigree={readiness.pedigree}
              />
            )}
            <DocumentsTab animalId={animal.id} />
          </>
        )}

        {/* ---------------------------- Фото/Видео --------------------------- */}
        {tab === 'media' && (
          <section className="mt-8">
            <div className="card">
              <h2 className="panel-heading">Фото и видео</h2>
              {typeof animal.photo === 'object' && animal.photo?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={animal.photo.url}
                  alt={animal.photo.alt ?? animal.identNumber}
                  className="max-w-md rounded-xl"
                />
              ) : (
                <p className="text-sm text-ink-500">
                  Материалы не загружены. Добавить их можно в{' '}
                  <Link href="/admin" className="underline underline-offset-2">
                    административной панели
                  </Link>
                  .
                </p>
              )}
            </div>
          </section>
        )}
        {/* Форма запроса живёт внизу страницы, а не на каждой закрытой
            вкладке: плашки на неё только ссылаются якорем. Иначе одна и та же
            форма рисовалась бы четырежды и вела бы четыре разных состояния */}
        {partial && user && (
          <div id="request" className="mt-10 scroll-mt-8">
            <AccessRequestForm animalId={animal.id as number} ownerName={owner} />
          </div>
        )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

async function DocumentsTab({ animalId }: { animalId: number | string }) {
  const payload = await getClient()
  const docs = await payload.find({
    collection: 'documents',
    where: { animal: { equals: animalId } },
    limit: 50,
    sort: '-issuedAt',
    overrideAccess: true,
  })

  return (
    <section className="mt-8">
      <div className="card overflow-x-auto">
        <h2 className="panel-heading">Документы</h2>
        <table className="metric-table min-w-[640px]">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Номер</th>
              <th>Название</th>
            </tr>
          </thead>
          <tbody>
            {docs.docs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-ink-500">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
