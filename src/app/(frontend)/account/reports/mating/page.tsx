import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AccountNav } from '@/components/AccountNav'
import { HerdNav } from '@/components/HerdNav'
import { CabinetPage } from '@/components/CabinetPage'
import { InfoTip } from '@/components/InfoTip'
import { getClient, getCurrentUser } from '@/lib/payload'
import { denyAssociation } from '@/lib/association'
import { relId } from '@/lib/visibility'
import { nf } from '@/lib/format'
import { INBREEDING_LABEL, INBREEDING_THRESHOLD } from '@/lib/herd-analytics'
import {
  MATING_BULLS_MAX,
  MATING_COWS_MAX,
  MATING_DEPTH,
  matingPlan,
} from '@/lib/mating'

export const metadata: Metadata = { title: 'Подбор быков' }
export const dynamic = 'force-dynamic'

/**
 * Подбор: команда быков против стада, инбридинг потомка в каждой клетке.
 *
 * ## Почему таблица, а не «рекомендуем быка X»
 *
 * Рекомендация потребовала бы сложить инбридинг с племенной ценностью
 * в одно число — то есть назначить цену родству в единицах индекса.
 * Такой цены не существует: у хозяйства, которое продаёт племенной
 * молодняк, и у хозяйства, которое доит, она разная. Таблица показывает
 * обе стороны и оставляет решение зоотехнику — тот же довод, что
 * в списке выбраковки.
 *
 * ## Почему выбор быков — обычная форма, а не живой поиск
 *
 * Выбор делается раз и надолго: команду быков набирают на сезон,
 * покупая семя. Живой поиск с подгрузкой понадобился бы для перебора,
 * которого здесь не бывает, и утащил бы страницу на клиент вместе
 * с расчётом родословных.
 */

type Search = Promise<{ bull?: string | string[] }>

const asIds = (v?: string | string[]): number[] => {
  const raw = v === undefined ? [] : Array.isArray(v) ? v : [v]
  return raw
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0)
    .slice(0, MATING_BULLS_MAX)
}

export default async function MatingPage({ searchParams }: { searchParams: Search }) {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: подбор ведёт хозяйство
  denyAssociation(user)
  if (!user) redirect('/login')

  const sp = await searchParams
  const picked = asIds(sp.bull)
  const orgId = relId(user.organization)
  const payload = await getClient()

  /*
   * Кандидаты в команду: быки-производители книги по убыванию индекса.
   * Своих в стаде обычно единицы, а подбирают в том числе чужих —
   * ради того и нужна общая книга.
   */
  const candidates = await payload.find({
    collection: 'animals',
    where: { and: [{ sex: { equals: 'male' } }, { ageGroup: { equals: 'bull' } }] },
    limit: 60,
    depth: 0,
    sort: '-ipcRank',
    overrideAccess: true,
  })

  const plan = orgId && picked.length > 0 ? await matingPlan(payload, orgId, picked) : null

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
          { label: 'Подбор' },
        ]}
        title="Подбор быков"
        intro={
          <>
            Инбридинг будущего потомка для каждой пары «корова × бык». Считать его может
            только тот, у кого есть обе родословные разом: у системы управления стадом
            есть ваша, у каталога быков — его, и ни у кого нет обеих. Отметьте быков,
            чьё семя вы покупаете, — до {MATING_BULLS_MAX} за раз.
          </>
        }
      >
        {/* --------------------------- Выбор быков --------------------------- */}
        <form method="get" className="card mt-8">
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="panel-heading mb-0">Команда быков</h2>
            <InfoTip label="Как считается инбридинг потомка">
              <p className="mb-2 font-medium text-ink-900">Что здесь за число</p>
              <p className="mb-2">
                Инбридинг потомка равен коэффициенту родства его родителей. Считается
                по Райту: сумма по всем общим предкам и всем путям к ним, с поправкой
                на собственный инбридинг каждого предка.
              </p>
              <p className="mb-2">
                Обход идёт на {MATING_DEPTH} колен. Расчёт в карточке животного идёт
                на девять — там одна родословная и время не жалко, здесь пар сотни,
                и каждое колено удваивает работу. Поэтому числа могут слегка
                расходиться с коэффициентом в карточке.
              </p>
              <p>
                Где собственный инбридинг предка не заполнен, он принимается нулём:
                коэффициент выходит заниженным, а не завышенным. Направление выбрано
                намеренно — порог предупреждающий, и ошибаться он должен в сторону
                «покажем меньше, чем есть».
              </p>
            </InfoTip>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.docs.map((b) => (
              <label key={b.id} className="flex items-baseline gap-2 text-[14px]">
                <input
                  type="checkbox"
                  name="bull"
                  value={String(b.id)}
                  defaultChecked={picked.includes(b.id as number)}
                  className="checkbox"
                />
                <span>
                  {b.name || b.identNumber}
                  <span className="ml-1.5 tabular-nums text-ink-500">
                    {b.ipc === null || b.ipc === undefined ? '' : nf(b.ipc, 0)}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-accent">
              Посчитать подбор
            </button>
            {picked.length > 0 && (
              <Link href="/account/reports/mating" className="btn">
                Сбросить
              </Link>
            )}
            <span className="text-[13px] text-ink-500">
              Отмечено {picked.length} из {MATING_BULLS_MAX}
            </span>
          </div>
        </form>

        {/* ----------------------------- Матрица ----------------------------- */}
        {plan && plan.rows.length > 0 && (
          <section className="mt-9">
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="section-title mb-0">Инбридинг потомка</h2>
            </div>
            <p className="mb-4 text-[13px] text-ink-500">
              Коров в подборе {nf(plan.cows, 0)}
              {plan.cows > plan.rows.length && <> · показаны первые {plan.rows.length}</>} · пар
              выше {INBREEDING_LABEL} — <b>{nf(plan.risky, 0)}</b>. Порядок строк —
              от самых засидевшихся после отёла: с ними решать раньше.
            </p>

            <div className="card">
              <div className="overflow-x-auto">
                <table className="metric-table">
                  <thead>
                    <tr>
                      <th>Корова</th>
                      <th className="text-right">Лакт.</th>
                      {plan.bulls.map((b) => (
                        <th key={b.id} className="text-right">
                          {b.name || b.identNumber}
                          <span className="ml-1 block text-[11px] font-normal tabular-nums text-ink-500">
                            {b.ipc === null ? '—' : nf(b.ipc, 0)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link
                            href={`/animals/${r.id}`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {r.name || r.identNumber}
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">{r.lactation}</td>
                        {r.cells.map((c) => {
                          const over = c.coi > INBREEDING_THRESHOLD
                          return (
                            <td
                              key={c.bullId}
                              className={`text-right tabular-nums ${
                                over
                                  ? 'bg-[#fdecea] font-medium text-[#8a2d22]'
                                  : c.coi > 0
                                    ? ''
                                    : 'text-ink-400'
                              }`}
                              title={
                                over
                                  ? `Выше порога ${INBREEDING_LABEL} — эквивалент спаривания двоюродных`
                                  : c.coi === 0
                                    ? 'Общих предков в пределах глубины расчёта не найдено'
                                    : undefined
                              }
                            >
                              {c.coi === 0 ? '—' : `${nf(c.coi, 2)} %`}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
                Розовым отмечены пары выше {INBREEDING_LABEL} — это эквивалент
                спаривания двоюродных. Порог предупреждающий, а не запрет: решение
                за вами. Прочерк означает, что общих предков в пределах {MATING_DEPTH} колен
                не нашлось, а не то, что их нет вовсе, — родословная может быть неполной.
                Совета «берите вот этого» здесь нет намеренно: он потребовал бы назначить
                родству цену в единицах индекса, а она разная у того, кто продаёт
                молодняк, и у того, кто доит.
              </p>
            </div>
          </section>
        )}

        {plan && plan.rows.length === 0 && (
          <div className="card mt-8">
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Подбирать некому: в стаде нет ни одной коровы или тёлки старше тринадцати
              месяцев, которой сейчас нужен бык. Стельные в подбор не входят — им бык
              не нужен, — а тёлок моложе тринадцати месяцев не осеменяют.
            </p>
          </div>
        )}

        {!plan && (
          <p className="mt-8 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Отметьте быков и нажмите «Посчитать подбор». Расчёт идёт по всему стаду
            сразу, до {nf(MATING_COWS_MAX, 0)} коров за раз.
          </p>
        )}

        <p className="mt-8 text-[14px]">
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
