import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
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
import { CertificateSection } from '@/components/CertificateSection'
import { certificateReadiness } from '@/lib/certification'
import { getClient, getCurrentUser } from '@/lib/payload'
import {
  AGE_GROUPS,
  ANIMAL_KINDS,
  DOCUMENT_TYPES,
  EXTERIOR_COMPOSITES,
  EXTERIOR_TRAITS,
  HEALTH_TRAITS,
  ID_FORMATS,
  PRODUCTION_TRAITS,
  SEXES,
  STATES,
  labelOf,
} from '@/lib/dictionaries'
import { dateRu, nf, signed } from '@/lib/format'
import type { Animal } from '@/payload-types'

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
  if (!user && !animal.publicDetails) redirect('/login')

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

  const readiness = tab === 'documents' ? await certificateReadiness(payload, animal) : null

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

      <main className="container-page pb-4">
        {isMine && <AccountNav active="animals" />}

        <div>
          <div className="min-w-0">
        <Breadcrumbs items={crumbs} />

        {/* ------------------------------ Шапка ------------------------------ */}
        <section className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          <div className="min-w-0">
            <div className="min-w-0">
              <p className="text-[12px] uppercase tracking-[0.09em] text-ink-500">Кличка</p>

              <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-[30px] font-medium leading-[1.08] sm:text-[36px]">
                <span className="break-words">{animal.name ?? '—'}</span>
                <span className="rounded-md bg-[#eeeeee] px-2.5 py-1 text-[13px] font-normal leading-none text-ink-700">
                  {kindLabel}
                </span>
              </h1>

              <p className="mt-3 text-[17px] leading-none">
                <span className="text-ink-500">Инд. №</span>{' '}
                <span className="font-medium tabular-nums">{animal.identNumber}</span>
              </p>

              <p className="mt-2 text-[15px] leading-snug text-ink-700">
                <span className="text-ink-500">Владелец:</span> {owner}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2.5 lg:items-end">
            <p className="text-[13px] text-ink-500">Обновлено {dateRu(animal.updatedAt)}</p>
            <TrustBadge level={animal.trustLevel} />
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
        {tab === 'evaluation' && (
          <>
            <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <div className="card">
                  <h2 className="panel-heading">Общий индекс племенной ценности</h2>
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
                </div>

                <div className="card">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="panel-heading mb-0">Продуктивные признаки</h2>
                    <ReliabilityNote value={animal.production?.reliabilityLevel} />
                  </div>
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
                </div>

                <div className="card">
                  <h2 className="panel-heading">Воспроизводительные качества</h2>
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
                </div>

                <div className="card">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="panel-heading mb-0">Признаки здоровья животного</h2>
                    <ReliabilityNote value={animal.health?.reliabilityLevel} />
                  </div>
                  <MetricTable
                    head={['Индексы', 'Прогноз', 'R, %']}
                    rows={HEALTH_TRAITS.map((t) => {
                      const v = (animal!.health as Record<string, { forecast?: number | null; r?: number | null }> | undefined)?.[t.key]
                      return { label: t.label, unit: t.unit, forecast: v?.forecast, r: v?.r, digits: 1 }
                    })}
                  />
                </div>
              </div>

              <div className="card">
                <h2 className="panel-heading">Экстерьер</h2>
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
              </div>
            </section>

            {/* ----------------------------- Фенотип ---------------------------- */}
            <section className="mt-6">
              <div className="card">
                <h2 className="panel-heading">Фенотип:</h2>
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
              </div>
            </section>
          </>
        )}

        {/* --------------------------- Общие данные -------------------------- */}
        {tab === 'general' && (
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="panel-heading">Идентификация</h2>
              <dl className="divide-y divide-[#ededed] text-sm">
                {[
                  ['Индивидуальный №', animal.identNumber],
                  ['Формат ID', labelOf(ID_FORMATS, animal.idFormat)],
                  ['Кличка', animal.name ?? '—'],
                  ['Тип животного', kindLabel],
                  ['Пол', SEXES.find((s) => s.value === animal!.sex)?.full ?? '—'],
                  ['Состояние', STATES.find((s) => s.value === animal!.state)?.full ?? '—'],
                  ['Возрастная группа', labelOf(AGE_GROUPS, animal.ageGroup)],
                  ['Дата рождения', dateRu(animal.birthDate)],
                  ['Порода', relName(animal.breed)],
                  ['Кровность по голштину, %', animal.bloodPercent ?? '—'],
                  ['Масть', relName(animal.coatColor)],
                  ['Группа крови', relName(animal.bloodGroup)],
                  ['Назначение', relName(animal.purpose)],
                  ['Ушная бирка', animal.altIds?.earTag || '—'],
                  ['Чип RFID', animal.altIds?.chipNumber || '—'],
                  ['Номер в ГПК', animal.altIds?.gpkNumber || '—'],
                  ['Международный ID', animal.altIds?.internationalId || '—'],
                  ['GUID (ФГИАС ПР)', animal.uuid || '—'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-6 py-2.5">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="text-right">{v as string}</dd>
                  </div>
                ))}
              </dl>
            </div>

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
        {tab === 'events' && <AnimalEventsTab animal={animal} />}

        {/* -------------------------- Происхождение -------------------------- */}
        {tab === 'origin' && <AnimalOriginTab animal={animal} />}

        {/* ---------------------------- Документы ---------------------------- */}
        {tab === 'documents' && (
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
