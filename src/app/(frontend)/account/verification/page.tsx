import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { VerificationForm } from '@/components/VerificationForm'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { VERIFICATION_STATUSES } from '@/collections/VerificationRequests'
import { labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'

export const metadata: Metadata = { title: 'Верификация записей' }
export const dynamic = 'force-dynamic'

/**
 * Подача животных на верификацию — сторона хозяйства.
 *
 * Отдельной страницей, а не кнопкой в списке стада: выбор записей —
 * осмысленная работа, её делают со списком в руках и сверяясь с бумагами,
 * а не мимоходом между двумя фильтрами.
 */

/** Чего не хватает записи, чтобы её подтвердили. */
const missingOf = (a: {
  birthDate?: string | null
  breed?: unknown
  father?: unknown
  mother?: unknown
  pedigreeText?: { fatherId?: string | null; motherId?: string | null } | null
}): string[] => {
  const out: string[] = []
  if (!a.birthDate) out.push('дата рождения')
  if (!a.breed) out.push('порода')
  const hasParents =
    a.father || a.mother || a.pedigreeText?.fatherId || a.pedigreeText?.motherId
  if (!hasParents) out.push('происхождение')
  return out
}

export default async function VerificationPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()

  /*
   * В список идут только записи, которым есть куда расти: уже подтверждённые
   * подавать незачем, а в длинном списке они мешают выбирать.
   */
  const { docs } = orgId
    ? await payload.find({
        collection: 'animals',
        where: {
          and: [
            { owner: { equals: orgId } },
            { trustLevel: { less_than: 3 } },
            { archived: { not_equals: true } },
          ],
        },
        limit: 500,
        sort: 'identNumber',
        depth: 0,
        overrideAccess: true,
      })
    : { docs: [] }

  const rows = docs.map((a) => {
    const missing = missingOf(a)
    return {
      id: a.id as number,
      identNumber: a.identNumber,
      name: a.name,
      birthDate: a.birthDate,
      trustLevel: a.trustLevel,
      ready: missing.length === 0,
      missing,
    }
  })

  const requests = orgId
    ? await payload.find({
        collection: 'verification-requests',
        where: { organization: { equals: orgId } },
        limit: 20,
        depth: 0,
        overrideAccess: true,
      })
    : { docs: [] }

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="events" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'События', href: '/account?tab=events' },
              { label: 'Верификация записей' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Верификация записей
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Уровень «Верифицировано ассоциацией» получают записи, которые Ассоциация проверила
            по документам. Раньше это происходило только вместе с проверкой загруженного файла —
            теперь подтвердить можно любые свои записи, независимо от того, когда они попали
            в систему. Это же требуется перед выпуском{' '}
            <Link href="/account?tab=documents" className="underline underline-offset-4">
              племенного свидетельства
            </Link>
            .
          </p>

          {/*
             Ссылка на каталог стоит до формы, а не после.
             Читают её ровно один раз — перед первой подачей, — и если
             положить её ниже списка стада на пятьсот строк, до неё
             не доберётся никто. А польза от неё вся в том, чтобы прочесть
             раньше, чем подать.
          */}
          <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Перед подачей стоит заглянуть в{' '}
            <Link href="/account/checks" className="underline underline-offset-4">
              список автоматических проверок
            </Link>
            : система сверяет записи по нему сама, и часть замечаний проще снять
            заранее, чем получить их в заключении. А{' '}
            <Link href="/account/checks/herd" className="underline underline-offset-4">
              прогон по своему стаду
            </Link>{' '}
            покажет, что именно найдётся в ваших записях.
          </p>

          <div className="mt-8 space-y-6">
            <VerificationForm rows={rows} />

            {requests.docs.length > 0 && (
              <div className="card">
                <h2 className="panel-heading">Ваши заявки</h2>
                <table className="metric-table">
                  <thead>
                    <tr>
                      <th>Заявка</th>
                      <th>Подана</th>
                      <th className="text-right">Записей</th>
                      <th>Состояние</th>
                      <th>Заключение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.docs.map((r) => {
                      const held = r.review?.heldCount ?? 0
                      return (
                        <tr key={r.id}>
                          <td>
                            {/*
                              Номер заявки — ссылка на разбор. Раньше строка
                              заканчивалась счётчиком, и «с замечаниями 3»
                              было тупиком: какие именно три, узнать было
                              негде.
                            */}
                            <Link
                              href={`/account/verification/${r.id}`}
                              className="underline underline-offset-4 hover:text-forest-500"
                            >
                              {r.number ?? `#${r.id}`}
                            </Link>
                          </td>
                          <td>{dateRu(r.requestedAt)}</td>
                          <td className="text-right tabular-nums">{(r.animals ?? []).length}</td>
                          <td>{labelOf(VERIFICATION_STATUSES, r.status)}</td>
                          <td className="text-ink-500">
                            {r.status === 'approved' ? (
                              <>
                                подтверждено {r.review?.approvedCount ?? 0}
                                {held > 0 && (
                                  <>
                                    , не прошло {held} —{' '}
                                    <Link
                                      href={`/account/verification/${r.id}`}
                                      className="underline underline-offset-4 hover:text-forest-500"
                                    >
                                      смотреть замечания
                                    </Link>
                                  </>
                                )}
                              </>
                            ) : (
                              (r.review?.comment ?? '—')
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
