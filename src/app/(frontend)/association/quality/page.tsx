import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { StaleSchemaNotice } from '@/components/StaleSchemaNotice'
import { getClient } from '@/lib/payload'
import { isStaleSchemaError, requireAssociation } from '@/lib/association'
import { bookQuality, type BookQuality } from '@/lib/book-quality'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Качество книги' }
export const dynamic = 'force-dynamic'

/**
 * Качество книги — что не в порядке во всей базе разом.
 *
 * Автоматические проверки на разборе пакета помогают эксперту смотреть
 * конкретный файл. Здесь те же вопросы заданы обо всех записях сразу,
 * и отвечают они на другое: куда вообще смотреть.
 *
 * Числа тут не для отчёта. Тысяча записей без даты рождения — это не «плохая
 * книга», это список работы: столько-то карточек нельзя ни оценить,
 * ни подтвердить, ни выпустить по ним свидетельство, пока кто-то не дошлёт
 * дату. Поэтому у каждой строки есть смысл действия, а не оценки.
 */

const ru = (v: number) => v.toLocaleString('ru-RU')

/** Куда ведёт каждая очередь: подписи задаются в `book-quality.ts`. */
const QUEUE_HREF: Record<string, string> = {
  'Пакеты, ждущие проверки': '/association',
  'Заявки на верификацию': '/association/verifications',
  'Заявки на членство': '/association/farms?tab=waiting',
}

function Bar({ value, total, tone }: { value: number; total: number; tone: string }) {
  const pct = total ? Math.max(1, Math.round((value / total) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ededed]">
      <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export default async function QualityPage() {
  await requireAssociation()
  const payload = await getClient()

  let data: BookQuality | null = null
  let stale = false

  try {
    data = await bookQuality(payload)
  } catch (e) {
    if (!isStaleSchemaError(e)) throw e
    stale = true
  }

  const fix = data?.issues.filter((i) => i.severity === 'fix') ?? []
  const note = data?.issues.filter((i) => i.severity === 'note') ?? []

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="quality" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Качество книги</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Те же вопросы, что задают проверки при разборе пакета, — но обо всех записях сразу.
            Это не отчёт и не оценка: тысяча карточек без даты рождения означает тысячу
            животных, которых нельзя ни оценить, ни подтвердить, пока дату не дошлют.
          </p>

          <p className="mt-2 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Считается по всем хозяйствам книги, а не по какому-то одному: у сотрудника
            Ассоциации своего стада нет, и раздел показывает ему всю базу — включая записи,
            закрытые для посторонних.
          </p>

          {data?.missing.length ? (
            <p className="mt-5 rounded-xl bg-[#f6f6f6] px-5 py-4 text-[14px] leading-relaxed text-ink-700">
              Часть сводки посчитать не удалось: запрос не уложился в отведённое время либо
              обратился к таблице, которой ещё нет в этой базе. Показано остальное — числа ниже
              верны, но неполны. Если раздел новый, примените миграции:{' '}
              <code className="rounded bg-canvas px-1.5 py-0.5">npm run payload migrate</code>.
            </p>
          ) : null}

          {stale ? (
            <div className="mt-8">
              <StaleSchemaNotice what="сводки по книге" />
            </div>
          ) : !data ? (
            <div className="card mt-8">
              <p className="text-[15px] text-ink-700">
                Сводка считается запросами к PostgreSQL напрямую и на другом хранилище
                не работает.
              </p>
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              {/* --------------------------- Очереди --------------------------- */}
              <div className="card">
                <h2 className="panel-heading">Что ждёт Ассоциацию</h2>

                {/*
                   Каждая цифра — ссылка в свою очередь. Панель, которая
                   сообщает «пакетов семь» и не даёт их открыть, заставляет
                   человека возвращаться в меню и искать раздел руками:
                   она показывает работу, но не подводит к ней.
                */}
                <div className="grid gap-4 sm:grid-cols-3">
                  {data.queues.map((q) => {
                    const href = QUEUE_HREF[q.label] ?? '/association'
                    return (
                      <Link
                        key={q.label}
                        href={href}
                        className="block rounded-xl bg-[#f6f6f6] px-5 py-4 transition-colors hover:bg-ink-100"
                      >
                        <p className="text-[13px] text-ink-500">{q.label}</p>
                        <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                          {ru(q.count)}
                        </p>
                        <p className="mt-1 text-[13px]">
                          {q.late > 0 ? (
                            <span className="text-amber-700">дольше недели: {ru(q.late)}</span>
                          ) : (
                            <span className="text-ink-500">
                              {q.count > 0 ? 'открыть очередь' : 'очередь пуста'}
                            </span>
                          )}
                        </p>
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* ------------------------ Достоверность ------------------------ */}
              <div className="card">
                <h2 className="panel-heading">Достоверность записей · {ru(data.animals)}</h2>

                <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                  Доля «Верифицировано ассоциацией» — это и есть мера того, за какую часть книги
                  Ассоциация отвечает. Остальное не хуже по существу: просто про эти записи она
                  ничего не говорила.
                </p>

                <div className="space-y-3">
                  {data.trust.map((t) => (
                    <div key={t.level}>
                      <div className="mb-1 flex items-baseline justify-between gap-4 text-[14px]">
                        <span>{t.label}</span>
                        <span className="tabular-nums text-ink-500">
                          {ru(t.count)} ·{' '}
                          {data.animals ? Math.round((t.count / data.animals) * 100) : 0}%
                        </span>
                      </div>
                      <Bar
                        value={t.count}
                        total={data.animals}
                        tone={t.level === 3 ? 'bg-forest-500' : t.level < 0 ? 'bg-red-400' : 'bg-ink-300'}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/*
                 Подтверждённые записи с находками — отдельной карточкой
                 и выше общей таблицы противоречий.

                 Причина в цене ошибки. Противоречие в неподтверждённой
                 записи — обычная работа: её для того и проверяют. Противоречие
                 в записи со знаком «Проверено ассоциацией» — это подпись
                 Ассоциации под данными, которые система считает
                 противоречивыми, и разбираться с ним надо раньше, чем
                 с остальной книгой.
              */}
              <div className="card">
                <h2 className="panel-heading">Подтверждено, но есть замечания</h2>
                <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                  Записи со статусом «Проверено ассоциацией», по которым сейчас срабатывает
                  существенная проверка. Появляются они не от небрежности: данные правят
                  после подтверждения, а список правил пополняется — запись, безупречная
                  в мае, может перестать быть таковой в августе.
                </p>
                <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                  Статус система не снимает сама — это решение человека. Ошибка в пороге новой
                  проверки не должна за ночь обесценить работу эксперта над тысячей записей.
                </p>
                <Link href="/association/verified-issues" className="btn btn-accent mt-5">
                  Посмотреть список
                </Link>
              </div>

              {/*
                 Возраст первого отёла по быкам — здесь, а не в отдельном
                 разделе меню. Это не отчётность и не постоянная работа,
                 а взгляд на книгу со стороны: что в ней вообще можно
                 сравнить между хозяйствами. Соседство с качеством книги
                 точнее, чем соседство с заявками.
              */}
              <div className="card">
                <h2 className="panel-heading">Возраст первого отёла по быкам</h2>
                <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                  Единственная сводка, которая сравнивает быков между хозяйствами. Хозяйству
                  такое сравнение запрещено — у стад разное выращивание, и среднее по ним
                  сравнивает не быков, а хозяйства. Здесь у каждой дочери берётся отклонение
                  от сверстниц её же стада, и разница между хозяйствами уходит при вычитании.
                </p>
                <Link href="/association/afc" className="btn btn-accent mt-5">
                  Открыть сводку
                </Link>
              </div>

              <div className="card">
                <h2 className="panel-heading">Пороги проверок</h2>
                <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                  Числа, по которым срабатывают автоматические проверки: границы удоя,
                  допуск по кровности, длительность стельности, доли по стаду. Действуют
                  на всю книгу — порог, свой у каждого хозяйства, ломает сравнимость
                  записей между хозяйствами.
                </p>
                <Link href="/association/checks" className="btn btn-accent mt-5">
                  Настроить пороги
                </Link>
              </div>

              {/* -------------------------- Находки ---------------------------- */}
              <div className="card">
                <h2 className="panel-heading">Противоречия в данных</h2>

                {fix.length === 0 && note.length === 0 ? (
                  <p className="text-[15px] text-ink-700">
                    Ни одно из правил не сработало: даты, пол родителей, границы правдоподобия
                    и полнота происхождения по всей книге в порядке.
                  </p>
                ) : (
                  <>
                    <p className="mb-5 max-w-[70ch] text-[15px] leading-relaxed text-ink-700">
                      Существенные — те, что делают запись противоречивой: по ним нельзя
                      ни считать, ни подтверждать. Остальные — неполнота, с которой можно жить,
                      пока не дошло до свидетельства.
                    </p>

                    <table className="metric-table">
                      <thead>
                        <tr>
                          <th>Что не так</th>
                          <th className="text-right">Записей</th>
                          <th className="text-right">Доля книги</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...fix, ...note].map((i) => (
                          <tr key={i.key}>
                            <td>
                              <span
                                className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[12px] ${
                                  i.severity === 'fix'
                                    ? 'bg-red-50 text-red-700'
                                    : 'bg-[#f2f2f2] text-ink-500'
                                }`}
                              >
                                {i.severity === 'fix' ? 'существенно' : 'неполнота'}
                              </span>
                              {/*
                                 Число без возможности посмотреть, кто за ним
                                 стоит, — не находка, а повод для беспокойства.
                                 Отсюда открывается список записей, а от него
                                 карточка.
                              */}
                              <Link
                                href={`/association/quality/${i.key}`}
                                className="underline underline-offset-4 hover:text-forest-500"
                              >
                                {i.label}
                              </Link>
                            </td>
                            <td className="text-right tabular-nums">{ru(i.count)}</td>
                            <td className="text-right tabular-nums text-ink-500">
                              {data.animals
                                ? `${((i.count / data.animals) * 100).toFixed(1)}%`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                <p className="mt-4 max-w-[80ch] text-[13px] leading-relaxed text-ink-500">
                  Считается по всей книге запросами к базе. Те же правила при разборе пакета
                  работают над его записями и позволяют перенести находку в замечания
                  хозяйству — отсюда таких действий нет намеренно: сводка показывает масштаб,
                  разбираются в конкретных пакетах и заявках.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </>
  )
}
