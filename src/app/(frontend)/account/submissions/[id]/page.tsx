import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { DataNav } from '@/components/DataNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { SubmissionPublishForm } from '@/components/SubmissionPublishForm'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { SUBMISSION_KINDS, SUBMISSION_STATUSES } from '@/collections/DataSubmissions'
import { labelOf } from '@/lib/dictionaries'

export const metadata: Metadata = { title: 'Пакет загрузки данных' }
export const dynamic = 'force-dynamic'

const dateTimeRu = (v?: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} в ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
}

const fileSize = (bytes?: number | null) => {
  if (!bytes) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} Мб` : `${Math.round(bytes / 1024)} Кб`
}

const FileBadge = ({ ext }: { ext: string }) => (
  <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[11px] font-medium uppercase text-white">
    {ext}
  </span>
)

const userName = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as { lastName?: string; firstName?: string; email?: string }
    const n = [o.lastName, o.firstName].filter(Boolean).join(' ')
    return n || o.email || '—'
  }
  return '—'
}

export default async function SubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ history?: string }>
}) {
  const { id } = await params
  const { history: showHistory } = await searchParams

  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  if (!user) redirect('/login')

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

  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)
  const subOrg =
    typeof submission.organization === 'object' && submission.organization
      ? submission.organization.id
      : submission.organization

  if (user.role !== 'admin' && subOrg !== orgId) notFound()

  const protocol =
    typeof submission.review?.errorProtocol === 'object' ? submission.review.errorProtocol : null

  /*
   * Показываем первые записи пакета, а не все: в файле их могут быть сотни,
   * а вопрос у человека один — те ли это животные.
   */
  const packageAnimals = (submission.animals ?? [])
    .filter((a): a is Exclude<typeof a, number> => typeof a === 'object' && a !== null)
    .slice(0, 12)

  const isChecked = submission.status === 'checked'
  const isAccepted = submission.status === 'accepted'

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="data" />
        <DataNav active="check" />

        <div>
          <div className="min-w-0">
        <Breadcrumbs
          items={[
            { label: 'Личный кабинет', href: '/account' },
            { label: 'Данные', href: '/account?tab=data&sub=check' },
            { label: 'Пакет данных' },
          ]}
        />

        <Link
          href="/account?tab=data&sub=check"
          className="inline-flex items-center gap-2 text-[15px] hover:text-forest-500"
        >
          <svg width="18" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true">
            <path
              d="M19 7H1m0 0 5.5-5.5M1 7l5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Назад
        </Link>

        <section className="mt-6">
          <div className="card px-8 py-9 sm:px-10">
            <h2 className="text-[26px] font-semibold">№ {submission.number}</h2>
            <p className="mt-2 text-[19px]">{labelOf(SUBMISSION_KINDS, submission.kind)}</p>

            <hr className="my-7 border-ink-100" />

            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="text-[15px]">{labelOf(SUBMISSION_STATUSES, submission.status)}</p>
              <p className="text-[15px] text-ink-500">
                {dateTimeRu(submission.review?.checkedAt ?? submission.submittedAt)}
              </p>
            </div>

            {submission.review?.comment && (
              <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed">
                <span className="text-ink-900">Комментарий: </span>
                <span className="text-ink-500">{submission.review.comment}</span>
              </p>
            )}

            {(submission.review?.totalRows ?? 0) > 0 && (
              <p className="mt-3 text-sm text-ink-700">
                Обработано записей: {submission.review?.totalRows}, принято{' '}
                {submission.review?.acceptedRows ?? 0}, с ошибками{' '}
                {submission.review?.rejectedRows ?? 0}.
              </p>
            )}

            {/*
               Находки проверки — то, ради чего вообще нужна проверка.
               Прежде хозяйство получало «часть данных не прошла проверку»
               и шло искать, какая именно. Это не результат проверки,
               а способ переложить работу обратно.
            */}
            {(submission.review?.findings ?? []).length > 0 && (
              <div className="mt-6 rounded-xl border border-ink-100 p-5">
                <h3 className="text-[15px] font-medium">
                  Замечания Ассоциации: {submission.review?.findings?.length}
                </h3>
                <p className="mt-1 text-[13px] text-ink-500">
                  Исправить их можно в карточках животных; после исправления загрузите файл
                  заново или сообщите Ассоциации.
                </p>
                <ul className="mt-3 divide-y divide-[#ededed] text-[15px]">
                  {(submission.review?.findings ?? []).map((f) => {
                    const animal = typeof f.animal === 'object' && f.animal ? f.animal : null
                    return (
                      <li key={f.id} className="py-3">
                        <p className="leading-snug">{f.text}</p>
                        <p className="mt-1 text-[13px] text-ink-500">
                          {animal ? (
                            <Link
                              href={`/animals/${animal.id}`}
                              className="underline underline-offset-4 hover:text-forest-500"
                            >
                              {animal.identNumber}
                            </Link>
                          ) : (
                            'весь пакет'
                          )}
                          {f.field ? ` · ${f.field}` : ''}
                          {' · '}
                          {(f.severity ?? 'fix') === 'fix'
                            ? 'требует исправления'
                            : 'на усмотрение хозяйства'}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/*
               Что сделал импорт — отдельно от того, что нашла проверка.
               Первое сделала машина при разборе файла, второе человек
               при разборе содержания, и путать их нельзя.
            */}
            {(submission.intake?.rows ?? 0) > 0 && (
              <p className="mt-1 text-sm text-ink-500">
                Приёмка файла: строк {submission.intake?.rows}, создано{' '}
                {submission.intake?.created ?? 0}, обновлено {submission.intake?.updated ?? 0},
                пропущено {submission.intake?.skipped ?? 0}.
              </p>
            )}

            {/*
               Записи пакета: именно им проверка поднимет уровень достоверности.
               Без списка «данные приняты» остаётся отвлечённой фразой — непонятно,
               о каких животных речь.
            */}
            {packageAnimals.length > 0 && (
              <div className="mt-6 rounded-xl border border-ink-100 p-5">
                <h3 className="text-[15px] font-medium">
                  Записи пакета: {submission.animals?.length ?? packageAnimals.length}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                  {isAccepted
                    ? 'Этим записям выставлен уровень «Верифицировано ассоциацией».'
                    : 'После проверки и вашего согласия эти записи получат уровень «Верифицировано ассоциацией». Остального стада проверка не касается.'}
                </p>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[14px]">
                  {packageAnimals.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/animals/${a.id}`}
                        className="underline underline-offset-4 hover:text-forest-500"
                      >
                        {a.name ?? `№ ${a.identNumber}`}
                      </Link>
                    </li>
                  ))}
                  {(submission.animals?.length ?? 0) > packageAnimals.length && (
                    <li className="text-ink-500">
                      и ещё {(submission.animals?.length ?? 0) - packageAnimals.length}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/*
               Непринятые строки. Пакет — единственное место, где они
               сохраняются: страница загрузки покажет их один раз и забудет,
               а вернуться к разбору файла человек может через неделю.
            */}
            {!!submission.intake?.issues?.length && (
              <div className="mt-6 rounded-xl border border-ink-100 p-5">
                <h3 className="text-[15px] font-medium">
                  Непринятые строки: {submission.intake.issues.length}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-500">
                  Эти строки файла в книгу не попали
                  {isAccepted ? '' : ' — остальные загружены и ждут проверки'}. Чтобы добавить
                  их, поправьте причину и загрузите файл заново.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="metric-table w-full">
                    <thead>
                      <tr>
                        <th className="text-right">Строка</th>
                        <th>Индивидуальный номер</th>
                        <th>Причина</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submission.intake.issues.map((it) => (
                        <tr key={it.id ?? `${it.row}-${it.ident}`}>
                          <td className="text-right tabular-nums">{it.row}</td>
                          <td>{it.ident || <span className="text-ink-500">не указан</span>}</td>
                          <td className="text-[13px] leading-snug">{it.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {protocol && (
              <div className="mt-7 rounded-xl bg-[#f0f0f0] p-6">
                <h3 className="text-[17px] font-medium">Документы для ознакомления</h3>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <span className="flex items-center gap-3 text-[15px]">
                    <FileBadge ext={(protocol.filename ?? 'xlsx').split('.').pop() ?? 'xlsx'} />
                    Протокол ошибок
                    <span className="text-ink-500">| {fileSize(protocol.filesize)}</span>
                  </span>
                  <a
                    href={protocol.url ?? '#'}
                    download
                    className="text-[15px] text-forest-500 underline underline-offset-4 hover:text-forest-600"
                  >
                    Скачать
                  </a>
                </div>
              </div>
            )}

            <SubmissionPublishForm
              id={String(submission.id)}
              disabled={!isChecked}
              alreadyPublished={isAccepted}
            />

            <hr className="my-8 border-ink-100" />

            {showHistory === '1' ? (
              <>
                <h3 className="mb-4 text-[17px] font-medium">История</h3>
                <ul className="text-sm">
                  {(submission.history ?? []).length === 0 && (
                    <li className="text-ink-500">Записей пока нет</li>
                  )}
                  {(submission.history ?? []).map((h, i) => (
                    <li
                      key={h.id ?? i}
                      className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#ededed] py-3 last:border-0"
                    >
                      <span>
                        <span className="text-ink-900">
                          {labelOf(SUBMISSION_STATUSES, h.status)}
                        </span>
                        {h.actor && (
                          <span className="text-ink-500"> · {userName(h.actor)}</span>
                        )}
                        {h.note && <span className="text-ink-500"> · {h.note}</span>}
                      </span>
                      <span className="text-ink-500">{dateTimeRu(h.at)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/account/submissions/${submission.id}`}
                  className="mt-5 inline-block text-[15px] text-forest-500 underline underline-offset-4"
                >
                  Скрыть историю
                </Link>
              </>
            ) : (
              <Link
                href={`/account/submissions/${submission.id}?history=1`}
                className="text-[15px] text-forest-500 underline underline-offset-4 hover:text-forest-600"
              >
                Показать историю
              </Link>
            )}
          </div>
        </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
