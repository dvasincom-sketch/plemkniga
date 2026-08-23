import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Синтетическое стадо промышленного размера.
 *
 * Зачем. Ассоциация агрегирует данные со всех хозяйств — это сотни тысяч
 * коров, а не двести записей сида. Многое, что на двухстах записях работает
 * мгновенно, на трёхстах тысячах перестаёт работать вовсе: сортировка
 * по профилю индекса, поиск по подстроке, обход родословной, расчёт
 * процентиля. Узнать об этом лучше на своей машине, чем от пользователя.
 *
 * Почему мимо Payload. Через `payload.create` запись животного идёт со всеми
 * хуками, валидациями и пересчётом индекса — порядка десяти в секунду.
 * Триста тысяч в таком темпе — восемь часов. Здесь пакетный `INSERT`
 * многострочными значениями: тот же объём укладывается в минуты. Плата
 * за это — хуки не отработают, поэтому служебные поля (`ipc_rank`,
 * `summary_milk_rank`, `uuid`, `name_latin`) скрипт заполняет сам,
 * а значения индекса считает потом `npm run backfill:index`.
 *
 * Что генерируется:
 *
 *  - хозяйства и стада, если их не хватает;
 *  - животные тремя поколениями: быки-производители, их дочери, внучки —
 *    родословная связная, а не случайные ссылки, иначе обход предков
 *    упрётся в NULL на первом же уровне и ничего не измерит;
 *  - оценка и экстерьер в истории (`animal-evaluations`, `animal-exteriors`)
 *    плюс снимок в карточке — как это делает жизнь;
 *  - отёлы, контрольные дойки, осеменения, случаи болезни по лактациям.
 *
 * Ничего не удаляет. Существующие записи остаются на месте, синтетика
 * добавляется рядом и опознаётся по префиксу индивидуального номера (`99`)
 * и по названию хозяйства. Удалить её потом можно одним `--drop`.
 *
 *   npm run seed:bulk -- --animals 280000        # сгенерировать
 *   npm run seed:bulk -- --animals 280000 --light # без событий, только карточки
 *   npm run seed:bulk -- --drop                   # убрать сгенерированное
 *
 * Значения признаков берутся из нормального распределения с параметрами,
 * близкими к голштинской популяции: удой 8 500 ± 1 400 кг, жир 3,9 ± 0,3 %,
 * белок 3,2 ± 0,2 %. Это не имитация настоящей генетики — потомки не
 * наследуют признаки родителей, — но для нагрузки важны объём и разброс,
 * а не биологическая правда.
 */

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = Number(process.argv[i + 1])
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback
}

const TOTAL = arg('animals', 280_000)
const HERD_SIZE = arg('herd', 2_000)
const LIGHT = process.argv.includes('--light')
const DROP = process.argv.includes('--drop')

/**
 * Сколько строк накапливать перед записью. Больше — меньше запросов,
 * но выше память под массив значений.
 */
const CHUNK = 2_000

/*
 * Жёсткий предел протокола PostgreSQL: не больше 65 535 параметров в одном
 * запросе. При тридцати пяти колонках это чуть меньше двух тысяч строк,
 * поэтому размер пачки считается от числа колонок, а не берётся на глаз.
 * Первый прогон на 280 тысячах уткнулся ровно в это: «bind message has
 * 4464 parameter formats but 0 parameters» — сообщение, по которому
 * причину не угадать.
 */
const MAX_PARAMS = 60_000

/** Префикс индивидуального номера: по нему синтетика узнаётся и удаляется. */
const PREFIX = '99'

const pool = new Pool({ connectionString: driverUri, ssl: sslConfig, max: 4 })

/* ------------------------------ Случайности ------------------------------- */

/*
 * Свой генератор с фиксированным зерном, а не Math.random. Два прогона
 * с одними параметрами дают одинаковое стадо — значит, замер до правки
 * и после сравнивают одно и то же, а не два разных стада.
 */
let seed = 20260816
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

/** Нормальное распределение (Бокс — Мюллер), обрезанное по краям. */
const gauss = (mean: number, sd: number, min?: number, max?: number) => {
  const u = Math.max(rnd(), 1e-9)
  const v = rnd()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  let x = mean + z * sd
  if (min !== undefined) x = Math.max(min, x)
  if (max !== undefined) x = Math.min(max, x)
  return x
}

const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1))
const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]!
const chance = (p: number) => rnd() < p
const round = (v: number, digits = 2) => Number(v.toFixed(digits))

const NAMES = [
  'Астра', 'Берёзка', 'Ветка', 'Голубка', 'Дымка', 'Ёлка', 'Жемчужина', 'Зорька',
  'Ива', 'Калина', 'Ласточка', 'Малина', 'Ночка', 'Осинка', 'Пеструшка', 'Ромашка',
  'Снежинка', 'Тучка', 'Умница', 'Фиалка', 'Хмелька', 'Царевна', 'Чайка', 'Ягодка',
]
const BULL_NAMES = [
  'Атлант', 'Витязь', 'Гранит', 'Дозор', 'Ермак', 'Жасмин', 'Зенит', 'Икар',
  'Кристалл', 'Лидер', 'Магнат', 'Норд', 'Орион', 'Пилот', 'Рубин', 'Сокол',
]

/** Индивидуальный номер РФ: префикс синтетики + порядковый номер до 12 цифр. */
const identOf = (n: number) => PREFIX + String(n).padStart(10, '0')

/* -------------------------------- Прогресс -------------------------------- */

const started = Date.now()
const elapsed = () => ((Date.now() - started) / 1000).toFixed(0)

let lastLine = ''
const progress = (text: string) => {
  if (text === lastLine) return
  lastLine = text
  process.stdout.write(`\r\x1b[2K${text}`)
}
const done = (text: string) => {
  process.stdout.write(`\r\x1b[2K${text}\n`)
  lastLine = ''
}

/* ------------------------------ Пакетный INSERT --------------------------- */

/**
 * Вставка пачкой: один запрос на CHUNK строк вместо CHUNK запросов.
 * Значения подставляются параметрами, а не склейкой строк, — не столько
 * ради безопасности (данные свои), сколько ради типов: PostgreSQL сам
 * разберётся, где число, где дата, а где NULL.
 */
async function insertMany(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  returning?: string,
): Promise<number[]> {
  if (!rows.length) return []

  const cols = columns.map((c) => `"${c}"`).join(', ')
  const ids: number[] = []
  const perQuery = Math.max(1, Math.floor(MAX_PARAMS / columns.length))

  for (let i = 0; i < rows.length; i += perQuery) {
    const slice = rows.slice(i, i + perQuery)
    const params: unknown[] = []
    const values = slice
      .map(
        (row) =>
          '(' +
          row
            .map((v) => {
              params.push(v)
              return `$${params.length}`
            })
            .join(', ') +
          ')',
      )
      .join(', ')

    const sql =
      `insert into "${table}" (${cols}) values ${values}` +
      (returning ? ` returning ${returning}` : '')
    const res = await client.query(sql, params)
    if (returning) for (const r of res.rows) ids.push(r.id as number)
  }

  return ids
}

/* --------------------------------- Уборка --------------------------------- */

async function drop(client: PoolClient) {
  console.log('Удаление синтетики…\n')

  /*
   * Порядок обратный порядку создания: сначала то, что ссылается на животных,
   * потом сами животные. Внешние ключи объявлены `ON DELETE SET NULL` при
   * `NOT NULL`, поэтому удалить животное, не убрав зависимые записи, нельзя
   * (разбор — в docs/refaktoring-bazy.md, раздел 3).
   */
  const scope = `select id from animals where ident_number like '${PREFIX}%'`

  for (const t of [
    'index_values',
    'milk_tests',
    'calvings',
    'inseminations',
    'health_events',
    'events',
    'animal_evaluations',
    'animal_exteriors',
    'access_requests',
  ]) {
    const r = await client.query(`delete from "${t}" where animal_id in (${scope})`)
    if (r.rowCount) console.log(`  ${t}: ${r.rowCount}`)
  }

  /*
   * Дочерние таблицы массивов Payload держат родителя в `_parent_id`,
   * а не в `animal_id`, поэтому в общий список они не попадают.
   * Каскад по ним, скорее всего, отработал бы и сам — но «скорее всего»
   * тут значит «пока схему не тронут», а `--drop` обязан убирать
   * синтетику полностью и сегодня, и после следующей миграции.
   */
  const dna = await client.query(`delete from animals_dna_tests where _parent_id in (${scope})`)
  if (dna.rowCount) console.log(`  animals_dna_tests: ${dna.rowCount}`)

  // Ссылки на быков-производителей из чужих осеменений
  await client.query(`update inseminations set bull_id = null where bull_id in (${scope})`)
  // Родительские ссылки внутри самой синтетики снимутся каскадом (nullable)
  await client.query(
    `update animals set father_id = null where father_id in (${scope}) and ident_number not like '${PREFIX}%'`,
  )
  await client.query(
    `update animals set mother_id = null where mother_id in (${scope}) and ident_number not like '${PREFIX}%'`,
  )

  const animals = await client.query(`delete from animals where ident_number like '${PREFIX}%'`)
  console.log(`  animals: ${animals.rowCount}`)

  const herds = await client.query(`delete from herds where name like 'Синтетика%'`)
  const orgs = await client.query(`delete from organizations where name like 'Синтетика%'`)
  console.log(`  herds: ${herds.rowCount}, organizations: ${orgs.rowCount}`)

  console.log(`\nГотово за ${elapsed()} с.`)
}

/* ------------------------------- Генерация -------------------------------- */

type Ctx = {
  client: PoolClient
  orgs: number[]
  herds: { id: number; org: number }[]
  breeds: number[]
  healthTypes: number[]
  /** Пусто, если справочник типов ДНК-тестов не заполнен: тогда тесты не генерируются. */
  dnaTypes: number[]
}

async function ensureScaffolding(client: PoolClient): Promise<Ctx> {
  const breeds = (await client.query<{ id: number }>('select id from breeds limit 5')).rows.map(
    (r) => r.id,
  )
  const healthTypes = (
    await client.query<{ id: number }>('select id from health_event_types limit 10')
  ).rows.map((r) => r.id)
  const dnaTypes = (
    await client.query<{ id: number }>('select id from dna_test_types limit 5')
  ).rows.map((r) => r.id)

  const needHerds = Math.ceil(TOTAL / HERD_SIZE)
  const needOrgs = Math.max(1, Math.ceil(needHerds / 4))

  const orgRows: unknown[][] = []
  for (let i = 0; i < needOrgs; i++) {
    orgRows.push([
      `Синтетика — хозяйство № ${i + 1}`,
      `Синт-${i + 1}`,
      'farm',
      'none',
      new Date(),
      new Date(),
    ])
  }
  const orgs = await insertMany(
    client,
    'organizations',
    ['name', 'short_name', 'type', 'membership', 'updated_at', 'created_at'],
    orgRows,
    'id',
  )

  const herdRows: unknown[][] = []
  for (let i = 0; i < needHerds; i++) {
    herdRows.push([
      `Синтетика — ферма № ${i + 1}`,
      orgs[i % orgs.length],
      new Date(),
      new Date(),
    ])
  }
  const herdIds = await insertMany(
    client,
    'herds',
    ['name', 'organization_id', 'updated_at', 'created_at'],
    herdRows,
    'id',
  )
  const herds = herdIds.map((id, i) => ({ id, org: orgs[i % orgs.length]! }))

  console.log(`Хозяйств создано: ${orgs.length}, ферм: ${herds.length}`)
  if (!dnaTypes.length) {
    console.log('Справочник типов ДНК-тестов пуст — тесты не генерируются (npm run seed)')
  }
  return { client, orgs, herds, breeds, healthTypes, dnaTypes }
}

const ANIMAL_COLUMNS = [
  'ident_number', 'id_format', 'uuid', 'name', 'name_latin', 'kind', 'sex', 'state',
  'age_group', 'birth_date', 'breed_id', 'blood_percent', 'owner_id', 'herd_id',
  'father_id', 'mother_id', 'trust_level', 'public_visible', 'public_details',
  'inbreeding', 'inbreeding_needs_approval', 'archived', 'for_sale',
  'ipc', 'ipc_rank', 'evaluation_date',
  'summary_milk_yield', 'summary_milk_rank', 'summary_fat_percent', 'summary_protein_percent',
  'summary_fat_kg', 'summary_protein_kg', 'summary_fat_protein_sum',
  'updated_at', 'created_at',
]

/** Одна карточка животного: значения в порядке ANIMAL_COLUMNS. */
function animalRow(opts: {
  n: number
  sex: 'male' | 'female'
  birth: Date
  ctx: Ctx
  herdIndex: number
  father: number | null
  mother: number | null
  /**
   * Коэффициент инбридинга, посчитанный вызывающей стороной по той
   * родословной, которую она же и строит. Не случайное число.
   */
  inbreeding: number
}): { row: unknown[]; ipc: number; milk: number } {
  const { n, sex, birth, ctx, herdIndex, father, mother, inbreeding } = opts
  const herd = ctx.herds[herdIndex % ctx.herds.length]!
  const male = sex === 'male'

  const milk = Math.round(gauss(8500, 1400, 3000, 15000))
  const fat = round(gauss(3.9, 0.3, 2.8, 5.6), 2)
  const protein = round(gauss(3.2, 0.2, 2.4, 4.2), 2)
  const fatKg = round((milk * fat) / 100, 1)
  const proteinKg = round((milk * protein) / 100, 1)
  const ipc = Math.round(gauss(100, 45, -80, 320))
  const name = male ? pick(BULL_NAMES) : pick(NAMES)
  const evaluated = new Date(birth.getTime() + int(700, 1400) * 86_400_000)
  const now = new Date()

  return {
    ipc,
    milk,
    row: [
      identOf(n),
      'rf',
      // uuid обычно ставит хук; здесь его нет, а поле уникально и обязательно
      `${'9'.repeat(8)}-0000-4000-8000-${String(n).padStart(12, '0')}`.slice(0, 36),
      name,
      name,
      male ? 'bull' : 'cow',
      sex,
      chance(0.9) ? 'alive' : pick(['sold', 'culled', 'dead']),
      male ? 'bull' : pick(['heifer', 'firstCalf', 'cow2', 'cow3']),
      birth,
      ctx.breeds.length ? pick(ctx.breeds) : null,
      round(gauss(93, 8, 50, 100), 1),
      herd.org,
      herd.id,
      father,
      mother,
      int(-1, 3),
      chance(0.6),
      chance(0.3),
      /*
       * Коэффициент приходит снаружи и соответствует построенной
       * родословной. Раньше здесь стояло `round(gauss(2.5, 2.2, 0, 30), 2)` —
       * случайное число со средним 2,5 % при родословной без общих предков,
       * то есть при настоящем коэффициенте, равном нулю.
       *
       * Ревизия проверок это и показала: `inbreeding-mismatch` срабатывала
       * на 78 % сверенных записей. Расхождение было настоящим — врал сид,
       * а не проверка. Но пользы от такого прогона нет никакой: находки,
       * которых заведомо 78 %, никто не читает, и настоящее расхождение
       * в них утонет.
       *
       * Отсюда правило: синтетика не обязана быть настоящей, но обязана
       * быть **непротиворечивой**. Число, которое противоречит соседнему
       * полю той же записи, ломает не красоту, а возможность что-либо
       * на этих данных проверить.
       */
      inbreeding,
      // Порог из хука коллекции: > 25 % требует ручного подтверждения.
      // Сид пишет прямым SQL, хука не будет — значение ставится здесь.
      inbreeding > 25,
      false,
      chance(0.05),
      ipc,
      ipc, // ipc_rank: обычно заполняет хук beforeChange
      evaluated > now ? now : evaluated,
      male ? null : milk,
      male ? -1_000_000 : milk, // summary_milk_rank
      male ? null : fat,
      male ? null : protein,
      male ? null : fatKg,
      male ? null : proteinKg,
      male ? null : round(fatKg + proteinKg, 1),
      now,
      now,
    ],
  }
}

async function generate(client: PoolClient) {
  console.log(`\nЦель: ${TOTAL.toLocaleString('ru-RU')} животных, ферма по ${HERD_SIZE}`)
  console.log(LIGHT ? 'Режим: только карточки и оценки\n' : 'Режим: полный, с событиями\n')

  const ctx = await ensureScaffolding(client)

  const offset =
    (
      await client.query<{ max: string | null }>(
        `select max(substring(ident_number from 3)::bigint)::text as max
           from animals where ident_number like '${PREFIX}%'`,
      )
    ).rows[0]?.max ?? '0'
  let counter = Number(offset) + 1

  /*
   * Три поколения. Быков мало и они старые — так и в жизни: один
   * производитель даёт тысячи дочерей. Пропорция задаёт форму родословной,
   * а форма и определяет, во что упрётся рекурсивный обход предков.
   */
  const bulls = Math.max(20, Math.round(TOTAL * 0.002))
  const dams = Math.round((TOTAL - bulls) * 0.3)
  const daughters = TOTAL - bulls - dams

  /*
   * Разбег дат подобран так, чтобы поколения не пересекались: самая поздняя
   * мать старше самой ранней дочери на два с лишним года. Первые версии
   * разбрасывали даты шире, и ревизия родословной честно нашла полторы тысячи
   * коров, отелившихся в тринадцать месяцев. Синтетика не обязана быть
   * настоящей, но обязана быть возможной — иначе на ней нельзя проверять
   * проверки.
   */
  const year = (y: number, spread: number) =>
    new Date(Date.UTC(y, int(0, 11), int(1, 28)) - int(0, spread) * 86_400_000)

  /* --- Поколение 1: быки-производители ---------------------------------- */

  const bullRows: unknown[][] = []
  for (let i = 0; i < bulls; i++) {
    bullRows.push(
      animalRow({
        n: counter++,
        sex: 'male',
        birth: year(2014, 400),
        ctx,
        herdIndex: i,
        father: null,
        mother: null,
        // Родителей нет — общих предков взяться неоткуда.
        inbreeding: 0,
      }).row,
    )
  }
  const bullIds = await insertMany(client, 'animals', ANIMAL_COLUMNS, bullRows, 'id')
  done(`Быки-производители: ${bullIds.length} (${elapsed()} с)`)

  /* --- Поколение 2: матери ---------------------------------------------- */

  const damIds: number[] = []
  const damBirths: Date[] = []
  const damBatch: unknown[][] = []
  for (let i = 0; i < dams; i++) {
    const birth = year(2018, 300)
    damBirths.push(birth)
    damBatch.push(
      animalRow({
        n: counter++,
        sex: 'female',
        birth,
        ctx,
        herdIndex: i,
        father: bullIds[i % bullIds.length]!,
        mother: null,
        // Известен один родитель: пути от общего предка не замыкаются.
        inbreeding: 0,
      }).row,
    )
    if (damBatch.length >= CHUNK * 5 || i === dams - 1) {
      damIds.push(...(await insertMany(client, 'animals', ANIMAL_COLUMNS, damBatch, 'id')))
      damBatch.length = 0
      progress(`Матери: ${damIds.length.toLocaleString('ru-RU')} из ${dams.toLocaleString('ru-RU')} (${elapsed()} с)`)
    }
  }
  done(`Матери: ${damIds.length.toLocaleString('ru-RU')} (${elapsed()} с)`)

  /* --- Поколение 3: дочери ---------------------------------------------- */

  /*
   * Каждая двадцатая дочь спаривается с отцом своей матери.
   *
   * Это не украшение и не небрежность. До сих пор родословная строилась
   * так, что общих предков не возникало вовсе, и настоящий коэффициент
   * инбридинга у всех до одного равнялся нулю. На таких данных проверить
   * `analyzeAncestry` нельзя ничем: расчёт, который всегда возвращает ноль,
   * и расчёт, который возвращает ноль потому, что инбридинга нет,
   * выглядят одинаково.
   *
   * Спаривание с отцом матери даёт ровно 25 % — величина известна заранее
   * и посчитана не нами, а учебником. Прогон `npm run audit:checks` теперь
   * сверяет два независимых расчёта одной величины: аналитический здесь
   * и обход девяти колен там. Расхождение будет означать ошибку в одном
   * из них, а не в данных.
   *
   * В жизни такое спаривание — происшествие, а не практика, и пять
   * процентов для него много. Но проверка написана именно ради этого
   * случая, и оставить её без единого примера значило бы не проверить.
   */
  const INBRED_EVERY = 20

  /*
   * Дочери одной матери разносятся по годам, а не бросаются в общий
   * разбег дат.
   *
   * Матерей втрое меньше дочерей, то есть у каждой их две-три. Общий
   * разбег в 640 дней означал, что двое почти наверняка окажутся ближе
   * друг к другу, чем длится стельность, — а это уже не «синтетика»,
   * а невозможная запись, на которую проверка `siblings-too-close`
   * справедливо ругается.
   *
   * Отсюда привязка к очереди: первая дочь матери рождается в 2022-м,
   * вторая в 2023-м, третья в 2024-м. Разбег ±40 дней внутри года
   * оставляет между соседними годами не меньше 285 дней — больше
   * стельности, но достаточно, чтобы даты не выглядели штампованными.
   */
  const daughterBirth = (nth: number) =>
    new Date(Date.UTC(2022 + nth, 6, 1) + int(-40, 40) * 86_400_000)

  const daughterIds: number[] = []
  const daughterBirths: Date[] = []
  const dBatch: unknown[][] = []
  for (let i = 0; i < daughters; i++) {
    const nBulls = bullIds.length
    const mother = damIds.length ? damIds[i % damIds.length]! : null

    /*
     * Отец матери известен по построению: матери заводились подряд
     * и получали `bullIds[j % bulls]`. Поэтому «отец матери» здесь
     * не запрашивается из базы, а вычисляется — сид не должен читать
     * то, что сам только что записал.
     */
    const mgsIdx = mother === null ? -1 : (i % damIds.length) % nBulls

    const wantInbred = mother !== null && i % INBRED_EVERY === 0
    let fatherIdx = i % nBulls
    if (wantInbred) fatherIdx = mgsIdx
    else if (fatherIdx === mgsIdx) fatherIdx = (fatherIdx + 1) % nBulls

    /*
     * Отец совпал с отцом матери — спаривание отца с дочерью, F = 1/4.
     * Иначе общих предков нет и коэффициент равен нулю.
     */
    const coi = fatherIdx === mgsIdx ? 25 : 0

    const birth = daughterBirth(damIds.length ? Math.floor(i / damIds.length) : 0)
    daughterBirths.push(birth)

    dBatch.push(
      animalRow({
        n: counter++,
        sex: 'female',
        birth,
        ctx,
        herdIndex: i,
        father: bullIds[fatherIdx]!,
        mother,
        inbreeding: coi,
      }).row,
    )
    if (dBatch.length >= CHUNK * 5 || i === daughters - 1) {
      daughterIds.push(...(await insertMany(client, 'animals', ANIMAL_COLUMNS, dBatch, 'id')))
      dBatch.length = 0
      progress(`Дочери: ${daughterIds.length.toLocaleString('ru-RU')} из ${daughters.toLocaleString('ru-RU')} (${elapsed()} с)`)
    }
  }
  done(`Дочери: ${daughterIds.length.toLocaleString('ru-RU')} (${elapsed()} с)`)

  const all = [...bullIds, ...damIds, ...daughterIds]

  /* --- История оценок и экстерьера --------------------------------------- */

  await fillEvaluations(client, all)

  /*
   * ДНК-тесты — только тем, у кого в карточке есть родители.
   *
   * Быки первого поколения записаны без отца и матери, и тест
   * на происхождение для них — бессмыслица: подтверждать нечего.
   * Проставить им «подтверждено» значило бы наполнить книгу записями,
   * которые сама книга считает невозможными.
   */
  await fillDnaTests(client, ctx, [
    ...damIds.map((id, j) => ({ id, birth: damBirths[j]! })),
    ...daughterIds.map((id, j) => ({ id, birth: daughterBirths[j]! })),
  ])
  /*
   * События получают не только идентификаторы, но и даты рождения.
   *
   * Без них отёлы раскладывались по календарным годам, а не по возрасту
   * коровы: матери 2018 года рождения телились впервые в 2023-м, то есть
   * в пять лет. Проверка `afc-too-old` находила это у каждой седьмой
   * записи — и находила верно.
   */
  if (!LIGHT) {
    await fillEvents(
      client,
      [
        ...damIds.map((id, j) => ({ id, birth: damBirths[j]! })),
        ...daughterIds.map((id, j) => ({ id, birth: daughterBirths[j]! })),
      ],
      bullIds,
      ctx,
    )
  }

  console.log(`\nВсего животных добавлено: ${all.length.toLocaleString('ru-RU')} за ${elapsed()} с`)
  console.log(
    '\nДальше:\n' +
      '  npm run backfill:index      — посчитать значения индекса по профилям\n' +
      '  npm run db:precheck         — убедиться, что данные проходят ограничения',
  )
}

/**
 * ДНК-тесты на происхождение у части стада.
 *
 * ## Зачем это в нагрузочном сиде
 *
 * Отбор «Происхождение по ДНК» спрашивает не о наличии теста, а о его
 * выводе, и проверить такой отбор на данных, где вывода нет ни у кого,
 * нельзя: пустой ответ выглядит одинаково и когда отбор работает,
 * и когда он сломан. До этой правки во всей базе был ровно один
 * ДНК-тест — у показательной коровы сида, и тот без вывода.
 *
 * ## Почему исключения тоже генерируются
 *
 * Соблазн выдать всем «подтверждено» велик: тогда ни одна проверка
 * не сработает и отчёты будут чистыми. Но именно исключённое
 * происхождение — единственный случай, ради которого поле вывода
 * заводилось, и `dna-parentage-excluded` без него не проверить ничем.
 * Четыре процента — величина скромная: в настоящих стадах расхождение
 * заявленного отцовства с ДНК доходит до десяти и выше. На стаде
 * в 280 000 голов это примерно тысяча с небольшим находок
 * `dna-parentage-excluded` в ревизии — они там не по ошибке.
 *
 * Доля тестируемых (12 %) взята из того же соображения: тест платный,
 * его делают не всем, и отбор обязан оставаться отбором, а не
 * синонимом «все коровы».
 */
async function fillDnaTests(
  client: PoolClient,
  ctx: Ctx,
  animals: { id: number; birth: Date }[],
) {
  if (!ctx.dnaTypes.length) return

  const cols = ['id', '_order', '_parent_id', 'type_id', 'date', 'verdict', 'result']
  const VERDICTS = [
    { value: 'confirmed', result: 'Происхождение подтверждено', upTo: 0.93 },
    { value: 'excluded', result: 'Происхождение по отцу не подтверждено', upTo: 0.97 },
    { value: 'inconclusive', result: 'Материала недостаточно для вывода', upTo: 1 },
  ] as const

  let rows: unknown[][] = []
  let count = 0

  for (const a of animals) {
    if (!chance(0.12)) continue

    /*
     * Тест берут у взрослого животного, а не в день рождения: между
     * рождением и пробой — от полугода до трёх лет. Дата раньше
     * рождения провалила бы `sequence`-проверки, и синтетика начала бы
     * давать находки, которых в жизни не бывает.
     */
    const date = new Date(a.birth.getTime() + int(180, 1_100) * 86_400_000)
    if (date.getTime() > Date.now()) continue

    const roll = rnd()
    const v = VERDICTS.find((x) => roll < x.upTo) ?? VERDICTS[0]

    rows.push([randomUUID(), 1, a.id, pick(ctx.dnaTypes), date, v.value, v.result])
    count++

    if (rows.length >= CHUNK * 5) {
      await insertMany(client, 'animals_dna_tests', cols, rows)
      rows = []
      progress(`ДНК-тесты: ${count.toLocaleString('ru-RU')} (${elapsed()} с)`)
    }
  }

  if (rows.length) await insertMany(client, 'animals_dna_tests', cols, rows)
  done(`ДНК-тесты: ${count.toLocaleString('ru-RU')} (${elapsed()} с)`)
}

/**
 * История оценок: у части животных одна запись, у части — три-четыре.
 * Разброс нужен не для красоты: блок «как менялась оценка» в карточке
 * появляется только при двух и более записях, и без разброса его нельзя
 * будет посмотреть ни на одном животном.
 */
async function fillEvaluations(client: PoolClient, ids: number[]) {
  const evalCols = [
    'animal_id', 'evaluated_at', 'source', 'base_version', 'is_current',
    'ipc', 'ipc_r', 'ipc_percentile',
    'production_reliability_level', 'health_reliability_level',
    'milk_forecast', 'milk_r', 'fat_percent_forecast', 'fat_percent_r',
    'protein_percent_forecast', 'protein_percent_r',
    'udder_health_forecast', 'udder_health_r',
    'productive_longevity_forecast', 'productive_longevity_r',
    'updated_at', 'created_at',
  ]
  const extCols = [
    'animal_id', 'assessed_at', 'is_current', 'lactation',
    'height', 'chest_width', 'body_depth', 'body_type', 'rump_angle', 'rump_width',
    'udder_depth', 'rear_udder', 'central_ligament', 'fore_udder',
    'body_composite', 'udder_composite', 'legs_composite',
    'updated_at', 'created_at',
  ]

  let evalRows: unknown[][] = []
  let extRows: unknown[][] = []
  let evalCount = 0
  let extCount = 0
  const now = new Date()

  for (const [i, id] of ids.entries()) {
    const rounds = chance(0.4) ? int(2, 4) : 1
    const baseIpc = gauss(100, 45, -80, 320)

    for (let r = 0; r < rounds; r++) {
      const at = new Date(Date.UTC(2023 + r, int(0, 11), int(1, 28)))
      if (at > now) break
      const isCurrent = r === rounds - 1
      // Оценка уточняется: с каждым туром сдвиг меньше, достоверность выше
      const ipc = Math.round(baseIpc + gauss(0, 30 / (r + 1)))

      evalRows.push([
        id, at, r === 0 ? 'import' : 'center', `2026.${r + 1}`, isCurrent,
        ipc, Math.round(gauss(55 + r * 10, 12, 20, 99)), int(1, 99),
        int(1, 5), int(1, 5),
        Math.round(gauss(300, 700, -2500, 3000)), int(30, 95),
        round(gauss(0.02, 0.12, -0.6, 0.6), 3), int(30, 95),
        round(gauss(0.01, 0.08, -0.4, 0.4), 3), int(30, 95),
        round(gauss(0.3, 1.1, -3, 3), 2), int(30, 95),
        round(gauss(0.5, 1.5, -4, 4), 2), int(30, 95),
        now, now,
      ])
    }

    // Экстерьер оценивают не всем: быков по дочерям, коров по лактациям
    if (chance(0.55)) {
      const at = new Date(Date.UTC(2024 + int(0, 2), int(0, 11), int(1, 28)))
      const lin = () => round(gauss(0, 1.1, -3, 3), 1)
      extRows.push([
        id, at > now ? now : at, true, int(0, 3),
        lin(), lin(), lin(), lin(), lin(), lin(),
        lin(), lin(), lin(), lin(),
        lin(), lin(), lin(),
        now, now,
      ])
    }

    if (evalRows.length >= CHUNK * 3 || i === ids.length - 1) {
      await insertMany(client, 'animal_evaluations', evalCols, evalRows)
      await insertMany(client, 'animal_exteriors', extCols, extRows)
      evalCount += evalRows.length
      extCount += extRows.length
      evalRows = []
      extRows = []
      progress(`Оценки: ${evalCount.toLocaleString('ru-RU')} строк, экстерьер: ${extCount.toLocaleString('ru-RU')} (${elapsed()} с)`)
    }
  }

  done(`Оценки: ${evalCount.toLocaleString('ru-RU')} строк, экстерьер: ${extCount.toLocaleString('ru-RU')} (${elapsed()} с)`)
}

/**
 * События по лактациям: отёл, за ним дойки раз в месяц, осеменения, болезни.
 * Здесь основной объём строк — на каждую корову приходится до сорока записей,
 * и именно они делают карточку животного тяжёлой.
 */
async function fillEvents(
  client: PoolClient,
  cows: { id: number; birth: Date }[],
  bulls: number[],
  ctx: Ctx,
) {
  const calvingCols = ['animal_id', 'number', 'date', 'result', 'milking_days', 'ease', 'calf_weight', 'updated_at', 'created_at']
  const milkCols = ['animal_id', 'date', 'lactation_number', 'daily_yield', 'fat_percent', 'protein_percent', 'somatic_cells', 'updated_at', 'created_at']
  const insCols = ['animal_id', 'bull_id', 'date', 'attempt_number', 'doses', 'lactation_number', 'updated_at', 'created_at']
  const healthCols = ['animal_id', 'type_id', 'date', 'severity', 'updated_at', 'created_at']

  let calvings: unknown[][] = []
  let milk: unknown[][] = []
  let ins: unknown[][] = []
  let health: unknown[][] = []
  const counts = { calvings: 0, milk: 0, ins: 0, health: 0 }
  const now = new Date()

  const flush = async () => {
    await insertMany(client, 'calvings', calvingCols, calvings)
    await insertMany(client, 'milk_tests', milkCols, milk)
    await insertMany(client, 'inseminations', insCols, ins)
    await insertMany(client, 'health_events', healthCols, health)
    counts.calvings += calvings.length
    counts.milk += milk.length
    counts.ins += ins.length
    counts.health += health.length
    calvings = []
    milk = []
    ins = []
    health = []
  }

  for (const [i, cow] of cows.entries()) {
    const id = cow.id
    const lactations = int(0, 3)

    /*
     * Отёлы считаются от рождения коровы, а не от календаря.
     *
     * Раньше отёл номер `l` ставился в год `2022 + l` независимо от того,
     * когда корова родилась и когда телилась в прошлый раз. Отсюда две
     * невозможности сразу: первый отёл в пять лет у старших поколений
     * и межотельный интервал в несколько дней, когда прошлый отёл
     * приходился на декабрь, а следующий на январь.
     *
     * 24–30 месяцев до первого отёла — середина рамки правдоподобия
     * из `docs/vozrast-pervogo-otela.md`. 320–400 дней между отёлами —
     * заведомо больше стельности (270 в нашей рамке, около 279 в жизни).
     */
    let calvingDate = new Date(cow.birth.getTime() + int(730, 913) * 86_400_000)

    for (let l = 1; l <= lactations; l++) {
      if (l > 1) {
        calvingDate = new Date(calvingDate.getTime() + int(320, 400) * 86_400_000)
      }
      if (calvingDate > now) break

      calvings.push([
        id, l, calvingDate,
        pick(['heifer', 'bull', 'twins']),
        int(280, 340),
        pick(['easy', 'easy', 'assisted', 'hard']),
        int(28, 46),
        now, now,
      ])

      // Контрольные дойки раз в месяц: кривая лактации с пиком на 60-й день
      const peak = gauss(32, 6, 12, 60)
      for (let m = 1; m <= 10; m++) {
        const at = new Date(calvingDate.getTime() + m * 30 * 86_400_000)
        if (at > now) break
        const t = m * 30
        const yield_ = peak * Math.pow(t / 60, 0.25) * Math.exp((1 - t / 60) * 0.32)
        milk.push([
          id, at, l,
          round(Math.max(2, yield_ + gauss(0, 1.5)), 1),
          round(gauss(3.9, 0.35, 2.6, 5.8), 2),
          round(gauss(3.2, 0.22, 2.4, 4.3), 2),
          int(60, 900),
          now, now,
        ])
      }

      // Осеменения: первое через два месяца после отёла, иногда повторные
      const attempts = int(1, 3)
      for (let a = 1; a <= attempts; a++) {
        const at = new Date(calvingDate.getTime() + (60 + a * 21) * 86_400_000)
        if (at > now) break
        ins.push([id, pick(bulls), at, a, 1, l, now, now])
      }

      if (ctx.healthTypes.length && chance(0.25)) {
        const at = new Date(calvingDate.getTime() + int(5, 250) * 86_400_000)
        if (at <= now) {
          health.push([id, pick(ctx.healthTypes), at, pick(['mild', 'moderate', 'severe']), now, now])
        }
      }
    }

    if (milk.length >= CHUNK * 3 || i === cows.length - 1) {
      await flush()
      progress(
        `События: отёлов ${counts.calvings.toLocaleString('ru-RU')}, ` +
          `доек ${counts.milk.toLocaleString('ru-RU')}, ` +
          `осеменений ${counts.ins.toLocaleString('ru-RU')} (${elapsed()} с)`,
      )
    }
  }

  done(
    `События: отёлов ${counts.calvings.toLocaleString('ru-RU')}, ` +
      `доек ${counts.milk.toLocaleString('ru-RU')}, ` +
      `осеменений ${counts.ins.toLocaleString('ru-RU')}, ` +
      `болезней ${counts.health.toLocaleString('ru-RU')} (${elapsed()} с)`,
  )
}

/* --------------------------------- Запуск --------------------------------- */

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}`)

  /*
   * Защита от запуска не туда. Сид уже однажды стёр боевые данные, и с тех
   * пор всё, что пишет много, спрашивает подтверждение переменной окружения.
   * Этот скрипт ничего не удаляет, но триста тысяч записей в боевой базе —
   * тоже авария, просто другого рода.
   */
  if (process.env.SEED_CONFIRM !== '1') {
    /*
     * Подсказка повторяет ту команду, которую человек и запускал.
     *
     * Первая версия всегда предлагала команду генерации — даже тому,
     * кто просил `--drop`. Человек, пришедший освободить место, получал
     * совет насыпать ещё триста тысяч записей. Подсказка, которая советует
     * противоположное задуманному, хуже отсутствия подсказки: её копируют
     * не глядя, потому что она выглядит как ответ системы на твоё действие.
     */
    const prefix = `SEED_CONFIRM=1${
      process.env.DATABASE_URI ? ` DATABASE_URI='${maskUri(uri ?? '')}'` : ''
    }`
    const command = DROP
      ? `${prefix} npm run seed:bulk -- --drop`
      : `${prefix} npm run seed:bulk -- --animals ${TOTAL}${LIGHT ? ' --light' : ''}`

    console.error(
      DROP
        ? '\nУдаление не подтверждено.\n\n' +
            'Скрипт уберёт из этой базы всю синтетику — животных с номерами\n' +
            `на «${PREFIX}» и хозяйства «Синтетика — …» — вместе с их событиями,\n` +
            'оценками и значениями индекса. Настоящие записи не тронет.\n' +
            'Убедитесь, что строка подключения выше — та самая, и повторите:\n\n' +
            `  ${command}\n`
        : '\nЗапуск не подтверждён.\n\n' +
            'Скрипт добавит в эту базу до сотен тысяч записей. Убедитесь, что\n' +
            'строка подключения выше — это та база, которую вы хотите наполнить,\n' +
            'и повторите команду целиком:\n\n' +
            `  ${command}\n`,
    )

    if (process.env.DATABASE_URI) {
      console.error('Строку подключения подставьте настоящую: выше она с маской.\n')
    }

    process.exitCode = 1
    return
  }

  const client = await pool.connect()
  try {
    if (DROP) await drop(client)
    else await generate(client)
  } finally {
    client.release()
  }
}

main()
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
