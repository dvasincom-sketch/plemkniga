import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { compareBulls, MAX_BULLS } from '@/lib/bull-compare'

/**
 * Проверка сравнения быков на живой базе.
 *
 * Сравнение со сверстницами — единственное число на экране, которое нельзя
 * проверить глазами: оно считается из двух средних по разным наборам коров.
 * Поэтому здесь строится стадо с заранее известным ответом: у одного быка
 * дочери доят на 1000 кг больше стада, у другого — на 500 меньше, и разница
 * обязана получиться именно такой.
 *
 *   npm run check:bulls
 */

const TAG = 'CHK-BULL'
let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const payload = await getPayload({ config })
  const suffix = String(Date.now()).slice(-8)
  let seq = 0
  const nextNumber = () => `4${suffix}${String(++seq).padStart(2, '0')}`

  const org = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Хозяйство ${suffix}`, membership: 'member' },
  })
  const herd = await payload.create({
    collection: 'herds',
    overrideAccess: true,
    data: { name: `${TAG} Стадо ${suffix}`, organization: org.id },
  })

  const mkAnimal = async (data: Record<string, unknown>) =>
    payload.create({
      collection: 'animals',
      overrideAccess: true,
      data: {
        identNumber: nextNumber(),
        owner: org.id,
        herd: herd.id,
        archived: false,
        ...data,
      } as never,
    })

  const bullA = await mkAnimal({ name: `${TAG} Хороший`, sex: 'male', kind: 'bull' })
  const bullB = await mkAnimal({ name: `${TAG} Средний`, sex: 'male', kind: 'bull' })
  const bullC = await mkAnimal({ name: `${TAG} Малодочерний`, sex: 'male', kind: 'bull' })

  /*
   * Фон стада: двадцать коров без отца по 7000 кг. Они и станут
   * сверстницами — среднее по ним известно заранее.
   */
  for (let i = 0; i < 20; i++) {
    await mkAnimal({ sex: 'female', summary: { milkYield: 7000 } })
  }

  const daughters: Record<string, number[]> = { a: [], b: [], c: [] }
  for (let i = 0; i < 10; i++) {
    const d = await mkAnimal({ sex: 'female', father: bullA.id, summary: { milkYield: 8000 } })
    daughters.a!.push(Number(d.id))
  }
  for (let i = 0; i < 10; i++) {
    const d = await mkAnimal({ sex: 'female', father: bullB.id, summary: { milkYield: 6500 } })
    daughters.b!.push(Number(d.id))
  }
  // У третьего дочерей меньше порога — разницу показывать нельзя
  for (let i = 0; i < 3; i++) {
    const d = await mkAnimal({ sex: 'female', father: bullC.id, summary: { milkYield: 9000 } })
    daughters.c!.push(Number(d.id))
  }

  // Внучка: дочь дочери быка A — нужна для проверки родства во втором колене
  const granddaughter = await mkAnimal({ sex: 'female', mother: daughters.a![0] })

  console.log('\nСравнение со сверстницами\n')

  const rows = await compareBulls(payload, [bullA.id, bullB.id, bullC.id], org.id)

  check(rows.length === 3, 'вернулись все три быка', `строк: ${rows.length}`)
  check(
    rows.map((r) => r.id).join(',') === [bullA.id, bullB.id, bullC.id].join(','),
    'порядок строк — тот, в котором быков назвали',
  )

  const a = rows.find((r) => r.id === bullA.id)!
  const b = rows.find((r) => r.id === bullB.id)!
  const c = rows.find((r) => r.id === bullC.id)!

  check(a.daughters === 10, 'у первого десять дочерей', String(a.daughters))
  check(a.vsMates !== null && a.vsMates > 0, 'у хорошего быка разница положительная', String(a.vsMates))
  check(b.vsMates !== null && b.vsMates < 0, 'у среднего быка разница отрицательная', String(b.vsMates))
  check(
    a.vsMates !== null && b.vsMates !== null && a.vsMates > b.vsMates,
    'хороший бык впереди среднего',
  )

  /*
   * Точное значение: у дочерей A 8000 кг, сверстницы — двадцать коров
   * по 7000, десять дочерей B по 6500 и три дочери C по 9000.
   * Среднее сверстниц = (20*7000 + 10*6500 + 3*9000) / 33 ≈ 7121,2,
   * разница ≈ +879. Проверяем с допуском: важно не совпадение до рубля,
   * а что считается именно разница со сверстницами, а не с общим средним.
   */
  const expectedA = Math.round(8000 - (20 * 7000 + 10 * 6500 + 3 * 9000) / 33)
  check(
    a.vsMates !== null && Math.abs(a.vsMates - expectedA) <= 2,
    `разница считается от сверстниц, а не от общего среднего (ждём ≈${expectedA})`,
    `получили ${a.vsMates}`,
  )

  check(c.vsMates === null, 'при трёх дочерях разница не показывается')
  check(c.compared === 3, 'но число сравнённых дочерей известно', String(c.compared))

  console.log('\nРодство с вашим стадом\n')

  check(a.daughtersInHerd === 10, 'дочери в стаде посчитаны', String(a.daughtersInHerd))
  check(
    (a.kinInHerd ?? 0) >= 11,
    'внучка тоже считается роднёй',
    `родни: ${a.kinInHerd}, дочерей: ${a.daughtersInHerd}`,
  )

  const anonymous = await compareBulls(payload, [bullA.id], null)
  check(anonymous[0]?.kinInHerd === null, 'без хозяйства колонка родства пустая')

  console.log('\nПотолок\n')

  const many = await compareBulls(
    payload,
    [bullA.id, bullB.id, bullC.id, bullA.id, bullB.id, bullC.id, bullA.id, bullB.id],
    org.id,
  )
  check(many.length <= MAX_BULLS, `больше ${MAX_BULLS} быков не берётся`, `вернулось ${many.length}`)
  check(many.length === 3, 'повторы схлопнуты', `вернулось ${many.length}`)

  // ------------------------------ уборка ------------------------------ //
  /*
   * Удаляем от потомков к предкам: у животного, на которое ссылаются
   * как на родителя, удаление упирается во внешний ключ. Одним запросом
   * по номеру порядок не задать.
   */
  const born = await payload.find({
    collection: 'animals',
    where: { identNumber: { like: `4${suffix}` } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  for (const doc of [...born.docs].reverse()) {
    await payload
      .delete({ collection: 'animals', id: doc.id, overrideAccess: true })
      .catch(() => null)
  }
  await payload.delete({ collection: 'herds', id: herd.id, overrideAccess: true })
  await payload.delete({ collection: 'organizations', id: org.id, overrideAccess: true })
  void granddaughter

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
