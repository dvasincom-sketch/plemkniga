import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { AssociationNav } from '@/components/AssociationNav'
import { FilterChips } from '@/components/FilterChips'
import { getClient } from '@/lib/payload'
import { requireAssociation } from '@/lib/association'
import { herdConditions } from '@/lib/herd-condition'
import { herdSignals, type Signal } from '@/lib/herd-signals'
import { INBREEDING_LABEL, SCC_LABEL } from '@/lib/herd-analytics'
import { nf, pct, plural } from '@/lib/format'
import type { Organization } from '@/payload-types'

export const metadata: Metadata = { title: 'Состояние стад' }
export const dynamic = 'force-dynamic'

/**
 * Состояние стад — зоотехническая картина по членам Ассоциации.
 *
 * ## Зачем этот раздел
 *
 * О хозяйстве Ассоциация видела две вещи: сколько у него записей и какая
 * доля подтверждена. И то и другое про бумагу. Передержанный молодняк,
 * скрытый мастит, первотёлки в выбытии — всё это было видно только
 * в кабинете самого хозяйства, куда эксперт не заходит.
 *
 * Между тем это и есть работа объединения. Хозяйство свою беду видит
 * и часто с ней живёт; смысл в том, что рядом есть тот, кто видит сорок
 * стад разом и знает, у кого вышло иначе. Разговор начинается с того,
 * что кто-то заметил.
 *
 * ## Чего здесь нет: списков животных
 *
 * Ассоциация видит числа и доли и не открывает чужое стадо поимённо.
 * Разборы за числом (`herd-drilldown.ts`) работают по любому владельцу,
 * и включить их стоило бы одной строки — граница проведена намеренно.
 * Сводное число это повод для звонка; поимённый список — работа
 * зоотехника хозяйства, и делать её за него Ассоциация не должна.
 * Поэтому у чисел здесь нет дверей, и это не недоделка.
 *
 * ## Почему подписи те же, что в кабинете хозяйства
 *
 * Сигналы собирает тот же `herdSignals`, что рисует полосу «Требует
 * решения» на «Обзоре». Эксперт и зоотехник должны читать одну и ту же
 * фразу: если Ассоциация говорит «передержка», а в кабинете написано
 * что-то другое, разговор начинается со сверки словарей.
 *
 * ## Почему нули не показываются числом
 *
 * «0 %» и «замеров нет» — разные ответы, и второй важнее первого.
 * Хозяйство без единого замера соматики не благополучно, а неизвестно,
 * и для Ассоциации это как раз повод: данные не доезжают.
 */

/** Порядок колонок — тот же, что порядок сигналов в кабинете хозяйства. */
const COLUMNS: { key: string; title: string; hint: string }[] = [
  { key: 'heifers-overdue', title: 'Передержка', hint: 'тёлки старше 15 мес. без отёла' },
  { key: 'scc-above', title: 'Соматика', hint: `коровы выше ${SCC_LABEL} по последнему замеру` },
  { key: 'inbreeding-above', title: 'Инбридинг', hint: `животные выше ${INBREEDING_LABEL}` },
  { key: 'culled-first', title: 'Первотёлки', hint: 'выбыли до второго отёла за год' },
  { key: 'heifers-ready', title: 'К осеменению', hint: 'тёлки 13–15 мес.' },
]

const TABS = [
  { key: 'members', label: 'Члены Ассоциации' },
  { key: 'all', label: 'Все хозяйства со стадом' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default async function HerdConditionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireAssociation()
  const { tab: tabParam } = await searchParams
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'members'

  const payload = await getClient()

  const [orgs, conditions] = await Promise.all([
    payload.find({
      collection: 'organizations',
      limit: 500,
      sort: 'name',
      depth: 0,
      overrideAccess: true,
    }),
    herdConditions(payload),
  ])

  /*
   * Хозяйства без живых коров не показываются ни на одной вкладке.
   * Строка из пяти прочерков ничего не сообщает, а место занимает —
   * и заодно врёт видом «здесь всё в порядке» там, где стада нет вовсе.
   */
  const rows = (orgs.docs as Organization[])
    .map((o) => {
      const c = conditions.get(o.id as number)
      return { org: o, cond: c, signals: c ? herdSignals(c) : [] }
    })
    .filter((r) => (r.cond?.cows ?? 0) > 0)

  const members = rows.filter((r) => r.org.membership === 'member')
  const shown = tab === 'members' ? members : rows

  /*
   * Порядок — по тяжести, а не по названию.
   *
   * Сначала те, у кого больше срочных сигналов, потом те, у кого больше
   * сигналов вообще, и только потом по алфавиту. Список, где хозяйство
   * с пятью бедами стоит между двумя благополучными, — это справочник,
   * а раздел называется «Наблюдение».
   */
  const sorted = [...shown].sort((a, b) => {
    const urgent = (r: typeof a) => r.signals.filter((s) => s.urgent).length
    if (urgent(b) !== urgent(a)) return urgent(b) - urgent(a)
    if (b.signals.length !== a.signals.length) return b.signals.length - a.signals.length
    return String(a.org.name).localeCompare(String(b.org.name), 'ru')
  })

  const withSignals = sorted.filter((r) => r.signals.length > 0).length
  const withMass = sorted.filter((r) => r.signals.some((s) => s.mass)).length

  return (
    <>
      <SiteHeader active="/association" />

      <main className="container-page pb-8">
        <AssociationNav active="herds" />

        <div className="min-w-0">
          <h1 className="text-[30px] font-medium leading-tight sm:text-[36px]">Состояние стад</h1>

          <p className="mt-4 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Те же числа, которые хозяйство видит у себя на «Обзоре», — по всем сразу.
            Это не оценка хозяйства и не основание для решений о членстве: передержка
            и соматика говорят о работе со стадом, а не о добросовестности. Смысл
            раздела в том, чтобы заметить и позвонить раньше, чем беда станет годовой
            потерей.
          </p>

          <p className="mt-3 max-w-[80ch] text-[15px] leading-relaxed text-ink-700">
            Списков животных здесь нет намеренно. Кто именно передержан — работа
            зоотехника хозяйства, и данные принадлежат хозяйству; Ассоциация видит
            масштаб, а не поголовье.
          </p>

          <FilterChips
            label="Кого показывать"
            active={tab}
            items={[
              {
                key: 'members',
                label: 'Члены Ассоциации',
                href: '/association/herds',
                count: members.length,
                hint: 'Те, за кого Ассоциация ручается',
              },
              {
                key: 'all',
                label: 'Все хозяйства со стадом',
                href: '/association/herds?tab=all',
                count: rows.length,
                hint: 'Включая тех, кто не состоит в Ассоциации',
              },
            ]}
          />

          <p className="mt-3 text-[14px] text-ink-500">
            {plural(sorted.length, 'хозяйство', 'хозяйства', 'хозяйств')} со стадом:{' '}
            {nf(sorted.length, 0)}, из них с сигналами: {nf(withSignals, 0)}
            {withMass > 0 && `, с признаком на большинстве стада: ${nf(withMass, 0)}`}
          </p>

          <div className="card mt-6">
            <div className="overflow-x-auto">
              <table className="metric-table">
                <thead>
                  <tr>
                    <th>Хозяйство</th>
                    <th className="text-right">Коров</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="text-right" title={c.hint}>
                        {c.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length + 2} className="py-10 text-center text-ink-500">
                        {tab === 'members'
                          ? 'Ни у одного члена Ассоциации нет стада в книге'
                          : 'Стад в книге нет'}
                      </td>
                    </tr>
                  )}

                  {sorted.map(({ org, cond, signals }) => {
                    const by = new Map(signals.map((s) => [s.key, s]))

                    return (
                      <tr key={org.id}>
                        <td className="min-w-[14rem]">
                          <Link
                            href={`/?owner=${encodeURIComponent(org.name)}#results`}
                            className="underline underline-offset-4 hover:text-forest-500"
                          >
                            {org.shortName || org.name}
                          </Link>
                          {org.membership !== 'member' && (
                            <span className="block text-[12px] text-ink-500">
                              не член Ассоциации
                            </span>
                          )}
                        </td>
                        <td className="text-right tabular-nums text-ink-500">
                          {nf(cond?.cows ?? 0, 0)}
                        </td>

                        {COLUMNS.map((c) => (
                          <td key={c.key} className="text-right">
                            <Cell signal={by.get(c.key)} base={baseOf(c.key, cond)} />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 max-w-[90ch] text-[13px] leading-relaxed text-ink-500">
              Прочерк — сигнала нет. «Нет данных» — считать не по чему: например, ни одного
              замера соматики или ни одной посчитанной родословной; это не благополучие,
              а неизвестность. Полужирная доля означает, что признак охватил больше половины
              основания, — тогда дело обычно не в стаде, а в том, что данные приехали
              не полностью.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  )
}

/**
 * Основание сигнала — чтобы отличить «беды нет» от «считать не по чему».
 *
 * Сигнала в списке нет в обоих случаях: и когда передержки ноль, и когда
 * тёлок нет вовсе. Для хозяйства разницы нет — молчание полосы означает
 * «всё в порядке», и это верно. Для Ассоциации разница главная: стадо
 * без единого замера соматики не благополучно, а неизвестно, и звонить
 * туда надо как раз поэтому.
 */
function baseOf(key: string, c?: { heifers?: unknown; udder?: unknown; trend?: unknown; cull?: unknown }) {
  if (!c) return 0
  const n = (v: unknown, field: string): number =>
    v && typeof v === 'object' ? Number((v as Record<string, unknown>)[field] ?? 0) : 0

  switch (key) {
    case 'heifers-overdue':
    case 'heifers-ready':
      return n(c.heifers, 'total')
    case 'scc-above':
      return n(c.udder, 'measured')
    case 'inbreeding-above':
      return n(c.trend, 'withInbreeding')
    case 'culled-first':
      return n(c.cull, 'total')
    default:
      return 0
  }
}

function Cell({ signal, base }: { signal?: Signal; base: number }) {
  if (!signal) {
    return base > 0 ? (
      <span className="text-ink-300">—</span>
    ) : (
      <span className="text-[12px] text-amber-700">нет данных</span>
    )
  }

  return (
    <span className="inline-block whitespace-nowrap">
      <span className={`tabular-nums ${signal.urgent ? 'font-medium text-[#8a2d22]' : ''}`}>
        {nf(signal.count, 0)}
      </span>
      {signal.share !== null && (
        <span className={`ml-1.5 text-[12px] ${signal.mass ? 'font-medium text-[#8a2d22]' : 'text-ink-500'}`}>
          {pct(signal.share)}
        </span>
      )}
    </span>
  )
}
