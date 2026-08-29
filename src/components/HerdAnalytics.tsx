import Link from 'next/link'
import { nf, plural } from '@/lib/format'
import { Moment } from '@/components/Moment'
import { InfoTip } from '@/components/InfoTip'
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
 * Отчёты по стаду в разделе «Стадо → Отчёты».
 *
 * ## Почему они переехали с «Обзора»
 *
 * Стояли на «Обзоре» — по доводу, что отчёт, за которым надо идти
 * в отдельный раздел, смотрят раз в квартал, то есть когда решать уже
 * поздно. Довод верный, но из него вышло другое: раздел «Отчёты» с двумя
 * дверями и «Обзор» с семью отчётами. Название перестало отвечать
 * содержимому, а это дороже одного лишнего нажатия: человек, которому
 * нужен отчёт, ищет его там, где написано «Отчёты», не находит и решает,
 * что отчёта нет.
 *
 * Ежедневность спасена иначе — полосой сигналов на «Обзоре»: там остались
 * те же числа, но только тревожные, и каждое ведёт прямо в список
 * животных. «Обзор» отвечает «что случилось», «Отчёты» — «почему
 * и с кем».
 *
 * ## Почему сеткой карточек, а не колонкой разделов
 *
 * Первая редакция давала каждому отчёту заголовок раздела и абзац
 * пояснения перед карточкой. Вышло пять экранов прокрутки, где половину
 * места занимал текст, объясняющий числа, которых ещё не видно. Сравнить
 * структуру стада с выбытием стало нельзя: они оказались на разных
 * экранах, а сравнивают их именно вместе.
 *
 * Теперь это сетка: карточка — отчёт, две в ряд на широком экране.
 * Пояснения остались, но переехали: короткая строка под заголовком
 * и подсказка под знаком вопроса для того, кто спросит «почему так».
 * Разбор целиком живёт в `herd-analytics.ts` — он для того, кто правит
 * код, а не для того, кто смотрит на стадо.
 *
 * ## Общее правило показа
 *
 * Каждая карточка сама себя прячет, когда считать не по чему. Ноль вместо
 * «нет данных» — утверждение, которого система не проверяла: «выбыло 0»
 * читается как «мы никого не потеряли», а означать может «выбытие
 * не заполняют».
 */

/**
 * Плитка с числом. С адресом — становится дверью в список животных.
 *
 * ## Почему дверь именно на плитке, а не отдельной ссылкой под карточкой
 *
 * Ссылка «показать животных» внизу карточки относилась бы ко всей карточке,
 * а числа в ней разные: «пора осеменять 12» и «передержка 4» — два разных
 * списка. Человек нажимает на то число, которое его встревожило, и должен
 * получить именно его.
 *
 * Плитка без адреса остаётся неподвижной. Это не недоделка: у «среднего
 * инбридинга» списка нет и быть не может — среднее не относится ни к одному
 * животному, а показать по нему всё стадо значило бы притвориться, что
 * относится.
 */
const Tile = ({
  label,
  value,
  note,
  tone,
  href,
}: {
  label: string
  value: string
  note?: string
  tone?: 'good' | 'warn' | 'plain'
  href?: string
}) => {
  const body = (
    <>
      <p className="text-[12px] leading-snug text-ink-500">{label}</p>
      <p
        className={`mt-1 text-[21px] font-medium leading-none tabular-nums ${
          tone === 'warn' ? 'text-[#c0392b]' : tone === 'good' ? 'text-forest-600' : ''
        }`}
      >
        {value}
        {href && <span className="ml-1.5 align-middle text-[13px] text-ink-400">→</span>}
      </p>
      {note && <p className="mt-1 text-[11px] leading-snug text-ink-500">{note}</p>}
    </>
  )

  if (!href) return <div className="rounded-xl bg-canvas px-3.5 py-3">{body}</div>

  return (
    <Link
      href={href}
      className="block rounded-xl bg-canvas px-3.5 py-3 transition-colors hover:bg-ink-100"
    >
      {body}
    </Link>
  )
}

/** Карточка отчёта: заголовок, короткая строка, подсказка «почему так». */
const Report = ({
  title,
  note,
  why,
  wide,
  children,
}: {
  title: string
  note?: string
  why?: React.ReactNode
  wide?: boolean
  children: React.ReactNode
}) => (
  <article className={`card ${wide ? 'lg:col-span-2' : ''}`}>
    <div className="mb-3 flex items-baseline gap-2">
      <h3 className="panel-heading mb-0">{title}</h3>
      {why && <InfoTip label={`Почему так считается: ${title}`}>{why}</InfoTip>}
    </div>
    {note && <p className="-mt-2 mb-4 text-[13px] leading-snug text-ink-500">{note}</p>}
    {children}
  </article>
)

/* ------------------------------------------------------------------ */

/**
 * Генетический тренд: два ряда на одном поле.
 *
 * Индекс говорит, куда стадо движется; инбридинг — какой ценой.
 * Голштинская популяция узкая, и прогресс в ней покупается родством:
 * подбор по лучшим быкам мира сужает круг предков. Два графика порознь
 * позволяют смотреть на первый и не смотреть на второй — ровно то, чего
 * делать нельзя.
 *
 * График свой, без библиотеки: десять точек и две линии против сотен
 * килобайт в браузере. Единственная линия сетки — порог инбридинга:
 * она означает решение, а не разметку.
 */
function TrendChart({ points }: { points: GeneticTrend['points'] }) {
  const withIpc = points.filter((p) => p.ipc !== null)
  if (withIpc.length < 2) return null

  const W = 640
  const H = 150
  const PAD = 26

  const ipcValues = withIpc.map((p) => p.ipc!)
  const ipcMin = Math.min(...ipcValues)
  const ipcMax = Math.max(...ipcValues)
  const ipcSpan = ipcMax - ipcMin || 1

  const inbValues = points.map((p) => p.inbreeding ?? 0)
  const inbMax = Math.max(...inbValues, INBREEDING_THRESHOLD) || 1

  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(points.length - 1, 1)
  const yIpc = (v: number) => H - PAD - ((v - ipcMin) / ipcSpan) * (H - PAD * 2)
  const yInb = (v: number) => H - PAD - (v / inbMax) * (H - PAD * 2)

  const line = (
    get: (p: GeneticTrend['points'][number]) => number | null,
    y: (v: number) => number,
  ) =>
    points
      .map((p, i) => (get(p) === null ? null : `${x(i)},${y(get(p)!)}`))
      .filter(Boolean)
      .join(' ')

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[150px] w-full min-w-[520px]"
        role="img"
        aria-label="Средний индекс и инбридинг по году рождения"
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={yInb(INBREEDING_THRESHOLD)}
          y2={yInb(INBREEDING_THRESHOLD)}
          stroke="#cbd1d8"
          strokeDasharray="4 4"
        />
        <text
          x={W - PAD}
          y={yInb(INBREEDING_THRESHOLD) - 5}
          textAnchor="end"
          className="fill-ink-400 text-[10px]"
        >
          порог {INBREEDING_THRESHOLD} %
        </text>

        <polyline points={line((p) => p.ipc, yIpc)} fill="none" stroke="#2e8757" strokeWidth="2.5" />
        <polyline
          points={line((p) => p.inbreeding, yInb)}
          fill="none"
          stroke="#f5a623"
          strokeWidth="2"
        />

        {points.map((p, i) => (
          <g key={p.year}>
            {p.ipc !== null && <circle cx={x(i)} cy={yIpc(p.ipc)} r="3" fill="#2e8757" />}
            <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-500 text-[10px]">
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
  const any =
    (structure && structure.cows > 0) ||
    (heifers && heifers.total > 0) ||
    (trend && trend.points.length > 1) ||
    (cull && cull.total > 0) ||
    (repro && (repro.calvings > 0 || repro.inseminations > 0)) ||
    (udder && udder.measured > 0) ||
    (milk && milk.groups.some((g) => g.cows > 0))

  if (!any) return null

  return (
    <section className="mt-9">
      <h2 className="section-title mb-5">Стадо в разрезе</h2>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ---------------------- Структура стада ---------------------- */}
        {structure && structure.cows > 0 && (
          <Report
            title="Структура по лактациям"
            note={`Средняя лактация ${
              structure.meanLactation === null ? '—' : nf(structure.meanLactation, 1)
            } · коров ${nf(structure.cows, 0)}`}
            why={
              <>
                <p className="mb-2 font-medium text-ink-900">Почему доля первотёлок важна</p>
                <p className="mb-2">
                  Сорок процентов первотёлок — это не молодое стадо, а высокая вынужденная
                  выбраковка: коровы не доживают до третьего отёла, и хозяйство каждый год
                  выращивает замену. Два стада с одинаковой строкой «коров 320» могут означать
                  противоположное.
                </p>
                <p>
                  Номер лактации берётся счётом отёлов, а не возрастной группой в карточке:
                  группу заполняет человек и забывает обновить, отёл — событие с датой.
                </p>
              </>
            }
          >
            {/*
               Полоса группы — дверь в список её коров. Строка без коров
               ссылкой не становится: приглашение открыть пустое —
               обещание, которое страница не выполнит.
            */}
            <div className="space-y-2.5">
              {structure.byLactation.map((r) => {
                const share = structure.cows > 0 ? (r.cows / structure.cows) * 100 : 0
                const bar = (
                  <>
                    <div className="flex items-baseline justify-between gap-4 text-[13px]">
                      <span>{r.label}</span>
                      <span className="tabular-nums text-ink-500">
                        {nf(r.cows, 0)} · {nf(share, 0)} %
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-forest-500"
                        style={{ width: `${Math.max(share, 0.5)}%` }}
                      />
                    </div>
                  </>
                )

                return r.cows > 0 ? (
                  <Link
                    key={r.lactation}
                    href={`/account/reports/lactation-${r.lactation}`}
                    className="block rounded-lg px-1 py-0.5 transition-colors hover:bg-canvas"
                  >
                    {bar}
                  </Link>
                ) : (
                  <div key={r.lactation} className="px-1 py-0.5">
                    {bar}
                  </div>
                )
              })}
            </div>

            {/*
               Два числа, а не одно. Прежде здесь стояло нулевое ведро
               целиком — вместе с тёлками и телятами, — и называлось
               «коровами без отёлов». Ссылка при этом вела на список,
               где молодняк отсечён: число и список расходились тем
               сильнее, чем больше в хозяйстве ремонта.
            */}
            {structure.withoutCalvings > 0 && (
              <p className="mt-3 text-[12px] leading-snug text-ink-500">
                Ещё{' '}
                <Link
                  href="/account/reports/no-calvings"
                  className="underline underline-offset-2 hover:text-forest-500"
                >
                  {nf(structure.withoutCalvings, 0)}{' '}
                  {plural(structure.withoutCalvings, 'корова', 'коровы', 'коров')} без отёлов
                </Link>{' '}
                в книге — в среднюю лактацию не входят: это пробел в данных, а не молодость
                стада.
              </p>
            )}

            {structure.youngStock > 0 && (
              <p className="mt-1 text-[12px] leading-snug text-ink-500">
                Плюс {nf(structure.youngStock, 0)}{' '}
                {plural(structure.youngStock, 'голова', 'головы', 'голов')} молодняка без
                отёлов — здесь это возраст, а не пробел.
              </p>
            )}
          </Report>
        )}

        {/* ------------------------ Молодняк --------------------------- */}
        {heifers && heifers.total > 0 && (
          <Report
            title="Ремонтный молодняк"
            note={`Тёлок без отёла ${nf(heifers.total, 0)}`}
            why={
              <>
                <p className="mb-2 font-medium text-ink-900">Откуда границы возраста</p>
                <p>
                  Тринадцать месяцев — возраст осеменения голштинской тёлки в мировой практике:
                  к этому времени она набирает нужную массу, а отёл приходится на 22–24 месяца.
                  После пятнадцати каждый месяц передержки — корм без отдачи. Это рамка
                  разговора, а не правило: решает хозяйство.
                </p>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile
                label="Растут, до 13 мес."
                value={nf(heifers.young, 0)}
                href={heifers.young > 0 ? '/account/reports/heifers-young' : undefined}
              />
              <Tile
                label="Пора осеменять"
                value={nf(heifers.ready, 0)}
                tone="good"
                href={heifers.ready > 0 ? '/account/reports/heifers-ready' : undefined}
                note={
                  heifers.meanReadyAge === null
                    ? '13–15 мес.'
                    : `в среднем ${nf(heifers.meanReadyAge, 1)} мес.`
                }
              />
              <Tile
                label="Передержка, 15+ мес."
                value={nf(heifers.overdue, 0)}
                tone={heifers.overdue > 0 ? 'warn' : 'plain'}
                href={heifers.overdue > 0 ? '/account/reports/heifers-overdue' : undefined}
              />
            </div>
          </Report>
        )}

        {/* --------------------- Удой по группам ----------------------- */}
        {milk && milk.groups.some((g) => g.cows > 0) && (
          <Report
            title="Удой за 305 дней по группам"
            note="Раздельно, а не одним средним: сравнивать надо первотёлок с первотёлками"
            why={
              <>
                <p className="mb-2 font-medium text-ink-900">Почему не общее среднее</p>
                <p className="mb-2">
                  Первотёлка даёт около четырёх пятых от того, что даст она же на третьей
                  лактации. Стадо с большой долей первотёлок по общему среднему выглядит хуже
                  соседнего, не будучи хуже: разница в возрастном составе.
                </p>
                <p className="mb-2">
                  В Канаде и США общий показатель приводят к взрослому эквиваленту
                  по опубликованным коэффициентам — по породе, региону и сезону отёла.
                  У нас таких таблиц нет, а коэффициент с потолка превратил бы измерение
                  в чужую, никем не подтверждённую оценку. Поэтому отечественный порядок:
                  305 дней, показанные раздельно.
                </p>
                <p>
                  Считаются строки лактаций, а не коровы: у коровы с тремя отёлами по строке
                  в каждой группе. Поэтому сумма здесь больше числа коров в стаде.
                </p>
              </>
            }
          >
            <div className="overflow-x-auto">
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>Группа</th>
                    <th className="text-right">Лактаций</th>
                    <th className="text-right">Удой 305</th>
                    <th className="text-right">Жир</th>
                    <th className="text-right">Белок</th>
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
            </div>

            {milk.inProgress > 0 && (
              <p className="mt-3 text-[12px] leading-snug text-ink-500">
                Ещё{' '}
                <Link
                  href="/account/reports/milk-in-progress"
                  className="underline underline-offset-2 hover:text-forest-500"
                >
                  {nf(milk.inProgress, 0)}{' '}
                  {plural(milk.inProgress, 'корова доит', 'коровы доят', 'коров доят')} сейчас
                </Link>{' '}
                — в средние не входят: «ещё доит» не то же, что «мало надоила».
              </p>
            )}
          </Report>
        )}

        {/* ------------------- Здоровье вымени ------------------------- */}
        {udder && udder.measured > 0 && (
          <Report
            title="Здоровье вымени"
            note={`По последнему замеру каждой коровы · измерено ${nf(udder.measured, 0)}`}
            why={
              <>
                <p className="mb-2 font-medium text-ink-900">Двести тысяч и среднее</p>
                <p className="mb-2">
                  Двести тысяч клеток — общепринятая граница здорового вымени, одинаковая
                  в Канаде, Европе и России. Выше начинается скрытый мастит, который бьёт
                  по надою, по сортности и по выбраковке сразу.
                </p>
                <p>
                  Среднее геометрическое, а не обычное: клетки распределены логнормально,
                  и одна корова с миллионом сдвигает обычное среднее так, что оно перестаёт
                  описывать стадо.
                </p>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Tile
                label="Среднее, тыс./мл"
                value={udder.meanScc === null ? '—' : nf(udder.meanScc, 0)}
                tone={udder.meanScc !== null && udder.meanScc > SCC_THRESHOLD ? 'warn' : 'good'}
              />
              <Tile
                label={`Выше ${SCC_THRESHOLD} тыс.`}
                value={nf(udder.above, 0)}
                tone={udder.above > 0 ? 'warn' : 'good'}
                href={udder.above > 0 ? '/account/reports/scc-above' : undefined}
                note={udder.share === null ? undefined : `${nf(udder.share, 0)} % от измеренных`}
              />
            </div>

            {udder.lastTest && (
              <p className="mt-3 text-[12px] text-ink-500">
                Последний замер: <Moment iso={udder.lastTest} />
              </p>
            )}
          </Report>
        )}

        {/* -------------------- Воспроизводство ------------------------ */}
        {repro && (repro.calvings > 0 || repro.inseminations > 0) && (
          <Report
            title="Воспроизводство"
            note={`За год: отёлов ${nf(repro.calvings, 0)}, осеменений ${nf(repro.inseminations, 0)} — включая выбывших за это время`}
            why={
              <>
                <p className="mb-2 font-medium text-ink-900">Это не племенная оценка</p>
                <p className="mb-2">
                  Фертильность в карточке животного — что оно передаёт потомству, и меняется
                  она поколениями. Эти числа — работа хозяйства, и меняются решением
                  зоотехника.
                </p>
                <p>
                  Сервис-период — от отёла до первого осеменения, ориентир 85–110 дней.
                  Индекс осеменения обычно 1,5–2; выше трёх означает проблему с выявлением
                  охоты, с хранением семени или со здоровьем стада. Межотельный период
                  у благополучного стада 380–400 дней.
                </p>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile
                label="Сервис-период, дней"
                value={repro.serviceperiod === null ? '—' : nf(repro.serviceperiod, 0)}
                note="ориентир 85–110"
              />
              <Tile
                label="Осеменений на стельность"
                value={repro.perConception === null ? '—' : nf(repro.perConception, 2)}
                note={repro.perConception === null ? 'результат не отмечен' : 'обычно 1,5–2'}
                tone={repro.perConception !== null && repro.perConception > 3 ? 'warn' : 'plain'}
              />
              <Tile
                label="Межотельный, дней"
                value={repro.calvingInterval === null ? '—' : nf(repro.calvingInterval, 0)}
                note="норма 380–400"
              />
            </div>
          </Report>
        )}

        {/* ------------------------- Выбытие --------------------------- */}
        {cull && cull.total > 0 && (
          <Report
            title="Выбытие за год"
            note={`${nf(cull.total, 0)} голов${
              cull.rate === null ? '' : ` · ${nf(cull.rate, 1)} % от стада с выбывшими`
            }`}
            why={
              <>
                <p className="mb-2 font-medium text-ink-900">Главная статья потерь</p>
                <p className="mb-2">
                  Корова окупает выращивание примерно ко второй лактации: выбывшая первотёлка
                  — чистый убыток, сколько бы молока она ни дала.
                </p>
                <p className="mb-2">
                  Причина показана вместе со средней лактацией, потому что причина без
                  возраста не даёт решения. «Болезни конечностей, сорок голов» — это либо полы
                  и обрезка, либо генетика ног, и различает их лактация: у первотёлок генетика
                  ног проявиться ещё не успевает.
                </p>
                <p>
                  Знаменатель доли — нынешнее стадо плюс выбывшие: деля на то, что осталось
                  после потерь, мы занижали бы долю тем сильнее, чем хуже дела.
                </p>
              </>
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/*
                 Дверь стоит на числе первотёлок, а не на общем итоге:
                 итог уже назван в строке под заголовком, а список открывают
                 ради того, чтобы посмотреть на самые дорогие потери.
                 Список при этом общий — за год, отсортированный по дате:
                 отдельный список «только первотёлки» разошёлся бы
                 с числом выбытия, стоящим рядом.
              */}
              <Tile
                label="Из них первотёлок"
                value={nf(cull.firstLactation, 0)}
                tone={cull.firstLactation > 0 ? 'warn' : 'plain'}
                href="/account/reports/culled-year"
                note="самая дорогая потеря"
              />
              <Tile
                label="Средняя лактация выбытия"
                value={cull.meanLactation === null ? '—' : nf(cull.meanLactation, 1)}
                note="чем меньше, тем короче продуктивная жизнь"
              />
            </div>

            {cull.reasons.length > 0 && (
              <div className="mt-4 overflow-x-auto">
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
          </Report>
        )}

        {/* -------------------- Генетический тренд --------------------- */}
        {trend && trend.points.length > 1 && (
          <Report
            title="Генетический тренд и инбридинг"
            wide
            note="По году рождения: генетика животного складывается один раз, а оценку пересчитывают"
            why={
              <>
                <p className="mb-2 font-medium text-ink-900">Почему две линии рядом</p>
                <p className="mb-2">
                  Индекс говорит, куда стадо движется; инбридинг — какой ценой. Голштинская
                  популяция узкая, и прогресс в ней покупается родством: подбор по лучшим
                  быкам мира сужает круг предков. Порознь их можно смотреть по очереди
                  и не смотреть второй.
                </p>
                <p>
                  {INBREEDING_THRESHOLD} % — эквивалент спаривания двоюродных. Выше начинается
                  заметная инбредная депрессия по продуктивности и воспроизводству; это
                  граница внимания, а не запрет.
                </p>
              </>
            }
          >
            <TrendChart points={trend.points} />

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile
                label="Средний инбридинг стада"
                value={trend.meanInbreeding === null ? '—' : `${nf(trend.meanInbreeding, 2)} %`}
              />
              <Tile
                label={`Животных выше ${INBREEDING_THRESHOLD} %`}
                value={nf(trend.aboveThreshold, 0)}
                tone={trend.aboveThreshold > 0 ? 'warn' : 'good'}
                href={
                  trend.aboveThreshold > 0 ? '/account/reports/inbreeding-above' : undefined
                }
                note={
                  trend.withInbreeding > 0
                    ? `${nf((trend.aboveThreshold / trend.withInbreeding) * 100, 0)} % от посчитанных`
                    : undefined
                }
              />
              <Tile
                label="Коэффициент посчитан у"
                value={nf(trend.withInbreeding, 0)}
                note="остальным не хватает родословной"
              />
            </div>
          </Report>
        )}
      </div>
    </section>
  )
}
