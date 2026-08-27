import { Moment } from '@/components/Moment'
import { InfoTip } from '@/components/InfoTip'
import { AREA_LABEL, AREA_ORDER, CHECKS, PROBE_COUNT, checkSpec } from '@/lib/check-registry'
import { FRESH_HOURS, type CheckRunView } from '@/lib/check-report'

/**
 * Статус: что проверено, когда и с каким исходом.
 *
 * ## Почему список строится из реестра, а не из результатов
 *
 * Доска, собранная из прогонов, покажет ровно то, что успели прогнать,
 * и умолчит об остальном. А главный вопрос здесь не «что зелено»,
 * а «что вообще проверялось». Поэтому строки берутся из реестра всех
 * проверок, а результаты на них накладываются: проверка без результата
 * честно говорит «не гонялась».
 *
 * ## Почему устаревшее не зелёное
 *
 * «Всё сошлось» трёхнедельной давности отвечает на вопрос «как было»,
 * притворяясь ответом на «как сейчас». Через {@link FRESH_HOURS} часов
 * исход становится «неизвестно» — серым, а не зелёным. Зелёное означает
 * «проверено недавно и сошлось», и ничего другого.
 *
 * Находки при этом важнее возраста: старый прогон с расхождением
 * остаётся красным. Расхождение не рассасывается само.
 *
 * ## Чего здесь нет
 *
 * Номеров животных и названий хозяйств. Страница открыта, и находка
 * формулируется как «отчёт 12, список 11», а не «у коровы такой-то».
 * За этим следят сами пробы.
 */

const TONE: Record<string, { dot: string; text: string; label: string }> = {
  ok: { dot: 'bg-forest-500', text: 'text-forest-600', label: 'сошлось' },
  failed: { dot: 'bg-[#c0392b]', text: 'text-[#c0392b]', label: 'есть находки' },
  stale: { dot: 'bg-ink-300', text: 'text-ink-500', label: 'устарело' },
  never: { dot: 'bg-ink-200', text: 'text-ink-400', label: 'не гонялась' },
}

/** Почему проверка не попала в прогон — одной фразой. */
const whyManual = (code: string): string => {
  const spec = checkSpec(code)
  if (!spec) return 'нет в реестре'
  if (spec.writes) return 'пишет в базу — гоняется только на копии'
  if (spec.needsServer) return 'нужен обход снаружи — место в ночном действии'
  return 'гоняется вручную'
}

/**
 * Команда прогона — целиком и в рабочем виде.
 *
 * Через `-G --data-urlencode`, а не строкой с готовым адресом.
 * Первая редакция показывала `?token=…&label=Разработка` — и первый же
 * запуск ответил четырёхсотым: кириллица в строке запроса уходит сырыми
 * байтами, а разбор HTTP такого не принимает и отвечает «плохой запрос»
 * ещё до того, как дело дойдёт до маршрута. Снаружи это выглядит как
 * поломка ручки, хотя ручка её и не видела.
 */
const COMMAND = [
  'curl -sS -G -w \'\\n%{http_code}\\n\' "http://localhost:3000/checks" \\',
  '  --data-urlencode "token=$CHECKS_TOKEN" \\',
  '  --data-urlencode "label=Разработка"',
].join('\n')

export function EvolutionChecks({ runs, error }: { runs: CheckRunView[]; error: string | null }) {
  /* Пробы, прогнанные хоть где-то, по коду проверки → результат по средам. */
  const byCode = new Map<string, { label: string; ok: boolean; findings: string[] }[]>()
  for (const run of runs) {
    for (const r of run.results) {
      const list = byCode.get(r.code) ?? []
      list.push({ label: run.label, ok: r.ok, findings: r.findings })
      byCode.set(r.code, list)
    }
  }

  return (
    <div className="space-y-10">
      {/* --------------------------- Прогоны --------------------------- */}
      <section>
        <h2 className="section-title mb-5">Последние прогоны</h2>

        {runs.length === 0 ? (
          <div className="card">
            {/*
               Недоступное хранилище и «ещё не запускали» — разные вещи,
               и подменять одно другим нельзя ровно здесь: страница
               заведена ради честного ответа о состоянии.
            */}
            {error ? (
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-[#8a2d22]">{error}</p>
            ) : (
              <p className="max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
                Прогонов ещё не было. Проверки запускаются на той машине, где развёрнута
                система.
              </p>
            )}

            <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
              Ключ задаётся переменной <code className="text-[13px]">CHECKS_TOKEN</code> —
              не короче шестнадцати знаков; пока её нет, маршрут отвечает несуществующей
              страницей. После правки окружения сервер нужно перезапустить.
            </p>

            {/*
               Кириллица в метке передаётся через --data-urlencode.
               Строкой в адресе она уходит сырыми байтами, и разбор HTTP
               отвечает «плохой запрос» до всякого маршрута.
            */}
            <pre className="mt-4 overflow-x-auto rounded-lg bg-canvas px-4 py-3 font-mono text-[13px] leading-relaxed">
              {COMMAND}
            </pre>
            <p className="mt-2 text-[13px] leading-snug text-ink-500">
              Метка передаётся через <code className="text-[12px]">--data-urlencode</code>:
              кириллица, вписанная прямо в адрес, уходит сырыми байтами, и сервер отвечает
              «плохой запрос» ещё до маршрута. Код ответа говорит об исходе прогона:
              200 — сошлось, 409 — есть находки.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {runs.map((run) => {
              const tone = TONE[run.outcome]
              return (
                <article key={run.label} className="card">
                  <div className="flex items-baseline gap-2">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                    <h3 className="panel-heading mb-0">{run.label}</h3>
                    <span className={`text-[14px] ${tone.text}`}>{tone.label}</span>
                  </div>

                  <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
                    Проб прогнано {run.total}, с находками {run.failed}. Заняло{' '}
                    {(run.ms / 1000).toFixed(1)} с.
                  </p>

                  <p className="mt-2 text-[13px] text-ink-500">
                    <Moment iso={run.ranAt} />
                    {run.version && <> · версия {run.version}</>}
                  </p>

                  {/*
                     Возраст назван словами, а не только датой. «26 августа»
                     требует от читателя вычитания, а вычитать он не станет
                     — и примет старое за нынешнее.
                  */}
                  {run.outcome === 'stale' && (
                    <p className="mt-3 rounded-lg bg-canvas px-3.5 py-3 text-[13px] leading-snug text-ink-700">
                      Прошло больше {FRESH_HOURS} часов. Что показано — это состояние
                      на момент прогона, а не сейчас: считать его нынешним нельзя,
                      поэтому исход отмечен как неизвестный.
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* -------------------------- Все проверки -------------------------- */}
      <section>
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="section-title mb-0">Что система умеет проверять</h2>
          <InfoTip label="Почему не все проверки в ночном прогоне">
            <p className="mb-2 font-medium text-ink-900">Почему не все гоняются сами</p>
            <p className="mb-2">
              Около половины проверок <b>пишет в базу</b>: заводит организации, животных,
              приглашения и потом удаляет. Ночной прогон на боевой книге означал бы,
              что каждую ночь в ней появляются и исчезают записи, а обрыв посреди
              прогона оставлял бы мусор, неотличимый от настоящих данных.
            </p>
            <p>
              Ещё три ходят по страницам снаружи и требуют живого сервера. Внутри
              самого сервера им не место: проверяющий, живущий внутри проверяемого,
              не заметит, что проверяемый не отвечает. Им место в ночном действии
              рядом с прогоном, а не в нём.
            </p>
          </InfoTip>
        </div>
        <p className="mb-6 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
          Всего проверок {CHECKS.length}, из них {PROBE_COUNT} умеет прогнать само
          приложение — они и попадают в ночной прогон. Остальные запускаются командой
          и здесь перечислены, чтобы было видно не только что проверено, но и что нет.
        </p>

        <div className="space-y-8">
          {AREA_ORDER.map((area) => {
            const list = CHECKS.filter((c) => c.area === area)
            if (list.length === 0) return null

            return (
              <div key={area}>
                <h3 className="panel-heading">{AREA_LABEL[area]}</h3>
                <div className="card overflow-x-auto">
                  <table className="metric-table min-w-[720px]">
                    <thead>
                      <tr>
                        <th>Проверка</th>
                        <th>Что сверяет</th>
                        <th>Команда</th>
                        <th>Состояние</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((spec) => {
                        const seen = byCode.get(spec.code) ?? []
                        const bad = seen.filter((s) => !s.ok)
                        const outcome = !spec.probe
                          ? 'never'
                          : seen.length === 0
                            ? 'never'
                            : bad.length > 0
                              ? 'failed'
                              : 'ok'
                        const tone = TONE[outcome]

                        return (
                          <tr key={spec.code}>
                            <td className="font-medium">{spec.title}</td>
                            <td className="text-ink-500">{spec.what}</td>
                            {/* Команда как есть: её копируют в терминал целиком */}
                            <td className="whitespace-nowrap font-mono text-[13px] text-ink-500">
                              npm run {spec.code}
                            </td>
                            <td className="whitespace-nowrap">
                              <span className="inline-flex items-baseline gap-2">
                                <span
                                  className={`inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${tone.dot}`}
                                />
                                <span className={tone.text}>
                                  {outcome === 'never' && spec.probe
                                    ? 'ещё не гонялась'
                                    : outcome === 'never'
                                      ? whyManual(spec.code)
                                      : outcome === 'failed'
                                        ? bad.map((b) => b.label).join(', ')
                                        : seen.map((s) => s.label).join(', ')}
                                </span>
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* --------------------------- Находки --------------------------- */}
      {runs.some((r) => r.results.some((p) => !p.ok)) && (
        <section>
          <h2 className="section-title mb-5">Находки</h2>
          <div className="space-y-5">
            {runs.map((run) =>
              run.results
                .filter((p) => !p.ok)
                .map((p) => (
                  <article key={`${run.label}-${p.code}`} className="card">
                    <h3 className="panel-heading mb-0">
                      {checkSpec(p.code)?.title ?? p.code}
                      <span className="ml-2 text-[14px] font-normal text-ink-500">{run.label}</span>
                    </h3>
                    <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-ink-700">
                      {p.findings.map((f, i) => (
                        <li key={i} className="flex gap-2">
                          <span aria-hidden="true" className="text-[#c0392b]">
                            ·
                          </span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                )),
            )}
          </div>
        </section>
      )}

      {/* ------------------------- Чего это не говорит ------------------- */}
      <section className="card">
        <h2 className="panel-heading">Чего этот раздел не говорит</h2>
        <ul className="max-w-[80ch] space-y-2.5 text-[15px] leading-relaxed text-ink-700">
          <li>
            <b>Зелёное — это «сошлось», а не «работает правильно».</b> Проверки сверяют
            то, что уже описано: числа с числами, схему с журналом, списки с отчётами.
            Ошибку, которой никто не придумал проверки, они не увидят.
          </li>
          <li>
            <b>Проверки данных смотрят одно хозяйство</b> — самое большое из заведённых.
            Расхождение, которое возникает только у другого, здесь не найдётся.
          </li>
          <li>
            <b>Битые внешние ссылки не проверяются вовсе.</b> Обход страниц знает только
            свои адреса; ссылка на чужой сайт, который закрылся, останется незамеченной.
          </li>
          <li>
            <b>Расхождение документации с кодом не ловит ничего.</b> Описание API
            сверяется с ручками, а рассказ о процессах в «Документации» — ни с чем.
          </li>
        </ul>
      </section>
    </div>
  )
}
