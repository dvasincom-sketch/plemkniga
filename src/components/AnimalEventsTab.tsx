import { getClient } from '@/lib/payload'
import { dateRu, nf } from '@/lib/format'
import { CALVING_RESULTS } from '@/collections/Calvings'
import { AnimalHistory } from './AnimalHistory'
import type { Animal } from '@/payload-types'

/**
 * Вкладка «События» карточки животного — оперативное состояние:
 * межотельный цикл, осеменения, продуктивность по лактациям, контрольные дойки.
 */

const resultLabel = (v?: string | null) =>
  CALVING_RESULTS.find((r) => r.value === v)?.label ?? '—'

const identOf = (v: unknown): string => {
  if (v && typeof v === 'object' && 'identNumber' in v) {
    return String((v as { identNumber: string }).identNumber)
  }
  return '—'
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="panel-heading">{title}</h3>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

const Empty = ({ cols, text }: { cols: number; text: string }) => (
  <tr>
    <td colSpan={cols} className="py-8 text-center text-ink-500">
      {text}
    </td>
  </tr>
)

/** «Половозрелость»: словесная характеристика возрастного состояния. */
function maturityLabel(animal: Animal): string {
  if (animal.sex === 'male') return 'Бык-производитель'
  switch (animal.ageGroup) {
    case 'calf':
      return 'Телёнок'
    case 'heifer':
      return 'Тёлка (не осеменялась)'
    case 'firstCalf':
      return 'Первотёлка'
    default:
      return 'Корова'
  }
}

export async function AnimalEventsTab({ animal }: { animal: Animal }) {
  const payload = await getClient()

  const [calvings, inseminations, milkTests] = await Promise.all([
    payload.find({
      collection: 'calvings',
      where: { animal: { equals: animal.id } },
      sort: 'number',
      limit: 50,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'inseminations',
      where: { animal: { equals: animal.id } },
      sort: 'date',
      limit: 50,
      depth: 1,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'milk-tests',
      where: { animal: { equals: animal.id } },
      sort: 'date',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const lactations = animal.lactations ?? []

  // Итоговая строка по лактациям
  type Totals = {
    yield: number
    fatKg: number
    proteinKg: number
    fatSum: number
    fatN: number
    protSum: number
    protN: number
  }

  const totals = lactations.reduce<Totals>(
    (acc, l) => {
      acc.yield += l.milk305 ?? l.milkYield ?? 0
      acc.fatKg += l.fatKg ?? 0
      acc.proteinKg += l.proteinKg ?? 0
      if (typeof l.fat305 === 'number') {
        acc.fatSum += l.fat305
        acc.fatN += 1
      }
      if (typeof l.protein305 === 'number') {
        acc.protSum += l.protein305
        acc.protN += 1
      }
      return acc
    },
    { yield: 0, fatKg: 0, proteinKg: 0, fatSum: 0, fatN: 0, protSum: 0, protN: 0 },
  )

  const lactWord =
    lactations.length === 1 ? 'лактация' : lactations.length < 5 ? 'лактации' : 'лактаций'

  return (
    <>
      <p className="mt-8 text-[17px]">
        <span className="font-semibold">Половозрелость:</span> {maturityLabel(animal)}
      </p>

      {/*
         Хроника стоит первой: на вопрос «что происходило с этой коровой»
         отвечает она, а таблицы ниже — на вопросы «когда был третий отёл»
         и «чем закончилось второе осеменение». Сначала общая картина,
         потом разборы по разделам.
      */}
      <section className="mt-7">
        <AnimalHistory animal={animal} />
      </section>

      <h2 className="section-title mt-7">Оперативное состояние животного</h2>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Panel title="Таблица межотельного цикла">
          <table className="metric-table min-w-[540px]">
            <thead>
              <tr>
                <th className="w-12">№</th>
                <th>Дата отела</th>
                <th>Результат</th>
                <th>Кол-во дойных дней</th>
                <th>Дата запуска</th>
              </tr>
            </thead>
            <tbody>
              {calvings.docs.length === 0 && <Empty cols={5} text="Отёлов пока нет" />}
              {calvings.docs.map((c, i) => (
                <tr key={c.id}>
                  <td>{c.number ?? i + 1}</td>
                  <td>{dateRu(c.date)}</td>
                  <td>{resultLabel(c.result)}</td>
                  <td className="tabular-nums">{c.milkingDays ?? '—'}</td>
                  <td>{dateRu(c.dryOffDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Осеменения">
          <table className="metric-table min-w-[320px]">
            <thead>
              <tr>
                <th className="w-12">№</th>
                <th>Дата</th>
                <th>Инд № Б</th>
              </tr>
            </thead>
            <tbody>
              {inseminations.docs.length === 0 && <Empty cols={3} text="Осеменений пока нет" />}
              {inseminations.docs.map((ins, i) => (
                <tr key={ins.id}>
                  <td>{i + 1}</td>
                  <td>{dateRu(ins.date)}</td>
                  <td className="tabular-nums">{identOf(ins.bull)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>

      <section className="mt-6">
        <Panel title="Продуктивность (лактации)">
          <table className="metric-table min-w-[820px]">
            <thead>
              <tr>
                <th className="w-12">№</th>
                <th>Дата начала</th>
                <th>Дата окончания</th>
                <th>Кол-во дней</th>
                <th className="text-right">Удой, кг</th>
                <th className="text-right">Ж,%</th>
                <th className="text-right">Б,%</th>
                <th className="text-right">Ж,кг</th>
                <th className="text-right">Б,кг</th>
              </tr>
            </thead>
            <tbody>
              {lactations.length === 0 && <Empty cols={9} text="Данные о лактациях отсутствуют" />}
              {lactations.map((l, i) => (
                <tr key={l.id ?? i}>
                  <td>{l.number ?? i + 1}</td>
                  <td>{dateRu(l.calvingDate)}</td>
                  <td>{dateRu(l.endDate ?? l.dryOffDate)}</td>
                  <td className="tabular-nums">{l.dd ?? '—'}</td>
                  <td className="text-right tabular-nums">{nf(l.milk305 ?? l.milkYield, 0)}</td>
                  <td className="text-right tabular-nums">{nf(l.fat305, 2)}</td>
                  <td className="text-right tabular-nums">{nf(l.protein305, 2)}</td>
                  <td className="text-right tabular-nums">{nf(l.fatKg, 1)}</td>
                  <td className="text-right tabular-nums">{nf(l.proteinKg, 1)}</td>
                </tr>
              ))}

              {lactations.length > 0 && (
                <tr className="font-medium">
                  <td />
                  <td colSpan={3}>
                    {lactations.length} {lactWord}
                  </td>
                  <td className="text-right tabular-nums">{nf(totals.yield, 0)}</td>
                  <td className="text-right tabular-nums">
                    {totals.fatN ? nf(totals.fatSum / totals.fatN, 2) : '—'}
                  </td>
                  <td className="text-right tabular-nums">
                    {totals.protN ? nf(totals.protSum / totals.protN, 2) : '—'}
                  </td>
                  <td className="text-right tabular-nums">{nf(totals.fatKg, 1)}</td>
                  <td className="text-right tabular-nums">{nf(totals.proteinKg, 1)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </section>

      <section className="mt-6">
        <Panel title="Контрольные дойки">
          <table className="metric-table min-w-[820px]">
            <thead>
              <tr>
                <th className="w-12">№</th>
                <th>Дата</th>
                <th className="text-right">Удой, кг</th>
                <th className="text-right">Ж,%</th>
                <th className="text-right">Б,%</th>
                <th className="text-right">Ж,кг</th>
                <th className="text-right">Б,кг</th>
                <th className="text-right">Сумма Б+Ж</th>
              </tr>
            </thead>
            <tbody>
              {milkTests.docs.length === 0 && (
                <Empty cols={8} text="Контрольных доек пока нет" />
              )}
              {milkTests.docs.map((m, i) => {
                const y = m.dailyYield ?? 0
                const fatKg = typeof m.fatPercent === 'number' ? (y * m.fatPercent) / 100 : null
                const protKg =
                  typeof m.proteinPercent === 'number' ? (y * m.proteinPercent) / 100 : null
                const sum = fatKg !== null && protKg !== null ? fatKg + protKg : null

                return (
                  <tr key={m.id}>
                    <td>{i + 1}</td>
                    <td>{dateRu(m.date)}</td>
                    <td className="text-right tabular-nums">{nf(y, 1)}</td>
                    <td className="text-right tabular-nums">{nf(m.fatPercent, 2)}</td>
                    <td className="text-right tabular-nums">{nf(m.proteinPercent, 2)}</td>
                    <td className="text-right tabular-nums">{nf(fatKg, 2)}</td>
                    <td className="text-right tabular-nums">{nf(protKg, 2)}</td>
                    <td className="text-right tabular-nums">{nf(sum, 2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      </section>
    </>
  )
}
