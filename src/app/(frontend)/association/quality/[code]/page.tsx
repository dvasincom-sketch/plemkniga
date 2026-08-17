import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { drilldown } from '@/lib/quality-drilldown'
import { dateRu } from '@/lib/format'

export const metadata: Metadata = { title: 'Разбор противоречия' }
export const dynamic = 'force-dynamic'

/**
 * Кто именно стоит за числом в сводке.
 *
 * Сводка отвечает «сколько», и останавливаться на этом нельзя: число без
 * возможности посмотреть, кто за ним стоит, — не находка, а повод
 * для беспокойства. Отсюда открывается карточка, а от неё уже видно,
 * чьё это хозяйство и что с записью делать.
 *
 * Список ограничен двумя сотнями строк. Дело не в скорости: разбирают
 * противоречия не «все сразу», а по одному, и страница на двадцать тысяч
 * строк ничем не поможет — она только скажет, что работы много, а это
 * и так написано в сводке.
 */
export default async function QualityDrilldownPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  await requireAssociation()
  const { code } = await params

  const payload = await getClient()
  const data = await drilldown(payload, code)
  if (!data) notFound()

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="quality" />

        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: 'Кабинет Ассоциации', href: '/association' },
              { label: 'Качество книги', href: '/association/quality' },
              { label: 'Разбор' },
            ]}
          />

          <h1 className="max-w-[30ch] text-[30px] font-medium leading-tight sm:text-[36px]">
            {data.label}
          </h1>

          <p className="mt-4 text-[15px] text-ink-700">
            Записей с этим противоречием: <b>{data.total.toLocaleString('ru-RU')}</b>
            {data.total > data.rows.length && <> · показаны первые {data.rows.length}</>} ·{' '}
            {data.severity === 'fix' ? 'существенно' : 'неполнота'}
          </p>

          <div className="card mt-6">
            <div className="overflow-x-auto">
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>Индивидуальный №</th>
                    <th>Кличка</th>
                    <th>Дата рождения</th>
                    <th>Хозяйство</th>
                    <th>В чём дело</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-ink-500">
                        Записей с этим противоречием нет
                      </td>
                    </tr>
                  )}

                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          href={`/animals/${r.id}`}
                          className="underline underline-offset-4 hover:text-forest-500"
                        >
                          {r.identNumber}
                        </Link>
                      </td>
                      <td>{r.name || '—'}</td>
                      <td className="whitespace-nowrap">{dateRu(r.birthDate)}</td>
                      <td className="text-ink-500">{r.owner || '—'}</td>
                      <td className="text-ink-500">{r.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
              Ассоциация видит записи всех хозяйств, включая закрытые: без этого проверять
              нечего. Править их она не может — исправляет владелец. Если противоречие
              существенно, обратитесь к хозяйству через замечание в пакете или заявке.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
