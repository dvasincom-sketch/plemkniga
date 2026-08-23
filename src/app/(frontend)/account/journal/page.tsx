import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Where } from 'payload'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { OperationsTable, OperationGroups } from '@/components/OperationsTable'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { OPERATIONS, OPERATION_GROUPS } from '@/lib/operations'
import type { Operation } from '@/payload-types'

export const metadata: Metadata = { title: 'Журнал операций' }
export const dynamic = 'force-dynamic'

const PAGE = 100

/**
 * Журнал операций хозяйства.
 *
 * ## Зачем он хозяйству, а не только Ассоциации
 *
 * ТЗ (требование №19) просит журнал как средство надзора. Но первым
 * его читателем оказывается само хозяйство, и вопросы у него свои:
 * кто выпустил ту ссылку, кто отправил корову в архив, когда именно
 * заблокировали уволенного. До сих пор ответы на них лежали в трёх
 * разных журналах, а на половину — не лежали нигде.
 *
 * ## Почему здесь нет правок карточек построчно
 *
 * У них свой журнал, на самой карточке, и он подробнее: показывает,
 * какое поле на что поменялось. Скопировать его сюда значило бы утопить
 * всё остальное — правок в тысячу раз больше, чем решений, — и завести
 * второй источник правды о том же событии.
 */
export default async function AccountJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>
}) {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой журнал
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  if (!orgId) redirect('/account')

  const { group } = await searchParams
  const active = OPERATION_GROUPS.some((g) => g.value === group) ? group! : 'all'

  const mine: Where = { or: [{ organization: { equals: orgId } }, { actor: { equals: user.id } }] }
  const inGroup =
    active === 'all'
      ? undefined
      : {
          action: {
            in: OPERATIONS.filter((o) => o.group === active).map((o) => o.value),
          },
        }

  const payload = await getClient()
  const found = await payload.find({
    collection: 'operations',
    where: inGroup ? { and: [mine, inGroup] } : mine,
    sort: '-at',
    limit: PAGE,
    depth: 0,
    overrideAccess: true,
  })

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="journal" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[{ label: 'Личный кабинет', href: '/account' }, { label: 'Журнал операций' }]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Журнал операций</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Что происходило с данными вашего хозяйства и что делали ваши люди: входы,
            приглашения и блокировки, заведение и архивирование карточек, перемещения,
            выпуск и отзыв доступа, заявки и решения Ассоциации. Построчные правки карточек
            сюда не попадают — у них свой журнал, прямо на карточке, и он подробнее.
          </p>

          <OperationGroups base="/account/journal" active={active} />

          <div className="mt-6">
            <OperationsTable rows={found.docs as Operation[]} />
          </div>

          {found.totalDocs > PAGE && (
            <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
              Показаны последние {PAGE} записей из {found.totalDocs}. Отбор по разделу сужает
              выдачу; за более старым — в{' '}
              <Link href="/account/access" className="underline underline-offset-4">
                разделы, где эти записи живут
              </Link>
              .
            </p>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
