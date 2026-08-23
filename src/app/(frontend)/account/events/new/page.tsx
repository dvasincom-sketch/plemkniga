import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { RecordEvent } from '@/components/RecordEvent'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'

export const metadata: Metadata = { title: 'Записать событие' }
export const dynamic = 'force-dynamic'

/**
 * Единая точка записи события.
 *
 * До сих пор её не было вовсе: отёлы, осеменения и дойки принимались только
 * файлом, а запуск, перемещение и выбытие — с карточки конкретного
 * животного, из блока внизу страницы. Слово «события» при этом означало
 * в системе три разные вещи — вкладку с загрузками, коллекцию `events`
 * и вкладку карточки, — и человек, который хотел записать отёл, не находил
 * места, где это делается, потому что его не было.
 *
 * Отдельной страницей, а не окном: запись пяти отёлов подряд — работа
 * на несколько минут со сверкой по журналу, и адрес, который можно открыть
 * заново, тут полезнее модального окна.
 */
export default async function RecordEventPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: своих животных у него нет
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()

  /*
   * Справочники грузятся на сервере: их десятки строк, и один запрос
   * дешевле похода из браузера после отрисовки. Животные так не грузятся
   * и не должны: их тысячи, для них поиск (`AnimalPicker`).
   */
  const [herds, reasons, technicians] = await Promise.all([
    orgId
      ? payload.find({
          collection: 'herds',
          where: { organization: { equals: orgId } },
          limit: 100,
          sort: 'name',
          depth: 0,
          overrideAccess: true,
        })
      : Promise.resolve({ docs: [] as { id: number; name: string }[] }),
    payload
      .find({
        collection: 'disposal-reasons',
        limit: 100,
        sort: 'name',
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as { id: number; name: string }[] })),
    payload
      .find({
        collection: 'technicians',
        ...(orgId ? { where: { organization: { equals: orgId } } } : {}),
        limit: 100,
        sort: 'name',
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as { id: number; name: string }[] })),
  ])

  const choices = (list: { id: number | string; name?: string | null }[]) =>
    list.map((x) => ({ value: String(x.id), label: x.name ?? String(x.id) }))

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
              { label: 'Записать событие' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Записать событие
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Сначала скажите, что произошло, потом — с кем. Животное ищется по номеру
            или кличке, номера отёла и лактации проставляются сами. Это путь для
            нескольких записей; когда их десятки и сотни, тот же отёл, осеменение
            или дойка{' '}
            <Link href="/account/import" className="underline underline-offset-4">
              загружаются файлом
            </Link>{' '}
            — там выбирается вид данных и лежит шаблон под каждый.
          </p>

          <div className="mt-8 max-w-[70rem]">
            <RecordEvent
              herds={choices(herds.docs)}
              disposalReasons={choices(reasons.docs)}
              technicians={choices(technicians.docs)}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
