import { InfoTip } from './InfoTip'
import { SELECTION_INTENSITY, correlatedResponse } from '@/lib/genetic-correlations'
import type { Base, IndexProfile } from '@/lib/breeding-index'

/**
 * Что произойдёт с признаками, если отбирать по этому профилю.
 *
 * Признаки связаны генетически: двигая один, вы двигаете остальные. Это самая
 * частая ловушка пользовательского индекса — хозяйство ставит сорок процентов
 * на белок, получает белок и через три года обнаруживает просевшую
 * фертильность, потому что связь между ними отрицательная и никто об этом
 * не сказал.
 *
 * Строки с нулевым весом помечены отдельно: именно они и есть ответ
 * на вопрос «а что будет с тем, чему я не давал веса».
 */

export function CorrelatedResponse({ profile, base }: { profile: IndexProfile; base: Base }) {
  const rows = correlatedResponse(profile, base)
  const max = Math.max(...rows.map((r) => Math.abs(r.sigma)), 0.01)
  const losses = rows.filter((r) => r.sigma < -0.05)

  return (
    <section className="card mt-6">
      <h2 className="panel-heading !mb-1">
        Что изменится в стаде{' '}
        <InfoTip>
          Ожидаемый сдвиг за поколение при {SELECTION_INTENSITY.label}. Считается по матрице
          генетических корреляций голштинской породы: Δ = i · (R·b) / √(bᵀRb)
        </InfoTip>
      </h2>
      <p className="mb-5 max-w-[75ch] text-[14px] leading-relaxed text-ink-500">
        Ожидаемый сдвиг за поколение, если оставлять в родители {SELECTION_INTENSITY.label} по этому
        профилю. Признаки связаны генетически, поэтому меняются и те, которым веса не давали —
        это и есть главная причина смотреть сюда до того, как менять веса.
      </p>

      <div className="overflow-x-auto">
        <table className="metric-table w-full min-w-[560px]">
          <thead>
            <tr>
              <th>Признак</th>
              <th className="text-right">Вес</th>
              <th className="w-[35%] text-left">Сдвиг за поколение</th>
              <th className="text-right">в долях σ</th>
              <th className="text-right">в единицах</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const width = (Math.abs(r.sigma) / max) * 100
              const noWeight = Math.abs(r.weight) < 0.005
              return (
                <tr key={r.key}>
                  <td>
                    <span className="text-[14px]">{r.label}</span>
                    <span className="ml-1.5 text-[12px] text-ink-500">{r.unit}</span>
                    {/*
                       У перевёрнутого признака улучшение — это уменьшение,
                       и в его собственных единицах отклик идёт со знаком
                       минус при зелёной полосе. Без пометки это читается
                       как противоречие.
                    */}
                    {r.inverted && (
                      <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-500">
                        меньше — лучше
                      </span>
                    )}
                    {noWeight && (
                      <span className="ml-2 rounded bg-canvas px-1.5 py-0.5 text-[11px] text-ink-500">
                        веса нет
                      </span>
                    )}
                  </td>
                  <td className="text-right tabular-nums text-ink-500">
                    {noWeight ? '—' : `${Math.round(r.weight * 100)} %`}
                  </td>
                  <td>
                    {/* Полоски от общей середины: вправо — рост, влево — потеря */}
                    <div className="flex h-[8px] items-center">
                      <div className="flex h-full w-1/2 justify-end">
                        {r.sigma < 0 && (
                          <div
                            style={{ width: `${width}%` }}
                            className="h-full rounded-l-full bg-[#c0392b]"
                          />
                        )}
                      </div>
                      <div className="h-full w-px bg-ink-300" />
                      <div className="h-full w-1/2">
                        {r.sigma > 0 && (
                          <div
                            style={{ width: `${width}%` }}
                            className="h-full rounded-r-full bg-forest-500"
                          />
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={`text-right tabular-nums ${r.sigma < 0 ? 'text-[#c0392b]' : ''}`}>
                    {r.sigma > 0 ? '+' : ''}
                    {r.sigma.toFixed(2)}
                  </td>
                  <td className={`text-right tabular-nums ${r.sigma < 0 ? 'text-[#c0392b]' : ''}`}>
                    {r.units > 0 ? '+' : ''}
                    {Math.abs(r.units) >= 10 ? Math.round(r.units) : r.units.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {losses.length > 0 && (
        <p className="mt-5 rounded-xl bg-[#fff6e5] px-4 py-3 text-[14px] leading-relaxed">
          Профиль тянет вниз: {losses.map((r) => r.label.toLowerCase()).join(', ')}. Если это
          не входило в замысел, добавьте этим признакам вес — за счёт тех, что стоят вверху
          таблицы.
        </p>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
        Матрица корреляций литературная, сводная по голштинской породе: своей у Ассоциации нет,
        её получают из компонент дисперсии на большой выборке. Знаки и порядок величин при этом
        устойчивы между странами — для предупреждения «просядет фертильность» этого достаточно,
        для планирования на пять лет вперёд нет.
      </p>
    </section>
  )
}
