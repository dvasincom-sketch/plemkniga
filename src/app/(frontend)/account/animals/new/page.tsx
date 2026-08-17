import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { NewAnimalForm } from '@/components/NewAnimalForm'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'

export const metadata: Metadata = { title: 'Новое животное' }
export const dynamic = 'force-dynamic'

/**
 * Ручное заведение животного.
 *
 * Отдельной страницей, а не окном поверх списка: ввод со свидетельства —
 * работа на несколько минут, в которой отвлекаются, сверяются с бумагой
 * и возвращаются. Окно такое переживает плохо, а адрес страницы можно
 * открыть заново, переслать и оставить открытым.
 */
export default async function NewAnimalPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у него свой раздел
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()

  /*
   * Списки для выбора грузятся на сервере: пород в справочнике десятки,
   * стад у хозяйства единицы — это дешевле одного запроса из браузера
   * и работает до того, как страница станет интерактивной.
   */
  const [breeds, herds] = await Promise.all([
    payload.find({ collection: 'breeds', limit: 200, sort: 'name', depth: 0, overrideAccess: true }),
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
  ])

  return (
    <>
      <SiteHeader active="/account" />

      <main className="container-page pb-8">
        <AccountNav active="animals" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Личный кабинет', href: '/account' },
              { label: 'Мои животные', href: '/account?tab=animals' },
              { label: 'Новое животное' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Новое животное</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Ручной ввод — для одиночных случаев: купили животное, нашли расхождение с бумажным
            свидетельством, завели телёнка от своей коровы. Когда записей больше десятка,
            быстрее и надёжнее{' '}
            <Link href="/account/import" className="underline underline-offset-4">
              загрузить файлом
            </Link>
            : у пакета остаётся исходник, и спорный случай потом разбирают по нему.
          </p>

          <div className="mt-8 max-w-[70rem]">
            <NewAnimalForm
              breeds={breeds.docs.map((b) => ({ id: b.id as number, name: b.name }))}
              herds={herds.docs.map((h) => ({ id: h.id as number, name: h.name }))}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
