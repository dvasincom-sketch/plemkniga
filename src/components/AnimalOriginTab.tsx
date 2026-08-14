import Link from 'next/link'
import { getClient } from '@/lib/payload'
import { buildPedigree, wrightInbreeding } from '@/lib/pedigree'
import { PedigreeTree } from './PedigreeTree'
import { dateRu, nf } from '@/lib/format'
import { TRUST_LEVELS, trustLabel } from '@/lib/dictionaries'
import { INBREEDING_MANUAL_APPROVAL, INBREEDING_WARNING } from '@/lib/animal-id'
import type { Animal } from '@/payload-types'

const relName = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const n = o.name ?? o.fullName
    if (typeof n === 'string' && n) return n
  }
  return '—'
}

function TrustBadge({ level }: { level?: number | null }) {
  const value = level ?? 0
  const hint = TRUST_LEVELS.find((t) => t.value === String(value))?.hint ?? ''
  return (
    <span className="flex items-center gap-2 text-[15px] text-ink-700">
      Уровень достоверности данных: <span className="font-medium text-ink-900">{value}</span>
      <span
        title={`${trustLabel(value)} — ${hint}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white"
      >
        i
      </span>
    </span>
  )
}

export async function AnimalOriginTab({ animal }: { animal: Animal }) {
  const payload = await getClient()

  const [roots, computedCoi] = await Promise.all([
    buildPedigree(payload, animal, 3),
    wrightInbreeding(payload, animal, 5),
  ])

  // Источники данных: откуда в системе появились сведения об этом животном
  const [submissions, documents] = await Promise.all([
    payload.find({
      collection: 'data-submissions',
      where: {
        and: [
          { organization: { equals: typeof animal.owner === 'object' ? animal.owner?.id : animal.owner } },
          { status: { in: ['checked', 'accepted'] } },
        ],
      },
      sort: '-submittedAt',
      limit: 5,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'documents',
      where: { animal: { equals: animal.id } },
      sort: '-issuedAt',
      limit: 5,
      depth: 1,
      overrideAccess: true,
    }),
  ])

  const dnaTests = animal.dnaTests ?? []
  // Если родители связаны карточками — показываем расчёт по древу,
  // иначе берём значение, пришедшее из импорта.
  const hasLinkedParents = Boolean(animal.father && animal.mother)
  const coi = hasLinkedParents
    ? computedCoi
    : typeof animal.inbreeding === 'number'
      ? animal.inbreeding
      : null

  const sources: { title: string; detail: string; date?: string | null }[] = [
    ...dnaTests.map((t) => ({
      title: relName(t.type) === '—' ? 'ДНК-исследование' : relName(t.type),
      detail: `Лаборатория: ${relName(t.laboratory)}`,
      date: t.date,
    })),
    ...submissions.docs.map((s) => ({
      title: `Пакет загрузки № ${s.number}`,
      detail: `Организация: ${relName(s.organization)}`,
      date: s.submittedAt,
    })),
    ...documents.docs.map((d) => ({
      title: d.title,
      detail: d.number ? `Документ № ${d.number}` : 'Документ',
      date: d.issuedAt,
    })),
  ]

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <h2 className="section-title">Генеалогическое древо</h2>
        <TrustBadge level={animal.trustLevel} />
      </div>

      <section className="mt-6">
        <PedigreeTree roots={roots} coi={coi} />
      </section>

      {typeof coi === 'number' && coi > INBREEDING_WARNING && (
        <p className="mt-4 rounded-xl bg-amber-50 px-5 py-4 text-sm text-amber-900">
          {coi > INBREEDING_MANUAL_APPROVAL
            ? `Коэффициент инбридинга ${nf(coi, 2)}% превышает порог ${INBREEDING_MANUAL_APPROVAL}% — запись требует ручного подтверждения Ассоциацией.`
            : `Коэффициент инбридинга ${nf(coi, 2)}% выше рекомендованного порога ${INBREEDING_WARNING}%.`}
        </p>
      )}

      <section className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="section-title mb-6">Источник данных</h2>
          <div className="card">
            {sources.length === 0 ? (
              <p className="text-sm text-ink-500">
                Подтверждающие источники не зарегистрированы. Данные внесены вручную и имеют
                статус «{trustLabel(animal.trustLevel)}».
              </p>
            ) : (
              <ul className="text-sm">
                {sources.map((s, i) => (
                  <li
                    key={`${s.title}-${i}`}
                    className="flex items-start justify-between gap-6 border-b border-[#ededed] py-3 last:border-0"
                  >
                    <span>
                      <span className="block text-ink-900">{s.title}</span>
                      <span className="block text-ink-500">{s.detail}</span>
                    </span>
                    <span className="flex-none text-ink-500">{dateRu(s.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <h2 className="section-title mb-6">Племучёт</h2>
          <div className="card">
            <dl className="divide-y divide-[#ededed] text-sm">
              {[
                ['Категория племучёта', relName(animal.category)],
                [
                  'Основание регистрации',
                  animal.registrationBasis === 'productivity'
                    ? 'По продуктивности (категория II)'
                    : 'По происхождению (категория I)',
                ],
                ['Класс племенной ценности', relName(animal.breedingClass)],
                ['Линия', relName(animal.line)],
                ['Семейство', relName(animal.family)],
                ['Порода', relName(animal.breed)],
                ['Кровность по голштину, %', animal.bloodPercent ?? '—'],
                ['Статус данных', trustLabel(animal.trustLevel)],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-6 py-2.5">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="text-right">{v as string}</dd>
                </div>
              ))}
            </dl>

            {(animal.haplotypes ?? []).length + (animal.dnaTests ?? []).length > 0 && (
              <p className="mt-5 text-sm text-ink-700">
                Происхождение подтверждено генетическими исследованиями — подробности на вкладке{' '}
                <Link href="?tab=general" className="underline underline-offset-2">
                  «Общие данные»
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
