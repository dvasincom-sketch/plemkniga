import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { DataNav } from '@/components/DataNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { VERIFICATION_PURPOSES, VERIFICATION_STATUSES } from '@/collections/VerificationRequests'
import { labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import type { VerificationRequest } from '@/payload-types'

export const metadata: Metadata = { title: 'Заявка на верификацию' }
export const dynamic = 'force-dynamic'

/**
 * Заявка на верификацию — сторона хозяйства.
 *
 * До этой страницы хозяйство видело только счётчики: «подтверждено 47,
 * с замечаниями 3». Какие именно три и что с ними не так — не видел никто,
 * кроме эксперта, который замечания написал.
 *
 * `docs/kabinet-associacii.md` называет это прямо: «часть данных не прошла
 * проверку» без указания, какая именно, — это не результат проверки,
 * а способ переложить работу на хозяйство. Эксперт разбирал записи
 * построчно, писал замечание к каждой, а на другом конце получалось число.
 *
 * Поэтому здесь порядок обратный привычному: сначала то, что **не прошло**,
 * с причиной по каждой записи и ссылкой на карточку, и только потом всё
 * остальное. Человек пришёл сюда за списком работы, а не за отчётом.
 */

type Finding = {
  /*
   * Payload даёт каждой строке массива собственный идентификатор — им
   * замечание и удаляют на стороне Ассоциации. В этом типе его не было,
   * пока замечания перебирались по животным: ключом служил номер животного.
   * Замечанию ко всему пакету животного нет, и ключ понадобился свой.
   */
  id?: string | null
  animal?: unknown
  field?: string | null
  severity?: string | null
  text?: string | null
}

const nameOf = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const a = v as { name?: string | null; identNumber?: string | null }
    return a.name || a.identNumber || '—'
  }
  return '—'
}

const identOf = (v: unknown): string => {
  if (v && typeof v === 'object') return String((v as { identNumber?: string }).identNumber ?? '')
  return ''
}

export default async function VerificationRequestPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  denyAssociation(user)
  if (!user) redirect(`/login?next=/account/verification/${id}`)

  const payload = await getClient()

  /*
   * С правами пользователя: правило `organizationScopedRead` само отдаёт
   * только свои заявки. Сверять организацию здесь второй раз — значит
   * завести то же правило в двух местах.
   */
  let request: VerificationRequest | null = null
  try {
    request = (await payload.findByID({
      collection: 'verification-requests',
      id,
      depth: 2,
      overrideAccess: false,
      user,
    })) as VerificationRequest
  } catch {
    notFound()
  }
  if (!request) notFound()

  const review = request.review ?? {}
  const findings = (review.findings ?? []) as Finding[]
  const animals = (request.animals ?? []) as unknown[]
  const decided = request.status === 'approved' || request.status === 'rejected'

  /*
   * Замечания собираются по животным, а не показываются простым списком.
   *
   * У одной записи может быть несколько замечаний — по дате рождения
   * и по происхождению, — и списком они выглядят как разные проблемы разных
   * животных. Работа же ведётся по животному: открыл карточку, поправил всё,
   * что к ней относится, закрыл.
   */
  const byAnimal = new Map<number, { animal: unknown; items: Finding[] }>()

  /**
   * Замечания ко всему пакету — те, у которых животного нет.
   *
   * Раньше строка `if (key === null) continue` их молча выбрасывала,
   * и это было верно ровно до тех пор, пока таких замечаний не бывало.
   * Теперь эксперт переносит сюда находки по стаду: смешанные единицы
   * измерения, дойки из разных источников, год без единого отёла. Указать
   * животное у них нельзя — беда в способе учёта, а не в записи.
   *
   * Выбрасывать их было бы худшим из исходов: эксперт видит, что записал
   * замечание, хозяйство не видит ничего, и оба уверены, что разговор
   * состоялся.
   */
  const general: Finding[] = []

  for (const f of findings) {
    const key = relId(f.animal)
    if (key === null) {
      general.push(f)
      continue
    }
    const entry = byAnimal.get(key) ?? { animal: f.animal, items: [] }
    entry.items.push(f)
    byAnimal.set(key, entry)
  }

  /** Запись не подтверждена, если у неё есть хоть одно «требует исправления». */
  const isHeld = (items: Finding[]) => items.some((f) => f.severity === 'fix')

  const held = [...byAnimal.entries()].filter(([, v]) => isHeld(v.items))
  const noted = [...byAnimal.entries()].filter(([, v]) => !isHeld(v.items))

  const heldIds = new Set(held.map(([k]) => k))
  const passed = animals.filter((a) => {
    const key = relId(a)
    return key !== null && !heldIds.has(key)
  })

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="data" />
        <DataNav active="check" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Верификация записей', href: '/account/verification' },
              { label: String(request.number ?? `#${request.id}`) },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Заявка {String(request.number ?? `#${request.id}`)}
          </h1>

          <dl className="mt-5 grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-[12px] text-ink-500">Состояние</dt>
              <dd className="mt-0.5 text-[15px]">
                {labelOf(VERIFICATION_STATUSES, request.status)}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-500">Подана</dt>
              <dd className="mt-0.5 text-[15px]">{dateRu(request.requestedAt)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-500">Решение принято</dt>
              <dd className="mt-0.5 text-[15px]">{dateRu(review.decidedAt) || '—'}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-500">Записей в заявке</dt>
              <dd className="mt-0.5 text-[15px] tabular-nums">{animals.length}</dd>
            </div>
          </dl>

          {request.purpose ? (
            <p className="mt-3 text-[14px] text-ink-500">
              Цель: {labelOf(VERIFICATION_PURPOSES, request.purpose).toLowerCase()}
            </p>
          ) : null}

          {/* ------------------ Замечания ко всему пакету ---------------------- */}
          {/*
             Стоят выше списка непрошедших записей, хотя подтверждению
             не мешают. Причина в том, что чинить их — другая работа: не
             поправить поле в карточке, а привести в порядок способ учёта.
             Прочитанное после списка «поправьте и подайте заново» такое
             замечание выглядит как ещё одна строка того же списка.
          */}
          {general.length > 0 && (
            <section className="card mt-8">
              <h2 className="panel-heading">Замечания ко всему пакету</h2>
              <p className="mb-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                Эти замечания не относятся к отдельной записи и подтверждению не мешали.
                Они о том, как ведётся учёт в целом: пока они в силе, средние по стаду
                и сравнение животных между собой ненадёжны.
              </p>

              <ul className="space-y-4">
                {general.map((f, i) => (
                  <li key={f.id ?? i} className="border-t border-ink-100 pt-4">
                    <p className="max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
                      {f.text}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ------------------- Что не прошло — первым делом ------------------ */}
          {held.length > 0 && (
            <section className="card mt-8">
              <h2 className="panel-heading">Не подтверждено: {held.length}</h2>
              <p className="mb-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                По каждой записи ниже указано, что именно мешает подтверждению. Поправьте
                в карточке и подайте заявку заново — переподавать всё стадо не нужно,
                достаточно этих записей.
              </p>

              <ul className="space-y-5">
                {held.map(([key, v]) => (
                  <li key={key} className="border-t border-ink-100 pt-4">
                    <p className="text-[15px]">
                      <Link
                        href={`/animals/${key}`}
                        className="underline underline-offset-4 hover:text-forest-500"
                      >
                        {nameOf(v.animal)}
                      </Link>
                      {identOf(v.animal) && (
                        <span className="ml-2 text-[13px] tabular-nums text-ink-500">
                          № {identOf(v.animal)}
                        </span>
                      )}
                    </p>

                    <ul className="mt-2 space-y-2">
                      {v.items.map((f, i) => (
                        <li key={i} className="text-[14px] leading-relaxed">
                          <span
                            className={`mr-2 rounded-md px-2 py-0.5 text-[12px] ${
                              f.severity === 'fix'
                                ? 'bg-[#fdecea] text-ink-900'
                                : 'bg-[#fff6e5] text-ink-900'
                            }`}
                          >
                            {f.severity === 'fix' ? 'требует исправления' : 'на ваше усмотрение'}
                          </span>
                          {f.field && <span className="text-ink-500">{f.field}: </span>}
                          {f.text || '—'}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ------------- Замечания, не мешающие подтверждению ---------------- */}
          {noted.length > 0 && (
            <section className="card mt-6">
              <h2 className="panel-heading">Замечания на ваше усмотрение: {noted.length}</h2>
              <p className="mb-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                Эти записи подтверждены. Замечания оставлены, чтобы вы знали о них, —
                исправлять их никто не требует.
              </p>

              <ul className="space-y-4">
                {noted.map(([key, v]) => (
                  <li key={key} className="border-t border-ink-100 pt-3 text-[14px]">
                    <Link
                      href={`/animals/${key}`}
                      className="underline underline-offset-4 hover:text-forest-500"
                    >
                      {nameOf(v.animal)}
                    </Link>
                    <ul className="mt-1.5 space-y-1 text-ink-700">
                      {v.items.map((f, i) => (
                        <li key={i}>
                          {f.field && <span className="text-ink-500">{f.field}: </span>}
                          {f.text || '—'}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ------------------------ Общее заключение ------------------------ */}
          {review.comment && (
            <section className="card mt-6">
              <h2 className="panel-heading">Заключение Ассоциации</h2>
              <p className="max-w-[75ch] text-[15px] leading-relaxed">{review.comment}</p>
            </section>
          )}

          {/* --------------------------- Что прошло --------------------------- */}
          <section className="card mt-6">
            <h2 className="panel-heading">
              {decided ? `Подтверждено: ${passed.length}` : `Записей в заявке: ${animals.length}`}
            </h2>

            {!decided && (
              <p className="mb-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                Заявка ещё не разобрана. Замечания появятся здесь вместе с решением —
                отдельно ходить и спрашивать не нужно.
              </p>
            )}

            {decided && held.length === 0 && (
              <p className="mb-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-700">
                Все записи заявки подтверждены, замечаний нет.
              </p>
            )}

            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
              {(decided ? passed : animals).map((a) => {
                const key = relId(a)
                if (key === null) return null
                return (
                  <li key={key}>
                    <Link
                      href={`/animals/${key}`}
                      className="underline underline-offset-4 hover:text-forest-500"
                    >
                      {nameOf(a)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
