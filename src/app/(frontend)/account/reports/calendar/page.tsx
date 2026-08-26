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
import { dateRu } from '@/lib/format'
import {
  CALVING_HORIZON,
  CYCLE_DAYS,
  DRY_OFF_BEFORE,
  GESTATION_DAYS,
  PREG_CHECK_FROM,
  herdCalendar,
  type CalendarRow,
} from '@/lib/herd-calendar'

export const metadata: Metadata = { title: 'Календарь стада' }
export const dynamic = 'force-dynamic'

/**
 * Календарь: запуск, отёл, проверка стельности.
 *
 * ## Почему три списка, а не один поток событий
 *
 * Единая лента «что происходит на неделе» смешала бы работы разных людей
 * и разных сроков: запуск планируют за месяц, родильное готовят за неделю,
 * а проверку стельности назначают на день приезда врача. Три списка можно
 * распечатать по отдельности и отдать разным людям — одну ленту нельзя.
 *
 * ## Пустой список — не поломка
 *
 * Все три складываются из осеменений. Хозяйство, которое их не записывает,
 * увидит здесь пусто, и это правда: без даты осеменения срок отёла
 * не выводится ниоткуда. Поэтому пустота объясняется словами, а не молчит.
 */

function Section({
  title,
  note,
  why,
  rows,
  empty,
  measure,
}: {
  title: string
  note: string
  why: React.ReactNode
  rows: CalendarRow[]
  empty: string
  /** Подпись колонки со сроком: у проверки это «прошло», у прочих «осталось». */
  measure: string
}) {
  return (
    <section className="mt-9">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="section-title mb-0">
          {title}
          {rows.length > 0 && (
            <span className="ml-2 align-middle text-[15px] font-normal tabular-nums text-ink-500">
              {rows.length}
            </span>
          )}
        </h2>
        <InfoTip label={`Как считается: ${title}`}>{why}</InfoTip>
      </div>
      <p className="mb-4 text-[13px] text-ink-500">{note}</p>

      <div className="card">
        {rows.length === 0 ? (
          <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Инд.№</th>
                  <th>Кличка</th>
                  <th className="text-right">Лакт.</th>
                  <th className="text-right">Дата</th>
                  <th className="text-right">{measure}</th>
                  <th>От чего считали</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
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
                    <td className="text-right tabular-nums">{r.lactation}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{dateRu(r.at)}</td>
                    {/*
                       Просроченное красным. Это не украшение: строка
                       «минус три дня» и строка «двенадцать дней» требуют
                       разных действий — первая уже сегодня.
                    */}
                    <td
                      className={`text-right tabular-nums ${r.days < 0 ? 'text-[#c0392b]' : ''}`}
                    >
                      {r.days}
                    </td>
                    <td className="whitespace-nowrap text-ink-500">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

export default async function CalendarPage() {
  const user = await getCurrentUser()
  // Кабинет хозяйства — не для сотрудника Ассоциации: это его ежедневная работа
  denyAssociation(user)
  if (!user) redirect('/login')

  const orgId = relId(user.organization)
  const payload = await getClient()
  const data = orgId ? await herdCalendar(payload, orgId) : null

  const nothing =
    !data ||
    (data.dryOff.length === 0 &&
      data.calving.length === 0 &&
      data.pregCheck.length === 0 &&
      data.rebreed.length === 0)

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
          { label: 'Календарь' },
        ]}
        title="Календарь стада"
        intro={
          <>
            Три списка на ближайшие недели: кого запускать, кто телится, кого проверять
            на стельность. Всё выводится из отёлов и осеменений, которые вы уже
            записываете, — вводить для календаря нечего. Ожидаемый отёл считается
            как плодотворное осеменение плюс {GESTATION_DAYS} дней.
          </>
        }
      >
        {nothing && (
          <div className="card mt-8">
            <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Календарь пуст, и это не поломка. Все три списка строятся от даты
              осеменения: без неё срок отёла не выводится ниоткуда, а значит нельзя
              сказать ни кого запускать, ни кто телится. Записывайте осеменения
              с результатом — календарь соберётся сам.
            </p>
            <Link href="/account/events/new" className="btn btn-accent mt-5">
              Записать осеменение
            </Link>
          </div>
        )}

        {/*
           Когда пусто всё, объяснение выше сказано один раз — три карточки
           «никого нет» под ним только повторяли бы его втрое. Когда пуст
           один список из трёх, его собственная пустота содержательна:
           «отёлов нет, а запускать есть кого» — это сообщение.
        */}
        {data && !nothing && (
          <>
            <Section
              title="Пора запускать"
              note={`Стельные коровы, до отёла не больше ${DRY_OFF_BEFORE} дней, запуск не отмечен`}
              measure="Дней до отёла"
              rows={data.dryOff}
              empty="Никого запускать не пора: стельных коров с отёлом в ближайшие два месяца нет, либо запуск у них уже отмечен."
              why={
                <>
                  <p className="mb-2 font-medium text-ink-900">Откуда шестьдесят дней</p>
                  <p className="mb-2">
                    Общепринятая длина сухостоя. Короче сорока пяти дней заметно снижает
                    удой следующей лактации: вымя не успевает обновить секреторную ткань.
                    Длиннее семидесяти — лишний корм без молока и риск ожирения,
                    а за ним кетоза после отёла.
                  </p>
                  <p>
                    Нетелей в списке нет: перед первым отёлом запускать нечего.
                    Корова уходит из списка, как только у последнего отёла проставлена
                    дата запуска.
                  </p>
                </>
              }
            />

            <Section
              title="Отёлы на ближайший месяц"
              note={`Ожидаемый отёл в пределах ${CALVING_HORIZON} дней, включая нетелей`}
              measure="Дней до отёла"
              rows={data.calving}
              empty="Отёлов в ближайший месяц не ожидается — по тем осеменениям, что записаны."
              why={
                <>
                  <p className="mb-2 font-medium text-ink-900">Почему считается, а не хранится</p>
                  <p className="mb-2">
                    Поля «ожидаемая дата отёла» в книге нет намеренно: оно повторяло бы
                    то, что выводится из даты плодотворного осеменения, и первым же
                    разошлось бы с ней при правке. Стельность голштинки — в среднем{' '}
                    {GESTATION_DAYS} дней, разброс 275–283.
                  </p>
                  <p>
                    Нетели включены наравне с коровами: телится нетель так же, и список
                    без них соврал бы родильному отделению. Отёл, просроченный больше чем
                    на две недели, из списка уходит — это уже вопрос к данным,
                    а не план.
                  </p>
                </>
              }
            />

            <Section
              title="Проверить стельность"
              note={`Последнее осеменение было ${PREG_CHECK_FROM} и больше дней назад, результат не подтверждён`}
              measure="Дней прошло"
              rows={data.pregCheck}
              empty="Проверять некого: у всех недавно осеменённых либо подтверждена стельность, либо проставлена дата проверки."
              why={
                <>
                  <p className="mb-2 font-medium text-ink-900">Откуда тридцать дней</p>
                  <p className="mb-2">
                    Ультразвуком стельность видно с 28–32 дней, ректально — с 35–40.
                    Раньше проверять нечего, позже — терять дни, если корова осталась
                    яловой: каждый такой день это несостоявшаяся лактация.
                  </p>
                  <p>
                    Здесь только те, у кого результат неизвестен вовсе. Яловые сюда
                    не попадают: проверять стельность у коровы, про которую уже известно,
                    что она яловая, незачем — ей нужно новое осеменение, а это другой
                    день, другой человек и другой список. Уходит строка тогда, когда
                    проставлена дата проверки: работа сделана, даже если результат ещё
                    вносят.
                  </p>
                </>
              }
            />

            <Section
              title="Осеменить заново"
              note={`Последнее осеменение окончилось яловостью, прошёл хотя бы один цикл (${CYCLE_DAYS} дней)`}
              measure="Дней прошло"
              rows={data.rebreed}
              empty="Яловых коров, ждущих нового осеменения, нет."
              why={
                <>
                  <p className="mb-2 font-medium text-ink-900">Откуда двадцать один день</p>
                  <p className="mb-2">
                    Длина полового цикла коровы; разброс 18–24 дня. Раньше охоты
                    не будет, и список, зовущий осеменять сегодня ту, что придёт
                    в охоту через неделю, приучает себе не верить.
                  </p>
                  <p>
                    Корова с четырьмя безрезультатными попытками стоит здесь
                    и одновременно в кандидатах на выбраковку. Это не противоречие:
                    осеменять её или убирать — решение хозяйства, и книга показывает
                    обе стороны, а не выбирает за него.
                  </p>
                </>
              }
            />
          </>
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
