import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { HerdNav } from '@/components/HerdNav'
import { CabinetPage } from '@/components/CabinetPage'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { herdDrilldown } from '@/lib/herd-drilldown'
import { dateRu } from '@/lib/format'

export const metadata: Metadata = { title: 'Кто стоит за числом' }
export const dynamic = 'force-dynamic'

/**
 * Список животных за одним числом отчёта.
 *
 * ## Зачем страница
 *
 * До неё «Обзор» умел сказать «инбридинг выше порога у двенадцати» и не
 * умел показать, у каких. С числом ничего сделать нельзя, а с двенадцатью
 * коровами можно — выбрать им другого быка. Это единственное, ради чего
 * такое число вообще считают.
 *
 * ## Почему таблица своя, а не общая таблица стада
 *
 * У общей четырнадцать колонок и ни одной под причину попадания в список,
 * а здесь причина — главное: без неё «тёлка в передержке» неотличима
 * от любой другой строки. Плюс половина списков относится к животным,
 * которых в стаде уже нет (выбытие), и общая таблица их просто не покажет.
 *
 * ## Почему нет отбора и сортировки
 *
 * Список приходит из отчёта уже отобранным и упорядоченным по тому, что
 * в нём важно: тёлки — от самой передержанной, соматика — от худшей.
 * Дать здесь второй отбор значило бы позволить человеку получить
 * подмножество, которое ни с каким числом уже не сходится.
 */
export default async function HerdReportPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: у неё свой разбор
  denyAssociation(user)
  if (!user) redirect('/login')

  const { code } = await params
  const orgId = relId(user.organization)
  const payload = await getClient()

  /*
   * Без хозяйства списка нет и быть не может: все условия отбора
   * начинаются с владельца. Отдать пустую таблицу значило бы сказать
   * «таких животных нет», хотя вопрос в том, чьих искать.
   */
  const data = orgId ? await herdDrilldown(payload, orgId, code) : null
  if (!data) notFound()

  const shown = data.rows.length

  return (
    <>
      <SiteHeader active="/account" />

      <CabinetPage
        nav={
          <>
            <AccountNav active="herd" />
            <HerdNav active="reports" />
          </>
        }
        crumbs={[
          { label: 'Личный кабинет', href: '/account' },
          { label: 'Стадо', href: '/account?tab=herd' },
          { label: 'Отчёты', href: '/account?tab=herd&sub=reports' },
          { label: 'Разбор' },
        ]}
        title={data.label}
        intro={data.note}
      >
        <p className="mt-4 text-[15px] text-ink-700">
          Животных в списке: <b className="tabular-nums">{data.total.toLocaleString('ru-RU')}</b>
          {/*
             Об обрезке говорится вслух. Список, молчащий о том, что он
             неполон, — это ложь про размер: «показано двести» читается
             как «их двести».
          */}
          {data.total > shown && <> · показаны первые {shown}</>}
        </p>

        <div className="card mt-6">
          <div className="overflow-x-auto">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Индивидуальный №</th>
                  <th>Кличка</th>
                  <th>Дата рождения</th>
                  <th>{data.detailLabel}</th>
                </tr>
              </thead>
              <tbody>
                {shown === 0 && (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-ink-500">
                      Таких животных в стаде нет
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
                    <td className="font-medium">{r.name || '—'}</td>
                    <td className="whitespace-nowrap">{dateRu(r.birthDate)}</td>
                    <td className="whitespace-nowrap text-ink-500">{r.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-5 text-[14px]">
          <Link
            href="/account?tab=herd&sub=reports"
            className="underline underline-offset-4 hover:text-forest-500"
          >
            Вернуться к отчётам
          </Link>
        </p>
      </CabinetPage>

      <SiteFooter />
    </>
  )
}
