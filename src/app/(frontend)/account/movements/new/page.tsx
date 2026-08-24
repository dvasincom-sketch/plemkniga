import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { DataNav } from '@/components/DataNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { MovementForm } from '@/components/MovementForm'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'

export const metadata: Metadata = { title: 'Записать перемещение' }
export const dynamic = 'force-dynamic'

/**
 * Перемещение животного между хозяйствами.
 *
 * ## Почему отдельно от «Записать событие»
 *
 * На той странице записывают то, что произошло с животным: отёл, дойку,
 * запуск. Здесь — то, что произошло с правом на него. Разница не в удобстве,
 * а в цене ошибки: неверная дойка правится тем же хозяйством за минуту,
 * неверная продажа отдаёт карточку чужим рукам, и вернуть её сможет только
 * Ассоциация. Соседство в одном списке ровняло бы эти два действия.
 *
 * ## Почему покупатель может не быть членом Ассоциации
 *
 * Так продают на самом деле. Требовать, чтобы у покупателя была учётная
 * запись, значит либо не дать записать половину сделок, либо получить
 * фиктивные регистрации ради одной строки. Карточка «хозяйство упомянуто,
 * книгу не ведёт» — честное описание того, что система про него знает:
 * название, ИНН, и всё.
 */
export default async function NewMovementPage({
  searchParams,
}: {
  searchParams: Promise<{ animal?: string }>
}) {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: своих животных у него нет
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()
  const sp = await searchParams

  const herds = orgId
    ? await payload.find({
        collection: 'herds',
        where: { organization: { equals: orgId } },
        limit: 100,
        sort: 'name',
        depth: 0,
        overrideAccess: true,
      })
    : { docs: [] as { id: number; name: string }[] }

  /*
   * Животное из адреса принимается только если оно ваше: ссылка приходит
   * с карточки, а карточку могли открыть и чужую. Проверка здесь, а не
   * в форме, — форма клиентская, и её значение приходит от браузера.
   */
  const asked = Number(sp.animal)
  let defaultAnimal: number | undefined
  if (Number.isFinite(asked) && asked > 0 && orgId) {
    const animal = await payload
      .findByID({ collection: 'animals', id: asked, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (animal && relId(animal.owner) === orgId) defaultAnimal = asked
  }

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="data" />
        <DataNav active="write" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Данные', href: '/account?tab=data' },
              { label: 'Записать перемещение' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Записать перемещение
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Продажа, аренда, перевод между площадками, выбраковка, падёж и поступление
            извне. Продажа и поступление меняют владельца — после них карточку ведёт
            другое хозяйство; остальные виды меняют только площадку или состояние.
            Покупателя не обязательно искать в книге: если его там нет, впишите название,
            и карточка заведётся с пометкой «книгу не ведёт».
          </p>

          <div className="mt-8 max-w-[70rem]">
            <MovementForm
              herds={herds.docs.map((h) => ({ value: String(h.id), label: h.name }))}
              defaultAnimal={defaultAnimal}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
