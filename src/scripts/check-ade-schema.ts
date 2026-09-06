import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import {
  adeAnimal,
  adeArrival,
  adeBreedingValue,
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
import {
  RECORDING_PROTOCOL,
  RECORDING_SCHEME,
  SAMPLING_MOMENT,
  SAMPLING_SCHEME,
} from '@/lib/milk-recording'

/**
 * Сверка того, что мы отдаём, с настоящими схемами ICAR.
 *
 * ## Чем это отличается от `check:ade`
 *
 * Тот прогон сверяет ресурс с **нашей** копией перечислений и с нашим
 * представлением о том, какие поля обязательны. Он ловит опечатки
 * и забытые поля, но по устройству не способен поймать расхождение
 * со стандартом: и проверяемое, и проверяющее написаны одной рукой.
 *
 * Здесь проверяющее написано ICAR. Если они переименуют значение,
 * сделают поле обязательным или сменят тип, мы узнаем об этом от себя,
 * а не от партнёра, у которого наш ответ не прошёл сверку.
 *
 * ## Почему прогон не ходит в сеть
 *
 * Схемы лежат копией в `vendor/icar-ade/` и обновляются отдельной
 * командой. Прогон, ходящий в сеть, падает, когда чужой сервер
 * недоступен, и — хуже — зеленеет, когда недоступен незаметно.
 *
 * ## Почему отсутствие схем — это отказ, а не пропуск
 *
 * Соблазн был написать «схем нет, пропускаем». Так делать нельзя:
 * прогон, умеющий тихо ничего не проверить, — худший из возможных.
 * Он занимает место настоящей проверки, показывает зелёное и снимает
 * вопрос «а сверяемся ли мы со стандартом» ровно тогда, когда ответ
 * «нет».
 *
 *   npm run ade:schemas     # подкачать схемы
 *   npm run check:ade-schema
 */

const VENDOR = 'vendor/icar-ade'

/*
 * Основа для идентификаторов схем.
 *
 * Ссылки внутри схем ICAR относительные — `../types/icarMassMeasureType.json`.
 * Ajv разрешает их относительно `$id` самой схемы, поэтому каждому файлу
 * ставится `$id` вида `file:///icar/resources/x.json`: тогда `../types/y.json`
 * превращается в `file:///icar/types/y.json`, то есть ровно в тот файл,
 * который лежит рядом. Без общей основы ссылки повисли бы, и Ajv отказал
 * бы не сверкой, а неразрешённой ссылкой — то есть жалобой не на то.
 */
const BASE = 'file:///icar/'

const fails: string[] = []
const fail = (m: string) => fails.push(m)

/* ------------------------------------------------------------------ */

if (!existsSync(VENDOR)) {
  console.log(`Схем ICAR нет в ${VENDOR}.`)
  console.log('')
  console.log('  Подкачайте их: npm run ade:schemas')
  console.log('')
  console.log('  Прогон намеренно не проходит без схем: проверка, умеющая тихо')
  console.log('  ничего не проверить, занимает место настоящей и показывает зелёное')
  console.log('  ровно тогда, когда со стандартом мы не сверяемся вовсе.')
  process.exit(1)
}

/*
 * В разбор идут только каталоги схем.
 *
 * В копии лежит ещё `url-schemes/` — это документы OpenAPI, а не JSON
 * Schema: у них свой корень с `paths` и `components`, и Ajv, приняв
 * их за схемы, объявил бы годным почти любой документ. Проверка стала бы
 * мягче ровно там, где заводилась ради строгости.
 *
 * Их читает отдельный прогон — сверка списка адресов.
 */
const SCHEMA_DIRS = ['resources', 'types', 'enums', 'collections']

const files: string[] = []
const walk = (p: string) => {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) walk(join(p, e))
    return
  }
  if (p.endsWith('.json')) files.push(p)
}
for (const dir of SCHEMA_DIRS) {
  const full = join(VENDOR, dir)
  if (existsSync(full)) walk(full)
}

const ajv = new Ajv2020({
  /*
   * Нестрогий режим вынужденно: схемы ICAR используют `discriminator`,
   * которого в JSON Schema нет — он из OpenAPI. В строгом режиме Ajv
   * отказывается от схемы целиком, и сверка не начинается вовсе.
   */
  strict: false,
  allErrors: true,
  /*
   * Форматы (`date-time`, `uri`) без `ajv-formats` не проверяются.
   * Это осознанный недобор: дату мы и так разбираем строго при приёме
   * (`check:ade-accept`), а тянуть ещё одну зависимость ради повторной
   * проверки того же — плата больше пользы.
   */
  validateFormats: false,
})

let loaded = 0
for (const file of files) {
  const id = BASE + relative(VENDOR, file).split(sep).join('/')
  try {
    const schema = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    ajv.addSchema({ ...schema, $id: id }, id)
    loaded += 1
  } catch (e) {
    fail(`${file}: не разобралось — ${e instanceof Error ? e.message : String(e)}`)
  }
}

console.log(`Схем загружено: ${loaded} из ${VENDOR}`)

const source = join(VENDOR, 'SOURCE.json')
if (existsSync(source)) {
  const s = JSON.parse(readFileSync(source, 'utf8')) as { branch?: string; fetchedAt?: string }
  console.log(`Ветка ${s.branch}, подкачано ${String(s.fetchedAt).slice(0, 10)}`)
}

/* ------------------------------------------------------------------ *
 *  Что сверяем                                                       *
 * ------------------------------------------------------------------ */

const animal: AnimalInput = {
  id: 1,
  identNumber: '1234567890',
  uuid: null,
  fgiasBaseUuid: null,
  rfid: '643012345678901',
  internationalId: 'RUSF000001234567890',
  breedCode: 'HOL',
  name: 'Ромашка',
  nameLatin: null,
  sex: 'female',
  state: null,
  birthDate: '2021-03-14',
  ageGroup: null,
  ownerId: 49,
  updatedAt: '2026-04-12T10:00:00.000Z',
  createdAt: null,
  fatherIdentNumber: null,
  fatherName: null,
  motherIdentNumber: null,
  motherName: null,
}

const movement = {
  id: 7001,
  animal,
  date: '2026-05-01',
  kind: 'sale',
  fromId: 12,
  toId: 49,
  updatedAt: null,
}

const CASES: [name: string, schema: string, resource: Record<string, unknown>][] = [
  ['животное', 'icarAnimalCoreResource', adeAnimal(animal)],
  [
    'контрольное доение',
    'icarTestDayResultEventResource',
    adeTestDayResult({
      id: 11,
      animal,
      date: '2026-04-12',
      milk: 34.2,
      fat: 3.82,
      protein: 3.24,
      somaticCells: 120,
      updatedAt: null,
    }),
  ],
  [
    'отёл',
    'icarReproParturitionEventResource',
    adeParturition({
      id: 12,
      animal,
      date: '2026-02-20',
      number: 2,
      ease: 'assisted',
      liveHeifers: 1,
      liveBulls: 0,
      stillborn: 0,
      updatedAt: null,
    }),
  ],
  [
    'осеменение',
    'icarReproInseminationEventResource',
    adeInsemination({
      id: 13,
      animal,
      date: '2026-01-20',
      attemptNumber: 1,
      method: null,
      bullIdentNumber: '9876543210',
      bullName: 'Барон',
      technician: null,
      updatedAt: null,
    }),
  ],
  ['взвешивание', 'icarWeightEventResource', adeWeight({ id: 14, animal, date: '2026-01-10', weight: 512, updatedAt: null })],
  [
    'поступление',
    'icarMovementArrivalEventResource',
    adeArrival(movement),
  ],
  ['выбытие', 'icarMovementDepartureEventResource', adeDeparture(movement)],
  [
    'падёж',
    'icarMovementDeathEventResource',
    adeDeath({ ...movement, id: 7002, kind: 'death', toId: null }),
  ],
  [
    'проверка стельности',
    'icarReproPregnancyCheckEventResource',
    adePregnancyCheck({ id: 15, animal, date: '2026-04-20', result: 'Стельная', updatedAt: null }),
  ],
  [
    'оценка экстерьера',
    'icarTypeClassificationEventResource',
    adeTypeClassification({
      id: 16,
      animal,
      assessedAt: '2026-03-01',
      assessor: 'Иванов И. И.',
      linear: { stature: 7 },
      composite: {},
      updatedAt: null,
    }),
  ],
  [
    'племенная ценность',
    'icarBreedingValueResource',
    adeBreedingValue({
      animal,
      profileKey: 'association',
      profileName: 'ИПЦ Ассоциации',
      baseVersion: 'CDCB-2025-metric',
      value: 421.7,
      reliability: 63,
      computedAt: '2026-09-01T03:00:00.000Z',
    }),
  ],
]

/* ------------------------------------------------------------------ *
 *  Известные дефекты самих схем ICAR                                 *
 * ------------------------------------------------------------------ */

/*
 * Третий случай, которого не было в замысле.
 *
 * Расхождение со схемой мыслилось двояким: либо наша ошибка, либо
 * изменение стандарта, и оба принимаются руками. Первый же запуск
 * показал третий: **ошибка в самой схеме**.
 *
 * `icarTypeClassificationEventResource` объявляет обязательными `score`
 * и `traitScored`, но не определяет их — ни у себя, ни у предков.
 * Оба поля живут в `icarConformationScoreType`, откуда список
 * обязательных, судя по всему, и скопировали, разделяя событие на два
 * ресурса: `icarConformationScoreEventResource` — одна оценка одного
 * признака, `icarTypeClassificationEventResource` — набор оценок
 * в массиве `conformationScores`.
 *
 * Схему в таком виде не выполнить ничем: обязательное поле, которого
 * в схеме нет, не может быть заполнено правильно. Подставить `score`
 * и `traitScored` на уровне события — соврать: у классификации,
 * состоящей из тридцати признаков, нет одного «того самого» балла.
 *
 * Поэтому исключение, а не подгонка. Условие у исключения жёсткое:
 * оно снимает **только названные** поля и только у названного ресурса.
 * Любое другое расхождение по этому же ресурсу пройдёт как обычно.
 */
const KNOWN_DEFECTS: Record<string, { fields: string[]; why: string }> = {
  icarTypeClassificationEventResource: {
    fields: ['score', 'traitScored'],
    why:
      'обязательные поля не определены ни в самой схеме, ни у предков — ' +
      'список required скопирован из icarConformationScoreType',
  },
}

/* ------------------------------------------------------------------ */

let checked = 0
let excused = 0

for (const [name, schemaName, resource] of CASES) {
  const id = `${BASE}resources/${schemaName}.json`
  const validate = ajv.getSchema(id)

  if (!validate) {
    /*
     * Отсутствие схемы — отказ, а не пропуск. Ресурс, для которого схемы
     * нет, ровно тот, который никто не сверял; тихо пройти мимо значило
     * бы отчитаться о сверке, которой не было.
     */
    fail(`${name}: схемы ${schemaName}.json нет в копии — добавьте её в точки входа ade:schemas`)
    continue
  }

  checked += 1

  if (!validate(resource)) {
    const defect = KNOWN_DEFECTS[schemaName]

    for (const e of validate.errors ?? []) {
      /*
       * Снимается только «нет обязательного поля» и только для полей,
       * названных в дефекте. Ошибка типа или лишнее свойство по тому же
       * ресурсу пройдёт как обычно: исключение сделано под конкретную
       * поломку схемы, а не под ресурс целиком.
       */
      const missing =
        e.keyword === 'required'
          ? String((e.params as { missingProperty?: string }).missingProperty ?? '')
          : ''

      if (defect && missing && defect.fields.includes(missing)) {
        excused += 1
        continue
      }

      fail(`${name}: ${e.instancePath || '/'} ${e.message ?? ''}`.trim())
    }
  }
}

console.log(`Сверено ресурсов: ${checked} из ${CASES.length}`)

/* ------------------------------------------------------------------ *
 *          Перечисления метода контроля против копии стандарта         *
 * ------------------------------------------------------------------ */

/*
 * Четыре перечисления ICAR книга держит у себя списками с русскими
 * подписями (`lib/milk-recording.ts`), и разбор «Метод контроля»
 * обещает читателю, что отдельная проверка следит за их совпадением
 * с копией стандарта. Проверки не было: сверялись только ресурсы,
 * а полей метода контроля ни в одном из них нет.
 *
 * Обещание, за которым ничего не стоит, хуже отсутствующего: значения
 * набраны руками, вплоть до опечатки ICAR в одном из них
 * (`MulitpleMilkingSampleInAMS`), и первая же правка «по красоте»
 * сделала бы выгрузку непринимаемой — молча.
 *
 * Сверяются ключи, а не подписи: подписи наши и переводятся, ключи
 * принадлежат стандарту.
 */
const ENUM_CASES: { file: string; ours: readonly string[]; what: string }[] = [
  {
    file: 'icarMilkRecordingProtocolType.json',
    ours: Object.keys(RECORDING_PROTOCOL),
    what: 'кто снимал показания',
  },
  {
    file: 'icarMilkRecordingSchemeType.json',
    ours: Object.keys(RECORDING_SCHEME),
    what: 'какие доения вошли в контроль',
  },
  {
    file: 'icarMilkSamplingSchemeType.json',
    ours: Object.keys(SAMPLING_SCHEME),
    what: 'как брали пробу',
  },
  {
    file: 'icarMilkSamplingMomentType.json',
    ours: Object.keys(SAMPLING_MOMENT),
    what: 'когда брали пробу',
  },
]

console.log('')
console.log('Перечисления метода контроля против копии стандарта')

for (const c of ENUM_CASES) {
  const path = join(VENDOR, 'enums', c.file)
  if (!existsSync(path)) {
    fail(`${c.file}: копии схемы нет в дереве — сверять не с чем`)
    continue
  }

  const theirs = (JSON.parse(readFileSync(path, 'utf8')) as { enum?: unknown }).enum
  if (!Array.isArray(theirs) || theirs.length === 0) {
    fail(`${c.file}: в схеме нет списка значений — проверка ничего не измерила`)
    continue
  }

  const their = new Set(theirs.map(String))
  const extra = c.ours.filter((k) => !their.has(k))
  const absent = [...their].filter((k) => !c.ours.includes(k))

  if (extra.length) fail(`${c.file}: у нас есть, а в стандарте нет — ${extra.join(', ')}`)
  if (absent.length) fail(`${c.file}: в стандарте есть, а у нас нет — ${absent.join(', ')}`)
  if (!extra.length && !absent.length) {
    console.log(`  ✓ ${c.what}: ${c.ours.length}`)
  }
}

if (excused > 0) {
  console.log('')
  console.log('Снято по известным дефектам самих схем ICAR:')
  for (const [schema, d] of Object.entries(KNOWN_DEFECTS)) {
    console.log(`  ${schema}: ${d.fields.join(', ')} — ${d.why}`)
  }
  console.log('  Сообщить о них в adewg/ICAR — работа на письмо, а не на код.')
}

/* ------------------------------------------------------------------ */

if (fails.length) {
  console.log('')
  for (const f of fails) console.log(`  ✗ ${f}`)
  console.log('')
  console.log('  Расхождение со схемой ICAR — это либо наша ошибка, либо изменение')
  console.log('  стандарта. Второе тоже надо принять руками: молча подогнать ответ')
  console.log('  под новую схему значит не заметить, что обещание изменилось.')
  process.exit(1)
}

console.log('\n  ✓ отдаваемые ресурсы проходят настоящие схемы ICAR')
process.exit(0)
