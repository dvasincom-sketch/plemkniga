import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { StaleSchemaNotice } from '@/components/StaleSchemaNotice'
import { getClient } from '@/lib/payload'
import { isStaleSchemaError, requireAssociation } from '@/lib/association'
import { bookQuality, type BookQuality } from '@/lib/book-quality'

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
                <div className="grid gap-6 sm:grid-cols-3">
                  {data.queues.map((q) => (
                    <div key={q.label}>
                      <p className="text-[13px] text-ink-500">{q.label}</p>
                      <p className="mt-1 text-[28px] font-medium leading-none tabular-nums">
                        {ru(q.count)}
                      </p>
                      {q.late > 0 && (
                        <p className="mt-1 text-[13px] text-amber-700">
                          дольше недели: {ru(q.late)}
                        </p>
                      )}
                    </div>
                  ))}
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
                              {i.label}
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
