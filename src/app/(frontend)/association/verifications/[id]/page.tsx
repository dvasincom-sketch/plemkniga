import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import {
  TakeVerification,
  VerificationAutoIssues,
  VerificationDecision,
  VerificationFindings,
  VerificationHerdIssues,
} from '@/components/VerificationReview'
import { getClient } from '@/lib/payload'
import { isStaleSchemaError, requireAssociation, waitingDays, waitingLabel } from '@/lib/association'
import { StaleSchemaNotice } from '@/components/StaleSchemaNotice'
import { checkAnimals } from '@/lib/data-checks'
import { herdIssues } from '@/lib/checks-herd'
import { checkSpec } from '@/lib/checks-registry'
import { relId } from '@/lib/visibility'
import { VERIFICATION_PURPOSES, VERIFICATION_STATUSES } from '@/collections/VerificationRequests'
import { labelOf, trustLabel } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import type { Animal } from '@/payload-types'

export const metadata: Metadata = { title: 'Разбор заявки' }
export const dynamic = 'force-dynamic'

const nameOf = (v: unknown): string =>
  v && typeof v === 'object' && 'name' in v ? String((v as { name?: string }).name ?? '—') : '—'

const personOf = (v: unknown): string | null => {
  if (!v || typeof v !== 'object') return null
  const u = v as { lastName?: string; firstName?: string; email?: string }
  return [u.lastName, u.firstName].filter(Boolean).join(' ') || u.email || null
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] leading-snug text-ink-500">{label}</p>
      <p className="mt-0.5 break-words text-[15px] leading-snug">{value || '—'}</p>
    </div>
  )
}

export default async function ReviewVerificationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAssociation()
  const { id } = await params

  const payload = await getClient()

  /*
   * Сервер разработки, запущенный до появления этой коллекции, о ней
   * не знает — отвечаем инструкцией, а не стеком (см. `isStaleSchemaError`).
   * Всё остальное — обычное «не найдено».
   */
  let request
  try {
    request = await payload.findByID({
      collection: 'verification-requests',
      id,
      depth: 2,
      overrideAccess: true,
    })
  } catch (e) {
    if (isStaleSchemaError(e)) {
      return (
        <>
          <SiteHeader active="/association" />
          <main className="container-page pb-8">
            <AssociationNav active="verifications" />
            <StaleSchemaNotice what="заявок на верификацию" />
          </main>
          <SiteFooter />
        </>
      )
    }
    notFound()
  }
  if (!request) notFound()

  const animals = (request.animals ?? []).filter(
    (a): a is Animal => typeof a === 'object' && a !== null,
  )

  const findings = (request.review?.findings ?? []).map((f) => ({
    id: String(f.id),
    text: f.text,
    field: f.field,
    severity: f.severity,
    animal:
      typeof f.animal === 'object' && f.animal
        ? { id: f.animal.id as number, identNumber: f.animal.identNumber }
        : (f.animal ?? null),
  }))

  /*
   * Разбор возвращает не только находки, но и оговорки о своей полноте:
   * какие проверки уперлись в потолок. Показываются они рядом с находками
   * и намеренно не спрятаны в подсказку — «замечаний не найдено»
   * и «замечаний не искали» выглядят на экране одинаково, а значат
   * противоположное, и цена ошибки здесь не наша, а хозяйства.
   */
  /*
   * Разбор по стаду идёт рядом с разбором по заявке и намеренно шире её.
   *
   * В заявку попадают десятки записей, а несопоставимость — свойство всего
   * массива хозяйства: единицы измерения смешаны не в заявке, а в учёте.
   * Эксперту это нужнее, чем хозяйству: он единственный, кто видит рядом
   * несколько хозяйств и понимает, что «средний удой 7 200» у одного
   * и у другого — не одно и то же число.
   *
   * Заявку эти находки не блокируют и в автоматические замечания
   * не попадают: чинить их поштучно нельзя, а отклонять заявку за то,
   * что где-то в стаде смешаны источники доек, было бы наказанием
   * не за то.
   */
  const [{ issues, limits }, herd] = await Promise.all([
    checkAnimals(payload, animals),
    herdIssues(payload, relId(request.organization)),
  ])

  const heldIds = new Set(
    findings
      .filter((f) => (f.severity ?? 'fix') === 'fix')
      .map((f) => (typeof f.animal === 'object' && f.animal ? f.animal.id : Number(f.animal)))
      .filter((n) => Number.isFinite(n)),
  )

  const decided = request.status === 'approved' || request.status === 'rejected'
  const assignee = personOf(request.review?.assignee)

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="verifications" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Кабинет Ассоциации', href: '/association' },
              { label: 'Заявки на верификацию', href: '/association/verifications' },
              { label: request.number ?? `Заявка #${request.id}` },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Заявка {request.number ?? `#${request.id}`}
          </h1>

          <p className="mt-4 text-[15px] text-ink-700">
            {nameOf(request.organization)} · {labelOf(VERIFICATION_PURPOSES, request.purpose)} ·{' '}
            {labelOf(VERIFICATION_STATUSES, request.status)}
            {!decided && <> · ждёт {waitingLabel(waitingDays(request.requestedAt))}</>}
          </p>

          <div className="mt-6 space-y-6">
            <div className="card">
              <h2 className="panel-heading">Заявка</h2>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Хозяйство" value={nameOf(request.organization)} />
                <Fact label="Кто подал" value={personOf(request.requestedBy) ?? '—'} />
                <Fact label="Когда" value={dateRu(request.requestedAt)} />
                <Fact label="Записей" value={animals.length} />
              </div>

              {request.comment && (
                <p className="mt-5 max-w-[70ch] border-t border-[#ededed] pt-5 text-[15px] leading-relaxed text-ink-700">
                  <span className="text-ink-500">Сообщение хозяйства: </span>
                  {request.comment}
                </p>
              )}

              {!decided && (
                <div className="mt-6 border-t border-[#ededed] pt-5">
                  <TakeVerification id={request.id} taken={assignee} />
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="panel-heading">Записи заявки · {animals.length}</h2>

              <p className="mb-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                Помеченные «не подтверждается» останутся с прежним уровнем достоверности —
                остальные получат «Верифицировано ассоциацией».
              </p>

              <div className="max-h-[28rem] overflow-auto">
                <table className="metric-table">
                  <thead>
                    <tr>
                      <th>Индивидуальный №</th>
                      <th>Кличка</th>
                      <th>Дата рождения</th>
                      <th>Сейчас</th>
                      <th>После решения</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animals.map((a) => {
                      const held = heldIds.has(a.id as number)
                      return (
                        <tr key={a.id}>
                          <td>
                            <Link
                              href={`/animals/${a.id}`}
                              className="underline underline-offset-4 hover:text-forest-500"
                            >
                              {a.identNumber}
                            </Link>
                          </td>
                          <td>{a.name || '—'}</td>
                          <td>{dateRu(a.birthDate)}</td>
                          <td className="text-ink-500">{trustLabel(a.trustLevel)}</td>
                          <td className={held ? 'text-amber-700' : 'text-forest-500'}>
                            {held ? 'не подтверждается' : 'верифицировано'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <VerificationAutoIssues
              id={request.id}
              issues={issues}
              dismissed={(request.review?.dismissed ?? []).map((d) => ({
                id: String(d.id),
                code: String(d.code),
                reason: String(d.reason),
                animal:
                  typeof d.animal === 'object' && d.animal
                    ? { id: d.animal.id as number, identNumber: d.animal.identNumber }
                    : (d.animal ?? null),
              }))}
              readOnly={decided}
            />

            {/*
               Находки по стаду теперь не только показываются, но и переносятся
               в замечания — ко всему пакету и без животного. Иначе хозяйство
               о них не узнает: «Проверить моё стадо» оно открывает по своей
               воле, а заключение по заявке читает обязательно.
            */}
            <VerificationHerdIssues
              id={request.id}
              scanned={herd.scanned}
              issues={herd.issues.map((h) => ({
                code: h.code,
                label: checkSpec(h.code)?.label ?? h.code,
                text: h.text,
                examples: h.examples?.map((e) => e.label),
              }))}
              recorded={findings
                .filter((f) => !f.animal && f.field)
                .map((f) => String(f.field))}
              readOnly={decided}
            />

            {(limits.length > 0 || herd.limits.length > 0) && (
              <div className="card">
                <h2 className="panel-heading">Что проверено не полностью</h2>
                <ul className="space-y-2">
                  {[...limits, ...herd.limits].map((l) => (
                    <li key={l} className="text-[14px] leading-relaxed text-ink-700">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <VerificationFindings
              id={request.id}
              findings={findings}
              animals={animals.map((a) => ({
                id: a.id as number,
                identNumber: a.identNumber,
                name: a.name,
              }))}
              readOnly={decided}
            />

            {decided ? (
              <div className="card">
                <h2 className="panel-heading">Заключение</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="Решение" value={labelOf(VERIFICATION_STATUSES, request.status)} />
                  <Fact label="Принял" value={personOf(request.review?.decidedBy) ?? '—'} />
                  <Fact label="Когда" value={dateRu(request.review?.decidedAt)} />
                  <Fact
                    label="Подтверждено"
                    value={`${request.review?.approvedCount ?? 0} из ${animals.length}`}
                  />
                </div>
                {request.review?.comment && (
                  <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                    {request.review.comment}
                  </p>
                )}
              </div>
            ) : (
              <VerificationDecision
                id={request.id}
                total={animals.length}
                held={heldIds.size}
              />
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
