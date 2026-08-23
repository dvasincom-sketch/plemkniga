import 'dotenv/config'
import { randomUUID } from 'crypto'
import { Pool } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Контрольное хозяйство: по одной заведомо испорченной записи на правило.
 *
 * ## Зачем
 *
 * Ревизия проверок (`npm run audit:checks`) показала, что тридцать девять
 * правил из сорока пяти не срабатывают ни разу. Это не значит «сломаны» —
 * значит, что в базе нет данных, на которых их видно, и о работоспособности
 * этих правил мы не знаем ничего. Различить «не сработала» и «работает,
 * но нечему срабатывать» машина не может: ей нужна запись, про которую
 * заранее известно, что она неверна.
 *
 * Отсюда и устройство: отдельное хозяйство, каждая запись сделана под своё
 * правило, и прогон по нему отвечает «поймала» или «не поймала» вместо
 * «данных нет».
 *
 * ## Почему прямой SQL, а не `payload.create`
 *
 * Половину этих записей коллекция создать не даст, и правильно делает:
 * `beforeValidate` в `Animals` не пропустит дату рождения в будущем,
 * самозачатие и родителя младше потомка. Через прикладной слой такие
 * данные в книгу не попадают.
 *
 * Но они в ней есть. Приходят импортом файла, приходят из чужой системы,
 * лежат с тех пор, когда правила не было. Проверка написана ровно для них,
 * и проверять её на данных, прошедших ту же валидацию, бессмысленно —
 * это проверка валидации, а не проверки.
 *
 * Побочное наблюдение, которое стоило записать: часть правил дублирует
 * запрет коллекции. На своей стороне мы их поймали дважды, но починить
 * чужие данные хук не может — только проверка.
 *
 * ## Идемпотентность
 *
 * Повторный запуск сносит прежнее контрольное хозяйство и заводит заново.
 * Удаление идёт своим SQL и только по этому хозяйству: `truncate`, которым
 * чистится демо-база, снёс бы всю книгу.
 *
 *   npm run seed:checks
 *   npm run audit:checks -- --org=<id>   # номер печатается в конце
 */

const ORG_NAME = 'Контрольное хозяйство (проверки)'
const ORG_INN = '0000000000'
const PREFIX = 'CHK-'

/** Столько «обычных» коров нужно, чтобы доли по стаду считались вообще. */
const FILLER = 40

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

const DAY = 86_400_000
const now = new Date()
const days = (n: number) => new Date(now.getTime() + n * DAY)
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

/* ------------------------------- Животные -------------------------------- */

const COLS = [
  'ident_number', 'id_format', 'uuid', 'name', 'kind', 'sex', 'state', 'age_group',
  'birth_date', 'breed_id', 'blood_percent', 'owner_id', 'herd_id',
  'father_id', 'mother_id', 'trust_level', 'public_visible', 'public_details',
  'inbreeding', 'archived', 'alt_ids_ear_tag',
  'pedigree_text_father_id', 'pedigree_text_mother_id',
  'disposal_date', 'disposal_reason_id',
  'summary_milk_yield', 'summary_fat_percent', 'summary_protein_percent', 'summary_fat_kg',
  'updated_at', 'created_at',
] as const

type Row = Partial<Record<(typeof COLS)[number], unknown>> & { ident_number: string }

type Ctx = { org: number; herd: number; breed: number | null; reason: number | null }

/**
 * Заготовка обычной коровы: всё в порядке, портим по одному полю.
 *
 * Жир в килограммах не лежит в заготовке константой, а считается из удоя
 * и процента жира уже после подстановки правок. Первый прогон это и показал:
 * наполнителю меняли удой, а 312 кг оставались от заготовки — и
 * `fat-kg-mismatch` сработала на тринадцати записях вместо одной. Находка
 * верная, но заведена не нами, а невнимательностью: в контрольном стаде
 * согласованными обязаны быть все поля, кроме одного испорченного нарочно.
 */
const base = (ctx: Ctx, n: number, over: Partial<Row> = {}): Row => derive({
  ident_number: `${PREFIX}${String(n).padStart(3, '0')}`,
  id_format: 'internal',
  uuid: randomUUID(),
  name: `Контрольная ${n}`,
  kind: 'cow',
  sex: 'female',
  state: 'alive',
  age_group: 'cow2',
  birth_date: ymd(2020, 3, 14),
  breed_id: ctx.breed,
  blood_percent: 90,
  owner_id: ctx.org,
  herd_id: ctx.herd,
  trust_level: 0,
  public_visible: false,
  public_details: false,
  archived: false,
  summary_milk_yield: 8000,
  summary_fat_percent: 3.9,
  summary_protein_percent: 3.2,
  // Жир в килограммах не пишется здесь: его досчитает `derive` из удоя
  // и процента — уже после того, как правка подставит свои значения.
  updated_at: now,
  created_at: now,
  ...over,
}, over)

/** Досчитать зависимые поля, если их не задали правкой явно. */
const derive = (row: Row, over: Partial<Row>): Row => {
  if (
    over.summary_fat_kg === undefined &&
    typeof row.summary_milk_yield === 'number' &&
    typeof row.summary_fat_percent === 'number'
  ) {
    row.summary_fat_kg = Math.round(row.summary_milk_yield * row.summary_fat_percent) / 100
  }
  return row
}

async function insertAnimals(rows: Row[]): Promise<number[]> {
  const values: unknown[] = []
  const tuples = rows.map((r, i) => {
    const start = i * COLS.length
    COLS.forEach((c) => values.push(r[c] ?? null))
    return `(${COLS.map((_, k) => `$${start + k + 1}`).join(', ')})`
  })

  const { rows: out } = await pool.query(
    `insert into animals (${COLS.map((c) => `"${c}"`).join(', ')})
     values ${tuples.join(', ')}
     returning id`,
    values,
  )
  return out.map((r) => Number(r.id))
}

/* -------------------------------- Очистка -------------------------------- */

async function wipe(org: number) {
  /*
   * Порядок здесь важен, и это тот самый порядок, из-за которого очистка
   * демо-базы через прикладной слой ломалась трижды. Разница в том, что
   * здесь список короткий и известен точно: контрольное хозяйство заводит
   * только эти таблицы и ничего больше — ни оценок, ни ревизий, ни грантов.
   */
  const ids = `(select id from animals where owner_id = ${org})`
  await pool.query(`delete from calvings_rels where parent_id in (select id from calvings where animal_id in ${ids})`)
  await pool.query(`delete from calvings where animal_id in ${ids}`)
  await pool.query(`delete from inseminations where animal_id in ${ids} or bull_id in ${ids}`)
  await pool.query(`delete from milk_tests where animal_id in ${ids}`)
  await pool.query(`delete from index_values where animal_id in ${ids}`)
  await pool.query(`delete from animals_dna_tests where _parent_id in ${ids}`)
  /*
   * Животные удаляются одним запросом, а не по одному, и это не оптимизация.
   * Они ссылаются друг на друга (отец, мать); при удалении по одному
   * внешний ключ отвергнет родителя, у которого потомок ещё жив.
   * Одна команда снимает весь набор разом, и ссылки внутри него
   * PostgreSQL проверяет по её завершении.
   */
  await pool.query(`delete from animals where owner_id = ${org}`)
}

/* ------------------------------- Наполнение ------------------------------ */

async function scaffolding(): Promise<Ctx> {
  /*
   * Явные ветвления вместо `??` с ожидаемым `number`.
   *
   * Цепочка `найти ?? создать` короче, но её тип TypeScript выводит как
   * «число или ничего»: возврат `pg` не обещает ни строки, ни колонки.
   * Проверка на `null` здесь не формальность — она превращает
   * «не завелось хозяйство» из молчаливого `null`, который всплывёт
   * пятью запросами позже чужой ошибкой, в понятный отказ на месте.
   */
  const idOf = async (q: string, p: unknown[] = []): Promise<number | null> => {
    const { rows } = await pool.query(q, p)
    const row = rows?.[0]
    return row ? Number(row.id) : null
  }

  let orgId = await idOf(`select id from organizations where inn = $1`, [ORG_INN])

  if (orgId === null) {
    /*
     * Без региона: поле — перечисление, служебного значения в нём нет,
     * а придумывать контрольному хозяйству настоящую область значило бы
     * подмешивать его в отчёты по регионам.
     */
    orgId = await idOf(
      `insert into organizations (name, short_name, inn, updated_at, created_at)
       values ($1, $2, $3, now(), now()) returning id`,
      [ORG_NAME, 'Контрольное', ORG_INN],
    )
  }

  if (orgId === null) throw new Error('Не удалось завести контрольное хозяйство')

  let herdId = await idOf(`select id from herds where organization_id = $1 limit 1`, [orgId])

  if (herdId === null) {
    herdId = await idOf(
      `insert into herds (name, organization_id, updated_at, created_at)
       values ($1, $2, now(), now()) returning id`,
      ['Контрольное стадо', orgId],
    )
  }

  if (herdId === null) throw new Error('Не удалось завести контрольное стадо')

  /*
   * Справочники необязательны: без породы и причины выбытия набор
   * заведётся, просто две проверки из сорока пяти останутся без данных.
   * Ронять из-за этого весь прогон незачем.
   */
  const one = async (table: string) =>
    idOf(`select id from ${table} limit 1`).catch(() => null)

  return {
    org: orgId,
    herd: herdId,
    breed: await one('breeds'),
    reason: await one('disposal_reasons'),
  }
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  const ctx = await scaffolding()
  await wipe(ctx.org)

  /* --- Опоры: здоровые отец и мать, чтобы `no-parents` не гремел у всех --- */

  const [sire, dam] = await insertAnimals([
    base(ctx, 900, {
      ident_number: `${PREFIX}SIRE`,
      name: 'Контрольный бык',
      kind: 'bull',
      sex: 'male',
      age_group: 'bull',
      /*
       * 2013 год, а не 2016. При 2016-м он оказывался моложе девятнадцати
       * месяцев на момент рождения почти всего наполнителя, и
       * `parent-age-implausible` срабатывала на сорока записях вместо одной.
       * Опорное животное обязано быть безупречным: находки заводятся
       * нарочно, а не побочно.
       */
      birth_date: ymd(2013, 5, 1),
      summary_milk_yield: null,
      summary_fat_percent: null,
      summary_protein_percent: null,
      summary_fat_kg: null,
    }),
    base(ctx, 901, {
      ident_number: `${PREFIX}DAM`,
      name: 'Контрольная мать',
      birth_date: ymd(2016, 8, 12),
    }),
  ])

  /*
   * По умолчанию у записи только отец, и это не небрежность.
   *
   * Общая мать у полусотни записей означала бы полсотни «братьев и сестёр»
   * с датами рождения вразнобой, и `siblings-too-close` загремела бы
   * на каждой паре, родившейся ближе стельности. Находка была бы верной
   * и совершенно бесполезной: контрольное хозяйство должно отвечать
   * «поймала или нет», а не тонуть в собственном шуме.
   *
   * Мать проставлена там, где её требует само правило.
   */
  const parents = { father_id: sire }

  /*
   * Дальше — по одной записи на правило. Номер в комментарии — код проверки,
   * которую запись обязана поднять; по нему её и искать, когда проверка
   * перестанет срабатывать.
   */
  const rows: Row[] = [
    // Паспорт
    base(ctx, 1, { ...parents, birth_date: null }),                                   // no-birth-date
    base(ctx, 2, { ...parents, birth_date: days(45) }),                               // birth-in-future
    base(ctx, 3, { ...parents, breed_id: null }),                                     // no-breed
    /*
     * Записи под `blood-out-of-range` и `self-parent` здесь нет, и это
     * не пропуск. База их не принимает: `chk_animals_blood_percent`
     * держит кровность в 0…100, `chk_animals_not_own_father` запрещает
     * животному быть своим отцом. Первый прогон этого скрипта на них
     * и остановился.
     *
     * Обходить ограничение, снимая его на время, — худшее из возможного:
     * мы бы проверили правило на данных, которых в этой базе не бывает,
     * и записали успех. Проверки помечены в реестре полем `dbGuard`,
     * и ревизия называет их недостижимыми, а не непроверенными.
     */
    base(ctx, 5, { ...parents, alt_ids_ear_tag: 'ДУБЛЬ-7' }),                         // duplicate-ear-tag
    base(ctx, 6, { ...parents, alt_ids_ear_tag: 'ДУБЛЬ-7' }),                         // duplicate-ear-tag

    // Происхождение
    /*
     * Матерью записан бык, а отца нет вовсе. Поставить обоих одним
     * животным нельзя: `chk_animals_parents_differ` требует, чтобы отец
     * и мать различались. Пустой отец при заполненной матери
     * `no-parents` не поднимает — она ищет отсутствие обоих.
     */
    base(ctx, 8, { father_id: null, mother_id: sire }),                                // parent-wrong-sex
    base(ctx, 9, { father_id: sire, birth_date: ymd(2013, 1, 1) }),                   // parent-younger
    base(ctx, 10, {}),                                                                // no-parents
    base(ctx, 11, { ...parents, pedigree_text_father_id: '77777777' }),               // pedigree-text-mismatch
    base(ctx, 12, { ...parents, mother_id: dam, blood_percent: 20 }),                  // blood-vs-parents
    base(ctx, 13, { ...parents, inbreeding: 40 }),                                    // high-inbreeding
    base(ctx, 14, { ...parents, inbreeding: 12 }),                                    // inbreeding-mismatch
    base(ctx, 15, { ...parents }),                                                    // pedigree-cycle (связь ниже)
    base(ctx, 16, { ...parents }),                                                    // pedigree-cycle (пара к 15)
    base(ctx, 17, { father_id: sire, birth_date: ymd(2014, 6, 1) }),                  // parent-age-implausible
    base(ctx, 18, { ...parents, mother_id: dam, birth_date: ymd(2021, 1, 10) }),      // siblings-too-close
    base(ctx, 19, { ...parents, mother_id: dam, birth_date: ymd(2021, 4, 15) }),      // siblings-too-close (пара к 18)
    base(ctx, 20, { ...parents }),                                                    // father-disposed-before (отец ниже)
    base(ctx, 21, { ...parents }),                                                    // dna-parentage-excluded

    // Воспроизводство — события заводятся ниже
    base(ctx, 22, { ...parents, birth_date: ymd(2021, 1, 10) }),                      // afc-too-young
    base(ctx, 23, { birth_date: ymd(2016, 1, 10) }),                                  // afc-too-old (отец ниже)
    base(ctx, 24, { ...parents }),                                                    // duplicate-first-calving
    base(ctx, 25, { ...parents }),                                                    // calving-order
    base(ctx, 26, { ...parents }),                                                    // calving-interval-short
    base(ctx, 27, { ...parents }),                                                    // calving-number-gap
    base(ctx, 28, { ...parents }),                                                    // duplicate-event
    base(ctx, 29, { ...parents }),                                                    // insemination-too-soon
    base(ctx, 30, { ...parents }),                                                    // pregnancy-check-before-insemination
    base(ctx, 31, { ...parents }),                                                    // bull-born-later
    base(ctx, 32, { ...parents }),                                                    // calf-birth-vs-calving
    base(ctx, 33, { ...parents }),                                                    // twins-mismatch
    base(ctx, 34, { ...parents }),                                                    // milk-test-outside-lactation

    // Продуктивность
    base(ctx, 35, { ...parents, summary_milk_yield: 90_000 }),                        // milk-implausible
    base(ctx, 36, { ...parents, summary_fat_percent: 9 }),                            // fat-implausible
    base(ctx, 37, { ...parents, summary_protein_percent: 0.4 }),                      // protein-implausible
    base(ctx, 38, { ...parents, summary_fat_kg: 90 }),                                // fat-kg-mismatch
    /*
     * Быку записали удой коровы. Пол при этом мужской, а `kind` — бык:
     * именно так выглядит перенос из таблицы, где пол лежал отдельной
     * колонкой и не совпал со строкой.
     */
    base(ctx, 60, {
      ...parents,
      kind: 'bull',
      sex: 'male',
      age_group: 'bull',
      birth_date: ymd(2018, 4, 2),
    }),                                                                               // bull-own-production

    // Состояние и выбытие
    /*
     * Без родителей намеренно: любой заведённый здесь бык моложе
     * животного 1996 года, и `parent-younger` сработала бы верно,
     * но не на том. Пустое происхождение поднимет `no-parents` —
     * та же находка, что у записи 10, и в отчёте это видно как счётчик,
     * а не как чужое правило.
     */
    base(ctx, 39, { birth_date: ymd(1996, 6, 1), state: 'alive' }),                   // too-old-alive
    base(ctx, 40, { ...parents, state: 'alive', disposal_reason_id: ctx.reason }),    // disposal-vs-state
    base(ctx, 41, { ...parents, state: 'sold', disposal_reason_id: null }),           // state-vs-disposal

    // По стаду
    base(ctx, 42, { ...parents, summary_milk_yield: 8 }),                             // units-mixed
    base(ctx, 43, { ...parents, summary_milk_yield: 9 }),                             // units-mixed
    base(ctx, 44, { ...parents, summary_milk_yield: 7 }),                             // units-mixed
    base(ctx, 45, { ...parents, summary_milk_yield: 26_000 }),                        // outlier-vs-herd
    /*
     * Восемь записей на первое января, а не четыре. Порог — доля выше пяти
     * процентов стада, и при сотне животных четыре записи дают ровно
     * четыре процента: проверка молчала бы, и молчала бы правильно,
     * а мы бы решили, что она сломана.
     */
    ...[2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023].map((y, k) =>
      base(ctx, 46 + k, { ...parents, birth_date: ymd(y, 1, 1) }),
    ),                                                                                // birth-date-clustered

    /*
     * Одно животное под двумя системами нумерации — заведённое дважды.
     *
     * Номера подобраны так, чтобы совпадение было именно цифровым,
     * а не текстовым: `CHK-880808231818` и `XXRUS880808231818` — разные
     * строки, и точное сравнение, на котором работает загрузка, их
     * не сведёт. Совпадает цифровое ядро — `880808231818`.
     *
     * Обе записи корректны сами по себе, и в этом весь смысл случая:
     * ни одна проверка по записи здесь ничего не найдёт, потому что
     * находить нечего — находка живёт между записями.
     *
     * Ведущий ноль во второй паре не украшение. `0000880808231818`
     * и `880808231818` — одно число, записанное Excel и не Excel;
     * если бы ядро не срезало ведущие нули, проверка молчала бы ровно
     * на том случае, ради которого чаще всего и нужна.
     */
    base(ctx, 61, { ...parents, ident_number: 'CHK-880808231818' }),                  // ident-core-shared
    base(ctx, 62, {
      ...parents,
      ident_number: 'XXRUS880808231818',
      id_format: 'rus',
    }),                                                                               // ident-core-shared
    /*
     * Тёлка с удоем. Заготовка уже несёт продуктивность, испорчена только
     * возрастная группа: до первого отёла лактации не бывает, и это
     * единственное, что здесь не так.
     */
    base(ctx, 65, { ...parents, age_group: 'heifer' }),                                // production-before-calving

    base(ctx, 63, { ...parents, ident_number: 'CHK-771122334455' }),                  // ident-core-shared
    base(ctx, 64, {
      ...parents,
      ident_number: 'CHK-INV-771122334455',
      alt_ids_ear_tag: '0000771122334455',
    }),                                                                               // ident-core-shared
  ]

  /*
   * Наполнитель. Проверки по стаду считают доли и молчат, пока записей
   * меньше двадцати: в стаде из шести любая доля — случайность. Заодно
   * половина удоев здесь кратна пятистам — это поднимает `values-rounded`.
   */
  for (let i = 0; i < FILLER; i++) {
    rows.push(
      base(ctx, 100 + i, {
        ...parents,
        /*
         * 2017 год, а не 2020: ниже этим животным заводятся отёлы 2019 года
         * ради проверки пропущенного года. Родиться после собственного
         * отёла они не могут — иначе половина находок будет про возраст
         * первого отёла, а не про то, ради чего запись заведена.
         */
        birth_date: ymd(2017, (i % 12) + 1, ((i * 7) % 27) + 1),
        summary_milk_yield: i % 2 === 0 ? 7500 + (i % 6) * 500 : 7412 + i * 13,
      }),
    )
  }

  const ids = await insertAnimals(rows)
  const at = (n: number) => ids[rows.findIndex((r) => r.ident_number === `${PREFIX}${String(n).padStart(3, '0')}`)]!

  /* ---- Связи, которые нельзя выставить при вставке: ссылки на себя ---- */

  await pool.query(`update animals set father_id = $2 where id = $1`, [at(15), at(16)])
  await pool.query(`update animals set father_id = $2 where id = $1`, [at(16), at(15)])

  /* Отец, выбывший задолго до зачатия: свой бык с датой выбытия. */
  const [goneSire] = await insertAnimals([
    base(ctx, 902, {
      ident_number: `${PREFIX}GONE`,
      name: 'Выбывший бык',
      kind: 'bull',
      sex: 'male',
      age_group: 'bull',
      birth_date: ymd(2014, 2, 1),
      state: 'culled',
      disposal_date: ymd(2017, 1, 1),
      disposal_reason_id: ctx.reason,
      summary_milk_yield: null,
      summary_fat_percent: null,
      summary_protein_percent: null,
      summary_fat_kg: null,
    }),
  ])
  await pool.query(`update animals set father_id = $2 where id = $1`, [at(20), goneSire])

  /*
   * Записи 23 отец достаётся тот же — не ради выбытия, а ради возраста.
   * Она рождена в 2016-м, и любой другой заведённый здесь бык её моложе:
   * `parent-younger` сработала бы верно, но помешала бы читать отчёт.
   * Родилась она до его выбытия, поэтому `father-disposed-before` молчит.
   */
  await pool.query(`update animals set father_id = $2 where id = $1`, [at(23), goneSire])

  /* Бык, родившийся позже осеменения. */
  const [youngBull] = await insertAnimals([
    base(ctx, 903, {
      ident_number: `${PREFIX}YOUNG`,
      name: 'Молодой бык',
      kind: 'bull',
      sex: 'male',
      age_group: 'bull',
      birth_date: ymd(2024, 6, 1),
      summary_milk_yield: null,
      summary_fat_percent: null,
      summary_protein_percent: null,
      summary_fat_kg: null,
    }),
  ])

  /* ------------------------------ ДНК-тест ------------------------------ */

  const dnaType = await pool
    .query(`select id from dna_test_types limit 1`)
    .then((r) => (r.rows[0] ? Number(r.rows[0].id) : null))
    .catch(() => null)

  await pool.query(
    `insert into animals_dna_tests ("_order", "_parent_id", "id", "type_id", "date", "verdict", "result")
     values (1, $1, $2, $3, $4, 'excluded', 'Происхождение по отцу не подтверждено')`,
    [at(21), randomUUID(), dnaType, ymd(2024, 5, 5)],
  )

  /* ------------------------------- Отёлы -------------------------------- */

  const calving = async (
    animal: number,
    number: number,
    date: Date,
    over: { result?: string; calves?: number[] } = {},
  ) => {
    const { rows: r } = await pool.query(
      `insert into calvings (animal_id, number, date, result, milking_days, updated_at, created_at)
       values ($1, $2, $3, $4, 305, now(), now()) returning id`,
      [animal, number, date, over.result ?? 'heifer'],
    )
    const id = Number(r[0].id)
    for (const [i, calf] of (over.calves ?? []).entries()) {
      await pool.query(
        `insert into calvings_rels ("order", parent_id, path, animals_id) values ($1, $2, 'calves', $3)`,
        [i, id, calf],
      )
    }
    return id
  }

  await calving(at(22), 1, ymd(2022, 4, 20))                        // afc-too-young: 15 мес.
  await calving(at(23), 1, ymd(2020, 3, 1))                         // afc-too-old: 50 мес.
  await calving(at(24), 1, ymd(2022, 5, 1))                         // duplicate-first-calving
  await calving(at(24), 1, ymd(2023, 6, 1))
  await calving(at(25), 1, ymd(2023, 5, 1))                         // calving-order
  await calving(at(25), 2, ymd(2022, 5, 1))
  await calving(at(26), 1, ymd(2022, 5, 1))                         // calving-interval-short
  await calving(at(26), 2, ymd(2022, 8, 20))
  await calving(at(27), 1, ymd(2022, 5, 1))                         // calving-number-gap
  await calving(at(27), 3, ymd(2024, 5, 1))
  await calving(at(29), 1, ymd(2023, 5, 1))                         // опора для insemination-too-soon
  await calving(at(32), 1, ymd(2023, 5, 1), { calves: [at(18)] })   // calf-birth-vs-calving
  await calving(at(33), 1, ymd(2023, 5, 1), { result: 'twins', calves: [at(19)] }) // twins-mismatch
  await calving(at(34), 1, ymd(2023, 5, 1))                         // опора для milk-test-outside-lactation

  /*
   * Год без единого отёла — 2021-й.
   *
   * Проверка молчит, пока отёлов меньше двадцати в год: у хозяйства
   * с двумя отёлами за десять лет «дыры» будут все восемь, и находка
   * сообщит ему, что оно маленькое, а не что оно что-то потеряло.
   *
   * Первый прогон её не поднял, и разбор оказался поучительным. Плотность
   * считается по всему промежутку между первым и последним отёлом стада,
   * а промежуток растянули **чужие** записи: отёл 2020 года у той, что
   * заведена под «слишком поздний первый отёл», и отёл 2024-го у той,
   * что заведена под пропуск в нумерации. Восемьдесят отёлов за четыре
   * года дали бы ровно двадцать, но за шесть лет — пятнадцать, и проверка
   * замолчала.
   *
   * Отсюда третий отёл наполнителю: сто двадцать отёлов на тот же
   * промежуток. Мораль общая — в наборе, где каждая запись заведена
   * под своё правило, записи всё равно считаются вместе.
   */
  for (let i = 0; i < FILLER; i++) {
    await calving(at(100 + i), 1, ymd(2019, (i % 12) + 1, 10))
    await calving(at(100 + i), 2, ymd(2022, (i % 12) + 1, 12))
    await calving(at(100 + i), 3, ymd(2024, (i % 12) + 1, 14))
  }

  /* ---------------------------- Осеменения ------------------------------ */

  const insem = async (animal: number, date: Date, over: { bull?: number; check?: Date } = {}) =>
    pool.query(
      `insert into inseminations (animal_id, bull_id, date, attempt_number, doses, pregnancy_check_date, source, updated_at, created_at)
       values ($1, $2, $3, 1, 1, $4, 'import', now(), now())`,
      [animal, over.bull ?? sire, date, over.check ?? null],
    )

  await insem(at(28), ymd(2023, 7, 1))                              // duplicate-event
  await insem(at(28), ymd(2023, 7, 1))
  await insem(at(29), ymd(2023, 5, 6))                              // insemination-too-soon: 5 дней
  await insem(at(30), ymd(2023, 7, 1), { check: ymd(2023, 6, 1) })  // pregnancy-check-before-insemination
  await insem(at(31), ymd(2023, 7, 1), { bull: youngBull })         // bull-born-later

  /* -------------------------- Контрольные дойки ------------------------- */

  const milk = async (animal: number, date: Date, source: string, yieldKg = 28) =>
    pool.query(
      `insert into milk_tests (animal_id, date, lactation_number, daily_yield, fat_percent, protein_percent, source, updated_at, created_at)
       values ($1, $2, 1, $3, 3.9, 3.2, $4, now(), now())`,
      [animal, date, yieldKg, source],
    )

  await milk(at(34), ymd(2021, 6, 1), 'lab')                        // milk-test-outside-lactation

  /*
   * Смешанные источники: лабораторные дойки плюс дойки со слов хозяйства.
   * Проверка молчит, если лабораторных нет вовсе — хозяйство, которое всё
   * ведёт само, ничего не смешивает.
   */
  for (let i = 0; i < 12; i++) await milk(at(100 + i), ymd(2022, (i % 12) + 1, 15), 'lab')
  for (let i = 12; i < 18; i++) await milk(at(100 + i), ymd(2022, (i % 12) + 1, 15), 'owner')

  /*
   * Пять свежих доек — ради проверки «коровы без доек за год».
   *
   * Без них все дойки контрольного стада старше года, находка сказала бы
   * «сорок из сорока», и по такому ответу нельзя отличить работающий
   * запрос от запроса, который просто считает всё стадо. Пять свежих
   * замеров делают ответ долей — то есть проверяемым.
   */
  for (let i = 0; i < 5; i++) await milk(at(100 + i), days(-30), 'lab')

  /* ----------------------- Индексы от разных баз ------------------------ */

  for (let i = 0; i < 10; i++) {
    await pool.query(
      `insert into index_values (animal_id, profile_key, profile_name, kind, base_version, value, computed_at, updated_at, created_at)
       values ($1, 'control', 'Контрольный профиль', 'selection', $2, $3, now(), now(), now())`,
      [at(100 + i), i < 5 ? '2024.1' : '2026.1', 100 + i],
    )
  }

  /* -------------------------------- Итог -------------------------------- */

  const total = await pool
    .query(`select count(*)::int as n from animals where owner_id = $1`, [ctx.org])
    .then((r) => Number(r.rows[0].n))

  console.log(`Контрольное хозяйство: № ${ctx.org}, животных ${total}\n`)
  console.log('Проверить, какие правила сработали:')
  console.log(`  npm run audit:checks -- --org=${ctx.org} --limit=200\n`)
  console.log('Правило, которого не окажется в таблице находок, не работает —')
  console.log('данные под него здесь заведены заведомо. Кроме перечисленных ниже.\n')

  const { guardedChecks } = await import('../lib/checks-registry')
  const guarded = guardedChecks()
  if (guarded.length) {
    console.log('Данных под эти правила здесь нет и быть не может:')
    for (const g of guarded) console.log(`  ${g.code} — не пускает ${g.dbGuard}`)
    console.log('')
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error('\nОшибка:\n  ' + (e instanceof Error ? e.message : String(e)) + '\n')
    await pool.end()
    process.exit(1)
  })
