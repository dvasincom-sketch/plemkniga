import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Готовность книги к выгрузке во ФГИАС ПР — по живой базе.
 *
 * ## Зачем, если разбор шаблонов уже сделан
 *
 * Разбор шаблонов сосчитал колонки: «Лактация» — девять поддержанных
 * из тринадцати. Это не тот ответ, который нужен. ФГИАС отвергает запись
 * за **незаполненное** обязательное поле, а не за отсутствующее в схеме,
 * и поддержанная колонка, которую в хозяйстве никто не вносит, даёт
 * в выгрузке пустую ячейку и отказ. Между «поле заведено» и «поле
 * заполнено» лежит вся разница между работающей выгрузкой и той, что
 * вернётся с ошибкой на каждой второй строке.
 *
 * Поэтому здесь считается доля заполненности по живым записям и число
 * строк, которые ушли бы во ФГИАС целиком. Скрипт ничего не пишет
 * и не меняет: он только читает и считает.
 *
 * ## Что он не отвечает
 *
 * Не отвечает, верны ли значения, — только заполнены ли. Порода,
 * заполненная у всех животных, всё равно уедет в реестр непринятой, пока
 * у нас нет её uuid из справочника ФГИАС; здесь она считается заполненной,
 * и это честно: вопрос справочников решается отдельно от вопроса полноты.
 * Колонки, которых у нас нет вовсе, в подсчёт не входят — они названы
 * в разборе шаблонов, и повторять их числом «ноль процентов» значило бы
 * смешать «не ведём» с «ведём плохо».
 *
 *   npm run check:fgias-readiness
 *
 * ## Про родословную считается отдельно и подробнее
 *
 * Шаблон «Родословная» требует четырнадцать предков — три ряда вглубь.
 * В карточке текстом лежат четыре гнезда, но есть ещё связи `father`
 * и `mother`, по которым родословная обходится вглубь на любую глубину,
 * пока предки заведены записями. Сколько рядов из этого реально
 * собирается — вопрос, ответ на который есть только у базы, и он решает,
 * сколько будет стоить эта часть выгрузки.
 */

/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>

/** Значение по пути вида `altIds.isoId`. */
const at = (obj: unknown, path: string): unknown => {
  let node: unknown = obj
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

/**
 * Заполнено ли поле.
 *
 * Ноль и `false` считаются заполненными намеренно: нулевой удой и пустой
 * удой значат разное, и подсчёт, в котором ноль сходит за пустоту, соврал
 * бы в сторону «у нас всё плохо» — то есть в ту же сторону, что и подсчёт
 * по схеме, только с другим знаком.
 */
const filled = (v: unknown): boolean => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

type Col = {
  title: string
  path: string
  /** Обязательное во ФГИАС: по нему считаются «полные строки». */
  need?: boolean
  /** Своя проверка, когда путём не обойтись. */
  has?: (r: Row) => boolean
}

const bar = (share: number): string => {
  const n = Math.round(share * 20)
  return '█'.repeat(n) + '·'.repeat(20 - n)
}

const pct = (n: number, of: number) => (of === 0 ? '—' : `${Math.round((n / of) * 100)}%`)

/**
 * Отчёт по одному шаблону.
 *
 * Печатает и долю по каждой колонке, и число строк, у которых заполнены
 * все обязательные. Первое говорит, что чинить; второе — сколько сегодня
 * реально уедет. Одного числа тут мало: колонка, заполненная на 95 %,
 * выглядит прекрасно, а если таких колонок пять и пустые в них разные
 * животные, целых строк останется втрое меньше.
 */
const report = (label: string, note: string, rows: Row[], cols: Col[]) => {
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`${label}  —  строк в базе: ${rows.length}`)
  if (note) console.log(`  ${note}`)
  console.log('')

  if (rows.length === 0) {
    console.log('  записей нет, считать нечего')
    return
  }

  for (const col of cols) {
    const n = rows.filter((r) => (col.has ? col.has(r) : filled(at(r, col.path)))).length
    const mark = col.need ? '!' : ' '
    console.log(
      `  ${mark} ${col.title.padEnd(30)} ${bar(n / rows.length)} ${pct(n, rows.length).padStart(4)}  ${n}`,
    )
  }

  const need = cols.filter((c) => c.need)
  if (need.length) {
    const whole = rows.filter((r) =>
      need.every((c) => (c.has ? c.has(r) : filled(at(r, c.path)))),
    ).length
    console.log('')
    console.log(
      `  Уйдёт целиком: ${whole} из ${rows.length} (${pct(whole, rows.length)}). ` +
        `Знаком «!» помечены обязательные во ФГИАС.`,
    )
  }
}

/* ------------------------------------------------------------------ */

/**
 * Все записи коллекции постранично.
 *
 * `limit: 0` в Payload отдаёт всё одним запросом, и на стаде в полсотни
 * тысяч это означает всю таблицу в памяти разом. Страницами дольше
 * и спокойнее; глубина связей нулевая — нам нужны идентификаторы,
 * а не разложенные объекты.
 */
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

/** Идентификатор связи: она приходит числом при `depth: 0`. */
const rel = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : typeof v === 'object' && v !== null
    ? ((v as { id?: number }).id ?? undefined)
    : undefined

/* ------------------------------------------------------------------ */
/*  Родословная                                                        */
/* ------------------------------------------------------------------ */

/**
 * Четырнадцать гнёзд шаблона «Родословная», как их пишет ФГИАС.
 *
 * Код читается справа налево: последняя буква — первый шаг от животного.
 * «ООМ» это отец отца матери: сначала М (мать), потом О (её отец), потом
 * О (его отец). Записать наоборот — обычная ошибка, и она не заметна
 * на «ОО» и «ММ», где порядок безразличен, зато переставляет местами
 * деда и бабку на всех смешанных путях.
 */
const NESTS = [
  'О',
  'М',
  'ОО',
  'МО',
  'ОМ',
  'ММ',
  'ООО',
  'МОО',
  'ОМО',
  'ММО',
  'ООМ',
  'МОМ',
  'ОММ',
  'МММ',
]

const gen = (code: string) => code.length

async function pedigree(animals: Row[]) {
  const byId = new Map<number, Row>()
  for (const a of animals) byId.set(a.id as number, a)

  const step = (id: number | undefined, letter: string): number | undefined => {
    if (id === undefined) return undefined
    const a = byId.get(id)
    if (!a) return undefined
    return rel(letter === 'О' ? a.father : a.mother)
  }

  /** Сколько гнёзд собирается связями. */
  const resolve = (a: Row): Set<string> => {
    const got = new Set<string>()
    for (const code of NESTS) {
      let id: number | undefined = a.id as number
      for (let i = code.length - 1; i >= 0; i--) {
        id = step(id, code[i]!)
        if (id === undefined) break
      }
      if (id !== undefined) got.add(code)
    }
    return got
  }

  console.log(`\n${'─'.repeat(72)}`)
  console.log(`Родословная — четырнадцать гнёзд против наших связей`)
  console.log(`  Животных в базе: ${animals.length}`)
  console.log('')

  const perNest = new Map<string, number>()
  const perAnimal: number[] = []
  let fullRow1 = 0
  let fullRow2 = 0
  let fullRow3 = 0

  for (const a of animals) {
    const got = resolve(a)
    perAnimal.push(got.size)
    for (const code of got) perNest.set(code, (perNest.get(code) ?? 0) + 1)
    if (NESTS.filter((c) => gen(c) === 1).every((c) => got.has(c))) fullRow1 += 1
    if (NESTS.filter((c) => gen(c) === 2).every((c) => got.has(c))) fullRow2 += 1
    if (NESTS.filter((c) => gen(c) === 3).every((c) => got.has(c))) fullRow3 += 1
  }

  for (const code of NESTS) {
    const n = perNest.get(code) ?? 0
    console.log(
      `  ${code.padEnd(6)} ряд ${gen(code)}  ${bar(n / animals.length)} ${pct(n, animals.length).padStart(4)}  ${n}`,
    )
  }

  console.log('')
  console.log(`  Первый ряд целиком (О, М):        ${fullRow1} (${pct(fullRow1, animals.length)})`)
  console.log(`  Второй ряд целиком (4 гнезда):    ${fullRow2} (${pct(fullRow2, animals.length)})`)
  console.log(`  Третий ряд целиком (8 гнёзд):     ${fullRow3} (${pct(fullRow3, animals.length)})`)

  const complete = perAnimal.filter((n) => n === NESTS.length).length
  const empty = perAnimal.filter((n) => n === 0).length
  console.log(
    `  Все четырнадцать:                 ${complete} (${pct(complete, animals.length)})`,
  )
  console.log(`  Ни одного предка:                 ${empty} (${pct(empty, animals.length)})`)

  /*
   * Текстовая родословная считается отдельно и не складывается со связями.
   * Она не годится для выгрузки — ФГИАС ждёт uuid, а не номер со
   * свидетельства, — но показывает, где данные вообще-то есть и не хватает
   * только записи предка. Это разные работы: достроить связь по
   * записанному номеру дешевле, чем узнать номер, которого нет нигде.
   */
  const textOnly = animals.filter(
    (a) =>
      !rel(a.father) &&
      filled(at(a, 'pedigreeText.fatherId')),
  ).length
  const textMother = animals.filter(
    (a) => !rel(a.mother) && filled(at(a, 'pedigreeText.motherId')),
  ).length

  console.log('')
  console.log(`  Отец известен текстом, но связи нет:  ${textOnly}`)
  console.log(`  Мать известна текстом, но связи нет:  ${textMother}`)
  console.log(
    '  Это кандидаты на достройку по номеру — работа дешевле, чем поиск неизвестного предка.',
  )
}

/* ------------------------------------------------------------------ */

async function main() {
  const payload = await getPayload({ config })

  console.log('\nЧитаем базу…')

  const [animalsAll, calvings, inseminations, milkTests, exteriors, movements] = await Promise.all([
    all(payload, 'animals'),
    all(payload, 'calvings'),
    all(payload, 'inseminations'),
    all(payload, 'milk-tests'),
    all(payload, 'animal-exteriors'),
    all(payload, 'movements'),
  ])

  /*
   * Архивные исключаются: во ФГИАС они не выгружаются, а в знаменателе
   * занижали бы заполненность тем сильнее, чем аккуратнее хозяйство
   * чистит стадо.
   */
  const animals = animalsAll.filter((a) => a.archived !== true)

  console.log(
    `Животных ${animals.length} (в архиве ещё ${animalsAll.length - animals.length}), ` +
      `отёлов ${calvings.length}, осеменений ${inseminations.length}, ` +
      `доек ${milkTests.length}, оценок экстерьера ${exteriors.length}, ` +
      `движений ${movements.length}`,
  )

  /* ---------------------------------------------------------------- */

  report(
    'Основные сведения',
    'Единственный шаблон с читаемым номером животного — и мост к базовому uuid.',
    animals,
    [
      { title: 'УНЖ (инд. номер)', path: 'identNumber', need: true },
      { title: 'Кличка', path: 'name', need: true },
      { title: 'Дата рождения', path: 'birthDate', need: true },
      { title: 'Пол', path: 'sex', need: true },
      { title: 'Половозрастная группа', path: 'ageGroup', need: true },
      { title: 'Порода', path: 'breed', need: true },
      { title: 'Кровность, %', path: 'bloodPercent' },
      { title: 'Линия', path: 'line' },
      { title: 'Масть', path: 'coatColor' },
      { title: 'Назначение', path: 'purpose' },
      { title: 'Собственник', path: 'owner', need: true },
      { title: 'Технологический номер', path: 'altIds.inventoryNumber' },
      { title: 'Бирка', path: 'altIds.earTag' },
      { title: 'ISO-ID', path: 'altIds.isoId' },
    ],
  )

  await pedigree(animals)

  report(
    'Отёл / Аборт / Запуск',
    'Счёт телочек и бычков считается из приплода по полу — здесь мерим, есть ли сам приплод.',
    calvings,
    [
      { title: 'Животное', path: 'animal', need: true },
      { title: 'Дата события', path: 'date', need: true },
      { title: 'Номер лактации', path: 'number', need: true },
      { title: 'Результат', path: 'result' },
      { title: 'Лёгкость отёла', path: 'ease' },
      { title: 'Приплод связан', path: 'calves' },
      { title: 'Масса телёнка', path: 'calfWeight' },
      { title: 'Дата запуска', path: 'dryOffDate' },
      { title: 'Дойных дней', path: 'milkingDays' },
    ],
  )

  report(
    'Осеменение',
    'Лучшее совпадение по составу колонок: расходится только ключ животного.',
    inseminations,
    [
      { title: 'Животное', path: 'animal', need: true },
      { title: 'Дата осеменения', path: 'date', need: true },
      { title: 'Номер лактации', path: 'lactationNumber', need: true },
      { title: 'Бык-осеменитель', path: 'bull', need: true },
      { title: 'Метод осеменения', path: 'method' },
      { title: 'Кратность', path: 'attemptNumber' },
      { title: 'Плодотворность (результат)', path: 'result' },
      { title: 'Дата теста на стельность', path: 'pregnancyCheckDate' },
    ],
  )

  report(
    'Контрольное доение',
    'День лактации ФГИАС требует числом; у нас он считается из даты отёла, а не хранится.',
    milkTests,
    [
      { title: 'Животное', path: 'animal', need: true },
      { title: 'Дата доения', path: 'date', need: true },
      { title: 'Суточный удой, кг', path: 'dailyYield', need: true },
      { title: 'Номер лактации', path: 'lactationNumber', need: true },
      { title: 'Жир, %', path: 'fatPercent' },
      { title: 'Белок, %', path: 'proteinPercent' },
      { title: 'Соматические клетки', path: 'somaticCells' },
      { title: 'Лаборатория', path: 'laboratory' },
    ],
  )

  /*
   * Лактации лежат массивом внутри карточки, а строкой выгрузки является
   * одна лактация. Поэтому они разворачиваются в плоский список — иначе
   * доля считалась бы по животным, а ФГИАС принимает по лактациям,
   * и корова с четырьмя лактациями, у которой заполнена одна, выглядела
   * бы полностью готовой.
   */
  const lactations: Row[] = []
  for (const a of animals) {
    const list = a.lactations
    if (Array.isArray(list)) for (const l of list) lactations.push(l as Row)
  }

  report(
    'Лактация: молочная продуктивность',
    'Строка — одна лактация, а не одно животное.',
    lactations,
    [
      { title: 'Номер лактации', path: 'number', need: true },
      { title: 'Дата отёла', path: 'calvingDate', need: true },
      { title: 'Дней', path: 'dd', need: true },
      { title: 'Удой, кг', path: 'milkYield', need: true },
      { title: 'Удой 305, кг', path: 'milk305' },
      { title: 'Жир, %', path: 'fat305' },
      { title: 'Жир, кг', path: 'fatKg' },
      { title: 'Белок, %', path: 'protein305' },
      { title: 'Белок, кг', path: 'proteinKg' },
    ],
  )

  report(
    'Корова: линейная оценка',
    'Четырнадцать признаков из семнадцати совпадают дословно — мерим их заполненность.',
    exteriors,
    [
      { title: 'Животное', path: 'animal', need: true },
      { title: 'Дата оценки', path: 'assessedAt', need: true },
      { title: 'Номер отёла (лактация)', path: 'lactation' },
      { title: 'Оценщик', path: 'assessor' },
      { title: 'Рост', path: 'height', need: true },
      { title: 'Глубина туловища', path: 'bodyDepth', need: true },
      { title: 'Положение таза', path: 'rumpAngle', need: true },
      { title: 'Ширина таза', path: 'rumpWidth', need: true },
      { title: 'Ширина груди', path: 'chestWidth', need: true },
      { title: 'Угол копыта', path: 'hoofAngle', need: true },
      { title: 'Задние ноги сбоку', path: 'rearLegsSide', need: true },
      { title: 'Задние ноги сзади', path: 'rearLegsRear', need: true },
      { title: 'Передние доли вымени', path: 'foreUdder', need: true },
      { title: 'Глубина вымени', path: 'udderDepth', need: true },
      { title: 'Центральная связка', path: 'centralLigament', need: true },
      { title: 'Длина сосков', path: 'teatLength', need: true },
      { title: 'Передние соски', path: 'frontTeatPlacement', need: true },
      { title: 'Задние соски', path: 'rearTeatPlacement', need: true },
    ],
  )

  report(
    'Подтверждение владения',
    'Реквизиты собственника берутся из организации, здесь мерим само событие.',
    movements,
    [
      { title: 'Животное', path: 'animal', need: true },
      { title: 'Дата', path: 'date', need: true },
      { title: 'Вид движения', path: 'kind', need: true },
      { title: 'От кого', path: 'from' },
      { title: 'Кому', path: 'to', need: true },
      { title: 'Основание', path: 'basis' },
    ],
  )

  /* ---------------------------------------------------------------- */

  console.log(`\n${'─'.repeat(72)}`)
  console.log('Чего в книге нет вовсе — считать нечего, названо для полноты картины')
  console.log('')
  for (const s of [
    'Живая масса — взвешивание как повторяемое событие (есть только масса телёнка)',
    'Оценка типа телосложения коровы и быка — шкала 50–100',
    'Экстерьер молодняка — шкалы 1–3 и 1–4',
    'Наличие спермопродукции — семенной код, статус, собственник семени',
    'Участие в выставках — мероприятие, место, награды',
    'УНСМ и базовый uuid ФГИАС — полей нет, а без них выгрузка безадресна',
  ])
    console.log(`  · ${s}`)

  console.log('')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
