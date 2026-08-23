import type { Metadata } from 'next'
import type { Where } from 'payload'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { OperationsTable, OperationGroups } from '@/components/OperationsTable'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { OPERATIONS, OPERATION_GROUPS } from '@/lib/operations'
import type { Operation } from '@/payload-types'

export const metadata: Metadata = { title: 'Журнал операций' }
export const dynamic = 'force-dynamic'

const PAGE = 200

/**
 * Сводный журнал операций по всей книге.
 *
 * ## Что он отвечает, чего не отвечали три прежних журнала
 *
 * Журнал правок знает, что менялось в карточках. Журнал просмотров —
 * кто открывал чужие записи по выданному доступу. Реестр удалённых —
 * что было под номером, которого больше нет. Ни один из них не отвечает
 * на вопрос, с которого начинается любой разбор: **что вообще
 * происходило в этот день**. Половина действий не оставляла строки
 * нигде — вход, блокировка, выпуск ссылки, решение по членству.
 *
 * ## Почему нет поиска по свободному тексту
 *
 * Он выглядит нужным и на журнале работает плохо: строки короткие
 * и однотипные, поиск по ним даёт либо ничего, либо всё. Полезны здесь
 * два отбора — по разделу и по хозяйству, — и оба точные.
 */
export default async function AssociationJournalPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; org?: string }>
}) {
  await requireAssociation()

  const { group, org } = await searchParams
  const active = OPERATION_GROUPS.some((g) => g.value === group) ? group! : 'all'
  const orgId = Number(org)

  const filters: Where[] = []
  if (active !== 'all') {
    filters.push({
      action: { in: OPERATIONS.filter((o) => o.group === active).map((o) => o.value) },
    })
  }
  if (Number.isFinite(orgId) && orgId > 0) filters.push({ organization: { equals: orgId } })

  const payload = await getClient()
  const found = await payload.find({
    collection: 'operations',
    where: filters.length ? { and: filters } : undefined,
    sort: '-at',
    limit: PAGE,
    depth: 1,
    overrideAccess: true,
  })

  /*
   * Счётчики по разделам считаются отдельными `count`, а не разбором
   * выдачи: выдача обрезана двумя сотнями строк, и счётчик по ней
   * показывал бы «сколько таких на первой странице» — число, которое
   * ничего не значит и выглядит как ответ.
   */
  const counts: Record<string, number> = {}
  await Promise.all(
    OPERATION_GROUPS.map(async (g) => {
      const c = await payload.count({
        collection: 'operations',
        overrideAccess: true,
        where: { action: { in: OPERATIONS.filter((o) => o.group === g.value).map((o) => o.value) } },
      })
      counts[g.value] = c.totalDocs
    }),
  )

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="journal" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Журнал операций</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Что происходило в книге: входы и отказы на входе, приглашения, смены ролей
            и блокировки, заведение и архивирование карточек, перемещения между хозяйствами,
            выпуск и отзыв доступа, заявки и решения. Журнал тонкий: он называет действие
            и указывает предмет, а подробности лежат там, где им место, — состав правки
            в журнале карточки, находки в заявке, строки загрузки в пакете.
          </p>

          <OperationGroups base="/association/journal" active={active} counts={counts} />

          <div className="mt-6">
            <OperationsTable rows={found.docs as Operation[]} showOrganization />
          </div>

          <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
            {found.totalDocs > PAGE
              ? `Показаны последние ${PAGE} записей из ${found.totalDocs}. `
              : `Записей: ${found.totalDocs}. `}
            Записать сюда нельзя ничем, кроме служебного вызова: у коллекции закрыты
            и создание, и изменение, включая доступ Ассоциации. Журнал, в который можно
            вписаться, ничего не свидетельствует.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
