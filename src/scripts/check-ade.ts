import {
  ADE_BIRTH_STATUS,
  ADE_BV_CALCULATION,
  ADE_CALVING_EASE,
  ADE_CONFORMATION_GROUP,
  ADE_CONFORMATION_TRAIT,
  ADE_GENDER,
  ADE_INSEMINATION_TYPE,
  ADE_MILK_CHARACTERISTIC,
  ADE_PRODUCTION_PURPOSE,
  ADE_RELATION,
  ADE_SCORING_METHOD,
  ADE_SPECIE,
  ADE_ANIMAL_STATUS,
  SCHEME,
} from '@/lib/ade/core'
import {
  COMPOSITE_TO_ADE,
  LINEAR_TO_ADE,
  adeAnimal,
  adeBreedingValue,
  adeInsemination,
  adeParturition,
  adeTestDayResult,
  adeTypeClassification,
  adeWeight,
  type AnimalInput,
} from '@/lib/ade/resources'

/**
 * Отображение книги в ICAR ADE — на выдуманных записях, без базы.
 *
 * ## Почему без базы, хотя проверять надо живое
 *
 * Проверяется здесь не содержимое книги, а форма ответа: имена полей,
 * значения перечислений, тип значения, формат времени. Всё это свойства
 * кода, а не данных, и живая база не добавила бы к ним ничего, кроме
 * времени прогона и требования, чтобы она была под рукой. Прогон, который
 * нельзя запустить в чужой среде, на практике не запускают.
 *
 * Живое проверяется иначе — тем, что чужая система заберёт наш ответ
 * и сверит его со схемой сама. В этом и смысл открытого стандарта.
 *
 * ## Что здесь ломается молча
 *
 * **Значение не из перечисления.** `Male` вместо `male`, `Difficult`
 * вместо `DifficultExtraAssistance`. JSON стерпит, наш код не заметит,
 * а чужая сверка по схеме откажет — и узнаем мы об этом от партнёра,
 * а не от себя.
 *
 * **Число там, где схема требует строку.** Показатель молока объявлен
 * строкой; `{"characteristic":"FAT","value":3.8}` выглядит правильнее
 * правильного и невалиден.
 *
 * **Время не в UTC.** Спецификация требует RFC3339 с суффиксом `Z`.
 * Местное время со смещением формально разберётся, но означает другую
 * точку на оси, и расхождение вылезет на границе месяца.
 *
 * **Двоеточие или косая черта в схеме идентификатора.** Схема попадает
 * в адрес запроса, и правило ADE прямо это запрещает. Соблазн назвать
 * схему `iso.org:11784` велик, а поймать последствие можно только там,
 * где адрес соберут.
 *
 * **Ноль вместо «неизвестно».** Отдельная проверка: отёл без записанных
 * чисел приплода не должен уезжать с `liveProgeny: 0` — это не пробел
 * в данных, а сообщение о том, что живых телят не было.
 *
 *   npm run check:ade
 */

const fails: string[] = []
const fail = (m: string) => fails.push(m)

/* ------------------------------------------------------------------ *
 *  Общая сверка любого ресурса                                        *
 * ------------------------------------------------------------------ */

const ENUMS: Record<string, readonly string[]> = {
  specie: ADE_SPECIE,
  gender: ADE_GENDER,
  status: ADE_ANIMAL_STATUS,
  productionPurpose: ADE_PRODUCTION_PURPOSE,
  relation: ADE_RELATION,
  birthStatus: ADE_BIRTH_STATUS,
  calvingEase: ADE_CALVING_EASE,
  inseminationType: ADE_INSEMINATION_TYPE,
  characteristic: ADE_MILK_CHARACTERISTIC,
  traitGroup: ADE_CONFORMATION_GROUP,
  traitScored: ADE_CONFORMATION_TRAIT,
  method: ADE_SCORING_METHOD,
  calculationType: ADE_BV_CALCULATION,
}

const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

/** Поля, которые в ADE — точка во времени, а не свободная строка. */
const TIME_FIELDS = new Set(['eventDateTime', 'birthDate', 'modified', 'created', 'taggingDate'])

function inspect(node: unknown, path: string, where: string): void {
  if (node === null || node === undefined) {
    fail(`${where}: ${path} равно null — необъявленных полей в ответе быть не должно`)
    return
  }

  if (Array.isArray(node)) {
    node.forEach((v, i) => inspect(v, `${path}[${i}]`, where))
    return
  }

  if (typeof node !== 'object') return

  const obj = node as Record<string, unknown>

  /* Пара «схема + id»: обе части обязательны, в схеме нет `:` и `/`. */
  if (typeof obj.scheme === 'string') {
    if (!obj.scheme.trim()) fail(`${where}: ${path}.scheme пустая`)
    if (/[:/]/.test(obj.scheme)) {
      fail(`${where}: ${path}.scheme «${obj.scheme}» содержит «:» или «/» — правило ADE это запрещает`)
    }
    if (typeof obj.id !== 'string' || !obj.id.trim()) {
      fail(`${where}: ${path} имеет схему, но не имеет id`)
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    const next = path ? `${path}.${key}` : key

    if (typeof value === 'string') {
      const allowed = ENUMS[key]
      if (allowed && !allowed.includes(value)) {
        fail(`${where}: ${next} = «${value}» — нет в перечислении ADE`)
      }
      if (TIME_FIELDS.has(key) && !RFC3339_UTC.test(value)) {
        fail(`${where}: ${next} = «${value}» — не RFC3339 в UTC с суффиксом Z`)
      }
      continue
    }

    /* Перечислимое поле, пришедшее числом, — та же ошибка, что чужое слово. */
    if (ENUMS[key] && typeof value !== 'object') {
      fail(`${where}: ${next} должно быть строкой из перечисления, а пришло ${typeof value}`)
      continue
    }

    inspect(value, next, where)
  }
}

/** Обязательные поля ресурса — по таблицам `docs/ade-spec.md`. */
function requireFields(res: Record<string, unknown>, keys: string[], where: string): void {
  for (const k of keys) {
    if (res[k] === undefined) fail(`${where}: нет обязательного поля ${k}`)
  }
  const meta = res.meta as Record<string, unknown> | undefined
  if (!meta) {
    fail(`${where}: нет meta — без него ресурс нельзя синхронизировать`)
  } else {
    if (!meta.source) fail(`${where}: нет meta.source`)
    if (!meta.modified) fail(`${where}: нет meta.modified`)
  }
}

/* ------------------------------------------------------------------ *
 *  Выдуманные записи                                                  *
 * ------------------------------------------------------------------ */

const cow: AnimalInput = {
  id: 101,
  identNumber: 'RU-0000123456',
  uuid: '11111111-2222-3333-4444-555555555555',
  fgiasBaseUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  rfid: '643000123456789',
  internationalId: 'RUSF000000123456',
  name: 'Ромашка',
  nameLatin: 'Romashka',
  sex: 'female',
  state: 'alive',
  birthDate: '2021-04-17',
  breedCode: 'HOL',
  ageGroup: 'cow2',
  ownerId: 1,
  updatedAt: '2026-08-01T10:00:00.000Z',
  createdAt: '2021-04-18T08:00:00.000Z',
  fatherIdentNumber: 'RU-0000000777',
  fatherName: 'PERCIVAL',
  motherIdentNumber: 'RU-0000099999',
  motherName: 'Берёзка',
}

const bull: AnimalInput = {
  id: 202,
  identNumber: 'RU-0000000777',
  uuid: '99999999-8888-7777-6666-555555555555',
  name: 'Барс',
  sex: 'male',
  state: 'alive',
  birthDate: '2018-02-02',
  breedCode: 'HOL',
  ageGroup: 'bull',
  ownerId: 1,
}

/** Животное без номеров и родителей: у отображения не должно быть дыр. */
const bare: AnimalInput = { id: 303, sex: null, state: null, ownerId: null }

/* ------------------------------------------------------------------ *
 *  Прогон                                                             *
 * ------------------------------------------------------------------ */

const built: [string, Record<string, unknown>, string[]][] = [
  ['животное', adeAnimal(cow), ['resourceType', 'identifier', 'specie', 'gender']],
  ['бык', adeAnimal(bull), ['resourceType', 'identifier', 'specie', 'gender']],
  ['животное без номеров', adeAnimal(bare), ['resourceType', 'identifier', 'specie', 'gender']],
  [
    'контрольное доение',
    adeTestDayResult({
      id: 5001,
      animal: cow,
      date: '2026-07-15',
      milk: 28.4,
      fat: 3.85,
      protein: 3.21,
      somaticCells: 145,
    }),
    ['resourceType', 'animal'],
  ],
  [
    'отёл',
    adeParturition({
      id: 6001,
      animal: cow,
      date: '2026-03-02',
      number: 2,
      ease: 'assisted',
      liveHeifers: 1,
      liveBulls: 0,
      stillborn: 0,
    }),
    ['resourceType', 'animal'],
  ],
  [
    'осеменение',
    adeInsemination({
      id: 7001,
      animal: cow,
      date: '2026-05-20',
      attemptNumber: 2,
      bullIdentNumber: bull.identNumber,
      bullName: 'Барс',
      technician: 'Иванов И. И.',
    }),
    ['resourceType', 'animal', 'inseminationType'],
  ],
  [
    'экстерьер',
    adeTypeClassification({
      id: 8001,
      animal: cow,
      assessedAt: '2026-06-10',
      assessor: 'Петрова А. С.',
      linear: { height: 7, udderDepth: 5, rumpAngle: 6, foreUdder: 8 },
      composite: { generalView: 84, udderQuality: 86, bodyVolume: 80 },
    }),
    ['resourceType', 'animal'],
  ],
  [
    'взвешивание',
    adeWeight({ id: 9001, animal: cow, date: '2026-01-11', weight: 612 }),
    ['resourceType', 'animal'],
  ],
  [
    'племенная ценность',
    adeBreedingValue({
      animal: cow,
      profileKey: 'association',
      profileName: 'ИПЦ Ассоциации',
      baseVersion: 'CDCB-2025-metric',
      value: 421.7,
      reliability: 63,
      computedAt: '2026-09-01T03:00:00.000Z',
    }),
    ['resourceType', 'id', 'animal'],
  ],
]

for (const [name, resource, required] of built) {
  requireFields(resource, required, name)
  inspect(resource, '', name)
}

console.log(`Собрано ресурсов: ${built.length}`)

/* ------------------------------------------------------------------ *
 *  Частности, которые общая сверка не поймает                        *
 * ------------------------------------------------------------------ */

/* Показатель молока — строка, а не число. */
const testDay = built.find(([n]) => n === 'контрольное доение')![1]
for (const c of (testDay.milkCharacteristics as { value: unknown; characteristic: string }[]) ?? []) {
  if (typeof c.value !== 'string') {
    fail(`контрольное доение: ${c.characteristic}.value пришло ${typeof c.value}, а схема требует строку`)
  }
}
if ((testDay.milkCharacteristics as unknown[])?.length !== 3) {
  fail('контрольное доение: жир, белок и соматика должны дать три показателя')
}

/* Ноль вместо «неизвестно»: отёл без записанных чисел не сообщает о нуле. */
const emptyCalving = adeParturition({ id: 6002, animal: cow, date: '2026-03-02' })
if ('liveProgeny' in emptyCalving || 'totalProgeny' in emptyCalving) {
  fail('отёл без записанных чисел приплода отдал liveProgeny — ноль выдан за факт')
}

/* Мертворождённый входит в общее число, но не в число живых. */
const stillbornCalving = adeParturition({
  id: 6003,
  animal: cow,
  date: '2026-03-02',
  liveHeifers: 1,
  liveBulls: 0,
  stillborn: 1,
})
if (stillbornCalving.liveProgeny !== 1 || stillbornCalving.totalProgeny !== 2) {
  fail(
    `двойня с мертворождённым: живых ${stillbornCalving.liveProgeny}, всего ` +
      `${stillbornCalving.totalProgeny}, ожидалось 1 и 2`,
  )
}

/* Выбраковка — не падёж. */
if (adeAnimal({ ...cow, state: 'culled' }).status !== 'OffFarm') {
  fail('выбракованное животное отдано не как OffFarm — падёж будет завышен')
}
if (adeAnimal({ ...cow, state: 'dead' }).status !== 'Dead') {
  fail('павшее животное отдано не как Dead')
}

/* Основной идентификатор — племенной номер, учётный уходит вторым. */
const animalRes = adeAnimal(cow)
if ((animalRes.identifier as { scheme: string }).scheme !== SCHEME.animal) {
  fail('основным идентификатором животного ушёл не племенной номер')
}
const alts = (animalRes.alternativeIdentifiers as { scheme: string }[]) ?? []
for (const need of [SCHEME.interbull, SCHEME.accounting, SCHEME.fgias, SCHEME.iso11785]) {
  if (!alts.some((a) => a.scheme === need)) fail(`в альтернативных идентификаторах нет схемы ${need}`)
}

/* Животное без единого номера всё равно получает идентификатор. */
const bareRes = adeAnimal(bare)
const bareId = bareRes.identifier as { scheme: string; id: string }
if (!bareId?.id) fail('животное без номеров осталось без идентификатора вовсе')

/* Непереводимые признаки не выдаются за соседние по смыслу. */
const exterior = built.find(([n]) => n === 'экстерьер')![1]
const traits = (exterior.conformationScores as { traitScored: string }[]) ?? []
if (traits.some((t) => !t.traitScored)) fail('экстерьер: оценка без имени признака')
if (traits.length !== 6) {
  fail(`экстерьер: ожидалось 6 оценок (4 линейных и 2 сводных), пришло ${traits.length}`)
}

const unmapped = [
  ...Object.entries(LINEAR_TO_ADE),
  ...Object.entries(COMPOSITE_TO_ADE),
].filter(([, v]) => v === null)
console.log(
  `Признаков без соответствия в номенклатуре ICAR: ${unmapped.length}` +
    (unmapped.length ? ` (${unmapped.map(([k]) => k).join(', ')})` : ''),
)

/* Имена признаков — из перечисления ADE, а не выдуманные. */
for (const [key, trait] of [...Object.entries(LINEAR_TO_ADE), ...Object.entries(COMPOSITE_TO_ADE)]) {
  if (trait && !ADE_CONFORMATION_TRAIT.includes(trait)) {
    fail(`признак ${key} отображён в «${trait}», которого нет в icarConformationTraitType`)
  }
}

/* ------------------------------------------------------------------ */

if (fails.length) {
  console.log('')
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\n  ✓ ресурсы ADE собираются по спецификации')
process.exit(0)
