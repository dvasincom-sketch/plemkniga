import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { DataNav } from '@/components/DataNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { VerificationForm } from '@/components/VerificationForm'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import {
  OPEN_VERIFICATION_STATUSES,
  VERIFICATION_STATUSES,
} from '@/collections/VerificationRequests'
import { labelOf } from '@/lib/dictionaries'
import { dateRu } from '@/lib/format'
import { GAP_LABEL, GAP_ORDER, GAP_WHY, completenessGaps } from '@/lib/completeness'

export const metadata: Metadata = { title: 'Верификация записей' }
export const dynamic = 'force-dynamic'

/**
 * Подача животных на верификацию — сторона хозяйства.
 *
 * Отдельной страницей, а не кнопкой в списке стада: выбор записей —
 * осмысленная работа, её делают со списком в руках и сверяясь с бумагами,
 * а не мимоходом между двумя фильтрами.
 */

/*
 * Чего не хватает записи, считает `completeness.ts` — то же правило,
 * что заслон применяет при подтверждении.
 *
 * Здесь стоял свой список из трёх условий, и он расходился с заслоном:
 * происхождением считался любой из родителей, а отёлы и дойки
 * не проверялись вовсе. Хозяйство видело «готово», подавало заявку
 * и получало отказ по причинам, о которых страница молчала. Требование,
 * объявленное в одном месте и применяемое в другом, — это способ
 * потратить чужое время.
 */

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

  const requests = orgId
    ? await payload.find({
        collection: 'verification-requests',
        where: { organization: { equals: orgId } },
        limit: 20,
        sort: '-requestedAt',
        depth: 0,
        overrideAccess: true,
      })
    : { docs: [] }

  /*
   * Какие записи уже ждут решения.
   *
   * Считается из тех же заявок, что показаны ниже, — отдельного запроса
   * не нужно. Если запись попала в две открытые заявки (так бывало
   * до появления этой проверки), берётся первая по свежести: показывать
   * человеку обе значило бы объяснять ему нашу же прежнюю недоработку.
   */
  const openBy = new Map<number, { number: string; status: string }>()
  for (const r of requests.docs) {
    if (!OPEN_VERIFICATION_STATUSES.some((s) => s === r.status)) continue
    for (const a of r.animals ?? []) {
      const id = relId(a)
      if (typeof id !== 'number' || openBy.has(id)) continue
      openBy.set(id, { number: String(r.number ?? `#${r.id}`), status: String(r.status) })
    }
  }

  const gapsBy = new Map(
    (await completenessGaps(payload, docs.map((a) => a.id as number))).map((g) => [
      g.animalId,
      g.missing.map((c) => GAP_LABEL[c]),
    ]),
  )

  const rows = docs.map((a) => {
    const missing = gapsBy.get(a.id as number) ?? []
    return {
      id: a.id as number,
      identNumber: a.identNumber,
      name: a.name,
      birthDate: a.birthDate,
      trustLevel: a.trustLevel,
      ready: missing.length === 0,
      missing,
      openRequest: openBy.get(a.id as number) ?? null,
    }
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
              { label: 'Данные', href: '/account?tab=data' },
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
            <Link href="/account?tab=herd&sub=documents" className="underline underline-offset-4">
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

          {/*
             Состав необходимого назван до подачи, а не в тексте отказа.
             Требование, о котором узнают из отказа, читается как придирка;
             названное заранее — как условие. Список берётся из того же
             правила, которым потом проверяют, поэтому разойтись они
             не могут.
          */}
          <details className="card mt-8">
            <summary className="cursor-pointer list-none text-[15px] font-medium">
              Что должно быть в записи, чтобы её подтвердили
              <span className="ml-2 text-[14px] font-normal text-ink-500">
                — {GAP_ORDER.length} требования, разверните
              </span>
            </summary>
            <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
              Подтверждение Ассоциации означает две вещи сразу: расхождений в данных нет
              и передано всё необходимое. Второе — вот это.
            </p>
            <dl className="mt-4 max-w-[70ch] space-y-3 text-[15px] leading-relaxed">
              {GAP_ORDER.map((code) => (
                <div key={code}>
                  <dt className="font-medium">{GAP_LABEL[code]}</dt>
                  <dd className="text-ink-700">{GAP_WHY[code]}</dd>
                </div>
              ))}
            </dl>
          </details>

          <div className="mt-6 space-y-6">
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
                            {r.status === 'cancelled' ? (
                              /*
                                 У отозванной заключения нет и не будет —
                                 в этой ячейке место сказать, почему она
                                 отозвана. Иначе строка выглядит оборванной:
                                 состояние есть, объяснения нет.
                              */
                              <>
                                отозвана вами
                                {r.withdrawnFor && <> в пользу заявки {r.withdrawnFor}</>}
                              </>
                            ) : r.status === 'approved' ? (
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
