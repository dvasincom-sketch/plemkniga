import { ADE_COLLECTIONS } from '@/lib/ade/core'
import {
  ADE_DATASETS,
  DATASET_TYPES,
  decodeToken,
  encodeToken,
  startToken,
  TOKEN_VERSION,
} from '@/lib/ade/datasets'
import { tombstoneEntries } from '@/lib/ade/tombstone'
import {
  adeAnimal,
  adeArrival,
  adeDeath,
  adeDeparture,
  adeInsemination,
  adeParturition,
  adePregnancyCheck,
  adeTestDayResult,
  adeTypeClassification,
  adeWeight,
  type AnimalInput,
} from '@/lib/ade/resources'

/**
 * Обмен наборами: метка продолжения и опознание удалённого.
 *
 * ## Что здесь ломается молча
 *
 * **Идентификатор надгробия не совпадает с тем, под которым ресурс
 * уезжал.** Клиент получает «удалено» на строку, которой у него нет,
 * по стандарту ничего не делает — и остаётся с записью, отозванной
 * год назад. Ни ошибки, ни расхождения счётчиков: у него всё сошлось,
 * просто корова, которой нет, продолжает доиться.
 *
 * Две эти строки собираются в разных файлах — `resources.ts` при выдаче
 * и `tombstone.ts` при удалении, — и это единственная пара мест, которой
 * позволено знать одно и то же. Здесь они сверяются напрямую.
 *
 * **Метка, которую можно подделать.** Внутри неё условие выборки;
 * стандарт говорит, что поведение при изменённой метке не определено,
 * а «не определено» на сервере означает «как получится» — вплоть
 * до чтения чужого. Подпись обязана отвергать тронутое.
 *
 * **Приставка набора в `sourceId`.** Стандарт требует уникальности
 * среди всех ресурсов сервера, а номера у нас начинаются с единицы
 * в каждой таблице. Доение №5 и отёл №5 без приставки — один
 * идентификатор, и в ленте они затирают друг друга.
 *
 *   npm run check:ade-generic
 */

const fails: string[] = []
const fail = (m: string) => fails.push(m)

/* ------------------------------------------------------------------ *
 *  Наборы                                                            *
 * ------------------------------------------------------------------ */

if (ADE_DATASETS.length !== ADE_COLLECTIONS.length) {
  fail(`наборов ${ADE_DATASETS.length}, а разделов стандарта ${ADE_COLLECTIONS.length}`)
}

for (const d of ADE_DATASETS) {
  if (!d.url.endsWith(`/datasets/${d.name}`)) fail(`у набора «${d.name}» неверный адрес: ${d.url}`)
  if (d.changes !== `${d.url}/changes`) {
    fail(`у набора «${d.name}» лента не под своим адресом: ${d.changes}`)
  }
  if (!d.containedTypes[0]?.startsWith('icar')) {
    fail(`у набора «${d.name}» не назван ресурс стандарта`)
  }
}

/*
 * Имя ресурса в наборе обязано совпадать с тем, что мы реально отдаём:
 * клиент по этому полю решает, какой схемой проверять приехавшее.
 */
const animal: AnimalInput = { id: 7, identNumber: '123', uuid: 'u-7', ownerId: 1 } as AnimalInput

const pc = { id: 5, animal, date: '2026-04-01', result: null, updatedAt: null }
const mv = { id: 5, animal, date: '2026-04-01', kind: 'sale', fromId: 1, toId: 2, updatedAt: null }
const death = { ...mv, kind: 'death', toId: null }

const SAMPLES: [name: string, resource: Record<string, unknown>][] = [
  ['animals', adeAnimal(animal)],
  ['test-day-results', adeTestDayResult({ id: 5, animal, date: '2026-04-01' })],
  ['parturitions', adeParturition({ id: 5, animal, date: '2026-04-01' })],
  ['inseminations', adeInsemination({ id: 5, animal, date: '2026-04-01' })],
  [
    'type-classifications',
    adeTypeClassification({ id: 5, animal, assessedAt: '2026-04-01', linear: {}, composite: {} }),
  ],
  ['weights', adeWeight({ id: 5, animal, date: '2026-04-01', weight: 500 })],
  ['pregnancy-checks', adePregnancyCheck(pc)],
  ['arrivals', adeArrival(mv)],
  ['departures', adeDeparture(mv)],
  ['deaths', adeDeath(death)],
]

for (const [name, resource] of SAMPLES) {
  const declared = DATASET_TYPES[name as keyof typeof DATASET_TYPES]
  if (resource.resourceType !== declared) {
    fail(`набор «${name}» обещает ${declared}, а отдаётся ${String(resource.resourceType)}`)
  }
}

console.log(`Наборов объявлено: ${ADE_DATASETS.length}`)

/* ------------------------------------------------------------------ *
 *  Идентификаторы: уникальны и совпадают с надгробием                *
 * ------------------------------------------------------------------ */

const sourceIdOf = (r: Record<string, unknown>) =>
  String((r.meta as { sourceId?: string } | undefined)?.sourceId ?? '')

const seen = new Map<string, string>()

for (const [name, resource] of SAMPLES) {
  const sid = sourceIdOf(resource)

  if (!sid.startsWith(`${name}:`)) {
    fail(`«${name}»: идентификатор «${sid}» без приставки набора — в ленте он столкнётся с чужим`)
  }

  const already = seen.get(sid)
  if (already) fail(`идентификатор «${sid}» одинаков у наборов «${already}» и «${name}»`)
  seen.set(sid, name)
}

console.log(`Идентификаторов сверено: ${SAMPLES.length}`)

/*
 * Надгробие против выдачи. Документ подсовывается такой же, каким его
 * увидит хук удаления: связи номерами, ключи как в базе.
 */
const TOMBS: [name: string, doc: Record<string, unknown>, expected: string][] = [
  ['animals', { id: 7, uuid: 'u-7' }, sourceIdOf(adeAnimal(animal))],
  ['test-day-results', { id: 5 }, sourceIdOf(adeTestDayResult({ id: 5, animal, date: '2026-04-01' }))],
  ['parturitions', { id: 5 }, sourceIdOf(adeParturition({ id: 5, animal, date: '2026-04-01' }))],
  ['weights', { id: 5 }, sourceIdOf(adeWeight({ id: 5, animal, date: '2026-04-01', weight: 500 }))],
  [
    'type-classifications',
    { id: 5 },
    sourceIdOf(adeTypeClassification({ id: 5, animal, assessedAt: '2026-04-01', linear: {}, composite: {} })),
  ],
]

for (const [name, doc, expected] of TOMBS) {
  const got = tombstoneEntries(name as never, doc).map((e) => e.sourceId)
  if (!got.includes(expected)) {
    fail(`надгробие «${name}» даёт ${got.join(', ') || '(ничего)'}, а ресурс уезжал как ${expected}`)
  }
}

/* Осеменение с датой теста хоронится дважды: само и проверкой стельности. */
const both = tombstoneEntries('inseminations', { id: 5, pregnancyCheckDate: '2026-04-10' })
if (both.length !== 2) {
  fail('осеменение с датой теста дало не два надгробия — проверка стельности останется у партнёра')
}
if (!both.some((e) => e.sourceId === sourceIdOf(adePregnancyCheck(pc)))) {
  fail('надгробие проверки стельности не совпало с тем, как она уезжала')
}

/* Перемещение — три ресурса из одной строки, и хоронятся нужные. */
const moved = tombstoneEntries('arrivals', { id: 5, kind: 'sale' }).map((e) => e.dataset)
if (!moved.includes('arrivals') || !moved.includes('departures')) {
  fail('удаление перемещения не похоронило обе стороны — у партнёра останется половина события')
}
const died = tombstoneEntries('deaths', { id: 5, kind: 'death' }).map((e) => e.dataset)
if (died.length !== 1 || died[0] !== 'deaths') fail(`падёж дал надгробия ${died.join(', ')}`)

console.log(`Случаев с надгробиями: ${TOMBS.length + 3}`)

/* ------------------------------------------------------------------ *
 *  Метка продолжения                                                 *
 * ------------------------------------------------------------------ */

const t0 = startToken('test-day-results')
t0.r = { t: '2026-04-01T10:00:00.000Z', i: 42 }

const raw = encodeToken(t0)

/* Стандарт требует base64 и ничего кроме: клиент вправе это проверить. */
if (!/^[A-Za-z0-9_-]+$/.test(raw)) fail(`метка не является строкой base64: «${raw.slice(0, 24)}…»`)

const back = decodeToken(raw, 'test-day-results')
if (!back.ok) fail(`своя же метка не разобралась: ${back.reason}`)
else if (back.token.r.i !== 42 || back.token.r.t !== t0.r.t) fail('метка вернулась с другой позицией')

/*
 * Подделка. Меняется середина строки — так выглядит и злой умысел,
 * и клиент, решивший «улучшить» метку, приписав к ней своё.
 */
const broken = Buffer.from(
  JSON.stringify({ p: JSON.stringify({ ...t0, r: { t: t0.r.t, i: 0 } }), s: 'подпись' }),
  'utf8',
).toString('base64url')

const forged = decodeToken(broken, 'test-day-results')
if (forged.ok) fail('подделанная метка принята — внутри неё условие выборки')
else if (forged.reason !== 'forged') fail(`подделка опознана как «${forged.reason}»`)

/* Метка от другого набора — не «почти та же», а другая. */
const alien = decodeToken(raw, 'parturitions')
if (alien.ok) fail('метка одного набора принята другим — клиент склеил бы ленты')
else if (alien.reason !== 'dataset') fail(`чужая метка опознана как «${alien.reason}»`)

/* Прежняя версия — не отказ, а полная пересинхронизация. */
const old = encodeToken({ ...t0, v: TOKEN_VERSION - 1 })
const oldRead = decodeToken(old, 'test-day-results')
if (oldRead.ok) fail('метка прежней версии принята как своя')
else if (oldRead.reason !== 'version') {
  fail(`старая метка опознана как «${oldRead.reason}» — партнёр получит отказ вместо пересинхронизации`)
}

/* Мусор вместо метки — не пятисотая и не «начнём сначала». */
const junk = decodeToken('это-не-метка', 'test-day-results')
if (junk.ok) fail('мусор принят за метку')

console.log('Меток проверено: 5')

/* ------------------------------------------------------------------ */

if (fails.length) {
  console.log('')
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\n  ✓ наборы, идентификаторы и метки продолжения сходятся')
process.exit(0)
