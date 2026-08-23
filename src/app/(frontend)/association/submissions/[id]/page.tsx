import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { AutoIssues, Decision, Findings, TakeIntoWork } from '@/components/SubmissionReview'
import { getClient } from '@/lib/payload'
import { requireAssociation, waitingDays, waitingLabel } from '@/lib/association'
import { checkAnimals } from '@/lib/data-checks'
import { SUBMISSION_KINDS, SUBMISSION_STATUSES } from '@/collections/DataSubmissions'
import { labelOf, trustLabel } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import type { Animal } from '@/payload-types'

export const metadata: Metadata = { title: 'Разбор пакета' }
export const dynamic = 'force-dynamic'

/**
 * Разбор пакета — рабочее место эксперта.
 *
 * Порядок на странице повторяет порядок работы: что за пакет и от кого →
 * что сделала машина → что в записях → находки → решение. Заключение внизу
 * не потому, что оно менее важно, а потому что до него доходят последним.
 *
 * Записи пакета показаны здесь же, а не ссылкой на список: эксперт смотрит
 * не «стадо хозяйства», а именно те строки, которых коснулся этот файл.
 */

const nameOf = (v: unknown): string =>
  v && typeof v === 'object' && 'name' in v ? String((v as { name?: string }).name ?? '—') : '—'

const personOf = (v: unknown): string | null => {
  if (!v || typeof v !== 'object') return null
  const u = v as { lastName?: string; firstName?: string; email?: string }
  const name = [u.lastName, u.firstName].filter(Boolean).join(' ')
  return name || u.email || null
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] leading-snug text-ink-500">{label}</p>
      <p className="mt-0.5 break-words text-[15px] leading-snug">{value || '—'}</p>
    </div>
  )
}

export default async function ReviewSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAssociation()
  const { id } = await params

  const payload = await getClient()

  let submission
  try {
    submission = await payload.findByID({
      collection: 'data-submissions',
      id,
      depth: 2,
      overrideAccess: true,
    })
  } catch {
    notFound()
  }
  if (!submission) notFound()

  const animals = (submission.animals ?? []).filter(
    (a): a is Animal => typeof a === 'object' && a !== null,
  )

  const findings = (submission.review?.findings ?? []).map((f) => ({
    id: String(f.id),
    text: f.text,
    field: f.field,
    severity: f.severity,
    animal:
      typeof f.animal === 'object' && f.animal
        ? { id: f.animal.id as number, identNumber: f.animal.identNumber, name: f.animal.name }
        : (f.animal ?? null),
  }))

  /*
   * Автоматические проверки гоняются при каждом открытии страницы, а не
   * сохраняются в пакет. Причина простая: данные меняются. Хозяйство
   * поправило дату рождения — находка должна исчезнуть сама, а не висеть
   * до тех пор, пока кто-нибудь не пересчитает. Сохранять стоит только
   * то, что сказал человек.
   */
  /*
   * Разбор возвращает не только находки, но и оговорки о своей полноте:
   * какие проверки уперлись в потолок. Показываются они рядом с находками
   * и намеренно не спрятаны в подсказку — «замечаний не найдено»
   * и «замечаний не искали» выглядят на экране одинаково, а значат
   * противоположное, и цена ошибки здесь не наша, а хозяйства.
   */
  const { issues, limits } = await checkAnimals(payload, animals)

  const blocking = findings.filter((f) => (f.severity ?? 'fix') === 'fix').length
  const decided = submission.status === 'checked' || submission.status === 'accepted' || submission.status === 'rejected'
  const assignee = personOf(submission.review?.assignee)
  const intakeIssues = submission.intake?.issues ?? []

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="queue" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Кабинет Ассоциации', href: '/association' },
              { label: 'Очередь проверки', href: '/association' },
              { label: submission.number ?? `Пакет #${submission.id}` },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Пакет {submission.number ?? `#${submission.id}`}
          </h1>

          <p className="mt-4 text-[15px] text-ink-700">
            {labelOf(SUBMISSION_KINDS, submission.kind)} от {nameOf(submission.organization)} ·{' '}
            {labelOf(SUBMISSION_STATUSES, submission.status)}
            {!decided && <> · ждёт {waitingLabel(waitingDays(submission.submittedAt))}</>}
          </p>

          <div className="mt-6 space-y-6">
            {/* ------------------------- Что за пакет ------------------------- */}
            <div className="card">
              <h2 className="panel-heading">Загрузка</h2>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label="Хозяйство" value={nameOf(submission.organization)} />
                <Fact label="Кто загрузил" value={personOf(submission.submittedBy) ?? '—'} />
                <Fact label="Когда" value={dateRu(submission.submittedAt)} />
                <Fact
                  label="Исходный файл"
                  value={
                    submission.sourceFile &&
                    typeof submission.sourceFile === 'object' &&
                    submission.sourceFile.url ? (
                      <a
                        href={submission.sourceFile.url}
                        className="underline underline-offset-4 hover:text-forest-500"
                      >
                        скачать
                      </a>
                    ) : (
                      '—'
                    )
                  }
                />
              </div>

              <div className="mt-6 border-t border-[#ededed] pt-5">
                <p className="mb-3 text-[13px] text-ink-500">
                  Итоги машинной приёмки — что сделал импорт, разбирая файл. Это не результат
                  проверки: здесь программа разбирала строки, содержание смотрите ниже.
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="Строк в файле" value={submission.intake?.rows ?? '—'} />
                  <Fact label="Создано" value={submission.intake?.created ?? '—'} />
                  <Fact label="Обновлено" value={submission.intake?.updated ?? '—'} />
                  <Fact label="Пропущено" value={submission.intake?.skipped ?? '—'} />
                </div>

                {intakeIssues.length > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-[14px] font-medium">Непринятые строки</p>
                    <ul className="text-[14px] text-ink-700">
                      {intakeIssues.slice(0, 20).map((i) => (
                        <li key={i.id} className="border-b border-[#ededed] py-1.5 last:border-0">
                          строка {i.row ?? '—'}
                          {i.ident ? `, № ${i.ident}` : ''} — {i.reason}
                        </li>
                      ))}
                    </ul>
                    {intakeIssues.length > 20 && (
                      <p className="mt-2 text-[13px] text-ink-500">
                        и ещё {intakeIssues.length - 20}; полный список — в протоколе загрузки.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {!decided && (
                <div className="mt-6 border-t border-[#ededed] pt-5">
                  <TakeIntoWork id={submission.id} taken={assignee} />
                </div>
              )}
            </div>

            {/* ------------------------ Записи пакета ------------------------- */}
            <div className="card">
              <h2 className="panel-heading">Записи пакета · {animals.length}</h2>

              <p className="mb-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                Строки, которых коснулся этот файл, — и только они. Проверка касается их,
                а не всего стада хозяйства.
              </p>

              <div className="max-h-[28rem] overflow-auto">
                <table className="metric-table">
                  <thead>
                    <tr>
                      <th>Индивидуальный №</th>
                      <th>Кличка</th>
                      <th>Дата рождения</th>
                      <th>Достоверность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animals.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-ink-500">
                          Пакет не привязан к записям — вероятно, загружен до того, как связь
                          появилась
                        </td>
                      </tr>
                    )}
                    {animals.map((a) => (
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* --------------------- Автоматические проверки ------------------ */}
            <AutoIssues id={submission.id} issues={issues} readOnly={decided} />

            {limits.length > 0 && (
              <div className="card">
                <h2 className="panel-heading">Что проверено не полностью</h2>
                <ul className="space-y-2">
                  {limits.map((l) => (
                    <li key={l} className="text-[14px] leading-relaxed text-ink-700">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* -------------------------- Находки ----------------------------- */}
            <Findings
              id={submission.id}
              findings={findings}
              animals={animals.map((a) => ({ id: a.id, identNumber: a.identNumber, name: a.name }))}
              readOnly={decided}
            />

            {/* -------------------------- Решение ----------------------------- */}
            {decided ? (
              <div className="card">
                <h2 className="panel-heading">Заключение</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="Решение" value={labelOf(SUBMISSION_STATUSES, submission.status)} />
                  <Fact label="Проверил" value={personOf(submission.review?.checkedBy) ?? '—'} />
                  <Fact label="Когда" value={dateRu(submission.review?.checkedAt)} />
                  <Fact label="Находок" value={findings.length || '—'} />
                </div>
                {submission.review?.comment && (
                  <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                    {submission.review.comment}
                  </p>
                )}
              </div>
            ) : (
              <Decision id={submission.id} blocking={blocking} decided={decided} />
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
