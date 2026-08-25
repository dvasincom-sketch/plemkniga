import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { compareBulls, MAX_BULLS } from '@/lib/bull-compare'
import {
  CALVING_TRAITS,
  EXTERIOR_TRAITS,
  HEALTH_TRAITS,
  LONGEVITY_TRAITS,
  exteriorDirection,
} from '@/lib/dictionaries'
import { bullStatus, daughtersFor, reliabilityOf } from '@/lib/bull-status'

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

  /* ---------------------------------------------------------------- */
  console.log('\nЛинейные признаки экстерьера\n')

  /*
   * Реестр признаков проверяется здесь, а не отдельным скриптом: карточка
   * быка — то место, где линейная оценка и читается, а неполный реестр
   * ломает именно её.
   */
  const noPoles = EXTERIOR_TRAITS.filter((t) => !t.minus.trim() || !t.plus.trim())
  check(
    noPoles.length === 0,
    'у каждого признака названы оба полюса шкалы',
    noPoles.map((t) => t.label).join(', '),
  )

  /*
   * Число признаков с оптимумом посередине проверяется точным числом,
   * а не «больше нуля». Это не придирка: отметка `middle` решает,
   * в каком блоке признак покажется и каким цветом, — и снять её
   * у «Длины сосков» ничего не сломает на вид, а полоса вправо снова
   * начнёт читаться как «лучше».
   */
  const middle = EXTERIOR_TRAITS.filter((t) => t.optimum === 'middle')
  check(
    middle.length === 9,
    `девять признаков с оптимумом посередине (сейчас ${middle.length})`,
    middle.map((t) => t.label).join(', '),
  )

  for (const key of ['udderDepth', 'teatLength', 'rumpAngle', 'rearLegsSide', 'hoofAngle'])
    check(
      EXTERIOR_TRAITS.find((t) => t.key === key)?.optimum === 'middle',
      `«${EXTERIOR_TRAITS.find((t) => t.key === key)?.label ?? key}» — оптимум посередине`,
    )

  /*
   * Направление — словом, а не знаком. Проверяется на трёх значениях:
   * отрицательном, положительном и близком к нулю. Последнее важнее
   * прочих: «средний по породе» отвечает на вопрос лучше, чем «−0,1»,
   * и потерять его легко — достаточно сравнить с нулём точно.
   */
  const udder = EXTERIOR_TRAITS.find((t) => t.key === 'udderDepth')!
  check(
    exteriorDirection(udder, -1.49) === udder.minus,
    'отрицательная оценка описана левым полюсом',
    String(exteriorDirection(udder, -1.49)),
  )
  check(
    exteriorDirection(udder, 1.2) === udder.plus,
    'положительная — правым',
    String(exteriorDirection(udder, 1.2)),
  )
  check(
    exteriorDirection(udder, 0.1) === 'средний по породе',
    'близкое к нулю названо средним по породе',
    String(exteriorDirection(udder, 0.1)),
  )
  check(exteriorDirection(udder, null) === null, 'пустая оценка не описывается словами')

  /*
   * Ключи реестра обязаны совпадать с полями коллекции: разойдись они —
   * и признак останется в таблице с пустой полосой, то есть будет
   * выглядеть неизмеренным, а не потерянным.
   */
  const exterior = payload.config.collections.find((c) => c.slug === 'animal-exteriors')
  const linear = exterior?.fields.find(
    (f) => (f as { name?: string }).name === 'linear',
  ) as { fields?: { name?: string }[] } | undefined
  const known = new Set((linear?.fields ?? []).map((f) => f.name))

  const orphan = EXTERIOR_TRAITS.filter((t) => known.size > 0 && !known.has(t.key))
  check(
    orphan.length === 0,
    `все ${EXTERIOR_TRAITS.length} признака есть в коллекции экстерьера`,
    orphan.map((t) => t.key).join(', '),
  )

  /* ---------------------------------------------------------------- */
  console.log('\nСтатус оценки: пороги выведены из формулы\n')

  /*
   * Проверяются не «какие-то» числа, а согласие формулы с практикой.
   * Если правило CDCB и наша арифметика разойдутся, ссылка на них
   * в интерфейсе станет неправдой — а она там стоит.
   */
  check(
    Math.round(reliabilityOf(60) * 100) === 83,
    `шестьдесят дочерей дают 83 % (у CDCB это порог)`,
    `${Math.round(reliabilityOf(60) * 100)} %`,
  )
  check(
    Math.round(reliabilityOf(75) * 100) === 86,
    'семьдесят пять дочерей дают 86 %',
    `${Math.round(reliabilityOf(75) * 100)} %`,
  )
  check(daughtersFor(0.5) === 13, 'для половинной надёжности нужно 13 дочерей', String(daughtersFor(0.5)))

  /*
   * Наследуемость меняет всё: у фертильности она в семь раз ниже,
   * и то же число дочерей даёт вчетверо меньшую надёжность. Проверка
   * стоит здесь, чтобы порог не «упростили» до одного числа на карточку.
   */
  const milk20 = Math.round(reliabilityOf(20, 0.3) * 100)
  const fert20 = Math.round(reliabilityOf(20, 0.04) * 100)
  check(milk20 > 60 && fert20 < 20, `двадцать дочерей: удой ${milk20} %, фертильность ${fert20} %`)

  check(bullStatus(10, 4).key === 'insufficient', 'десять дочерей в четырёх хозяйствах — данных мало')
  check(bullStatus(20, 5).key === 'preliminary', 'двадцать в пяти — предварительная')
  check(bullStatus(60, 12).key === 'official', 'шестьдесят в двенадцати — устойчивая')

  /*
   * Слово «официальная» с экрана убрано: официальность присваивает орган,
   * а у нас это арифметика надёжности. Проверка стоит здесь, чтобы оно
   * не вернулось незаметно — например, вместе с новой формулировкой,
   * написанной по памяти.
   */
  check(
    !['insufficient', 'preliminary', 'official'].some((k) =>
      /офици/i.test(bullStatus(k === 'official' ? 60 : k === 'preliminary' ? 20 : 5, 12).label),
    ),
    'ни одна ступень не названа официальной',
  )

  /* Достигнутый порог показывается достигнутым, а не исчезает */
  check(
    bullStatus(60, 12).progress.done && bullStatus(60, 12).progress.steps.length === 2,
    'на верхней ступени блок порога остаётся и помечен пройденным',
  )
  check(
    bullStatus(200, 2).key === 'insufficient',
    'двести дочерей в двух хозяйствах — всё равно мало',
    'эффект стада неотделим от эффекта быка, и числом дочерей это не лечится',
  )
  check(
    bullStatus(10, 4).missing?.includes('13') === true,
    'сказано, сколько дочерей не хватает',
    String(bullStatus(10, 4).missing),
  )

  /* ---------------------------------------------------------------- */
  console.log('\nМакет карточки: признаки разложены без потерь\n')

  /*
   * Карточка показывает признаки здоровья двумя группами — долголетие
   * и отёлы, — а хранятся они одним списком. Разойтись этим двум местам
   * ничего не мешает: достаточно завести пятый признак здоровья
   * и не вспомнить про показ. Тогда он тихо исчезнет с карточки,
   * оставаясь в базе, в выгрузке и в расчёте индекса, — и обнаружится
   * это не раньше, чем кто-нибудь спросит, куда делось число.
   *
   * Проверяются оба направления. Потеря — признак есть в хранении,
   * но не показан. Двойной показ — признак попал в обе группы и стоит
   * в карточке дважды, изображая два разных.
   */
  const shown = [...LONGEVITY_TRAITS, ...CALVING_TRAITS].map((t) => t.key)
  const lost = HEALTH_TRAITS.filter((t) => !shown.includes(t.key))
  check(
    lost.length === 0,
    `все ${HEALTH_TRAITS.length} признака здоровья попали в карточку`,
    `потеряны: ${lost.map((t) => t.label).join(', ')}`,
  )
  check(
    new Set(shown).size === shown.length,
    'ни один признак не показан дважды',
    shown.join(', '),
  )

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
