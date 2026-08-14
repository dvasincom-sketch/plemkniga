import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { ExteriorChart } from '@/components/ExteriorChart'
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

const InfoIcon = () => (
  <span
    title="Уровень достоверности оценки: 1 — низкий, 5 — высокий"
    className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white"
  >
    i
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

  return (
    <>
      <SiteHeader active="/" />

      <main className="container-page pb-4">
        {/* ------------------------------ Шапка ------------------------------ */}
        <section className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-6">
            <div className="flex h-[92px] w-[92px] flex-none items-center justify-center overflow-hidden rounded-2xl bg-[#e9e9e9]">
              <svg width="70" height="60" viewBox="0 0 70 60" fill="none" aria-hidden="true">
                <ellipse cx="35" cy="34" rx="24" ry="22" fill="#fff" />
                <ellipse cx="10" cy="26" rx="10" ry="6" fill="#c9c9c9" transform="rotate(-20 10 26)" />
                <ellipse cx="60" cy="26" rx="10" ry="6" fill="#c9c9c9" transform="rotate(20 60 26)" />
                <ellipse cx="27" cy="30" rx="3.4" ry="4.2" fill="#8d8d8d" />
                <ellipse cx="43" cy="30" rx="3.4" ry="4.2" fill="#8d8d8d" />
                <ellipse cx="35" cy="46" rx="13" ry="9" fill="#dcdcdc" />
              </svg>
            </div>

            <div>
              <h1 className="flex flex-wrap items-center gap-3 text-[26px] font-medium sm:text-[30px]">
                <span>Кличка: {animal.name ?? '—'}</span>
                <span className="rounded-md bg-[#eeeeee] px-2.5 py-1 text-[13px] font-normal text-ink-700">
                  {kindLabel}
                </span>
              </h1>
              <p className="mt-1 text-[26px] font-medium sm:text-[30px]">
                Инд. №: {animal.identNumber}
              </p>
              <p className="mt-2 text-[15px] text-ink-700">Владелец: {owner}</p>
            </div>
          </div>

          <p className="text-sm text-ink-700">Обновлено: {dateRu(animal.updatedAt)}</p>
        </section>

        {/* ------------------------------ Вкладки ---------------------------- */}
        <nav className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
                    <span className="text-[13px] text-ink-700">
                      Уровень достоверности: {animal.production?.reliabilityLevel ?? '—'}
                      <InfoIcon />
                    </span>
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
                    <span className="text-[13px] text-ink-700">
                      Уровень достоверности: {animal.health?.reliabilityLevel ?? '—'}
                      <InfoIcon />
                    </span>
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
                  ['Порода', animal.breed ?? '—'],
                  ['Кровность по голштину, %', animal.bloodPercent ?? '—'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-6 py-2.5">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="text-right">{v as string}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card">
              <h2 className="panel-heading">Продуктивность (последняя лактация)</h2>
              <dl className="divide-y divide-[#ededed] text-sm">
                {[
                  ['Удой, л', nf(animal.summary?.milkYield)],
                  ['Жир, %', nf(animal.summary?.fatPercent, 2)],
                  ['Белок, %', nf(animal.summary?.proteinPercent, 2)],
                  ['Жир, кг', nf(animal.summary?.fatKg)],
                  ['Белок, кг', nf(animal.summary?.proteinKg)],
                  ['СБП, кг', nf(animal.summary?.fatProteinSum)],
                  ['ИПЦ', signed(animal.ipc)],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between gap-6 py-2.5">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="text-right tabular-nums">{v as string}</dd>
                  </div>
                ))}
              </dl>
              {animal.notes && <p className="mt-5 text-sm text-ink-700">{animal.notes}</p>}
            </div>
          </section>
        )}

        {/* -------------------------- Происхождение -------------------------- */}
        {tab === 'origin' && (
          <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card">
              <h2 className="panel-heading">Родители</h2>
              <dl className="divide-y divide-[#ededed] text-sm">
                <div className="flex justify-between gap-6 py-2.5">
                  <dt className="text-ink-500">Отец</dt>
                  <dd className="text-right">
                    {typeof animal.father === 'object' && animal.father ? (
                      <Link href={`/animals/${animal.father.id}`} className="underline underline-offset-2">
                        {animal.father.identNumber} {animal.father.name ?? ''}
                      </Link>
                    ) : (
                      [animal.pedigreeText?.fatherId, animal.pedigreeText?.fatherName]
                        .filter(Boolean)
                        .join(' ') || '—'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-6 py-2.5">
                  <dt className="text-ink-500">Мать</dt>
                  <dd className="text-right">
                    {typeof animal.mother === 'object' && animal.mother ? (
                      <Link href={`/animals/${animal.mother.id}`} className="underline underline-offset-2">
                        {animal.mother.identNumber} {animal.mother.name ?? ''}
                      </Link>
                    ) : (
                      [animal.pedigreeText?.motherId, animal.pedigreeText?.motherName]
                        .filter(Boolean)
                        .join(' ') || '—'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-6 py-2.5">
                  <dt className="text-ink-500">Отец отца</dt>
                  <dd className="text-right">{animal.pedigreeText?.fatherFatherId || '—'}</dd>
                </div>
                <div className="flex justify-between gap-6 py-2.5">
                  <dt className="text-ink-500">Отец матери</dt>
                  <dd className="text-right">{animal.pedigreeText?.motherFatherId || '—'}</dd>
                </div>
                <div className="flex justify-between gap-6 py-2.5">
                  <dt className="text-ink-500">Коэффициент инбридинга, %</dt>
                  <dd className="text-right tabular-nums">{nf(animal.inbreeding, 2)}</dd>
                </div>
              </dl>
            </div>

            <div className="card">
              <h2 className="panel-heading">Родословная</h2>
              <div className="grid grid-cols-3 gap-3 text-[13px]">
                <div className="flex items-center rounded-lg bg-canvas p-3">
                  {animal.identNumber}
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg bg-canvas p-3">
                    О: {typeof animal.father === 'object' && animal.father
                      ? animal.father.identNumber
                      : animal.pedigreeText?.fatherId || '—'}
                  </div>
                  <div className="rounded-lg bg-canvas p-3">
                    М: {typeof animal.mother === 'object' && animal.mother
                      ? animal.mother.identNumber
                      : animal.pedigreeText?.motherId || '—'}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg bg-canvas p-3">
                    ОО: {animal.pedigreeText?.fatherFatherId || '—'}
                  </div>
                  <div className="rounded-lg bg-canvas p-3">
                    ОМ: {animal.pedigreeText?.motherFatherId || '—'}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------- Документы ---------------------------- */}
        {tab === 'documents' && <DocumentsTab animalId={animal.id} />}

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
