import type { Metadata } from 'next'
import Link from 'next/link'
import type { Where } from 'payload'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { IssueDocument, RevokeDocument } from '@/components/DocumentIssue'
import { StaleSchemaNotice } from '@/components/StaleSchemaNotice'
import { getClient } from '@/lib/payload'
import { isStaleSchemaError, requireAssociation } from '@/lib/association'
import { DOCUMENT_TYPES, labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import type { Document } from '@/payload-types'

export const metadata: Metadata = { title: 'Документы' }
export const dynamic = 'force-dynamic'

/**
 * Выпуск документов и журнал выдачи.
 *
 * Журнал важнее формы выпуска, хотя стоит ниже её. Выпуск — действие
 * на минуту; журнал — ответ на вопрос «кто выдал это свидетельство»,
 * который задают через год, в споре, и от которого зависит, чего стоит
 * бумага на руках.
 *
 * Поэтому здесь только выданное Ассоциацией: документы, которые хозяйство
 * загрузило само — ветеринарные справки, договоры, — лежат у него в кабинете
 * и к подписи Ассоциации отношения не имеют.
 */

const identOf = (v: unknown): { id: number; ident: string } | null => {
  if (!v || typeof v !== 'object') return null
  const a = v as { id?: number; identNumber?: string }
  if (!a.id) return null
  return { id: a.id, ident: a.identNumber ?? `#${a.id}` }
}

const nameOf = (v: unknown): string =>
  v && typeof v === 'object' && 'name' in v ? String((v as { name?: string }).name ?? '—') : '—'

const personOf = (v: unknown): string => {
  if (!v || typeof v !== 'object') return '—'
  const u = v as { lastName?: string; firstName?: string; email?: string }
  return [u.lastName, u.firstName].filter(Boolean).join(' ') || u.email || '—'
}

const TABS = [
  { key: 'active', label: 'Действующие' },
  { key: 'revoked', label: 'Отозванные' },
  { key: 'all', label: 'Все' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default async function AssociationDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireAssociation()
  const { tab: tabParam } = await searchParams
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'active'

  const payload = await getClient()

  /*
   * Журнал — только то, что выпустила Ассоциация. Признак — заполненное
   * «кто выдал»: у бумаг, загруженных хозяйством, его нет и быть не должно.
   */
  const issued: Where = { issuedBy: { exists: true } }
  const where: Where =
    tab === 'active'
      ? { and: [issued, { 'revoked.at': { exists: false } }] }
      : tab === 'revoked'
        ? { and: [issued, { 'revoked.at': { exists: true } }] }
        : issued

  let docs: Document[] = []
  let totalDocs = 0
  let stale = false

  try {
    const res = await payload.find({
      collection: 'documents',
      where,
      sort: '-issuedAt',
      limit: 200,
      depth: 1,
      overrideAccess: true,
    })
    docs = res.docs as Document[]
    totalDocs = res.totalDocs
  } catch (e) {
    if (!isStaleSchemaError(e)) throw e
    stale = true
  }

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="documents" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Документы</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Племенные свидетельства и зоотехнические сертификаты, выпущенные Ассоциацией.
            Отозванные остаются в журнале: документ существовал, на него ссылались, и стереть
            запись значило бы переписать прошлое.
          </p>

          {stale ? (
            <div className="mt-8">
              <StaleSchemaNotice what="журнала выдачи документов" />
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              <IssueDocument />

              <div className="card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <h2 className="panel-heading mb-0">Журнал выдачи · {totalDocs}</h2>
                  <div className="flex flex-wrap gap-2 text-[14px]">
                    {TABS.map((t) => (
                      <Link
                        key={t.key}
                        href={`/association/documents?tab=${t.key}`}
                        className={`rounded-lg px-3 py-1.5 transition-colors ${
                          tab === t.key
                            ? 'bg-forest-500 text-white'
                            : 'bg-[#f6f6f6] hover:bg-ink-100'
                        }`}
                      >
                        {t.label}
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="metric-table">
                    <thead>
                      <tr>
                        <th>Номер</th>
                        <th>Что выдано</th>
                        <th>Животное</th>
                        <th>Хозяйство</th>
                        <th>Когда</th>
                        <th>Кто выдал</th>
                        <th>Состояние</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-ink-500">
                            {tab === 'revoked'
                              ? 'Отозванных документов нет'
                              : 'Документов пока не выдавали'}
                          </td>
                        </tr>
                      )}

                      {docs.map((d) => {
                        const animal = identOf(d.animal)
                        const revoked = Boolean(d.revoked?.at)

                        return (
                          <tr key={d.id}>
                            <td className="whitespace-nowrap tabular-nums">{d.number ?? '—'}</td>
                            <td>{labelOf(DOCUMENT_TYPES, d.type)}</td>
                            <td>
                              {animal ? (
                                <Link
                                  href={`/animals/${animal.id}`}
                                  className="underline underline-offset-4 hover:text-forest-500"
                                >
                                  {animal.ident}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>{nameOf(d.organization)}</td>
                            <td className="whitespace-nowrap">{dateRu(d.issuedAt)}</td>
                            <td className="text-ink-500">{personOf(d.issuedBy)}</td>
                            <td>
                              {revoked ? (
                                <span className="text-red-700">
                                  отозван {dateRu(d.revoked?.at)}
                                  {d.revoked?.reason && (
                                    <span className="block text-[12px] text-ink-500">
                                      {d.revoked.reason}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <RevokeDocument documentId={d.id as number} />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {totalDocs > docs.length && (
                  <p className="mt-3 text-[13px] text-ink-500">
                    Показаны последние {docs.length} из {totalDocs.toLocaleString('ru-RU')}.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
