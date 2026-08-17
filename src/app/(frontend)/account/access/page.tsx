import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ReplacePublic, RevokeGrant } from '@/components/GrantActions'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { ACCESS_SCOPES } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'

export const metadata: Metadata = { title: 'Доступы — Племенная книга' }
export const dynamic = 'force-dynamic'

/**
 * Кабинет → «Доступы»: кому открыты мои данные и что открыли мне.
 *
 * До этого экрана точечный доступ был достижим только из уведомлений:
 * выдать — можно, увидеть выданное и отозвать — нет. Право, которым нельзя
 * распорядиться после выдачи, хозяйство перестаёт выдавать: оно не помнит,
 * кому что открыло, и на всякий случай не открывает больше.
 *
 * Три списка на одной странице, и порядок не случаен. Сверху выданное —
 * это то, чем управляют. Ниже полученное — справка. В самом низу записи,
 * которые прежние одобрения успели опубликовать всему свету: их не закрывают
 * молча, но и забывать о них не дают.
 *
 * Разбор — `docs/tochechnyy-dostup.md`, раздел 6.5.
 */

const scopeLabel = (value: string): string =>
  ACCESS_SCOPES.find((s) => s.value === value)?.label ?? value

const listScopes = (scopes?: string[] | null): string =>
  scopes?.length ? scopes.map((s) => scopeLabel(s).toLowerCase()).join(', ') : '—'

const nameOf = (v: unknown): string => {
  if (v && typeof v === 'object') {
    const o = v as { shortName?: string | null; name?: string | null; identNumber?: string | null }
    return o.shortName || o.name || o.identNumber || '—'
  }
  return '—'
}

/** Действует ли грант прямо сейчас: та же проверка, что в загрузчике. */
const isAlive = (g: { revokedAt?: string | null; expiresAt?: string | null }): boolean => {
  if (g.revokedAt) return false
  if (!g.expiresAt) return true
  const until = Date.parse(g.expiresAt)
  return Number.isNaN(until) || until > Date.now()
}

const term = (g: { expiresAt?: string | null; revokedAt?: string | null }): string => {
  if (g.revokedAt) return `отозван ${dateRu(g.revokedAt)}`
  if (!g.expiresAt) return 'бессрочно'
  const until = Date.parse(g.expiresAt)
  return until <= Date.now() ? `истёк ${dateRu(g.expiresAt)}` : `до ${dateRu(g.expiresAt)}`
}

export default async function AccessPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/account/access')

  const org = relId(user.organization)
  const payload = await getClient()

  if (!org) {
    return (
      <>
        <SiteHeader active="/account" />
        <main className="container-page pb-8">
          <AccountNav active="access" />
          <p className="card text-[15px] text-ink-700">
            У вашей учётной записи нет организации, поэтому выдавать и получать доступ
            не от чьего имени. Доступ выдаётся хозяйству, а не человеку: зоотехник может
            смениться, а договорённость между хозяйствами остаётся.
          </p>
        </main>
        <SiteFooter />
      </>
    )
  }

  const [issued, received, publicByOldApproval] = await Promise.all([
    payload
      .find({
        collection: 'access-grants',
        where: { owner: { equals: org } },
        sort: '-createdAt',
        limit: 200,
        depth: 1,
        overrideAccess: false,
        user,
      })
      .then((r) => r.docs)
      .catch(() => []),

    payload
      .find({
        collection: 'access-grants',
        where: { grantee: { equals: org } },
        sort: '-createdAt',
        limit: 200,
        depth: 1,
        overrideAccess: false,
        user,
      })
      .then((r) => r.docs)
      .catch(() => []),

    /*
     * Записи, которые прежние одобрения сделали публичными.
     *
     * Признак — одобренный запрос плюс до сих пор открытая карточка. Ни то,
     * ни другое по отдельности ничего не значит: открытая карточка может быть
     * решением владельца, а одобренный запрос — уже заменённым на грант.
     */
    payload
      .find({
        collection: 'access-requests',
        where: { and: [{ owner: { equals: org } }, { status: { equals: 'approved' } }] },
        sort: '-decidedAt',
        limit: 100,
        depth: 1,
        overrideAccess: true,
      })
      .then((r) => r.docs)
      .catch(() => []),
  ])

  const stillPublic = publicByOldApproval.filter((r) => {
    const animal = (r as { animal?: unknown }).animal
    return typeof animal === 'object' && animal && (animal as { publicDetails?: boolean }).publicDetails
  })

  // Одна запись могла быть одобрена нескольким хозяйствам — показываем однажды
  const seen = new Set<number>()
  const toReplace = stillPublic.filter((r) => {
    const id = relId((r as { animal?: unknown }).animal)
    if (id === null || seen.has(id)) return false
    seen.add(id)
    return true
  })

  const alive = issued.filter(isAlive)
  const gone = issued.filter((g) => !isAlive(g))

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="access" />

        <Breadcrumbs
          items={[{ label: 'Личный кабинет', href: '/account' }, { label: 'Доступы' }]}
        />

        <h1 className="mt-2 text-[28px] font-medium leading-tight sm:text-[32px]">Доступы</h1>
        <p className="mt-2 max-w-[75ch] text-[15px] leading-relaxed text-ink-500">
          Точечный доступ выдаётся хозяйству, а не человеку, и всегда отзывается.
          Выдать его можно из уведомления о запросе — там же выбираются области,
          охват и срок.
        </p>

        {/* --------------------------- Выданные --------------------------- */}
        <section className="card mt-8">
          <h2 className="panel-heading">Вы открыли</h2>

          {alive.length === 0 && gone.length === 0 ? (
            <p className="text-[15px] leading-relaxed text-ink-500">
              Вы пока никому не открывали свои данные точечно. Запросы приходят
              в{' '}
              <Link href="/account/notifications" className="underline underline-offset-4">
                уведомления
              </Link>
              , решение принимается там.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead className="text-left text-[12px] uppercase tracking-[0.06em] text-ink-500">
                  <tr>
                    <th className="pb-2 pr-4 font-normal">Кому</th>
                    <th className="pb-2 pr-4 font-normal">На что</th>
                    <th className="pb-2 pr-4 font-normal">Что открыто</th>
                    <th className="pb-2 pr-4 font-normal">Срок</th>
                    <th className="pb-2 pr-4 font-normal">Последний просмотр</th>
                    <th className="pb-2 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {alive.map((g) => {
                    const animal = (g as { animal?: unknown }).animal
                    const animalId = relId(animal)
                    return (
                      <tr key={g.id} className="border-t border-ink-100">
                        <td className="py-3 pr-4">{nameOf((g as { grantee?: unknown }).grantee)}</td>
                        <td className="py-3 pr-4">
                          {animalId ? (
                            <Link
                              href={`/animals/${animalId}`}
                              className="underline underline-offset-4"
                            >
                              {nameOf(animal)}
                            </Link>
                          ) : (
                            <span className="text-ink-500">всё стадо</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">{listScopes((g as { scopes?: string[] }).scopes)}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{term(g)}</td>
                        <td className="py-3 pr-4 whitespace-nowrap text-ink-500">
                          {(g as { lastSeenAt?: string | null }).lastSeenAt
                            ? dateRu((g as { lastSeenAt?: string | null }).lastSeenAt)
                            : 'ни разу'}
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          <RevokeGrant grantId={g.id as number} />
                        </td>
                      </tr>
                    )
                  })}

                  {gone.map((g) => {
                    const animal = (g as { animal?: unknown }).animal
                    const animalId = relId(animal)
                    return (
                      <tr key={g.id} className="border-t border-ink-100 text-ink-500">
                        <td className="py-3 pr-4">{nameOf((g as { grantee?: unknown }).grantee)}</td>
                        <td className="py-3 pr-4">{animalId ? nameOf(animal) : 'всё стадо'}</td>
                        <td className="py-3 pr-4">{listScopes((g as { scopes?: string[] }).scopes)}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{term(g)}</td>
                        <td className="py-3 pr-4"></td>
                        <td className="py-3"></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {gone.length > 0 && (
                <p className="mt-4 text-[13px] leading-snug text-ink-500">
                  Отозванные и истёкшие показаны серым и не удаляются: на них ссылаются
                  записи о просмотрах, и «доступа не было» и «доступ отозвали» — разные
                  ответы на один вопрос.
                </p>
              )}
            </div>
          )}
        </section>

        {/* --------------------------- Полученные -------------------------- */}
        <section className="card mt-6">
          <h2 className="panel-heading">Вам открыли</h2>

          {received.filter(isAlive).length === 0 ? (
            <p className="text-[15px] leading-relaxed text-ink-500">
              Вам пока не открывали чужих данных точечно. Закрытую запись в книге можно
              попросить у владельца — на её странице есть форма запроса.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead className="text-left text-[12px] uppercase tracking-[0.06em] text-ink-500">
                  <tr>
                    <th className="pb-2 pr-4 font-normal">Кто открыл</th>
                    <th className="pb-2 pr-4 font-normal">На что</th>
                    <th className="pb-2 pr-4 font-normal">Что открыто</th>
                    <th className="pb-2 font-normal">Срок</th>
                  </tr>
                </thead>
                <tbody>
                  {received.filter(isAlive).map((g) => {
                    const animal = (g as { animal?: unknown }).animal
                    const animalId = relId(animal)
                    return (
                      <tr key={g.id} className="border-t border-ink-100">
                        <td className="py-3 pr-4">{nameOf((g as { owner?: unknown }).owner)}</td>
                        <td className="py-3 pr-4">
                          {animalId ? (
                            <Link
                              href={`/animals/${animalId}`}
                              className="underline underline-offset-4"
                            >
                              {nameOf(animal)}
                            </Link>
                          ) : (
                            <span className="text-ink-500">всё стадо хозяйства</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">{listScopes((g as { scopes?: string[] }).scopes)}</td>
                        <td className="py-3 whitespace-nowrap">{term(g)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------------- Открыто всем по прежним запросам ---------------- */}
        {toReplace.length > 0 && (
          <section className="card mt-6">
            <h2 className="panel-heading">Открыто всем по прежним запросам</h2>

            <p className="mb-5 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
              Раньше одобрение запроса открывало карточку не заявителю, а всем
              посетителям книги — другой возможности у системы не было. Эти записи
              так и остались публичными: вы нажимали кнопку, зная последствие,
              и закрывать их за вас никто не станет.
            </p>

            <p className="mb-5 max-w-[75ch] text-[13px] leading-relaxed text-ink-500">
              «Закрыть и выдать точечно» уберёт только полную карточку: запись
              останется в книге строкой с замком. Тем, чьи запросы вы когда-то
              одобрили, выдастся бессрочный доступ ко всем четырём областям — ровно
              то, что у них было. Отобрать данные у того, кому вы их дали, эта кнопка
              не должна.
            </p>

            <ul className="space-y-4">
              {toReplace.map((r) => {
                const animal = (r as { animal?: unknown }).animal
                const animalId = relId(animal)
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 pt-4"
                  >
                    <div className="min-w-0">
                      <p className="text-[15px]">
                        {animalId ? (
                          <Link
                            href={`/animals/${animalId}`}
                            className="underline underline-offset-4"
                          >
                            {nameOf(animal)}
                          </Link>
                        ) : (
                          nameOf(animal)
                        )}
                      </p>
                      <p className="mt-0.5 text-[13px] text-ink-500">
                        Открыта по запросу от {nameOf((r as { requesterOrg?: unknown }).requesterOrg)}
                        {(r as { decidedAt?: string | null }).decidedAt
                          ? `, ${dateRu((r as { decidedAt?: string | null }).decidedAt)}`
                          : ''}
                      </p>
                    </div>
                    {animalId && <ReplacePublic animalId={animalId} />}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  )
}
