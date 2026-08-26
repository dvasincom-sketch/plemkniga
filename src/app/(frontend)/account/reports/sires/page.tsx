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
import { nf, signed } from '@/lib/format'
import { MIN_DAUGHTERS, sireSummary } from '@/lib/sire-summary'

export const metadata: Metadata = { title: 'Быки в моём стаде' }
export const dynamic = 'force-dynamic'

/**
 * Что каждый бык дал именно здесь.
 *
 * ## Почему разница со сверстницами бледнеет при малом числе дочерей
 *
 * Разница по двум дочерям — совпадение, а не результат, и выглядеть как
 * результат она не должна. Прятать её при этом нельзя: хозяйство вправе
 * видеть всё, что о нём посчитано. Поэтому она показана, но приглушена,
 * а рядом стоит число дочерей — тот же приём, что на карточке быка.
 *
 * ## Почему нет вывода «этот бык лучше»
 *
 * Вывод потребовал бы весов: удой против жира, жир против возраста
 * первого отёла, всё вместе против соматики. Веса у каждого хозяйства
 * свои — на то в книге и заведены профили индекса. Таблица показывает
 * стороны, выбор остаётся за зоотехником.
 */

export default async function SiresPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: это разбор его стада
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()
  const data = orgId ? await sireSummary(payload, orgId) : null

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
          { label: 'Быки' },
        ]}
        title="Быки в моём стаде"
        intro={
          <>
            Каталожная оценка быка посчитана по дочерям в десятках хозяйств — с другим
            кормлением, содержанием и климатом. Здесь другое: что он дал у вас.
            Дочери сравниваются с ровесницами того же стада, а не с каталожным средним,
            иначе разница означала бы только разницу в возрасте.
          </>
        }
      >
        {!data || data.rows.length === 0 ? (
          <div className="card mt-8">
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Разбор по быкам собирается из связи «дочь — отец». Пока в стаде нет коров
              с указанным отцом, группировать не по чему. Отца можно связать в карточке
              животного или прислать файлом — тогда отчёт соберётся сам.
            </p>
            <Link href="/account?tab=herd" className="btn btn-accent mt-5">
              Перейти к стаду
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[15px] text-ink-700">
              Быков с дочерями в стаде: <b className="tabular-nums">{data.rows.length}</b>
              {data.withoutSire > 0 && (
                <>
                  {' · '}
                  <span className="text-ink-500">
                    у {nf(data.withoutSire, 0)} коров из {nf(data.cows, 0)} отец в книге
                    не указан — в разбор они не входят
                  </span>
                </>
              )}
            </p>

            <div className="card mt-6">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="panel-heading mb-0">Дочери против сверстниц</h2>
                <InfoTip label="Как считается разница со сверстницами">
                  <p className="mb-2 font-medium text-ink-900">С кем сравниваются дочери</p>
                  <p className="mb-2">
                    С коровами того же стада и той же группы лактаций: первотёлки
                    с первотёлками, третья и старше со своими. Сравнение с каталожным
                    средним показывало бы разницу в кормлении, а не в быке.
                  </p>
                  <p className="mb-2">
                    Сами дочери из среднего по стаду не исключаются. Исключить их значило
                    бы сравнивать группу с остатком, который тем меньше, чем больше
                    в стаде дочерей этого быка: у быка с половиной стада «сверстницами»
                    осталась бы вторая половина, и разница удвоилась бы на ровном месте.
                  </p>
                  <p>
                    Числа здесь не сойдутся с оценкой быка в его карточке, и это
                    не ошибка: там сверстницы по всей книге, здесь — по одному
                    хозяйству. Вопросы разные.
                  </p>
                </InfoTip>
              </div>

              <div className="overflow-x-auto">
                <table className="metric-table">
                  <thead>
                    <tr>
                      <th>Бык</th>
                      <th className="text-right">ИПЦ</th>
                      <th className="text-right">Дочерей</th>
                      <th className="text-right">С лактацией</th>
                      <th className="text-right">Удой 305</th>
                      <th className="text-right">Против сверстниц</th>
                      <th className="text-right">Жир</th>
                      <th className="text-right">Белок</th>
                      <th className="text-right">Возраст 1-го отёла</th>
                      <th className="text-right">ССК</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => {
                      /*
                       * Мало дочерей — приглушаем разницу, а не прячем.
                       * Спрятать значило бы скрыть от хозяйства то, что
                       * о нём посчитано; показать наравне — выдать
                       * совпадение за закономерность.
                       */
                      const weak = r.withMilk < MIN_DAUGHTERS
                      return (
                        <tr key={r.id}>
                          <td>
                            <Link
                              href={`/animals/${r.id}`}
                              className="underline underline-offset-4 hover:text-forest-500"
                            >
                              {r.name || r.identNumber}
                            </Link>
                          </td>
                          <td className="text-right tabular-nums">
                            {r.ipc === null ? '—' : nf(r.ipc, 0)}
                          </td>
                          <td className="text-right font-medium tabular-nums">{r.daughters}</td>
                          <td className="text-right tabular-nums text-ink-500">{r.withMilk}</td>
                          <td className="text-right tabular-nums">
                            {r.milk305 === null ? '—' : nf(r.milk305, 0)}
                          </td>
                          <td
                            className={`text-right tabular-nums ${
                              weak
                                ? 'text-ink-400'
                                : r.vsMates !== null && r.vsMates < 0
                                  ? 'ipc-negative'
                                  : 'ipc-positive'
                            }`}
                            title={
                              weak
                                ? `Посчитано по ${r.withMilk} дочерям — это совпадение, а не результат`
                                : undefined
                            }
                          >
                            {r.vsMates === null ? '—' : signed(Math.round(r.vsMates))}
                          </td>
                          <td className="text-right tabular-nums">
                            {r.fatPercent === null ? '—' : nf(r.fatPercent, 2)}
                          </td>
                          <td className="text-right tabular-nums">
                            {r.proteinPercent === null ? '—' : nf(r.proteinPercent, 2)}
                          </td>
                          <td className="text-right tabular-nums">
                            {r.afc === null ? '—' : `${nf(r.afc, 1)} мес.`}
                          </td>
                          <td className="text-right tabular-nums">
                            {r.scc === null ? '—' : nf(r.scc, 0)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
                Разница, посчитанная меньше чем по {MIN_DAUGHTERS} дочерям, показана
                бледным: это совпадение, а не результат. Порядок в таблице — по числу
                дочерей, а не по разнице: сперва то, на что можно опереться. Вывода
                «этот бык лучше» здесь нет намеренно — он потребовал бы весов, а веса
                у каждого хозяйства свои, и заданы они в профилях индекса.
              </p>
            </div>

            <p className="mt-5 text-[14px]">
              <Link
                href="/account?tab=herd&sub=reports"
                className="underline underline-offset-4 hover:text-forest-500"
              >
                Вернуться к отчётам
              </Link>
            </p>
          </>
        )}
      </CabinetPage>

      <SiteFooter />
    </>
  )
}
