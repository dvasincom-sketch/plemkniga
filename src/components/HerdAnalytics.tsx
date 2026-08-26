import { nf } from '@/lib/format'
import { Moment } from '@/components/Moment'
import { INBREEDING_THRESHOLD, SCC_THRESHOLD } from '@/lib/herd-analytics'
import type {
  Culling,
  GeneticTrend,
  HeiferAges,
  LactationStructure,
  MilkByLactation,
  Reproduction,
  UdderHealth,
} from '@/lib/herd-analytics'

/**
 * Отчёты по стаду на «Обзоре».
 *
 * ## Почему они здесь, а не на отдельной странице
 *
 * Все семь отвечают на вопросы, которые зоотехник задаёт себе утром,
 * открывая кабинет: какое у меня стадо, почему я его теряю, двигаюсь ли
 * вперёд, здорово ли вымя, хватит ли замены. Отчёт, за которым надо идти
 * в отдельный раздел, смотрят раз в квартал — то есть тогда, когда решать
 * уже поздно.
 *
 * ## Общее правило показа
 *
 * Каждый блок сам себя прячет, когда считать не по чему. Ноль вместо
 * «нет данных» — утверждение, которого система не проверяла: «выбыло 0»
 * читается как «мы никого не потеряли», а означать может «выбытие
 * не заполняют».
 */

const Tile = ({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'good' | 'warn' | 'plain'
}) => (
  <div className="rounded-xl bg-canvas px-4 py-3.5">
    <p className="text-[13px] leading-snug text-ink-500">{label}</p>
    <p
      className={`mt-1 text-[24px] font-medium leading-none tabular-nums ${
        tone === 'warn' ? 'text-[#c0392b]' : tone === 'good' ? 'text-forest-600' : ''
      }`}
    >
      {value}
    </p>
    {note && <p className="mt-1 text-[12px] leading-snug text-ink-500">{note}</p>}
  </div>
)

/* ------------------------------------------------------------------ */

/**
 * Генетический тренд: два ряда на одном поле.
 *
 * ## Почему индекс и инбридинг вместе
 *
 * Это две стороны одного решения. Индекс говорит, куда стадо движется;
 * инбридинг — какой ценой. Голштинская популяция узкая, и прогресс в ней
 * покупается родством: подбор по лучшим быкам мира неизбежно сужает круг
 * предков. Два графика порознь позволяют смотреть на первый и не смотреть
 * на второй — ровно то, чего делать нельзя.
 *
 * ## Почему свой SVG, а не библиотека
 *
 * График здесь простой — десять точек и две линии, — а библиотека тянет
 * в браузер сотни килобайт и своё представление о том, как рисовать оси.
 * Разбор в `EvolutionBench` тот же.
 *
 * Ось подписана годами и значениями по краям, а не сеткой: сетка на десяти
 * точках занимает больше внимания, чем сами точки.
 */
function TrendChart({ points }: { points: GeneticTrend['points'] }) {
  const withIpc = points.filter((p) => p.ipc !== null)
  if (withIpc.length < 2) return null

  const W = 640
  const H = 180
  const PAD = 28

  const ipcValues = withIpc.map((p) => p.ipc!)
  const ipcMin = Math.min(...ipcValues)
  const ipcMax = Math.max(...ipcValues)
  const ipcSpan = ipcMax - ipcMin || 1

  const inbValues = points.map((p) => p.inbreeding ?? 0)
  const inbMax = Math.max(...inbValues, INBREEDING_THRESHOLD) || 1

  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(points.length - 1, 1)
  const yIpc = (v: number) => H - PAD - ((v - ipcMin) / ipcSpan) * (H - PAD * 2)
  const yInb = (v: number) => H - PAD - (v / inbMax) * (H - PAD * 2)

  const line = (get: (p: GeneticTrend['points'][number]) => number | null, y: (v: number) => number) =>
    points
      .map((p, i) => (get(p) === null ? null : `${x(i)},${y(get(p)!)}`))
      .filter(Boolean)
      .join(' ')

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full min-w-[560px]" role="img"
        aria-label="Средний индекс и инбридинг по году рождения">
        {/* Порог инбридинга — единственная линия сетки: она означает решение,
            а не разметку */}
        <line
          x1={PAD}
          x2={W - PAD}
          y1={yInb(INBREEDING_THRESHOLD)}
          y2={yInb(INBREEDING_THRESHOLD)}
          stroke="#cbd1d8"
          strokeDasharray="4 4"
        />
        <text x={W - PAD} y={yInb(INBREEDING_THRESHOLD) - 5} textAnchor="end" className="fill-ink-400 text-[10px]">
          порог инбридинга {INBREEDING_THRESHOLD} %
        </text>

        <polyline points={line((p) => p.ipc, yIpc)} fill="none" stroke="#2e8757" strokeWidth="2.5" />
        <polyline points={line((p) => p.inbreeding, yInb)} fill="none" stroke="#f5a623" strokeWidth="2" />

        {points.map((p, i) => (
          <g key={p.year}>
            {p.ipc !== null && <circle cx={x(i)} cy={yIpc(p.ipc)} r="3.5" fill="#2e8757" />}
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-500 text-[10px]">
              {p.year}
            </text>
          </g>
        ))}
      </svg>

      <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-forest-500" /> средний индекс
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-accent-500" /> средний инбридинг
        </span>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function HerdAnalytics({
  structure,
  heifers,
  trend,
  cull,
  repro,
  udder,
  milk,
}: {
  structure: LactationStructure | null
  heifers: HeiferAges | null
  trend: GeneticTrend | null
  cull: Culling | null
  repro: Reproduction | null
  udder: UdderHealth | null
  milk: MilkByLactation | null
}) {
  return (
    <>
      {/* ---------------------- Структура стада ---------------------- */}
      {structure && structure.cows > 0 && (
        <section className="mt-10">
          <h2 className="section-title mb-2">Структура стада</h2>
          <p className="mb-5 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Сколько коров какой лактации. Доля первотёлок — не про возраст стада, а про то,
            доживают ли коровы до третьего отёла: чем её больше, тем выше вынужденная
            выбраковка.
          </p>

          <div className="card">
            <div className="space-y-3">
              {structure.byLactation.map((r) => {
                const share = structure.cows > 0 ? (r.cows / structure.cows) * 100 : 0
                return (
                  <div key={r.lactation}>
                    <div className="flex items-baseline justify-between gap-4 text-[14px]">
                      <span>{r.label}</span>
                      <span className="tabular-nums text-ink-500">
                        {nf(r.cows, 0)} · {nf(share, 0)} %
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-forest-500"
                        style={{ width: `${Math.max(share, 0.5)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Tile
                label="Средняя лактация"
                value={structure.meanLactation === null ? '—' : nf(structure.meanLactation, 1)}
                note="показатель продуктивного долголетия"
              />
              {structure.withoutCalvings > 0 && (
                <Tile
                  label="Коров без отёлов в книге"
                  value={nf(structure.withoutCalvings, 0)}
                  note="в среднюю лактацию не входят: это пробел в данных, а не молодость стада"
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* ------------------------ Молодняк --------------------------- */}
      {heifers && heifers.total > 0 && (
        <section className="mt-10">
          <h2 className="section-title mb-2">Ремонтный молодняк</h2>
          <p className="mb-5 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Тёлки без отёла — завтрашнее стадо. Тринадцать месяцев — возраст осеменения
            голштинской тёлки в мировой практике; после пятнадцати каждый месяц передержки
            это корм без отдачи.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile label="Растут, до 13 мес." value={nf(heifers.young, 0)} />
            <Tile
              label="Пора осеменять, 13–15 мес."
              value={nf(heifers.ready, 0)}
              tone="good"
              note={
                heifers.meanReadyAge === null
                  ? undefined
                  : `средний возраст ${nf(heifers.meanReadyAge, 1)} мес.`
              }
            />
            <Tile
              label="Передержка, старше 15 мес."
              value={nf(heifers.overdue, 0)}
              tone={heifers.overdue > 0 ? 'warn' : 'plain'}
            />
          </div>
        </section>
      )}

      {/* --------------------- Удой по группам ----------------------- */}
      {milk && milk.groups.some((g) => g.cows > 0) && (
        <section className="mt-10">
          <h2 className="section-title mb-2">Удой за 305 дней по группам</h2>
          <p className="mb-5 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Раздельно, а не одним средним: первотёлка даёт около четырёх пятых от того,
            что даст она же на третьей лактации, и общее среднее по стаду говорит больше
            о возрастном составе, чем о продуктивности. Сравнивать надо первотёлок
            с первотёлками.
          </p>

          <div className="card overflow-x-auto">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Группа</th>
                  <th className="text-right">Лактаций</th>
                  <th className="text-right">Удой 305, кг</th>
                  <th className="text-right">Жир, %</th>
                  <th className="text-right">Белок, %</th>
                </tr>
              </thead>
              <tbody>
                {milk.groups.map((g) => (
                  <tr key={g.key}>
                    <td>{g.label}</td>
                    <td className="text-right tabular-nums">{nf(g.cows, 0)}</td>
                    <td className="text-right tabular-nums">
                      {g.milk305 === null ? '—' : nf(g.milk305, 0)}
                    </td>
                    <td className="text-right tabular-nums">
                      {g.fatPercent === null ? '—' : nf(g.fatPercent, 2)}
                    </td>
                    <td className="text-right tabular-nums">
                      {g.proteinPercent === null ? '—' : nf(g.proteinPercent, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {milk.inProgress > 0 && (
              <p className="mt-3 max-w-[75ch] text-[13px] leading-relaxed text-ink-500">
                Ещё {nf(milk.inProgress, 0)} лактаций в ходу — в средние они не входят.
                Лактация в ходу означает «ещё доит», а не «мало надоила», и, смешав её
                с законченными, среднее наказывало бы хозяйство за недавние отёлы.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ------------------- Здоровье вымени ------------------------- */}
      {udder && udder.measured > 0 && (
        <section className="mt-10">
          <h2 className="section-title mb-2">Здоровье вымени</h2>
          <p className="mb-5 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            По последнему замеру каждой коровы. Двести тысяч клеток — общепринятая граница
            здорового вымени: выше начинается скрытый мастит, который бьёт по надою,
            по сортности и по выбраковке сразу.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile
              label="Среднее по стаду, тыс./мл"
              value={udder.meanScc === null ? '—' : nf(udder.meanScc, 0)}
              tone={udder.meanScc !== null && udder.meanScc > SCC_THRESHOLD ? 'warn' : 'good'}
              note="геометрическое: одна корова с миллионом не должна двигать всё стадо"
            />
            <Tile
              label={`Коров выше ${SCC_THRESHOLD} тыс.`}
              value={nf(udder.above, 0)}
              tone={udder.above > 0 ? 'warn' : 'good'}
              note={udder.share === null ? undefined : `${nf(udder.share, 0)} % от измеренных`}
            />
            <Tile
              label="Коров с замером"
              value={nf(udder.measured, 0)}
              note="остальные в расчёт не вошли"
            />
          </div>

          {udder.lastTest && (
            <p className="mt-3 text-[13px] text-ink-500">
              Последний замер: <Moment iso={udder.lastTest} />
            </p>
          )}
        </section>
      )}

      {/* -------------------- Воспроизводство ------------------------ */}
      {repro && (repro.calvings > 0 || repro.inseminations > 0) && (
        <section className="mt-10">
          <h2 className="section-title mb-2">Воспроизводство</h2>
          <p className="mb-5 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Не племенные оценки, а работа хозяйства за год. Племенная ценность меняется
            поколениями, эти числа — решением зоотехника.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile
              label="Сервис-период, дней"
              value={repro.serviceperiod === null ? '—' : nf(repro.serviceperiod, 0)}
              note="от отёла до первого осеменения; ориентир 85–110"
            />
            <Tile
              label="Осеменений на стельность"
              value={repro.perConception === null ? '—' : nf(repro.perConception, 2)}
              note={
                repro.perConception === null
                  ? 'результат осеменений не отмечен — считать не по чему'
                  : 'обычно 1,5–2; выше трёх — искать причину'
              }
              tone={repro.perConception !== null && repro.perConception > 3 ? 'warn' : 'plain'}
            />
            <Tile
              label="Межотельный период, дней"
              value={repro.calvingInterval === null ? '—' : nf(repro.calvingInterval, 0)}
              note="у благополучного стада 380–400"
            />
          </div>

          <p className="mt-3 text-[13px] text-ink-500">
            Посчитано по {nf(repro.calvings, 0)} отёлам и {nf(repro.inseminations, 0)} осеменениям
            за последний год.
          </p>
        </section>
      )}

      {/* ------------------------- Выбытие --------------------------- */}
      {cull && cull.total > 0 && (
        <section className="mt-10">
          <h2 className="section-title mb-2">Выбытие за год</h2>
          <p className="mb-5 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Главная статья потерь молочного хозяйства. Корова окупает выращивание примерно
            ко второй лактации: выбывшая первотёлка — чистый убыток, сколько бы молока
            она ни дала.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile
              label="Выбыло голов"
              value={nf(cull.total, 0)}
              note={cull.rate === null ? undefined : `${nf(cull.rate, 1)} % от стада с выбывшими`}
            />
            <Tile
              label="Из них первотёлок"
              value={nf(cull.firstLactation, 0)}
              tone={cull.firstLactation > 0 ? 'warn' : 'plain'}
              note="самая дорогая потеря"
            />
            <Tile
              label="Средняя лактация выбытия"
              value={cull.meanLactation === null ? '—' : nf(cull.meanLactation, 1)}
              note="чем меньше, тем короче продуктивная жизнь"
            />
          </div>

          {cull.reasons.length > 0 && (
            <div className="card mt-4 overflow-x-auto">
              {/*
                 Причина и лактация вместе, а не порознь: причина без возраста
                 не даёт решения. «Болезни конечностей, сорок голов» — это либо
                 полы и обрезка, либо генетика ног, и различает их лактация:
                 у первотёлок генетика ног проявиться ещё не успевает.
              */}
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>Причина</th>
                    <th className="text-right">Голов</th>
                    <th className="text-right">Средняя лактация</th>
                  </tr>
                </thead>
                <tbody>
                  {cull.reasons.map((r) => (
                    <tr key={r.reason}>
                      <td>{r.reason}</td>
                      <td className="text-right tabular-nums">{nf(r.count, 0)}</td>
                      <td className="text-right tabular-nums">
                        {r.meanLactation === null ? '—' : nf(r.meanLactation, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* -------------------- Генетический тренд --------------------- */}
      {trend && trend.points.length > 1 && (
        <section className="mt-10">
          <h2 className="section-title mb-2">Генетический тренд и инбридинг</h2>
          <p className="mb-3 max-w-[80ch] text-[14px] leading-relaxed text-ink-500">
            Средний индекс и средний коэффициент инбридинга по году рождения. Год рождения,
            а не дата оценки: оценку пересчитывают и меняют базу сравнения, а генетика
            животного складывается один раз. Ряд по году рождения показывает работу подбора.
          </p>
          <p className="mb-5 max-w-[80ch] text-[14px] leading-relaxed text-ink-700">
            Две линии рядом намеренно. Индекс говорит, куда стадо движется; инбридинг — какой
            ценой. Голштинская популяция узкая, и прогресс в ней покупается родством.
          </p>

          <div className="card">
            <TrendChart points={trend.points} />

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Tile
                label="Средний инбридинг стада"
                value={trend.meanInbreeding === null ? '—' : `${nf(trend.meanInbreeding, 2)} %`}
              />
              <Tile
                label={`Животных выше ${INBREEDING_THRESHOLD} %`}
                value={nf(trend.aboveThreshold, 0)}
                tone={trend.aboveThreshold > 0 ? 'warn' : 'good'}
                note={
                  trend.withInbreeding > 0
                    ? `${nf((trend.aboveThreshold / trend.withInbreeding) * 100, 0)} % от тех, у кого он посчитан`
                    : undefined
                }
              />
              <Tile
                label="Коэффициент посчитан у"
                value={nf(trend.withInbreeding, 0)}
                note="остальным не хватает родословной"
              />
            </div>

            <p className="mt-4 max-w-[75ch] text-[13px] leading-relaxed text-ink-500">
              {INBREEDING_THRESHOLD} % — эквивалент спаривания двоюродных. Выше начинается
              заметная инбредная депрессия по продуктивности и воспроизводству; это граница
              внимания, а не запрет.
            </p>
          </div>
        </section>
      )}
    </>
  )
}
