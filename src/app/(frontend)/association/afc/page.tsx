import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { afcSireBook, AFC_SIRE_MIN_DAUGHTERS } from '@/lib/afc-sires'
import { nf, signed } from '@/lib/format'

export const metadata: Metadata = { title: 'Возраст первого отёла по быкам' }
export const dynamic = 'force-dynamic'

/**
 * Сводка по книге: чем дочери быка отличаются от сверстниц по возрасту
 * первого отёла.
 *
 * ## Зачем Ассоциации то, что запрещено хозяйству
 *
 * Отчёт хозяйства считает средний возраст дочерей внутри своего стада
 * и прямо запрещает смешивать стада: у них разное выращивание. Запрет
 * верен, и снимать его нельзя. Но Ассоциации нужно сравнить быков между
 * хозяйствами — она единственная, кто видит их рядом.
 *
 * Выход не в снятии запрета, а в устранении причины: у каждой дочери
 * берётся отклонение от сверстниц её же стада. Разница между хозяйствами
 * входит в оба слагаемых и уходит при вычитании.
 *
 * ## Почему таблица не отсортирована «лучшие сверху»
 *
 * Потому что «лучше» здесь не определено, и определять его мы не беремся.
 * Возраст первого отёла — в первую очередь решение хозяйства: когда
 * осеменить тёлку. Управление перевешивает генетику с большим запасом,
 * и объявить быка с ранними дочерьми хорошим значило бы приписать ему
 * чужую заслугу.
 *
 * Порядок в таблице — от ранних к поздним, и это порядок, а не оценка.
 * Столбец подписан «раньше сверстниц», а не «преимущество».
 *
 * Тот же разбор — решение №52: сырые кривые исходов по возрасту отёла
 * уже один раз оказались перепутаны с качеством хозяйства, и показывать
 * их как цель мы отказались.
 */

export default async function AssociationAfcPage() {
  await requireAssociation()
  const payload = await getClient()
  const book = await afcSireBook(payload)

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
              { label: 'Возраст первого отёла по быкам' },
            ]}
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">
            Возраст первого отёла по быкам
          </h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            У каждой дочери взят возраст первого отёла её сверстниц — коров того же стада,
            не дочерей этого быка, — и посчитана разность. Так сравнение не зависит от того,
            в какое хозяйство попали дочери: разница между хозяйствами входит в оба слагаемых
            и уходит при вычитании.
          </p>

          <section className="mt-8">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="card">
                <p className="text-[13px] text-ink-500">Быков в сводке</p>
                <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                  {book.rows.length}
                </p>
              </div>
              <div className="card">
                <p className="text-[13px] text-ink-500">Коров с известным возрастом</p>
                <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                  {book.cows.toLocaleString('ru-RU')}
                </p>
              </div>
              <div className="card">
                <p className="text-[13px] text-ink-500">Порог по дочерям</p>
                <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                  {AFC_SIRE_MIN_DAUGHTERS}
                </p>
              </div>
              <div className="card">
                <p className="text-[13px] text-ink-500">Быков не прошло порог</p>
                <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                  {book.hidden}
                </p>
              </div>
            </div>
          </section>

          {book.rows.length === 0 ? (
            <div className="card mt-8">
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Ни у одного быка в книге нет {AFC_SIRE_MIN_DAUGHTERS} дочерей с известным
                возрастом первого отёла. Пока их столько не наберётся, отклонение измеряет
                не быка, а несколько конкретных коров.
              </p>
            </div>
          ) : (
            <>
              <section className="mt-8">
                <div className="card overflow-x-auto">
                  <table className="metric-table min-w-[860px]">
                    <thead>
                      <tr>
                        <th>Бык</th>
                        <th className="text-right">Дочерей</th>
                        <th className="text-right">Стад</th>
                        <th className="text-right">Хозяйств</th>
                        <th className="text-right">Средний возраст</th>
                        <th className="text-right">Разброс</th>
                        <th className="text-right">Раньше сверстниц</th>
                      </tr>
                    </thead>
                    <tbody>
                      {book.rows.map((s) => (
                        <tr key={s.sireId}>
                          <td>
                            <Link
                              href={`/animals/${s.sireId}`}
                              className="underline underline-offset-4"
                            >
                              {s.name || s.identNumber}
                            </Link>
                            {s.name && (
                              <span className="ml-2 text-[13px] tabular-nums text-ink-500">
                                {s.identNumber}
                              </span>
                            )}
                          </td>
                          <td className="text-right tabular-nums">{s.daughters}</td>
                          <td className="text-right tabular-nums">{s.herds}</td>
                          <td className="text-right tabular-nums">{s.farms}</td>
                          <td className="text-right tabular-nums">{nf(s.meanAfc)}</td>
                          <td className="text-right tabular-nums text-ink-500">
                            {s.minAfc}–{s.maxAfc}
                          </td>
                          {/*
                             Знак не перекрашивается в зелёное и красное.
                             Цвет — это оценка, а оценки здесь нет: минус
                             означает «телятся раньше соседок по стаду»,
                             и хорошо это или плохо, зависит от того,
                             доросли ли они к этому сроку.
                          */}
                          <td className="text-right tabular-nums">
                            {signed(s.meanDev)}
                            {s.compared < s.daughters && (
                              <span className="ml-2 text-[12px] text-ink-500">
                                по {s.compared}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
                  Порядок — от ранних к поздним. Это порядок, а не оценка: столбец подписан
                  «раньше сверстниц», а не «преимущество». Пометка «по N» рядом со значением
                  означает, что сравнить удалось не всех дочерей — у остальных в стаде
                  не нашлось сверстниц с известным возрастом первого отёла.
                </p>
              </section>

              <section className="mt-10">
                <div className="card">
                  <h2 className="panel-heading">Чего эта таблица не говорит</h2>
                  <div className="max-w-[80ch] space-y-4 text-[15px] leading-relaxed text-ink-700">
                    <p>
                      Она не называет лучших быков. Возраст первого отёла — в первую очередь
                      решение хозяйства: когда осеменить тёлку. Наследуются скорость роста
                      и возраст полового созревания, но выращивание перевешивает генетику
                      с большим запасом.
                    </p>
                    <p>
                      Сравнение со сверстницами снимает разницу между хозяйствами, но не
                      снимает выбор внутри хозяйства. Если тёлок покрупнее осеменяют раньше,
                      а покрупнее они у одного быка, отклонение это покажет — покажет верно,
                      но объяснит неправильно.
                    </p>
                    <p>
                      И главное: ранний отёл сам по себе не цель.{' '}
                      <Link
                        href="/association/quality"
                        className="underline underline-offset-4 hover:text-forest-500"
                      >
                        Качество книги
                      </Link>{' '}
                      — про полноту данных, а 22–25 месяцев считаются разумным сроком только
                      при живой массе около 400 кг к четырнадцати месяцам. Тёлка, отелившаяся
                      в 22 месяца недоросшей, доит хуже и выбывает раньше.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
