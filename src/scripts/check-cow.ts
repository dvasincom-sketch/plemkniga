import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { AGE_GROUPS, ANIMAL_KINDS } from '@/lib/dictionaries'

/**
 * Три ответа на вопрос «корова ли это» — и насколько они расходятся.
 *
 * ## Откуда взялись три
 *
 * В карточке лежат два поля и одна связь, и каждое по-своему отвечает
 * на один и тот же вопрос.
 *
 * `kind` — «Тип животного»: корова, бык, тёлка, телёнок. Ставится руками
 * при заведении карточки и после этого не меняется никогда: перевода
 * тёлки в коровы в системе нет, как нет и повода его вызвать.
 *
 * `ageGroup` — «Возрастная группа»: телёнок, тёлка, первотёлка, корова
 * второй лактации, корова третьей и старше, бык-производитель. Ставится
 * так же руками и так же не меняется сама, хотя по смыслу обязана
 * меняться каждый отёл.
 *
 * Отёлы — записи коллекции `calvings`. Это единственный из трёх ответов,
 * который не утверждение, а факт: корова — это та, что телилась.
 *
 * ## Почему это не придирка к именованию
 *
 * Три ответа расходятся, и каждый уже на что-то влияет. По `ageGroup`
 * решается, какие события предлагать в карточке и что писать в графе
 * «половозрелость». По `kind` отбираются коровы для сигналов стада.
 * По числу отёлов проставляется номер лактации при загрузке доек
 * и осеменений. Пока они согласны, разницы не видно; как только
 * разойдутся — три части системы начинают говорить о разном стаде.
 *
 * Одно расхождение уже названо и починено в двух местах: тёлка с удоем
 * ловится проверкой `production-before-calving` и помечается в таблице.
 * То есть о самой возможности рассогласования в проекте уже знают —
 * но лечат следствие в одной точке, а не причину.
 *
 * ## Что делает этот скрипт
 *
 * Считает, сколько животных живой базы каждое из трёх определений
 * относит к коровам, и печатает поимённо, где они не сходятся. Ничего
 * не пишет и не чинит: выбор источника правды — решение, а не находка,
 * и принимать его надо по числам, а не по ощущению.
 *
 *   npm run check:cow
 */

type Row = Record<string, unknown>

const rel = (v: unknown): number | undefined =>
  typeof v === 'number'
    ? v
    : typeof v === 'object' && v !== null
      ? ((v as { id?: number }).id ?? undefined)
      : undefined

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

const pct = (n: number, of: number) => (of === 0 ? '—' : `${Math.round((n / of) * 100)}%`)

const label = (list: readonly { value: string; label: string }[], v: unknown) =>
  list.find((x) => x.value === v)?.label ?? (v === undefined || v === null ? '(пусто)' : String(v))

/**
 * Показать расхождение: сколько и на ком.
 *
 * Печатается не только число, но и пять номеров. Число говорит, велика ли
 * беда; номера — можно ли пойти и посмотреть. Проверка, которая называет
 * только количество, заставляет писать запрос к базе руками, и поэтому
 * её обычно не доводят до конца.
 */
const show = (what: string, hits: Row[], total: number) => {
  const head = hits
    .slice(0, 5)
    .map((a) => String(a.identNumber ?? a.id))
    .join(', ')
  console.log(
    `  ${String(hits.length).padStart(5)}  ${pct(hits.length, total).padStart(4)}  ${what}` +
      (hits.length ? `\n${' '.repeat(15)}${head}${hits.length > 5 ? ' …' : ''}` : ''),
  )
}

async function main() {
  const payload = await getPayload({ config })

  console.log('\nЧитаем базу…')

  const [animalsAll, calvings] = await Promise.all([
    all(payload, 'animals'),
    all(payload, 'calvings'),
  ])

  const animals = animalsAll.filter((a) => a.archived !== true)

  /* Число отёлов на животное — третье определение, единственное фактическое. */
  const calved = new Map<number, number>()
  for (const c of calvings) {
    const id = rel(c.animal)
    if (id !== undefined) calved.set(id, (calved.get(id) ?? 0) + 1)
  }

  const n = (a: Row) => calved.get(a.id as number) ?? 0
  const total = animals.length

  console.log(
    `Животных ${total} (в архиве ещё ${animalsAll.length - total}), отёлов ${calvings.length}\n`,
  )

  /* ---------------------------------------------------------------- */
  console.log('─'.repeat(72))
  console.log('Сколько коров — по каждому из трёх определений\n')

  const byKind = animals.filter((a) => a.kind === 'cow')
  const byAge = animals.filter(
    (a) => a.ageGroup === 'firstCalf' || a.ageGroup === 'cow2' || a.ageGroup === 'cow3',
  )
  const byFact = animals.filter((a) => n(a) > 0)

  console.log(`  ${String(byKind.length).padStart(5)}  «Тип животного» = корова`)
  console.log(`  ${String(byAge.length).padStart(5)}  «Возрастная группа» = перво/2/3+ лактации`)
  console.log(`  ${String(byFact.length).padStart(5)}  есть хотя бы один отёл`)
  console.log('')
  console.log(
    '  Совпадают все три: ' +
      animals.filter(
        (a) =>
          (a.kind === 'cow') ===
            (a.ageGroup === 'firstCalf' || a.ageGroup === 'cow2' || a.ageGroup === 'cow3') &&
          (a.kind === 'cow') === (n(a) > 0),
      ).length +
      ` из ${total}`,
  )

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Возрастная группа против факта отёла\n')

  show(
    'группа «телёнок» или «тёлка», а отёлы записаны',
    animals.filter((a) => (a.ageGroup === 'calf' || a.ageGroup === 'heifer') && n(a) > 0),
    total,
  )
  show(
    'группа коровья, а отёлов ни одного',
    animals.filter(
      (a) =>
        (a.ageGroup === 'firstCalf' || a.ageGroup === 'cow2' || a.ageGroup === 'cow3') && n(a) === 0,
    ),
    total,
  )
  show(
    'группа «первотёлка», а отёлов больше одного',
    animals.filter((a) => a.ageGroup === 'firstCalf' && n(a) > 1),
    total,
  )
  show(
    'группа «2 лактации», а отёлов не два',
    animals.filter((a) => a.ageGroup === 'cow2' && n(a) !== 2),
    total,
  )
  show(
    'группа «3+ лактации», а отёлов меньше трёх',
    animals.filter((a) => a.ageGroup === 'cow3' && n(a) < 3),
    total,
  )

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Тип животного против возрастной группы\n')

  show(
    'тип «корова», а группа «телёнок» или «тёлка»',
    animals.filter((a) => a.kind === 'cow' && (a.ageGroup === 'calf' || a.ageGroup === 'heifer')),
    total,
  )
  show(
    'тип «тёлка» или «телёнок», а группа коровья',
    animals.filter(
      (a) =>
        (a.kind === 'heifer' || a.kind === 'calf') &&
        (a.ageGroup === 'firstCalf' || a.ageGroup === 'cow2' || a.ageGroup === 'cow3'),
    ),
    total,
  )
  show(
    'тип «бык», а группа не «бык-производитель»',
    animals.filter((a) => a.kind === 'bull' && a.ageGroup !== 'bull'),
    total,
  )
  show(
    'группа «бык-производитель», а тип не «бык»',
    animals.filter((a) => a.ageGroup === 'bull' && a.kind !== 'bull'),
    total,
  )

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Пол против остальных двух\n')

  show(
    'пол мужской, а тип не «бык»',
    animals.filter((a) => a.sex === 'male' && a.kind !== 'bull'),
    total,
  )
  show(
    'пол мужской, а группа не «бык-производитель»',
    animals.filter((a) => a.sex === 'male' && a.ageGroup !== 'bull'),
    total,
  )
  show(
    'пол женский, а тип «бык»',
    animals.filter((a) => a.sex === 'female' && a.kind === 'bull'),
    total,
  )
  show('пол мужской, а отёлы записаны', animals.filter((a) => a.sex === 'male' && n(a) > 0), total)

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Раскладка: тип животного × возрастная группа\n')

  const kinds = [...ANIMAL_KINDS.map((k) => k.value as string), '(пусто)']
  const ages = [...AGE_GROUPS.map((g) => g.value as string), '(пусто)']

  const head = ages.map((g) => label(AGE_GROUPS, g).slice(0, 9).padStart(10)).join('')
  console.log(' '.repeat(12) + head)
  for (const k of kinds) {
    const cells = ages
      .map((g) => {
        const c = animals.filter(
          (a) => (a.kind ?? '(пусто)') === k && (a.ageGroup ?? '(пусто)') === g,
        ).length
        return (c === 0 ? '·' : String(c)).padStart(10)
      })
      .join('')
    console.log(label(ANIMAL_KINDS, k).slice(0, 11).padEnd(12) + cells)
  }

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Что из этого следует для выгрузки во ФГИАС\n')
  console.log(
    '  ФГИАС просит одну колонку «Половозрастная группа» — uuid из реестра\n' +
      '  «Половозрастные группы по видам животных» (349 записей). Отдавать в неё\n' +
      '  придётся ровно один из трёх наших ответов, и выбрать надо до того,\n' +
      '  как хозяйство увидит первую выгрузку.\n',
  )

  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
