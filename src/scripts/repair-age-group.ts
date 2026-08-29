import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { AGE_GROUPS, type AgeGroup } from '@/lib/dictionaries'
import { raiseAgeGroup } from '@/lib/age-group'

/**
 * Поднять возрастную группу там, где отёлы уже это доказали.
 *
 * ## Зачем скрипт, если есть хук
 *
 * Хук на отёле (`raiseAnimalAgeGroup` в коллекции `calvings`) поднимает
 * группу при каждой новой записи. Но отёлы, лежащие в базе с прежних
 * времён, его никогда не вызовут: они уже записаны. Этот скрипт проходит
 * по ним один раз — как `repair:pta-kg` и `repair:blood`, по той же
 * причине и с той же оговоркой, что переписывать чужие данные можно
 * только там, где правило доказуемо.
 *
 * ## Что он не делает
 *
 * Не понижает группу. Ни одной строки, ни при каких числах. Двести
 * семьдесят восемь животных с коровьей группой и без единого отёла
 * останутся коровами: отсутствие записи об отёле не доказывает, что
 * отёла не было, — оно доказывает только, что запись не загружена.
 * Разбор — в `lib/age-group.ts` и в решении №228.
 *
 * Не трогает быков: группа «бык-производитель» вне коровьей шкалы.
 *
 * ## Сухой прогон по умолчанию
 *
 * Без ключа скрипт только печатает, что сделал бы. Писать он начинает
 * с `--apply`, и это не осторожность ради осторожности: правило новое,
 * а карточки чужие, и первый прогон обязан быть предъявлен человеку
 * до того, как что-то изменится.
 *
 *   npm run repair:age-group           — посмотреть
 *   npm run repair:age-group -- --apply — сделать
 */

const APPLY = process.argv.includes('--apply')

type Row = Record<string, unknown>

const rel = (v: unknown): number | undefined =>
  typeof v === 'number'
    ? v
    : typeof v === 'object' && v !== null
      ? ((v as { id?: number }).id ?? undefined)
      : undefined

const labelOf = (v: unknown) => AGE_GROUPS.find((g) => g.value === v)?.label ?? '(пусто)'

async function all(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: string,
): Promise<Row[]> {
  const out: Row[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: collection as never,
      limit: 500,
      page,
      depth: 0,
      overrideAccess: true,
    })
    out.push(...(res.docs as unknown as Row[]))
    if (!res.hasNextPage) break
    page += 1
  }
  return out
}

async function main() {
  const payload = await getPayload({ config })

  console.log(`\n${APPLY ? 'Правим' : 'Сухой прогон — ничего не пишем'}\n`)

  const [animals, calvings] = await Promise.all([
    all(payload, 'animals'),
    all(payload, 'calvings'),
  ])

  /*
   * Хранится и число отёлов, и дата последнего: датой определения группы
   * становится день отёла, а не день запуска скрипта. Животное стало
   * коровой тогда, когда отелилось; записать «определено сегодня» значило
   * бы соврать реестру, который эту дату спрашивает.
   */
  const count = new Map<number, number>()
  const lastDate = new Map<number, string>()
  for (const c of calvings) {
    const id = rel(c.animal)
    if (id === undefined) continue
    count.set(id, (count.get(id) ?? 0) + 1)
    const d = typeof c.date === 'string' ? c.date : undefined
    if (d && (!lastDate.has(id) || d > lastDate.get(id)!)) lastDate.set(id, d)
  }

  const plan = animals
    .map((a) => ({
      a,
      from: a.ageGroup as AgeGroup | null,
      to: raiseAgeGroup(a.ageGroup as AgeGroup | null, count.get(a.id as number) ?? 0),
      calvings: count.get(a.id as number) ?? 0,
      when: lastDate.get(a.id as number),
    }))
    .filter((p) => p.to !== null)

  if (plan.length === 0) {
    console.log('Поднимать нечего: группа нигде не ниже доказанной отёлами.\n')
    process.exit(0)
  }

  console.log(`Поднимется записей: ${plan.length}\n`)

  const bySteps = new Map<string, number>()
  for (const p of plan) {
    const key = `${labelOf(p.from)} → ${labelOf(p.to)}`
    bySteps.set(key, (bySteps.get(key) ?? 0) + 1)
  }
  for (const [step, n] of [...bySteps].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${step}`)
  }

  console.log('\nПервые двадцать поимённо:\n')
  for (const p of plan.slice(0, 20)) {
    console.log(
      `  ${String(p.a.identNumber ?? p.a.id).padEnd(18)} ` +
        `${labelOf(p.from).padEnd(18)} → ${labelOf(p.to).padEnd(18)} ` +
        `отёлов ${p.calvings}${p.when ? `, последний ${p.when.slice(0, 10)}` : ''}`,
    )
  }
  if (plan.length > 20) console.log(`  … и ещё ${plan.length - 20}`)

  if (!APPLY) {
    console.log('\nЭто сухой прогон. Чтобы записать: npm run repair:age-group -- --apply\n')
    process.exit(0)
  }

  let done = 0
  let failed = 0
  for (const p of plan) {
    try {
      await payload.update({
        collection: 'animals',
        id: p.a.id as number,
        data: {
          ageGroup: p.to,
          ageGroupDate: p.when ?? new Date().toISOString(),
        } as never,
        overrideAccess: true,
        context: { skipJournal: true },
      })
      done += 1
    } catch (e) {
      failed += 1
      console.error(`  ✗ ${p.a.identNumber ?? p.a.id}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`\nПоднято: ${done}${failed ? `, не вышло: ${failed}` : ''}\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nНе отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
