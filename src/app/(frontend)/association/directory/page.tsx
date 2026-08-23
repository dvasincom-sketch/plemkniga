import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { DirectoryReview } from '@/components/DirectoryReview'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { dateRu } from '@/lib/format'
import type { Organization } from '@/payload-types'

export const metadata: Metadata = { title: 'Справочник хозяйств' }
export const dynamic = 'force-dynamic'

/**
 * Карточки хозяйств, заведённые контрагентами.
 *
 * ## Откуда они берутся
 *
 * Хозяйство оформляет продажу и не находит покупателя в книге —
 * потому что тот в Ассоциации не состоит и никогда не состоял. Требовать
 * от покупателя регистрации ради одной строки нельзя: половина сделок
 * просто не будет записана. Поэтому продавец вписывает название, и карточка
 * заводится сама — с пометкой «книгу не ведёт» и с очередью сюда.
 *
 * ## Зачем эта страница вообще нужна
 *
 * Без разбора справочник зарастает за год: «ООО "Заря"», «ООО Заря»
 * и «Заря, ООО» окажутся тремя хозяйствами, и история перемещений
 * распадётся на три ветки, каждая из которых выглядит полной. Ключ
 * названия ловит очевидные совпадения при вводе, но «Заря» и «Зорька»
 * он не различит и не должен: это работа человека, знающего область.
 *
 * ## Почему нет кнопки «удалить»
 *
 * На каждую карточку уже ссылается перемещение — утверждение о том,
 * чьё животное. Удалить одну сторону сделки значит стереть половину
 * факта. Дубль сливается: перемещения переезжают на основную карточку,
 * а лишняя остаётся с отметкой «слито с» и уходит из поиска.
 */
export default async function DirectoryPage() {
  await requireAssociation()

  const payload = await getClient()

  const [pending, merged] = await Promise.all([
    payload.find({
      collection: 'organizations',
      where: {
        and: [{ presence: { equals: 'referenced' } }, { mergedInto: { exists: false } }],
      },
      limit: 200,
      sort: 'name',
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'organizations',
      where: { mergedInto: { exists: true } },
      limit: 50,
      sort: '-updatedAt',
      depth: 1,
      overrideAccess: true,
    }),
  ])

  const docs = pending.docs as Organization[]
  const nameOf = (v: unknown): string =>
    v && typeof v === 'object' ? ((v as Organization).name ?? '') : ''

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="directory" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Справочник хозяйств
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Карточки, которые завели сами хозяйства, оформляя продажу покупателю вне книги.
            У такой карточки есть название, иногда ИНН — и больше ничего: ни учётной записи,
            ни данных. Разобрать нужно каждую, и ответа два. Если это настоящее хозяйство,
            которого в книге не было, — отметить самостоятельным. Если то же самое хозяйство
            уже есть под другим написанием — слить, и перемещения переедут на основную карточку.
          </p>

          <div className="card mt-8">
            <h2 className="panel-heading">Ждут разбора · {docs.length}</h2>

            {docs.length === 0 ? (
              <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                Неразобранных карточек нет. Они появляются здесь, когда хозяйство оформляет
                продажу покупателю, которого в книге не нашлось.
              </p>
            ) : (
              <ul className="divide-y divide-[#e6e6e6]">
                {docs.map((o) => (
                  <li key={o.id} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="text-[17px] font-medium">{o.name}</span>
                      {o.inn && (
                        <span className="text-[14px] text-ink-500 tabular-nums">ИНН {o.inn}</span>
                      )}
                      {o.region && <span className="text-[14px] text-ink-500">{o.region}</span>}
                    </div>

                    <p className="mt-1 text-[13px] text-ink-500">
                      {o.referencedBy
                        ? `Карточку завело хозяйство «${nameOf(o.referencedBy)}»`
                        : 'Кто завёл карточку — не записано'}
                      {o.createdAt ? ` · ${dateRu(o.createdAt)}` : ''}
                    </p>

                    <div className="mt-4">
                      <DirectoryReview id={o.id} name={o.name} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {merged.docs.length > 0 && (
            <div className="card mt-6">
              <h2 className="panel-heading">Слитые карточки</h2>
              <p className="mb-4 max-w-[70ch] text-[14px] leading-relaxed text-ink-500">
                Остаются навсегда: на них могли ссылаться выданные документы и выгрузки,
                ушедшие наружу. Из поиска они убраны, перемещения переехали на основную.
              </p>
              <ul className="space-y-2 text-[14px]">
                {(merged.docs as Organization[]).map((o) => (
                  <li key={o.id}>
                    {o.name} → <span className="font-medium">{nameOf(o.mergedInto)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
