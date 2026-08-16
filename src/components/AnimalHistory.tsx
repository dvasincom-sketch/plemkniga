import type { Where } from 'payload'
import { getClient } from '@/lib/payload'
import { dateRu, nf } from '@/lib/format'
import { CALVING_RESULTS } from '@/collections/Calvings'
import { EVENT_TYPES, labelOf } from '@/lib/dictionaries'
import type { Animal } from '@/payload-types'

/**
 * Хроника животного за последний год.
 *
 * Записи о животном лежат в пяти коллекциях: дойки, отёлы, осеменения,
 * события здоровья и общая лента. Каждая показана своей таблицей — это удобно,
 * когда знаешь, что ищешь, и бесполезно, когда вопрос звучит «что вообще
 * происходило с этой коровой».
 *
 * Здесь всё сведено в один поток по времени. Так видно то, чего не видно
 * в отдельных таблицах: мастит через две недели после отёла, провал удоя
 * следом за ним, три осеменения подряд без результата.
 *
 * Год — не круглое число ради красоты: это горизонт, на котором у коровы
 * умещается полный цикл (отёл, раздой, осеменение, спад, запуск), и на котором
 * зоотехник помнит события лично и может проверить запись.
 */

const KIND_STYLE: Record<string, { label: string; tone: string }> = {
  milk: { label: 'Дойка', tone: 'bg-brand-50 text-forest-600' },
  calving: { label: 'Отёл', tone: 'bg-[#e8f0fb] text-[#1f4d80]' },
  insemination: { label: 'Осеменение', tone: 'bg-[#f2ecfb] text-[#5b3d8c]' },
  health: { label: 'Здоровье', tone: 'bg-[#fdecea] text-[#8c2f27]' },
  event: { label: 'Событие', tone: 'bg-canvas text-ink-700' },
}

type Entry = {
  id: string
  at: number
  kind: keyof typeof KIND_STYLE
  title: string
  detail?: string
}

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

const monthTitle = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`

/** Склонение по числу: 1 дойка, 2 дойки, 5 доек. */
const plural = (n: number, one: string, few: string, many: string) => {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few
  return many
}

export async function AnimalHistory({ animal }: { animal: Animal }) {
  const payload = await getClient()
  const since = new Date()
  since.setFullYear(since.getFullYear() - 1)
  const from = since.toISOString()

  const scope = (): Where => ({
    and: [{ animal: { equals: animal.id } }, { date: { greater_than_equal: from } }],
  })

  const [milk, calvings, inseminations, health, events] = await Promise.all([
    payload.find({
      collection: 'milk-tests',
      where: scope(),
      sort: '-date',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'calvings',
      where: scope(),
      sort: '-date',
      limit: 20,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'inseminations',
      where: scope(),
      sort: '-date',
      limit: 50,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'health-events',
      where: scope(),
      sort: '-date',
      limit: 50,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'events',
      where: scope(),
      sort: '-date',
      limit: 50,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const entries: Entry[] = []

  for (const t of milk.docs) {
    entries.push({
      id: `m${t.id}`,
      at: new Date(t.date).getTime(),
      kind: 'milk',
      title: `Контрольная дойка — ${nf(t.dailyYield, 1)} кг/сут`,
      detail: [
        t.fatPercent ? `жир ${nf(t.fatPercent, 2)} %` : null,
        t.proteinPercent ? `белок ${nf(t.proteinPercent, 2)} %` : null,
        t.somaticCells ? `соматика ${nf(t.somaticCells, 0)} тыс./мл` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  for (const c of calvings.docs) {
    entries.push({
      id: `c${c.id}`,
      at: new Date(c.date).getTime(),
      kind: 'calving',
      title: `Отёл № ${c.number} — ${CALVING_RESULTS.find((r) => r.value === c.result)?.label ?? '—'}`,
      detail: [
        c.ease === 'easy' ? 'лёгкий' : c.ease === 'assisted' ? 'с помощью' : c.ease === 'hard' ? 'трудный' : null,
        c.calfWeight ? `масса телёнка ${nf(c.calfWeight, 0)} кг` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  for (const i of inseminations.docs) {
    const bull =
      typeof i.bull === 'object' && i.bull ? (i.bull.name ?? i.bull.identNumber) : null
    const result =
      typeof i.result === 'object' && i.result ? i.result.name : null
    entries.push({
      id: `i${i.id}`,
      at: new Date(i.date).getTime(),
      kind: 'insemination',
      title: `Осеменение${i.attemptNumber ? `, попытка ${i.attemptNumber}` : ''}${bull ? ` — ${bull}` : ''}`,
      detail: result ?? undefined,
    })
  }

  for (const h of health.docs) {
    const type = typeof h.type === 'object' && h.type ? h.type.name : null
    entries.push({
      id: `h${h.id}`,
      at: new Date(h.date).getTime(),
      kind: 'health',
      title: h.title || type || 'Ветеринарное событие',
      detail: [
        type && h.title ? type : null,
        h.severity === 'severe' ? 'тяжёлое' : h.severity === 'moderate' ? 'средней тяжести' : null,
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  for (const e of events.docs) {
    entries.push({
      id: `e${e.id}`,
      at: new Date(e.date).getTime(),
      kind: 'event',
      title: e.title || labelOf(EVENT_TYPES, e.type),
      detail:
        e.value !== null && e.value !== undefined
          ? `${nf(e.value, 0)} ${plural(Math.round(e.value), 'балл', 'балла', 'баллов')}`
          : undefined,
    })
  }

  entries.sort((a, b) => b.at - a.at)

  /* ----------------------- Помесячная полоса удоя ----------------------- */

  const months: { key: string; title: string; milk: number | null; marks: Set<string> }[] = []
  const now = new Date()
  for (let back = 11; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      title: monthTitle(d),
      milk: null,
      marks: new Set(),
    })
  }
  const byKey = new Map(months.map((m) => [m.key, m]))
  const sums = new Map<string, { sum: number; n: number }>()

  for (const e of entries) {
    const d = new Date(e.at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const m = byKey.get(key)
    if (!m) continue
    if (e.kind === 'milk') {
      const value = Number(e.title.match(/([\d,.]+) кг/)?.[1].replace(',', '.') ?? 0)
      const s = sums.get(key) ?? { sum: 0, n: 0 }
      s.sum += value
      s.n += 1
      sums.set(key, s)
    } else {
      m.marks.add(e.kind)
    }
  }
  for (const [key, s] of sums) {
    const m = byKey.get(key)
    if (m && s.n) m.milk = Math.round((s.sum / s.n) * 10) / 10
  }
  const maxMilk = Math.max(...months.map((m) => m.milk ?? 0), 1)

  if (entries.length === 0) {
    return (
      <div className="card">
        <h2 className="panel-heading">Хроника за последний год</h2>
        <p className="text-sm leading-relaxed text-ink-500">
          За последние двенадцать месяцев записей нет. Их создают загрузка данных, ввод отёлов
          и осеменений и выгрузки из доильного зала.
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="panel-heading !mb-1">Хроника за последний год</h2>
          <p className="text-[13px] text-ink-500">
            {milk.totalDocs} {plural(milk.totalDocs, 'дойка', 'дойки', 'доек')} ·{' '}
            {calvings.totalDocs} {plural(calvings.totalDocs, 'отёл', 'отёла', 'отёлов')} ·{' '}
            {inseminations.totalDocs}{' '}
            {plural(inseminations.totalDocs, 'осеменение', 'осеменения', 'осеменений')} ·{' '}
            {health.totalDocs} {plural(health.totalDocs, 'событие', 'события', 'событий')} здоровья
          </p>
        </div>
      </div>

      {/* ------------------------ Полоса по месяцам ------------------------ */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex min-w-[560px] items-end gap-1.5">
          {months.map((m) => (
            <div key={m.key} className="flex-1">
              <div className="flex h-[86px] items-end">
                <div
                  title={m.milk ? `${m.title}: ${m.milk} кг/сут в среднем` : `${m.title}: доек нет`}
                  style={{ height: `${m.milk ? Math.max(6, (m.milk / maxMilk) * 100) : 3}%` }}
                  className={`w-full rounded-t ${m.milk ? 'bg-forest-500' : 'bg-ink-100'}`}
                />
              </div>
              {/* Точки под столбцом: что ещё случилось в этом месяце */}
              <div className="mt-1 flex h-[6px] justify-center gap-[3px]">
                {[...m.marks].map((k) => (
                  <span
                    key={k}
                    title={KIND_STYLE[k]?.label}
                    className={`h-[5px] w-[5px] rounded-full ${
                      k === 'health'
                        ? 'bg-[#c0392b]'
                        : k === 'calving'
                          ? 'bg-[#1f4d80]'
                          : k === 'insemination'
                            ? 'bg-[#5b3d8c]'
                            : 'bg-ink-300'
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1 truncate text-center text-[11px] text-ink-500">
                {m.title.slice(0, 3)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="mb-4 text-[12px] text-ink-500">
        Столбец — средний суточный удой за месяц, точки под ним — отёлы, осеменения и события
        здоровья.
      </p>

      {/* --------------------------- Лента записей -------------------------- */}
      <ol className="space-y-2 border-t border-ink-100 pt-4">
        {entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[14px]">
            <span className="w-[92px] flex-none tabular-nums text-ink-500">{dateRu(new Date(e.at).toISOString())}</span>
            <span
              className={`flex-none rounded px-1.5 py-0.5 text-[11px] ${KIND_STYLE[e.kind].tone}`}
            >
              {KIND_STYLE[e.kind].label}
            </span>
            <span className="min-w-0">{e.title}</span>
            {e.detail && <span className="text-[13px] text-ink-500">{e.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
