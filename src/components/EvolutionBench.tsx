import {
  benchCell,
  benchReports,
  benchScenarios,
  hasBench,
  type BenchMeasurement,
} from '@/lib/bench-report'
import { dateRu } from '@/lib/format'

/**
 * Замер: что меряли, на чём и что получилось.
 *
 * ## Почему среды стоят колонками, а не отдельными таблицами
 *
 * Цифра сама по себе не отвечает ни на один вопрос: «поиск 259 мс» —
 * это много или мало? Ответ появляется в сравнении. Разложив среды
 * по отдельным таблицам, мы заставили бы читателя держать числа
 * в голове и сравнивать их глазами через полэкрана — то есть делать
 * руками ровно ту работу, ради которой он сюда пришёл.
 *
 * ## Почему в ячейке медиана, а худшее — рядом мелким
 *
 * Порог приёмки — про то, сколько человек ждёт, и ждёт он в том числе
 * худший раз из десяти. Но таблица, где в каждой ячейке по два равных
 * числа, не читается вовсе: глаз не знает, какое из них главное.
 * Медиана крупно отвечает «сколько обычно», худшее мелко — «а как
 * бывает».
 *
 * ## Почему конфигурация стоит выше цифр, а не в примечании
 *
 * «Поиск 59 мс» — не факт о системе, пока не сказано, на какой машине
 * и на каком объёме. Пока железо не названо, читатель достраивает его
 * сам, обычно щедро.
 */

const ms = (v: number) => `${v.toLocaleString('ru-RU')} мс`

function ServerCard({ m }: { m: BenchMeasurement }) {
  const s = m.server
  if (!s) return null

  const rows: [string, string][] = [
    ['Процессор', `${s.cpu}, ядер ${s.cores}`],
    ['Память', `${s.memoryGb} ГБ`],
    ['Система', s.platform],
    ['Node.js', s.node],
    ['PostgreSQL', s.postgres],
    ['Размер базы', s.databaseSize],
    ...Object.entries(s.settings).map(([k, v]) => [k, v] as [string, string]),
  ]

  return (
    <div className="card">
      <h3 className="text-[19px] font-medium">{m.label}</h3>
      <p className="mt-1.5 text-[13px] leading-snug text-ink-500">
        {dateRu(s.at)} · {m.animals.toLocaleString('ru-RU')} животных · {m.runs} прогонов
      </p>

      {/*
         Оговорка про удалённую базу стоит у самой карточки среды, а не
         внизу страницы. Замер со своей машины против прод-базы меряет
         не прод, а канал до него, — и узнать об этом надо до того, как
         начнёшь сравнивать колонки, а не после.
      */}
      {s.remoteDatabase && (
        <p className="mt-3 rounded-lg bg-[#fff6e5] px-3 py-2 text-[13px] leading-snug text-ink-700">
          База не на той машине, где шёл замер. В каждой цифре сидит задержка сети до неё —
          на мелких сценариях она и есть весь результат. Настоящий замер боевого сервера
          делается на самом сервере.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-ink-100 pb-1.5">
            <dt className="text-ink-500">{k}</dt>
            <dd className="text-right tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function EvolutionBench() {
  if (!hasBench) {
    return (
      <div className="card">
        <h3 className="text-[19px] font-medium">Замер ещё не проводился</h3>
        <p className="mt-2 max-w-[75ch] text-[15px] leading-relaxed text-ink-700">
          Отчёт появится здесь после прогона <code>npm run bench -- --save</code> на базе
          нужного объёма. До этого показывать нечего, и придумывать цифры мы не будем.
        </p>
      </div>
    )
  }

  const scenarios = benchScenarios()
  const grouped: { name: string; items: typeof scenarios }[] = []
  for (const s of scenarios) {
    const last = grouped[grouped.length - 1]
    if (last && last.name === s.group) last.items.push(s)
    else grouped.push({ name: s.group, items: [s] })
  }

  return (
    <div className="space-y-6">
      <div
        className={`grid grid-cols-1 gap-6 ${benchReports.length > 1 ? 'lg:grid-cols-2' : ''}`}
      >
        {benchReports.map((m) => (
          <ServerCard key={m.label} m={m} />
        ))}
      </div>

      {benchReports.length === 1 && (
        <p className="max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
          Пока здесь один замер, и сравнивать его не с чем. Второй появится после прогона
          в другой среде: <code>npm run bench -- --save --label Прод</code>.
        </p>
      )}

      {grouped.map((g) => (
        <div key={g.name} className="card">
          <h3 className="text-[19px] font-medium">{g.name}</h3>

          <div className="mt-4 overflow-x-auto">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Сценарий</th>
                  {benchReports.map((m) => (
                    <th key={m.label} className="text-right">
                      {m.label}
                    </th>
                  ))}
                  <th className="text-right">Порог ТЗ</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((s) => (
                  <tr key={s.what}>
                    <td>{s.what}</td>

                    {benchReports.map((m) => {
                      const r = benchCell(m, s.group, s.what)
                      /*
                         Прочерк означает «в этой среде такого сценария
                         не мерили» — например, замер сделан на версии,
                         где его ещё не было. Показать здесь ноль или
                         пустоту значило бы выдать пропуск за результат.
                      */
                      if (!r)
                        return (
                          <td key={m.label} className="text-right text-ink-400">
                            —
                          </td>
                        )

                      return (
                        <td key={m.label} className="text-right tabular-nums">
                          <span className={r.ok === false ? 'text-red-700' : ''}>
                            {ms(r.medianMs)}
                          </span>
                          <span className="block text-[12px] text-ink-400">
                            худшее {ms(r.worstMs)}
                            {r.runs !== undefined && r.runs !== m.runs && ` · ${r.runs} прогона`}
                          </span>
                        </td>
                      )
                    })}

                    <td className="text-right tabular-nums text-ink-500">
                      {s.limitMs === undefined ? '—' : ms(s.limitMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/*
         Чего замер не измеряет — сказано вслух и на той же странице.
         Отчёт, умалчивающий о своих границах, читается как утверждение
         обо всей системе, и на приёмке это утверждение предъявят нам.
      */}
      <div className="card">
        <h3 className="text-[19px] font-medium">Чего эти цифры не говорят</h3>
        <ul className="mt-3 max-w-[80ch] space-y-2 text-[15px] leading-relaxed text-ink-700">
          <li>
            <b>Про пятьсот одновременных пользователей.</b> Пятьсот пользователей — это
            пятьсот браузеров, своя сеть и страницы целиком; замер шлёт запросы из одного
            процесса в один пул соединений. Отдельный прогон с параллельностью показывает,
            во сколько раз проседает ответ, — но проверкой этого критерия ТЗ не является.
          </li>
          <li>
            <b>Про доступность 99,5 %.</b> Это не замер, а мониторинг за период. У нас есть{' '}
            <code>/healthz</code>, но нет наблюдения, которое бы считало простои.
          </li>
          <li>
            <b>Про восстановление на точку времени.</b> Проверяется восстановлением из копии,
            а не измерением скорости.
          </li>
          <li>
            <b>Про страницу целиком.</b> Меряется путь до данных: запрос, правила доступа,
            сборка ответа. Отрисовка, размер разметки и дорога до браузера сюда не входят.
          </li>
        </ul>
      </div>
    </div>
  )
}
