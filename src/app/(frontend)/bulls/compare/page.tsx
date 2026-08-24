import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { BullPicker } from '@/components/BullPicker'
import { AccountNav } from '@/components/AccountNav'
import { HerdNav } from '@/components/HerdNav'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { isAssociationUser } from '@/lib/association'
import { getClient, getCurrentUser } from '@/lib/payload'
import { relId } from '@/lib/visibility'
import { compareBulls, KINSHIP_DEPTH, MAX_BULLS, type BullRow } from '@/lib/bull-compare'
import { BULL_COMPARISON_MIN } from '@/lib/bull-proof'

export const metadata: Metadata = { title: 'Сравнение быков' }
export const dynamic = 'force-dynamic'

/**
 * Сравнение быков (ТЗ, требование №5).
 *
 * ## Кому это нужно
 *
 * Покупателю семени. Он решает не «хорош ли этот бык» — на это отвечает
 * карточка, — а «кого из этих пяти». До сих пор для этого открывали пять
 * вкладок и сличали числа глазами.
 *
 * ## Почему таблица читается сверху вниз, а не слева направо
 *
 * Признаки в строках, быки в колонках. Так сравнивают одно и то же
 * у разных: глаз идёт по строке и видит пять чисел одной природы.
 * При обратной раскладке — быки строками — рядом оказываются удой,
 * жир и возраст отёла, то есть числа, которые сравнивать между собой
 * нельзя вовсе.
 */

const kg = (v: number | null): string => (v === null ? '—' : `${v.toLocaleString('ru-RU')}`)
const signed = (v: number | null): string =>
  v === null ? '—' : v > 0 ? `+${v.toLocaleString('ru-RU')}` : v.toLocaleString('ru-RU')

/** Значение с числом животных, на которых оно посчитано. */
function Cell({ value, on, unit }: { value: string; on?: number; unit?: string }) {
  return (
    <>
      <span className="tabular-nums">{value}</span>
      {unit && value !== '—' && <span className="text-ink-500"> {unit}</span>}
      {on !== undefined && value !== '—' && (
        <span className="block text-[12px] text-ink-500">по {on}</span>
      )}
    </>
  )
}

export default async function BullComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>
}) {
  const { ids: raw } = await searchParams
  const ids = (raw ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, MAX_BULLS)

  const user = await getCurrentUser()
  const orgId = relId(user?.organization)
  const payload = await getClient()

  const rows: BullRow[] = ids.length ? await compareBulls(payload, ids, orgId) : []

  const without = (id: number) =>
    `/bulls/compare${ids.filter((x) => x !== id).length ? `?ids=${ids.filter((x) => x !== id).join(',')}` : ''}`

  /*
   * Экран принадлежит стаду, и над ним стоят ряды стада.
   *
   * Он живёт по общему адресу `/bulls/…`, а не внутри `/account`, потому
   * что ссылка на собранное сравнение пересылается — в том числе тому,
   * у кого учётной записи нет. Но у вошедшего хозяйства это раздел
   * кабинета: сюда ведёт «Стадо → Отчёты», и колонка родства считается
   * от его родословной. Раз вход из кабинета, то и вернуться из экрана
   * надо в кабинет, а не гадать, где ты оказался.
   *
   * Гостю ряды не показываются: разделов кабинета у него нет, и ряд
   * из четырёх плашек, ни одна из которых ему не открыта, — приглашение,
   * которое никуда не ведёт. Ему остаётся общая шапка и путь от книги.
   */
  const inCabinet = Boolean(user) && !isAssociationUser(user)

  return (
    <>
      <SiteHeader active={inCabinet ? '/account' : '/'} />

      <main className="container-page pb-8">
        {inCabinet && (
          <>
            <AccountNav active="herd" />
            <HerdNav active="reports" />
          </>
        )}

        <div className="min-w-0">
          <Breadcrumbs
            items={
              inCabinet
                ? [
                    { label: 'Личный кабинет', href: '/account' },
                    { label: 'Стадо', href: '/account?tab=herd' },
                    { label: 'Отчёты', href: '/account?tab=herd&sub=reports' },
                    { label: 'Сравнение быков' },
                  ]
                : [{ label: 'Племенная книга', href: '/' }, { label: 'Сравнение быков' }]
            }
          />

          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Сравнение быков</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            До {MAX_BULLS} быков рядом. Главная строка здесь — не средний удой дочерей,
            а разница со сверстницами: дочери разных быков стоят в разных хозяйствах,
            и разница между хозяйствами больше разницы между быками. Сравнение
            со сверстницами берёт у каждой дочери средний удой других коров её же стада
            и считает разницу — эффект хозяйства при этом снимается.
          </p>

          <div className="mt-8">
            <BullPicker chosen={ids} />
          </div>

          {rows.length === 0 ? (
            <div className="card mt-8">
              <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                Добавьте быков — по номеру или кличке. Сравнение живёт в адресе строки:
                собранную таблицу можно переслать, и она откроется той же.
              </p>
            </div>
          ) : (
            <>
              <div className="card mt-8 overflow-x-auto">
                <table className="metric-table min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="min-w-[14rem]">Признак</th>
                      {rows.map((b) => (
                        <th key={b.id} className="text-right">
                          <Link
                            href={`/animals/${b.id}`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {b.name || b.identNumber}
                          </Link>
                          <span className="block text-[12px] font-normal text-ink-500 tabular-nums">
                            {b.identNumber}
                          </span>
                          <Link
                            href={without(b.id)}
                            className="mt-1 block text-[12px] font-normal text-ink-500 underline underline-offset-4 hover:text-[#c0392b]"
                          >
                            убрать
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="font-medium">Разница со сверстницами, кг</td>
                      {rows.map((b) => (
                        <td key={b.id} className="text-right">
                          <Cell value={signed(b.vsMates)} on={b.vsMates === null ? undefined : b.compared} />
                          {b.vsMates === null && (
                            <span className="block text-[12px] text-ink-500">
                              дочерей меньше {BULL_COMPARISON_MIN}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>Дочерей в книге</td>
                      {rows.map((b) => (
                        <td key={b.id} className="text-right tabular-nums">
                          {b.daughters}
                          <span className="block text-[12px] text-ink-500">
                            в {b.farms} {b.farms === 1 ? 'хозяйстве' : 'хозяйствах'}
                          </span>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>Средний удой дочерей, кг</td>
                      {rows.map((b) => (
                        <td key={b.id} className="text-right">
                          <Cell value={kg(b.milkMean)} on={b.withMilk} />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>Жир, %</td>
                      {rows.map((b) => (
                        <td key={b.id} className="text-right tabular-nums">
                          {b.fatMean ?? '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>Белок, %</td>
                      {rows.map((b) => (
                        <td key={b.id} className="text-right tabular-nums">
                          {b.proteinMean ?? '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>Возраст первого отёла дочерей, мес.</td>
                      {rows.map((b) => (
                        <td key={b.id} className="text-right">
                          <Cell value={b.afcMean === null ? '—' : String(b.afcMean)} on={b.afcCows} />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td>ИПЦ быка</td>
                      {rows.map((b) => (
                        <td key={b.id} className="text-right tabular-nums">
                          {b.ipc ?? '—'}
                        </td>
                      ))}
                    </tr>

                    {orgId && (
                      <tr>
                        <td className="font-medium">Родня в вашем стаде</td>
                        {rows.map((b) => (
                          <td key={b.id} className="text-right tabular-nums">
                            {b.kinInHerd ?? 0}
                            {(b.daughtersInHerd ?? 0) > 0 && (
                              <span className="block text-[12px] text-ink-500">
                                из них дочерей: {b.daughtersInHerd}
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="card mt-6">
                <h2 className="panel-heading">Как это читать</h2>

                <p className="max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
                  <span className="font-medium">Рядом с каждым числом стоит, на скольких
                  дочерях оно посчитано</span> — и это не педантизм. Бык с тремя дочерьми
                  и бык с пятьюстами выглядят в таблице одинаково убедительно, а означают
                  разное: у первого «+900 кг» — случайность трёх коров, у второго
                  «+300 кг» — установленный факт. Ниже {BULL_COMPARISON_MIN} дочерей
                  разница не показывается вовсе: число, набранное на трёх коровах, читают
                  как число, и приписка мелким шрифтом этого не меняет.
                </p>

                {orgId && (
                  <p className="mt-3 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
                    <span className="font-medium">Родня в вашем стаде</span> — сколько ваших
                    коров имеют этого быка в родословной до {KINSHIP_DEPTH}-го колена.
                    Этого не даёт ни один каталог, и дать не может: нужны разом родословная
                    быка и ваша. Лучший по всем признакам бык, у которого в вашем стаде уже
                    сорок дочерей, — это инбридинг, а не улучшение.
                  </p>
                )}

                <p className="mt-3 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
                  Чего эта таблица не даёт — настоящей племенной ценности. Она требует
                  одновременного учёта происхождения самих дочерей, года и сезона отёла
                  и решается уравнением по всей популяции, а не запросом по нескольким
                  быкам. Сравнение со сверстницами снимает эффект хозяйства и не снимает
                  остального: если дочерей одного быка осеменяли лучшими коровами,
                  его разница будет завышена, и никакой запрос этого не различит.
                </p>
              </div>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
