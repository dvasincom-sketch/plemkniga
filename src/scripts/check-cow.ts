import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { AGE_GROUPS } from '@/lib/dictionaries'
import { raiseAgeGroup } from '@/lib/age-group'

/**
 * Возрастная группа против факта отёла — насколько они расходятся.
 *
 * ## Откуда взялись определения
 *
 * Ответов было три, стало два. «Тип животного» убран решением №228:
 * на живой базе он оказался умолчанием формы у девяноста трёх процентов
 * записей и полу не противоречил ни разу, то есть не сообщал ничего
 * сверх остальных двух. Скрипт остаётся, потому что вопрос никуда
 * не делся — просто теперь спорят двое.
 *
 * `ageGroup` — «Возрастная группа»: телёнок, тёлка, первотёлка, корова
 * второй лактации, корова третьей и старше, бык-производитель. Ставится
 * так же руками и так же не меняется сама, хотя по смыслу обязана
 * меняться каждый отёл.
 *
 * Отёлы — записи коллекции `calvings`. Единственный из ответов, который
 * не утверждение, а факт: корова — это та, что телилась.
 *
 * ## Почему это не придирка к именованию
 *
 * Оба уже на что-то влияют. По `ageGroup` решается, какие события
 * предлагать в карточке, что писать в графе «половозрелость» и какую
 * группу отдавать во ФГИАС. По числу отёлов проставляется номер лактации
 * при загрузке доек и осеменений. Пока они согласны, разницы не видно;
 * как только разойдутся — части системы говорят о разном стаде.
 *
 * ## Что делает этот скрипт после решения №228
 *
 * Считает то же самое, но теперь у расхождений разная цена. Отёл при
 * несоответствии повышает группу — такие строки хук починит сам, и они
 * печатаются как работа, которую предстоит сделать `repair:age-group`.
 * Коровья же группа без отёлов остаётся как есть намеренно: незаписанное
 * событие и несостоявшееся событие — разное, и понижать по отсутствию
 * записи книга не станет. Такие строки печатаются как то, что чинить
 * не надо, чтобы их не пошли чинить руками.
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
  console.log('Сколько коров — по каждому определению\n')

  const coweish = (a: Row) =>
    a.ageGroup === 'firstCalf' || a.ageGroup === 'cow2' || a.ageGroup === 'cow3'

  const byAge = animals.filter(coweish)
  const byFact = animals.filter((a) => n(a) > 0)

  console.log(`  ${String(byAge.length).padStart(5)}  «Возрастная группа» = перво/2/3+ лактации`)
  console.log(`  ${String(byFact.length).padStart(5)}  есть хотя бы один отёл`)
  console.log('')
  console.log(
    `  Согласны оба: ${animals.filter((a) => coweish(a) === n(a) > 0).length} из ${total}`,
  )

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Целость самих отёлов\n')

  /*
   * Блок появился после того, как два прогона подряд дали несводимые
   * числа: отёлов поровну — две тысячи шестьдесят пять, животных поровну,
   * а животных, у которых есть хоть один отёл, на двадцать три меньше.
   * Отёлов столько же, а хозяев у них меньше — значит часть сменила
   * владельца, и все расхождения группы ниже считаются уже не по тем
   * данным, по которым считались вчера.
   *
   * Проверять это надо до всего остального. Правило «отёл повышает
   * группу» опирается на то, что отёл принадлежит тому животному,
   * на которое указывает; если указание переехало, правило аккуратно
   * перенесёт ошибку в карточки и заверит её датой.
   *
   * Повтор номера у одного животного — главный признак. Номер отёла
   * по счёту в жизни коровы уникален по построению: два «первых отёла»
   * у одной коровы означают либо задвоенную загрузку, либо съехавшую
   * привязку.
   */
  const byAnimal = new Map<number, unknown[]>()
  let orphan = 0
  for (const c of calvings) {
    const id = rel(c.animal)
    if (id === undefined) {
      orphan += 1
      continue
    }
    byAnimal.set(id, [...(byAnimal.get(id) ?? []), c.number])
  }

  const dupNumber: Row[] = []
  let maxPer = 0
  for (const [id, numbers] of byAnimal) {
    maxPer = Math.max(maxPer, numbers.length)
    const filledNumbers = numbers.filter((v) => v !== null && v !== undefined)
    if (new Set(filledNumbers).size !== filledNumbers.length) {
      const a = animals.find((x) => x.id === id)
      if (a) dupNumber.push(a)
    }
  }

  const known = new Set(animalsAll.map((a) => a.id as number))
  const lost = [...byAnimal.keys()].filter((id) => !known.has(id)).length

  console.log(`  ${String(calvings.length).padStart(5)}        отёлов всего`)
  console.log(`  ${String(byAnimal.size).padStart(5)}        животных, которым они принадлежат`)
  console.log(`  ${String(maxPer).padStart(5)}        больше всего отёлов у одного животного`)
  show('у одного животного два отёла с одним номером', dupNumber, total)
  console.log(`  ${String(orphan).padStart(5)}        отёлов без ссылки на животное`)
  console.log(`  ${String(lost).padStart(5)}        отёлов у животных, которых нет в базе`)

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
  console.log('«Отёлов нет» — это не телилась или отёлы не загружены?\n')

  /*
   * Вопрос, от которого зависит выбор источника правды.
   *
   * Первый прогон показал 278 животных с коровьей группой и без единого
   * отёла. Прочесть это можно двояко, и разница решает всё. Если у них
   * пусто и в лактациях — группа поставлена неверно, и факт отёла честнее.
   * Если лактации есть, а отёлов нет — значит отёлы просто не загружены,
   * коллекция `calvings` неполна, и делать её источником правды значит
   * разжаловать двести семьдесят восемь коров в тёлки одним скриптом.
   *
   * Это ровно тот вид молчаливой порчи, за которым мы охотимся всю неделю,
   * только устроенный не разбором значения, а выбором определения.
   */
  const cowNoCalving = animals.filter(
    (a) =>
      (a.ageGroup === 'firstCalf' || a.ageGroup === 'cow2' || a.ageGroup === 'cow3') && n(a) === 0,
  )

  const hasLact = (a: Row) =>
    (Array.isArray(a.lactations) && a.lactations.length > 0) ||
    typeof (a.summary as Record<string, unknown> | undefined)?.milkYield === 'number'

  show('из них есть лактации или удой — отёлы не загружены', cowNoCalving.filter(hasLact), total)
  show('из них пусто и в продуктивности — группа под вопросом', cowNoCalving.filter((a) => !hasLact(a)), total)

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Пол против возрастной группы\n')

  show(
    'пол мужской, а группа не «бык-производитель»',
    animals.filter((a) => a.sex === 'male' && a.ageGroup !== 'bull'),
    total,
  )
  show(
    'группа «бык-производитель», а пол женский',
    animals.filter((a) => a.ageGroup === 'bull' && a.sex === 'female'),
    total,
  )
  show('пол мужской, а отёлы записаны', animals.filter((a) => a.sex === 'male' && n(a) > 0), total)

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Раскладка: возрастная группа × число отёлов\n')

  const buckets = [0, 1, 2, 3]
  const bucketName = (b: number) => (b === 3 ? '3 и более' : String(b))

  console.log(' '.repeat(20) + buckets.map((b) => bucketName(b).padStart(11)).join(''))
  for (const g of AGE_GROUPS) {
    const cells = buckets
      .map((b) => {
        const c = animals.filter(
          (a) => a.ageGroup === g.value && (b === 3 ? n(a) >= 3 : n(a) === b),
        ).length
        return (c === 0 ? '·' : String(c)).padStart(11)
      })
      .join('')
    console.log(g.label.slice(0, 19).padEnd(20) + cells)
  }

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(72)}`)
  console.log('Что поднимет правило «отёл повышает, но не понижает»\n')

  /*
   * Ровно то, что сделает `repair:age-group` и что дальше будет делать
   * хук на каждом новом отёле. Печатается здесь, а не только там, чтобы
   * до починки было видно её объём, а после — что он стал нулевым.
   */
  const willRise = animals
    .map((a) => ({ a, next: raiseAgeGroup(a.ageGroup as never, n(a)) }))
    .filter((x) => x.next !== null)

  show('строк поднимется', willRise.map((x) => x.a), total)
  for (const g of AGE_GROUPS) {
    const c = willRise.filter((x) => x.next === g.value).length
    if (c) console.log(`         ${String(c).padStart(5)} → ${g.label}`)
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
