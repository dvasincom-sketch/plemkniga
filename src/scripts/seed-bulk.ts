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
 *  - отёлы, контрольные дойки, осеменения, случаи болезни по лактациям;
 *  - выбытие: дата и причина у тех, кто числится проданным, выбракованным
 *    или павшим.
 *
 * Возраст задаётся в месяцах от дня прогона, а не календарным годом.
 * Книга заводится один раз, а живёт годами: даты вида «родился в 2022-м»
 * стареют вместе с календарём, и через три года в стаде не остаётся
 * ни одного животного моложе трёх лет. Отчёты по молодняку при этом
 * показывают не беду, а протухшую дату.
 *
 * Ничего не удаляет. Существующие записи остаются на месте, синтетика
 * добавляется рядом и опознаётся по префиксу индивидуального номера (`99`)
 * и по названию хозяйства. Удалить её потом можно одним `--drop`.
 *
 *   npm run seed:bulk -- --animals 280000        # сгенерировать
 *   npm run seed:bulk -- --animals 280000 --light # без событий, только карточки
 *   npm run seed:bulk -- --drop                   # убрать сгенерированное
 *
 * Отдельный небольшой набор — своей приставкой номера и своей подписью
 * хозяйств, чтобы убирался порознь от книги:
 *
 *   npm run seed:farm                             # 400 голов, одно хозяйство
 *   npm run seed:farm -- --drop                   # убрать только его
 *
 * Он собирается за секунды и нужен там, где книга не нужна: проверить
 * правку в отчёте, посмотреть страницу, прогнать проверки. Гонять ради
 * этого триста тысяч записей по двадцать минут — плата ни за что.
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

const text = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  const v = i === -1 ? null : process.argv[i + 1]
  return v && !v.startsWith('--') ? v : fallback
}

const TOTAL = arg('animals', 280_000)
const HERD_SIZE = arg('herd', 2_000)
const LIGHT = process.argv.includes('--light')
const DROP = process.argv.includes('--drop')

/**
 * Приставка номера и подпись хозяйств — доводами, а не константами.
 *
 * Книга на триста тысяч записей пересобирается двадцать минут, и гонять
 * её ради проверки одной правки незачем: то же самое видно на хозяйстве
 * в четыреста голов, которое собирается за секунды. Но два набора
 * синтетики должны убираться порознь, иначе маленький уносит большой.
 *
 * Разделяет их пара «приставка номера + подпись»: по первой узнаются
 * животные, по второй — хозяйства и фермы. Нужны обе. Приставка
 * защищает животных, но не хозяйство: `--drop` уже однажды снёс чужое
 * хозяйство, чьи животные при этом остались, и удаление упало внешним
 * ключом с сообщением не про то, что произошло.
 *
 * Второй генератор писать для этого не нужно и вредно: он стал бы
 * вторым определением того же стада — с другой кривой лактации, другими
 * возрастами и своими расхождениями, которые пришлось бы ловить
 * ещё одним прогоном.
 */
const PREFIX = text('tag', '99')
const LABEL = text('name', 'Синтетика')

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

/**
 * План отёлов коровы: даты, которые уже наступили.
 *
 * ## Почему он считается один раз и на двоих
 *
 * Число отёлов решалось внутри прохода по событиям, а карточка животного
 * заводилась раньше и об этом решении не знала. Отсюда шло расхождение
 * записи с самой собой: возрастная группа говорила «корова», отёлов
 * не было ни одного; продуктивность за 305 дней стояла у тёлки, которая
 * ещё не телилась. Проверка `production-before-calving` написана ровно
 * про второе и находила бы это у каждой второй записи книги.
 *
 * Теперь план строится до карточки и передаётся дальше: карточка знает,
 * сколько отёлов у животного будет, и не утверждает ничего сверх этого.
 *
 * ## Откуда сроки
 *
 * 24–30 месяцев до первого отёла — середина рамки правдоподобия
 * из `docs/vozrast-pervogo-otela.md`. 320–400 дней между отёлами —
 * заведомо больше стельности (270 в нашей рамке, около 279 в жизни).
 *
 * Без единого отёла остаётся двадцатая корова, а не четвёртая. Стояло
 * `int(0, 3)` — то есть каждая четвёртая корова любого возраста
 * не телилась ни разу, а отчёт «коровы без отёлов» означает «пробел
 * в данных, а не молодость стада» и при четверти книги перестаёт быть
 * находкой. Пять процентов — тот же приём, что с инбредными парами:
 * пример должен быть, потока быть не должно.
 */
function plannedCalvings(birth: Date): Date[] {
  /*
   * До пяти отёлов, а не до трёх.
   *
   * С потолком в три группа «Четвёртая лактация и старше» в отчёте
   * по структуре стада была пуста всегда: не потому, что стадо молодое,
   * а потому что таких коров сид не заводил вовсе. Пустая строка
   * в отчёте читается как утверждение о стаде, а была утверждением
   * о генераторе.
   *
   * Возраст ограничивает число отёлов сам: те, что не поместились
   * до сегодняшнего дня, отсекаются ниже. Молодой корове пять
   * не достанется при всём желании.
   */
  const planned = chance(0.05) ? 0 : int(1, 5)
  const now = Date.now()
  const out: Date[] = []

  let at = birth.getTime() + int(730, 913) * 86_400_000
  for (let l = 1; l <= planned; l++) {
    if (l > 1) at += int(320, 400) * 86_400_000
    // Отёл, до которого корова ещё не дожила, не случился
    if (at > now) break
    out.push(new Date(at))
  }
  return out
}

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
  for (const t of ['animals_dna_tests', 'animals_lactations']) {
    const r = await client.query(`delete from "${t}" where _parent_id in (${scope})`)
    if (r.rowCount) console.log(`  ${t}: ${r.rowCount}`)
  }

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

  /*
   * Убираются только те хозяйства, которые завёл этот скрипт.
   *
   * Стояло `name like 'Синтетика%'` — и уборка сносила заодно
   * «Синтетика — стенд проверок», заведённый `seed:flaws`. Его животные
   * при этом оставались: у них своя приставка номера, под `scope`
   * они не попадают. Внешний ключ на владельца объявлен
   * `on delete set null` при `not null`, и удаление падало с текстом
   * «null value in column "owner_id" of relation "animals"» — сообщением
   * не про то, что произошло.
   *
   * Приставка номера защищает животных, но не хозяйство. Поэтому здесь
   * теперь точные имена, а не общее начало.
   */
  const herds = await client.query(`delete from herds where name like '${LABEL} — ферма № %'`)
  const orgs = await client.query(
    `delete from organizations o
      where o.name like '${LABEL} — хозяйство № %'
        and not exists (select 1 from animals a where a.owner_id = o.id)`,
  )
  console.log(`  herds: ${herds.rowCount}, organizations: ${orgs.rowCount}`)

  /*
   * Если у хозяйства остались животные — сказать об этом, а не падать
   * внешним ключом. Такое означает, что чьи-то записи завелись в нашем
   * хозяйстве, и решать это должен человек.
   */
  const stuck = await client.query(
    `select o.name, count(a.id)::int as n
       from organizations o
       join animals a on a.owner_id = o.id
      where o.name like '${LABEL} — хозяйство № %'
      group by o.name`,
  )
  for (const r of stuck.rows ?? []) {
    console.log(`  ! ${(r as { name?: unknown }).name}: осталось животных ${(r as { n?: unknown }).n} — хозяйство не убрано`)
  }

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
  /** Причины выбытия: без них выбывшее животное противоречит само себе. */
  disposalReasons: number[]
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
  const disposalReasons = (
    await client.query<{ id: number }>('select id from disposal_reasons limit 20')
  ).rows.map((r) => r.id)

  const needHerds = Math.ceil(TOTAL / HERD_SIZE)
  const needOrgs = Math.max(1, Math.ceil(needHerds / 4))

  const orgRows: unknown[][] = []
  for (let i = 0; i < needOrgs; i++) {
    orgRows.push([
      `${LABEL} — хозяйство № ${i + 1}`,
      `${LABEL.slice(0, 4)}-${i + 1}`,
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
      `${LABEL} — ферма № ${i + 1}`,
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
  if (!disposalReasons.length) {
    console.log('Справочник причин выбытия пуст — выбывшие останутся без причины (npm run seed)')
  }
  return { client, orgs, herds, breeds, healthTypes, dnaTypes, disposalReasons }
}

const ANIMAL_COLUMNS = [
  'ident_number', 'id_format', 'uuid', 'name', 'name_latin', 'kind', 'sex', 'state',
  'disposal_date', 'disposal_reason_id',
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
  /**
   * Отёлы, которые у животного будут: решаются до карточки, чтобы
   * карточка не утверждала того, чего события не подтвердят.
   * У быков список пуст.
   */
  calvings: Date[]
  /**
   * Кровность по голштину. Считает вызывающая сторона: у потомка она
   * должна следовать из родительских, а родителей знает только тот,
   * кто строит родословную.
   */
  blood: number
}): { row: unknown[]; ipc: number; milk: number } {
  const { n, sex, birth, ctx, herdIndex, father, mother, inbreeding, calvings, blood } = opts
  const herd = ctx.herds[herdIndex % ctx.herds.length]!
  const male = sex === 'male'

  const milk = Math.round(gauss(8500, 1400, 3000, 15000))
  const fat = round(gauss(3.9, 0.3, 2.8, 5.6), 2)
  const protein = round(gauss(3.2, 0.2, 2.4, 4.2), 2)
  const fatKg = round((milk * fat) / 100, 1)
  const proteinKg = round((milk * protein) / 100, 1)
  const ipc = Math.round(gauss(100, 45, -80, 320))
  const name = male ? pick(BULL_NAMES) : pick(NAMES)
  const now = new Date()

  /* Дата оценки прижимается к сегодняшнему дню ниже, в самой строке:
     у молодняка «рождение плюс два года» приходится на будущее. */
  const evaluated = new Date(birth.getTime() + int(700, 1400) * 86_400_000)

  const ageMonths = (now.getTime() - birth.getTime()) / (30.4 * 86_400_000)

  /*
   * Возрастная группа выводится из возраста, а не тянется жребием.
   *
   * Стояло `pick(['heifer', 'firstCalf', 'cow2', 'cow3'])` — то есть
   * четырёхлетняя корова с тремя отёлами могла числиться тёлкой,
   * а годовалая тёлка коровой третьей лактации. Поле при этом читают
   * отчёты: «коровы без отёлов» отсекает по нему телят и тёлок, и жребий
   * означал, что отчёт считает по случайному признаку.
   *
   * Точного соответствия числу отёлов здесь всё равно нет — отёлы
   * раздаются потом, отдельным проходом, — но возрасту соответствие
   * есть, а отёлы следуют за возрастом. Оставшееся расхождение
   * (корова по возрасту, отёлов ноль) — это ровно то, что отчёт
   * «коровы без отёлов в книге» и должен находить: в жизни оно означает
   * не молодость стада, а пробел в данных.
   */
  /*
   * Возрастная группа — по числу отёлов, а не по жребию и не по возрасту.
   *
   * Стояло `pick(['heifer', 'firstCalf', 'cow2', 'cow3'])`: четырёхлетняя
   * корова с тремя отёлами могла числиться тёлкой, а годовалая тёлка —
   * коровой третьей лактации. Поле при этом читают отчёты: «коровы без
   * отёлов в книге» отбирает именно по нему.
   *
   * Возраст решает только там, где отёлов ещё нет: телёнок до года,
   * дальше тёлка. Отелившаяся становится коровой по номеру лактации —
   * ровно так, как это поле и понимают.
   *
   * Совпадения с фактом теперь не может не быть: план отёлов посчитан
   * до карточки и передан сюда, а проход по событиям пишет его же.
   */
  /*
   * Двадцатая взрослая без отёлов остаётся противоречивой намеренно.
   *
   * Полное согласие карточки с событиями делает две проверки
   * непроверяемыми: `no-calvings` («числится коровой, отёлов нет»)
   * и `production-before-calving` («у тёлки заполнен удой») перестают
   * находить что-либо вовсе. А написаны они не про выдуманный случай:
   * в жизни отёл случается и не попадает в книгу — доярка записала
   * в тетрадь, выгрузка до системы не дошла, — и признаком остаётся
   * либо возрастная группа, проставленная человеком, либо продуктивность,
   * приехавшая из доильного зала.
   *
   * Поэтому у части взрослых без отёлов остаётся ровно один из двух
   * следов недовнесённого отёла — тот же приём, что с инбредными парами
   * выше: пример должен быть, потока быть не должно.
   */
  const unrecordedCalving = !male && !calvings.length && ageMonths >= 34 && chance(0.2)
  const groupSaysCow = unrecordedCalving && chance(0.5)

  const ageGroup = male
    ? 'bull'
    : calvings.length === 0
      ? groupSaysCow
        ? 'cow2'
        : ageMonths < 12
          ? 'calf'
          : 'heifer'
      : calvings.length === 1
        ? 'firstCalf'
        : calvings.length === 2
          ? 'cow2'
          : 'cow3'

  /*
   * Продуктивность за 305 дней бывает только у отелившейся.
   *
   * До первого отёла лактации нет — доить нечем, — и проверка
   * `production-before-calving` написана ровно про это. Раньше сид
   * ставил удой, жир и белок каждой самке подряд, включая тёлок,
   * и находка была бы у каждой второй записи книги.
   *
   * Место в порядке по удою у недоившихся то же, что у быков:
   * не «ноль килограммов», а «не участвует».
   */
  const producing = !male && (calvings.length > 0 || (unrecordedCalving && !groupSaysCow))

  /*
   * Выбывшее животное получает дату и причину выбытия.
   *
   * Состояние выбиралось жребием — десятая часть книги числилась
   * проданной, выбракованной или павшей, — а `disposal_date`
   * не заполнялась вовсе. Отсюда две беды сразу.
   *
   * Первая: отчёт «выбытие за год» на синтетике всегда показывал ноль,
   * то есть самый дорогой для хозяйства отчёт нельзя было ни посмотреть,
   * ни проверить. Двадцать восемь тысяч выбывших животных не попадали
   * ни в одно число: в живых их нет, в выбытии их нет.
   *
   * Вторая: правило `state-vs-disposal` («выбыло, а причина не указана»)
   * срабатывало на всех них разом. Находки, которых заведомо десять
   * процентов книги, никто не читает — тот же довод, что был у инбридинга
   * в этом же файле.
   *
   * Часть выбытий приходится на последние двенадцать месяцев — иначе
   * годовой отчёт снова остался бы пустым, — остальные размазаны на три
   * года назад, но не раньше двух лет от рождения.
   */
  const state = chance(0.9) ? 'alive' : pick(['sold', 'culled', 'dead'])
  const gone = state !== 'alive'
  const maxAgo = Math.min(3 * 365, Math.max(1, (now.getTime() - birth.getTime()) / 86_400_000 - 730))
  const disposalDate = gone
    ? new Date(now.getTime() - int(1, Math.round(chance(0.4) ? Math.min(365, maxAgo) : maxAgo)) * 86_400_000)
    : null

  /*
   * Малая доля выбывших остаётся без причины намеренно. Правило
   * `state-vs-disposal` написано именно про такие записи, и книга,
   * в которой оно не срабатывает ни разу, не проверяет его, а молчит
   * о нём. Тот же приём, что с инбредными парами выше.
   */
  const disposalReason =
    gone && ctx.disposalReasons.length && chance(0.95) ? pick(ctx.disposalReasons) : null

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
      state,
      disposalDate,
      disposalReason,
      ageGroup,
      birth,
      ctx.breeds.length ? pick(ctx.breeds) : null,
      blood,
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
      producing ? milk : null,
      producing ? milk : -1_000_000, // summary_milk_rank
      producing ? fat : null,
      producing ? protein : null,
      producing ? fatKg : null,
      producing ? proteinKg : null,
      producing ? round(fatKg + proteinKg, 1) : null,
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
  /*
   * Возраст считается от дня прогона, а не календарным годом.
   *
   * Стояло `year(2014)` для быков, `year(2018)` для матерей и 2022–2024
   * для дочерей. Пока сид гоняли в тот же год, это работало; но книга
   * заводится один раз, а живёт годами, и синтетика стареет вместе
   * с календарём. К августу 2026-го самому молодому животному в книге
   * пошёл третий год: тёлок младше пятнадцати месяцев не осталось
   * ни одной, и отчёт по молодняку показывал «в передержке 2354 из 2354,
   * пора осеменять — ноль». Сто процентов передержки не бывает; это
   * не находка, а протухшая дата.
   *
   * Возраст в месяцах от сегодняшнего дня протухнуть не может.
   */
  const monthsAgo = (months: number, spread: number) =>
    new Date(Date.now() - Math.round(months * 30.44 + int(-spread, spread)) * 86_400_000)

  /* --- Поколение 1: быки-производители ---------------------------------- */

  const bullRows: unknown[][] = []
  /* Даты рождения быков нужны потом: туры оценки считаются от рождения. */
  const bullBirths: Date[] = []
  /*
   * Кровность быков и матерей — из распределения, кровность дочерей —
   * из родительских. Иначе `blood-vs-parents` находит расхождение
   * у каждой четырнадцатой записи: правило сверяет кровность потомка
   * с полусуммой родительских, а сид разыгрывал её независимо.
   */
  const bullBloods: number[] = []
  for (let i = 0; i < bulls; i++) {
    // Быки старше всех: десять лет с разбегом в год
    const birth = monthsAgo(120, 200)
    bullBirths.push(birth)
    const blood = round(gauss(93, 8, 50, 100), 1)
    bullBloods.push(blood)
    bullRows.push(
      animalRow({
        n: counter++,
        sex: 'male',
        birth,
        // Бык не телится: план пуст, продуктивности в карточке нет
        calvings: [],
        blood,
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
  /* План отёлов решается до карточки — им же потом пишутся события */
  const damCalvingPlans: Date[][] = []
  const damBloods: number[] = []
  const damBatch: unknown[][] = []
  for (let i = 0; i < dams; i++) {
    // Матери: шесть лет с разбегом в полгода — старше самой старшей дочери
    const birth = monthsAgo(72, 100)
    damBirths.push(birth)
    const damCalvings = plannedCalvings(birth)
    damCalvingPlans.push(damCalvings)
    const damBlood = round(gauss(93, 8, 50, 100), 1)
    damBloods.push(damBlood)
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
        calvings: damCalvings,
        blood: damBlood,
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
   * Дочери одной матери разносятся по возрасту, а не бросаются в общий
   * разбег дат.
   *
   * Матерей втрое меньше дочерей, то есть у каждой их две-три. Общий
   * разбег означал, что двое почти наверняка окажутся ближе друг к другу,
   * чем длится стельность, — а это уже не «синтетика», а невозможная
   * запись, на которую проверка `siblings-too-close` справедливо ругается.
   *
   * Отсюда привязка к очереди: старшая дочь, средняя, младшая.
   *
   * ## Почему возрасты именно такие
   *
   * **45 месяцев** — взрослая корова: два-три отёла позади.
   *
   * **32 месяца** — только что отелившаяся. Первый отёл здесь приходится
   * на 24–30 месяцев, и когорта поставлена заведомо позже верхней
   * границы: иначе половина её оказалась бы «в передержке» просто потому,
   * что срок отёла ещё не наступил. Передержка должна означать беду,
   * а не то, что мы неудачно выбрали дату.
   *
   * **4–16 месяцев** — ремонтный молодняк, и он единственный размазан
   * по возрасту, а не поставлен точкой. Ради него написана половина
   * отчётов, а границы там узкие: «растут» до 13 месяцев, «пора
   * осеменять» 13–15, дальше передержка. Точка любого возраста попала бы
   * ровно в одну группу из трёх и оставила бы две пустыми — а пустая
   * группа в отчёте читается как «таких у нас нет».
   *
   * Между младшей когортой и средней остаётся не меньше пятнадцати
   * месяцев, между средней и старшей — тринадцать. И то и другое
   * заметно больше стельности, на которую смотрит `siblings-too-close`.
   */
  const daughterBirth = (nth: number) =>
    nth === 0 ? monthsAgo(45, 30) : nth === 1 ? monthsAgo(32, 30) : monthsAgo(int(4, 16), 15)

  const daughterIds: number[] = []
  const daughterBirths: Date[] = []
  const daughterCalvingPlans: Date[][] = []
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
    const dCalvings = plannedCalvings(birth)
    daughterCalvingPlans.push(dCalvings)

    /*
     * Кровность дочери — полусумма родительских.
     *
     * Разбег ±0,4 п. п. на округление: правило допускает расхождение
     * до одной доли восьмой части (12,5 п. п.), и укладываться надо
     * с запасом, а не впритык.
     *
     * Каждая пятидесятая уходит за допуск намеренно. Правило написано
     * не про выдумку: перепутанный отец — обычная ошибка выгрузки,
     * и кровность первой её и выдаёт. Проверка без единого примера
     * не проверена ничем.
     */
    const parentBlood = (bullBloods[fatherIdx]! + damBloods[i % damIds.length]!) / 2
    const dBlood = round(
      Math.min(100, Math.max(50, parentBlood + (chance(0.02) ? int(14, 30) * (chance(0.5) ? 1 : -1) : gauss(0, 0.4)))),
      1,
    )

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
        calvings: dCalvings,
        blood: dBlood,
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

  await fillEvaluations(client, [
    ...bullIds.map((id, j) => ({ id, birth: bullBirths[j]! })),
    ...damIds.map((id, j) => ({ id, birth: damBirths[j]! })),
    ...daughterIds.map((id, j) => ({ id, birth: daughterBirths[j]! })),
  ])

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
        ...damIds.map((id, j) => ({ id, calvings: damCalvingPlans[j]! })),
        ...daughterIds.map((id, j) => ({ id, calvings: daughterCalvingPlans[j]! })),
      ],
      bullIds,
      ctx,
    )
    await syncSummaries(client)
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
async function fillEvaluations(client: PoolClient, ids: { id: number; birth: Date }[]) {
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

  for (const [i, { id, birth }] of ids.entries()) {
    const rounds = chance(0.4) ? int(2, 4) : 1
    const baseIpc = gauss(100, 45, -80, 320)

    /*
     * Туры оценки считаются от рождения животного, а не по календарю.
     *
     * Стояло `Date.UTC(2023 + r, …)`: год выбирался безотносительно
     * того, когда животное родилось. Пока в книге не было никого моложе
     * двух лет, это сходило с рук; с появлением младшей когорты тёлка,
     * родившаяся в этом году, получала бы оценку, выданную три года
     * назад, — то есть до собственного рождения.
     *
     * Первая оценка — через год после рождения (геномная), дальше
     * ежегодные туры. Дошедшие до будущего отсекаются.
     */
    for (let r = 0; r < rounds; r++) {
      const at = new Date(birth.getTime() + (365 + r * 365 + int(0, 60)) * 86_400_000)
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
      /* Экстерьер оценивают после первого отёла: не раньше двух лет. */
      const at = new Date(birth.getTime() + int(730, 1_100) * 86_400_000)
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
 * Продуктивность в карточке — из лучшей лактации, а не из своего розыгрыша.
 *
 * ## Зачем
 *
 * `summary_milk_yield` разыгрывался `gauss(8500, 1400)` независимо
 * от событий животного. То есть в книге жили три удоя сразу: замеры
 * контрольных доек, строка лактации и число в карточке — и ни одно
 * не следовало из другого. Расхождение такого рода не ловится ни одной
 * проверкой: каждое число по отдельности правдоподобно.
 *
 * Теперь карточка берёт наивысшую законченную лактацию — ту, что
 * показывают в свидетельстве, — и всё, что в ней стоит, посчитано
 * из тех же доек.
 *
 * ## Почему отдельным проходом, а не в самой карточке
 *
 * Карточка заводится до событий: на момент вставки лактаций ещё нет.
 * Считать их вперёд значило бы держать в памяти три миллиона замеров
 * ради одного числа на животное. Один `update` после — дешевле и точнее.
 *
 * ## Почему только синтетика
 *
 * `ident_number like '99%'` — граница, а не оптимизация. У настоящей
 * записи расхождение карточки с лактациями это находка для эксперта,
 * и переписать её «как правильно» значило бы стереть след ошибки
 * вместе с ошибкой.
 */
async function syncSummaries(client: PoolClient) {
  const best = await client.query(`
    update animals a
       set summary_milk_yield = b.milk305,
           summary_milk_rank = b.milk305,
           summary_fat_percent = b.fat305,
           summary_protein_percent = b.protein305,
           summary_fat_kg = b.fat_kg,
           summary_protein_kg = b.protein_kg,
           summary_fat_protein_sum = b.fat_kg + b.protein_kg
      from (
        select distinct on (l._parent_id)
               l._parent_id as id, l.milk305, l.fat305, l.protein305, l.fat_kg, l.protein_kg
          from animals_lactations l
         where l.milk305 is not null and l.milk305 > 0
         order by l._parent_id, l.milk305 desc
      ) b
     where a.id = b.id
       and a.ident_number like '${PREFIX}%'`)

  /*
   * Отелившиеся без единого замера остаются без продуктивности.
   *
   * Это корова, отелившаяся на днях: дойка ещё не приезжала, лактации
   * нет. Оставь ей разыгранное число — и в карточке стоял бы удой
   * за 305 дней у лактации, которой ещё нет.
   *
   * Условие «есть отёлы» здесь не для красоты: без него под уборку
   * попала бы намеренная посадка — тёлка с удоем, ради которой написана
   * проверка `production-before-calving`.
   */
  const cleared = await client.query(`
    update animals a
       set summary_milk_yield = null,
           summary_milk_rank = -1000000,
           summary_fat_percent = null,
           summary_protein_percent = null,
           summary_fat_kg = null,
           summary_protein_kg = null,
           summary_fat_protein_sum = null
     where a.ident_number like '${PREFIX}%'
       and a.summary_milk_yield is not null
       and exists (select 1 from calvings c where c.animal_id = a.id)
       and not exists (select 1 from animals_lactations l where l._parent_id = a.id)`)

  done(
    `Продуктивность карточек из лактаций: ${(best.rowCount ?? 0).toLocaleString('ru-RU')}, ` +
      `снято у отелившихся без замеров: ${(cleared.rowCount ?? 0).toLocaleString('ru-RU')} (${elapsed()} с)`,
  )
}

/**
 * События по лактациям: отёл, за ним дойки раз в месяц, осеменения, болезни.
 * Здесь основной объём строк — на каждую корову приходится до сорока записей,
 * и именно они делают карточку животного тяжёлой.
 */
async function fillEvents(
  client: PoolClient,
  cows: { id: number; calvings: Date[] }[],
  bulls: number[],
  ctx: Ctx,
) {
  const calvingCols = ['animal_id', 'number', 'date', 'result', 'milking_days', 'ease', 'calf_weight', 'updated_at', 'created_at']
  const milkCols = ['animal_id', 'date', 'lactation_number', 'daily_yield', 'fat_percent', 'protein_percent', 'somatic_cells', 'updated_at', 'created_at']
  const insCols = ['animal_id', 'bull_id', 'date', 'attempt_number', 'doses', 'lactation_number', 'updated_at', 'created_at']
  const healthCols = ['animal_id', 'type_id', 'date', 'severity', 'updated_at', 'created_at']
  const lactCols = [
    '_order', '_parent_id', 'id', 'number', 'calving_date', 'insemination_date',
    'dd', 'milk_yield', 'milk305', 'fat305', 'protein305', 'scc',
    'dry_off_date', 'fat_kg', 'protein_kg', 'end_date',
  ]

  let calvings: unknown[][] = []
  let milk: unknown[][] = []
  let ins: unknown[][] = []
  let health: unknown[][] = []
  let lacts: unknown[][] = []
  const counts = { calvings: 0, milk: 0, ins: 0, health: 0, lacts: 0 }
  const now = new Date()

  const flush = async () => {
    await insertMany(client, 'calvings', calvingCols, calvings)
    await insertMany(client, 'milk_tests', milkCols, milk)
    await insertMany(client, 'inseminations', insCols, ins)
    await insertMany(client, 'health_events', healthCols, health)
    await insertMany(client, 'animals_lactations', lactCols, lacts)
    counts.calvings += calvings.length
    counts.milk += milk.length
    counts.ins += ins.length
    counts.health += health.length
    counts.lacts += lacts.length
    calvings = []
    milk = []
    ins = []
    health = []
    lacts = []
  }

  for (const [i, cow] of cows.entries()) {
    const id = cow.id

    /*
     * Даты отёлов приходят готовыми, а не разыгрываются здесь.
     *
     * Разыгрывались — и карточка животного, заведённая раньше, об этом
     * розыгрыше не знала: возрастная группа и продуктивность за 305 дней
     * ставились наугад и противоречили собственным событиям записи.
     * Один розыгрыш на карточку и события — единственный способ, которым
     * запись не может разойтись сама с собой. Разбор — `plannedCalvings`.
     */
    for (const [k, calvingDate] of cow.calvings.entries()) {
      const l = k + 1

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
      const tests: { day: number; yield: number; fat: number; protein: number; scc: number }[] = []
      for (let m = 1; m <= 10; m++) {
        const at = new Date(calvingDate.getTime() + m * 30 * 86_400_000)
        if (at > now) break
        const t = m * 30
        const yield_ = peak * Math.pow(t / 60, 0.25) * Math.exp((1 - t / 60) * 0.32)
        const row = {
          day: t,
          yield: round(Math.max(2, yield_ + gauss(0, 1.5)), 1),
          fat: round(gauss(3.9, 0.35, 2.6, 5.8), 2),
          protein: round(gauss(3.2, 0.22, 2.4, 4.3), 2),
          /*
           * Соматика логнормальная, а не равномерная.
           *
           * Стояло `int(60, 900)` — и выше порога в 200 тысяч
           * оказывалось 83 % замеров. В жизни это 10-15 %: распределение
           * соматики скошено, у большинства коров она низкая, а высокие
           * значения редки и велики. Равномерный разброс делал сигнал
           * «скрытый мастит» массовым на всей книге — то есть беду,
           * выдуманную нами же, и ровно ту, от которой полоса сигналов
           * советует «сперва проверьте, все ли замеры приехали».
           *
           * Медиана 110 тысяч, выше порога — каждый шестой замер.
           */
          scc: Math.round(Math.exp(gauss(Math.log(110), 0.6, Math.log(10), Math.log(3000)))),
        }
        tests.push(row)
        milk.push([
          id, at, l, row.yield, row.fat, row.protein, row.scc, now, now,
        ])
      }

      /*
       * Строка лактации в карточке — из тех же доек, а не отдельным числом.
       *
       * До этого `animals_lactations` не заполнялась вовсе: сид писал
       * отёлы и контрольные дойки, а строку лактации — нет. Пять модулей
       * читают именно её, и все пять молчали на всей книге: удой
       * по группам лактаций, коровы с незакрытой лактацией, сравнение
       * дочерей быка, список на выбраковку и заслон полноты перед
       * верификацией. Отчёты были написаны, ни один не работал ни разу,
       * и молчали они правдоподобно.
       *
       * Удой за 305 дней считается методом контрольных доек (ICAR):
       * надой каждого замера умножается на длину отрезка до предыдущего.
       * Это ровно тот способ, который описан в `completeness.ts` и ради
       * которого там требуется шесть замеров, — и он же связывает строку
       * лактации с дойками намертво. Возьми мы сюда своё случайное число,
       * в книге появилось бы третье значение удоя, не сходящееся ни с
       * замерами, ни с карточкой.
       */
      if (tests.length) {
        const sinceCalving = (now.getTime() - calvingDate.getTime()) / 86_400_000
        const isLast = k === cow.calvings.length - 1
        /*
         * Лактация закончена, если за ней последовал отёл или прошло
         * заведомо больше 305 дней. Незакрытой остаётся только последняя
         * и только пока корова в ней, — иначе «коров с незакрытой
         * лактацией» стало бы всё стадо.
         */
        const finished = !isLast || sinceCalving >= 340
        const dd = finished ? 305 : Math.floor(Math.min(sinceCalving, 304))

        let prev = 0
        let milkKg = 0
        let fatKg = 0
        let proteinKg = 0
        let sccSum = 0
        for (const t of tests) {
          const upto = Math.min(t.day, dd)
          const span = upto - prev
          if (span > 0) {
            milkKg += t.yield * span
            fatKg += (t.yield * span * t.fat) / 100
            proteinKg += (t.yield * span * t.protein) / 100
            prev = upto
          }
          sccSum += t.scc
        }
        // Хвост от последнего замера до конца лактации — тем же надоем
        const tail = tests[tests.length - 1]!
        if (dd > prev) {
          const span = dd - prev
          milkKg += tail.yield * span
          fatKg += (tail.yield * span * tail.fat) / 100
          proteinKg += (tail.yield * span * tail.protein) / 100
        }

        const end = finished ? new Date(calvingDate.getTime() + 305 * 86_400_000) : null
        lacts.push([
          l,
          id,
          randomUUID(),
          l,
          calvingDate,
          new Date(calvingDate.getTime() + 81 * 86_400_000),
          dd,
          Math.round(milkKg),
          Math.round(milkKg),
          milkKg > 0 ? round((fatKg / milkKg) * 100, 2) : null,
          milkKg > 0 ? round((proteinKg / milkKg) * 100, 2) : null,
          Math.round(sccSum / tests.length),
          end,
          Math.round(fatKg),
          Math.round(proteinKg),
          end,
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
          `лактаций ${counts.lacts.toLocaleString('ru-RU')}, ` +
          `осеменений ${counts.ins.toLocaleString('ru-RU')} (${elapsed()} с)`,
      )
    }
  }

  done(
    `События: отёлов ${counts.calvings.toLocaleString('ru-RU')}, ` +
      `доек ${counts.milk.toLocaleString('ru-RU')}, ` +
      `лактаций ${counts.lacts.toLocaleString('ru-RU')}, ` +
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
    /*
     * Подсказка повторяет и приставку с подписью: без них человек,
     * пересобиравший маленькое хозяйство, скопировал бы команду
     * и снёс всю книгу.
     */
    const scope = PREFIX === '99' ? '' : ` --tag ${PREFIX} --name ${LABEL}`
    const command = DROP
      ? `${prefix} npm run seed:bulk -- --drop${scope}`
      : `${prefix} npm run seed:bulk -- --animals ${TOTAL}${LIGHT ? ' --light' : ''}${scope}`

    console.error(
      DROP
        ? '\nУдаление не подтверждено.\n\n' +
            'Скрипт уберёт из этой базы всю синтетику — животных с номерами\n' +
            `на «${PREFIX}» и хозяйства «${LABEL} — …» — вместе с их событиями,\n` +
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
