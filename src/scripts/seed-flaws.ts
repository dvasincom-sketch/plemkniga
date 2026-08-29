import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Animal } from '@/payload-types'
import { checkAnimals } from '@/lib/data-checks'
import { herdIssues } from '@/lib/checks-herd'
import { ALL_CHECKS, guardedChecks } from '@/lib/checks-registry'
import { poolOf, type SqlPool } from '@/lib/sql'

/**
 * Хозяйство-стенд: записи, испорченные нарочно, по группе на каждое правило.
 *
 * ## Зачем
 *
 * Ревизия проверок (`audit:checks`) на чистой книге сообщает: сорок восемь
 * правил из пятидесяти трёх не сработали ни разу. Она честно оговаривает,
 * что это не «сломаны», а «данных, на которых их видно, в книге нет».
 * Оговорка верная и бесполезная: пятьдесят три правила написаны, четыре
 * проверены, о сорока восьми не известно ничего. Проверка, которую никогда
 * не запускали на подходящих данных, — это не проверка, а намерение.
 *
 * ## Почему отдельное хозяйство, а не брак вразброс по книге
 *
 * Соблазн был подсыпать испорченных записей в общую синтетику. Так делать
 * нельзя: ревизия печатает доли — «сработала на 7 % разобранных», — и по ним
 * решают, не врёт ли порог. Подмешанный брак делает эти доли выдуманными
 * нами же, и первый настоящий всплеск утонет в нашем фоне. Ровно эта беда
 * уже случалась дважды: инбридинг на 78 % и кровность на 7 %.
 *
 * Стенд стоит отдельным хозяйством с говорящим названием, и смотрят на него
 * отдельной командой:
 *
 *   npm run seed:flaws                 завести стенд
 *   npm run seed:flaws -- --drop       убрать
 *   npm run audit:checks -- --org=N    прогнать по нему все правила
 *
 * Общая ревизия при этом остаётся чистой: стенд — одно хозяйство из сорока,
 * и в долях по книге он теряется.
 *
 * ## Почему скрипт проверяет сам себя
 *
 * Посадить брак мало: надо знать, что правило его увидело. Поэтому после
 * посадки скрипт прогоняет по стенду тот же самый код проверок, что и
 * кабинет, и печатает таблицу «посажено — сработало». Несработавшая посадка
 * — находка, а не мелочь: она означает либо что правило не работает, либо
 * что мы неверно поняли, на что оно смотрит. И то и другое надо знать
 * до того, как эксперт положится на прогон.
 *
 * ## Почему прямым SQL
 *
 * Записи здесь заведомо неверные, а Payload на то и Payload, чтобы такие
 * не принимать: половина посадок не прошла бы валидацию, ради которой
 * они и заводятся. Поэтому вставка идёт мимо хуков, а читаются записи
 * потом уже через Payload — тем же путём, каким их читает кабинет.
 */

const DROP = process.argv.includes('--drop')

/** Приставка стенда: своя, не `99` — иначе `seed:bulk --drop` унесёт его с собой. */
const PREFIX = '98'
const ORG_NAME = 'Синтетика — стенд проверок'
const HERD_NAME = 'Синтетика — стенд проверок, ферма'

const DAY = 86_400_000
const now = new Date()
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY)
const yearsAgo = (n: number) => daysAgo(Math.round(n * 365.25))

let counter = 0
const identOf = () => PREFIX + String(++counter).padStart(10, '0')

/* ------------------------------ Учёт посадок ------------------------------ */

type Planted = { codes: string[]; what: string }
const planted: Planted[] = []

/* ------------------------------ Вставка строк ----------------------------- */

const insert = async (
  pool: SqlPool,
  table: string,
  row: Record<string, unknown>,
): Promise<number> => {
  const cols = Object.keys(row)
  const params = Object.values(row)
  const res = await pool.query(
    `insert into "${table}" (${cols.map((c) => `"${c}"`).join(', ')})
     values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     returning id`,
    params,
  )
  return Number((res.rows?.[0] as { id?: unknown })?.id ?? 0)
}

async function main() {
  const payload = await getPayload({ config })
  const pool = poolOf(payload)
  if (!pool) {
    console.log('\nПрямой доступ к базе недоступен\n')
    process.exit(1)
  }

  /* ------------------------------- Уборка -------------------------------- */

  const wipe = async () => {
    const org = await pool.query(`select id from organizations where name = $1`, [ORG_NAME])
    const orgId = Number((org.rows?.[0] as { id?: unknown })?.id ?? 0)
    if (!orgId) return { orgId: 0, animals: 0 }

    /*
     * Порядок обратный порядку создания. Родословную внутри стенда
     * приходится рвать отдельно: животные ссылаются друг на друга,
     * и внешние ключи не дадут удалить строку, на которую ссылается
     * соседняя.
     */
    await pool.query(
      `update animals set father_id = null, mother_id = null where owner_id = $1`,
      [orgId],
    )
    for (const t of [
      'calvings_rels',
      'calvings',
      'milk_tests',
      'inseminations',
      'animals_dna_tests',
      'animal_evaluations',
      'animals_lactations',
    ]) {
      const key =
        t === 'calvings_rels'
          ? `parent_id in (select id from calvings where animal_id in (select id from animals where owner_id = $1))`
          : t === 'animals_dna_tests' || t === 'animals_lactations'
            ? `_parent_id in (select id from animals where owner_id = $1)`
            : `animal_id in (select id from animals where owner_id = $1)`
      await pool.query(`delete from "${t}" where ${key}`, [orgId])
    }

    const del = await pool.query(`delete from animals where owner_id = $1`, [orgId])
    await pool.query(`delete from herds where organization_id = $1`, [orgId])
    await pool.query(`delete from organizations where id = $1`, [orgId])
    return { orgId, animals: del.rowCount ?? 0 }
  }

  if (DROP) {
    const done = await wipe()
    console.log(
      done.orgId
        ? `\nСтенд убран: хозяйство #${done.orgId}, животных ${done.animals}\n`
        : '\nСтенда нет — убирать нечего\n',
    )
    process.exit(0)
  }

  const before = await wipe()
  if (before.orgId) console.log(`\nПрежний стенд убран: животных ${before.animals}`)

  /* ------------------------------ Основание ------------------------------ */

  const orgId = await insert(pool, 'organizations', {
    name: ORG_NAME,
    short_name: 'Стенд проверок',
    type: 'farm',
    membership: 'none',
    updated_at: now,
    created_at: now,
  })
  const herdId = await insert(pool, 'herds', {
    name: HERD_NAME,
    organization_id: orgId,
    updated_at: now,
    created_at: now,
  })

  const breedRow = await pool.query(`select id from breeds order by id limit 1`)
  const breedId = Number((breedRow.rows?.[0] as { id?: unknown })?.id ?? 0) || null
  const reasonRow = await pool.query(`select id from disposal_reasons order by id limit 1`)
  const reasonId = Number((reasonRow.rows?.[0] as { id?: unknown })?.id ?? 0) || null
  const dnaTypeRow = await pool.query(`select id from dna_test_types order by id limit 1`)
  const dnaTypeId = Number((dnaTypeRow.rows?.[0] as { id?: unknown })?.id ?? 0) || null

  console.log(`Хозяйство-стенд #${orgId}, ферма #${herdId}\n`)

  /** Одна карточка со здоровыми значениями по умолчанию. */
  const animal = async (over: Record<string, unknown> = {}): Promise<number> =>
    insert(pool, 'animals', {
      ident_number: identOf(),
      id_format: 'rf',
      uuid: randomUUID(),
      name: 'Стенд',
      name_latin: 'Stend',
      kind: 'cow',
      sex: 'female',
      state: 'alive',
      age_group: 'cow2',
      birth_date: yearsAgo(4),
      breed_id: breedId,
      blood_percent: 93,
      owner_id: orgId,
      herd_id: herdId,
      trust_level: 1,
      public_visible: false,
      public_details: false,
      archived: false,
      updated_at: now,
      created_at: now,
      ...over,
    })

  const plant = async (codes: string[], what: string, fn: () => Promise<void>) => {
    await fn()
    planted.push({ codes, what })
  }

  /* ------------------------- Паспорт и жизненный цикл -------------------- */

  await plant(['no-birth-date'], 'дата рождения не заполнена', async () => {
    await animal({ birth_date: null })
  })

  await plant(['birth-in-future'], 'дата рождения на месяц вперёд', async () => {
    await animal({ birth_date: daysAgo(-30) })
  })

  await plant(['no-breed'], 'порода не выбрана', async () => {
    await animal({ breed_id: null })
  })

  await plant(['too-old-alive'], 'тридцать лет и числится живой', async () => {
    await animal({ birth_date: yearsAgo(30) })
  })

  await plant(['disposal-vs-state'], 'причина выбытия при состоянии «в стаде»', async () => {
    await animal({ state: 'alive', disposal_reason_id: reasonId, disposal_date: daysAgo(100) })
  })

  await plant(['state-vs-disposal'], 'выбыла, причина не указана', async () => {
    await animal({ state: 'culled', disposal_date: daysAgo(100), disposal_reason_id: null })
  })

  await plant(
    ['duplicate-ear-tag'],
    'один номер бирки у двух записей',
    async () => {
      await animal({ alt_ids_ear_tag: 'СТЕНД-0001' })
      await animal({ alt_ids_ear_tag: 'СТЕНД-0001' })
    },
  )

  /*
   * Совпадают не номера, а их цифры — и в разных полях карточки.
   *
   * Двумя одинаковыми основными номерами это не посадить: на
   * `ident_number` стоит уникальный индекс, и вторая вставка просто
   * не пройдёт. Правило смотрит шире: оно берёт все восемь полей-номеров
   * и сравнивает цифровые части. Настоящий случай выглядит именно так —
   * одно хозяйство записало животное основным номером, другое тот же
   * скот привезло инвентарным.
   */
  await plant(
    ['ident-core-shared'],
    'цифры основного номера повторены инвентарным у другой записи',
    async () => {
      const shared = identOf()
      await animal({ ident_number: shared })
      await animal({ alt_ids_inventory_number: shared })
    },
  )

  /* ------------------------------ Происхождение -------------------------- */

  await plant(['no-parents'], 'ни родителей, ни их номеров', async () => {
    await animal({ father_id: null, mother_id: null })
  })

  await plant(['parent-younger'], 'мать младше дочери', async () => {
    const mother = await animal({ birth_date: yearsAgo(1) })
    await animal({ birth_date: yearsAgo(4), mother_id: mother })
  })

  await plant(['parent-age-implausible'], 'матери было 15 месяцев при отёле', async () => {
    const mother = await animal({ birth_date: yearsAgo(5) })
    await animal({
      birth_date: new Date(yearsAgo(5).getTime() + 450 * DAY),
      mother_id: mother,
    })
  })

  await plant(['parent-wrong-sex'], 'отцом записана самка', async () => {
    const she = await animal({ sex: 'female', kind: 'cow', birth_date: yearsAgo(8) })
    await animal({ father_id: she })
  })

  await plant(['pedigree-cycle'], 'мать дочери — её собственная дочь', async () => {
    const a1 = await animal({ birth_date: yearsAgo(8) })
    const a2 = await animal({ birth_date: yearsAgo(5), mother_id: a1 })
    await pool.query(`update animals set mother_id = $1 where id = $2`, [a2, a1])
  })

  await plant(['siblings-too-close'], 'у одной матери двое с разницей в сто дней', async () => {
    const mother = await animal({ birth_date: yearsAgo(9) })
    await animal({ birth_date: daysAgo(900), mother_id: mother })
    await animal({ birth_date: daysAgo(800), mother_id: mother })
  })

  await plant(['father-disposed-before'], 'отец выбыл за два года до рождения', async () => {
    const father = await animal({
      sex: 'male',
      kind: 'bull',
      birth_date: yearsAgo(12),
      state: 'dead',
      disposal_date: daysAgo(1_600),
      disposal_reason_id: reasonId,
    })
    await animal({ birth_date: daysAgo(800), father_id: father })
  })

  await plant(['pedigree-text-mismatch'], 'номер отца в тексте не тот, что у связи', async () => {
    const father = await animal({ sex: 'male', kind: 'bull', birth_date: yearsAgo(12) })
    await animal({ father_id: father, pedigree_text_father_id: 'RU0000000000' })
  })

  await plant(['blood-vs-parents'], 'кровность на 30 п. п. мимо родительской', async () => {
    const father = await animal({ sex: 'male', kind: 'bull', birth_date: yearsAgo(12), blood_percent: 95 })
    const mother = await animal({ birth_date: yearsAgo(8), blood_percent: 95 })
    await animal({ father_id: father, mother_id: mother, blood_percent: 60 })
  })

  await plant(['high-inbreeding'], 'коэффициент инбридинга 30 %', async () => {
    const father = await animal({ sex: 'male', kind: 'bull', birth_date: yearsAgo(12) })
    await animal({ father_id: father, inbreeding: 30, inbreeding_needs_approval: true })
  })

  await plant(['inbreeding-mismatch'], 'заявлено 10 % при родословной без общих предков', async () => {
    const father = await animal({ sex: 'male', kind: 'bull', birth_date: yearsAgo(12) })
    const mother = await animal({ birth_date: yearsAgo(8) })
    await animal({ father_id: father, mother_id: mother, inbreeding: 10 })
  })

  await plant(['dna-parentage-excluded'], 'тест исключил происхождение, родители остались', async () => {
    const father = await animal({ sex: 'male', kind: 'bull', birth_date: yearsAgo(12) })
    const child = await animal({ father_id: father })
    await insert(pool, 'animals_dna_tests', {
      _order: 1,
      _parent_id: child,
      id: randomUUID(),
      type_id: dnaTypeId,
      date: daysAgo(200),
      verdict: 'excluded',
    })
  })

  /* ------------------------------ Продуктивность ------------------------- */

  await plant(['milk-implausible'], 'удой 40 000 кг', async () => {
    await animal({ summary_milk_yield: 40_000, summary_milk_rank: 40_000 })
  })

  await plant(['fat-implausible'], 'жир 8 %', async () => {
    await animal({ summary_fat_percent: 8 })
  })

  await plant(['protein-implausible'], 'белок 7 %', async () => {
    await animal({ summary_protein_percent: 7 })
  })

  await plant(['fat-kg-mismatch'], 'жир в кг вдвое мимо произведения', async () => {
    await animal({
      summary_milk_yield: 8_000,
      summary_fat_percent: 4,
      summary_fat_kg: 640, // ожидалось 320
    })
  })

  await plant(['bull-own-production'], 'у быка стоит собственный удой', async () => {
    await animal({
      sex: 'male',
      kind: 'bull',
      birth_date: yearsAgo(10),
      age_group: 'bull',
      summary_milk_yield: 9_000,
    })
  })

  await plant(['production-before-calving'], 'у тёлки заполнен удой', async () => {
    await animal({
      age_group: 'heifer',
      birth_date: yearsAgo(1.5),
      summary_milk_yield: 7_500,
    })
  })

  await plant(['eval-source-unnamed'], 'привезённая оценка без расчётного центра', async () => {
    await animal({ ipc_details_forecast: 120, ipc_details_center: null, ipc_details_base: null })
  })

  /* -------------------------------- Отёлы -------------------------------- */

  const withCalvings = async (
    over: Record<string, unknown>,
    rows: { number: number; date: Date; result?: string }[],
  ): Promise<number> => {
    const id = await animal(over)
    for (const r of rows) {
      await insert(pool, 'calvings', {
        animal_id: id,
        number: r.number,
        date: r.date,
        result: r.result ?? 'heifer',
        milking_days: 305,
        ease: 'easy',
        updated_at: now,
        created_at: now,
      })
    }
    return id
  }

  await plant(['afc-too-young'], 'первый отёл в пятнадцать месяцев', async () => {
    const birth = yearsAgo(4)
    await withCalvings({ birth_date: birth }, [
      { number: 1, date: new Date(birth.getTime() + 456 * DAY) },
    ])
  })

  await plant(['afc-too-old'], 'первый отёл в пять лет', async () => {
    const birth = yearsAgo(7)
    await withCalvings({ birth_date: birth }, [
      { number: 1, date: new Date(birth.getTime() + 1_830 * DAY) },
    ])
  })

  await plant(['duplicate-first-calving'], 'два отёла с номером 1', async () => {
    const birth = yearsAgo(5)
    await withCalvings({ birth_date: birth }, [
      { number: 1, date: new Date(birth.getTime() + 800 * DAY) },
      { number: 1, date: new Date(birth.getTime() + 1_200 * DAY) },
    ])
  })

  await plant(['calving-order'], 'второй отёл раньше первого', async () => {
    const birth = yearsAgo(6)
    await withCalvings({ birth_date: birth }, [
      { number: 1, date: new Date(birth.getTime() + 1_200 * DAY) },
      { number: 2, date: new Date(birth.getTime() + 800 * DAY) },
    ])
  })

  await plant(['calving-interval-short'], 'между отёлами двести дней', async () => {
    const birth = yearsAgo(6)
    await withCalvings({ birth_date: birth }, [
      { number: 1, date: new Date(birth.getTime() + 800 * DAY) },
      { number: 2, date: new Date(birth.getTime() + 1_000 * DAY) },
    ])
  })

  await plant(['calving-number-gap'], 'в ряду отёлов пропущен второй', async () => {
    const birth = yearsAgo(7)
    await withCalvings({ birth_date: birth }, [
      { number: 1, date: new Date(birth.getTime() + 800 * DAY) },
      { number: 3, date: new Date(birth.getTime() + 1_600 * DAY) },
    ])
  })

  await plant(['duplicate-event'], 'два одинаковых отёла в одну дату', async () => {
    const birth = yearsAgo(5)
    const at = new Date(birth.getTime() + 900 * DAY)
    await withCalvings({ birth_date: birth }, [
      { number: 1, date: at },
      { number: 2, date: at },
    ])
  })

  await plant(['twins-mismatch'], 'в отёле двойня, а телёнок записан один', async () => {
    const birth = yearsAgo(5)
    const mother = await withCalvings({ birth_date: birth }, [])
    const at = new Date(birth.getTime() + 900 * DAY)
    const calving = await insert(pool, 'calvings', {
      animal_id: mother,
      number: 1,
      date: at,
      result: 'twins',
      milking_days: 305,
      ease: 'easy',
      updated_at: now,
      created_at: now,
    })
    const calf = await animal({ birth_date: at, age_group: 'calf', mother_id: mother })
    await insert(pool, 'calvings_rels', {
      order: 1,
      parent_id: calving,
      path: 'calves',
      animals_id: calf,
    })
  })

  await plant(['calf-birth-vs-calving'], 'телёнок родился не в день отёла', async () => {
    const birth = yearsAgo(5)
    const mother = await animal({ birth_date: birth })
    const at = new Date(birth.getTime() + 900 * DAY)
    const calving = await insert(pool, 'calvings', {
      animal_id: mother,
      number: 1,
      date: at,
      result: 'heifer',
      milking_days: 305,
      ease: 'easy',
      updated_at: now,
      created_at: now,
    })
    const calf = await animal({
      birth_date: new Date(at.getTime() + 40 * DAY),
      age_group: 'calf',
      mother_id: mother,
    })
    await insert(pool, 'calvings_rels', {
      order: 1,
      parent_id: calving,
      path: 'calves',
      animals_id: calf,
    })
  })

  /* ------------------------- Осеменения и дойки -------------------------- */

  await plant(['insemination-too-soon'], 'осеменение через десять дней после отёла', async () => {
    const birth = yearsAgo(5)
    const at = new Date(birth.getTime() + 900 * DAY)
    const cow = await withCalvings({ birth_date: birth }, [{ number: 1, date: at }])
    await insert(pool, 'inseminations', {
      animal_id: cow,
      date: new Date(at.getTime() + 10 * DAY),
      attempt_number: 1,
      doses: 1,
      lactation_number: 1,
      updated_at: now,
      created_at: now,
    })
  })

  await plant(
    ['pregnancy-check-before-insemination'],
    'проверка стельности раньше самого осеменения',
    async () => {
      const cow = await animal({ birth_date: yearsAgo(5) })
      await insert(pool, 'inseminations', {
        animal_id: cow,
        date: daysAgo(200),
        pregnancy_check_date: daysAgo(240),
        attempt_number: 1,
        doses: 1,
        updated_at: now,
        created_at: now,
      })
    },
  )

  await plant(['bull-born-later'], 'бык родился после осеменения', async () => {
    const bull = await animal({ sex: 'male', kind: 'bull', birth_date: daysAgo(100) })
    const cow = await animal({ birth_date: yearsAgo(5) })
    await insert(pool, 'inseminations', {
      animal_id: cow,
      bull_id: bull,
      date: daysAgo(400),
      attempt_number: 1,
      doses: 1,
      updated_at: now,
      created_at: now,
    })
  })

  await plant(['milk-test-outside-lactation'], 'дойка раньше первого отёла', async () => {
    const birth = yearsAgo(5)
    const at = new Date(birth.getTime() + 900 * DAY)
    const cow = await withCalvings({ birth_date: birth }, [{ number: 1, date: at }])
    await insert(pool, 'milk_tests', {
      animal_id: cow,
      date: new Date(at.getTime() - 200 * DAY),
      lactation_number: 1,
      daily_yield: 25,
      fat_percent: 3.9,
      protein_percent: 3.2,
      somatic_cells: 150,
      source: 'lab',
      updated_at: now,
      created_at: now,
    })
  })

  /* --------------------------- Правила по стаду -------------------------- */

  /*
   * Проверки по стаду смотрят не на запись, а на картину: доли, разброс,
   * пропуски в ряду. Одной испорченной строкой их не поднять — нужен
   * узор, поэтому здесь заводятся десятки записей сразу.
   */

  await plant(['birth-date-clustered'], 'двадцать записей рождены первого января', async () => {
    for (let i = 0; i < 20; i++) {
      await animal({ birth_date: new Date(Date.UTC(now.getUTCFullYear() - 4, 0, 1)) })
    }
  })

  await plant(['values-rounded'], 'двадцать удоев кратны пятистам', async () => {
    for (let i = 0; i < 20; i++) {
      const milk = 6_000 + i * 500
      await animal({ summary_milk_yield: milk, summary_milk_rank: milk })
    }
  })

  await plant(['units-mixed'], 'часть удоев записана в тоннах', async () => {
    for (let i = 0; i < 10; i++) {
      await animal({ summary_milk_yield: 8 + i * 0.1, summary_milk_rank: 8 })
    }
  })

  await plant(['outlier-vs-herd'], 'удой втрое выше медианы стада', async () => {
    for (let i = 0; i < 3; i++) {
      await animal({ summary_milk_yield: 24_000, summary_milk_rank: 24_000 })
    }
  })

  await plant(['milk-test-source-mixed'], 'дойки стада из трёх разных источников', async () => {
    const birth = yearsAgo(5)
    const at = new Date(birth.getTime() + 900 * DAY)
    for (const src of ['lab', 'owner', 'import'] as const) {
      const cow = await withCalvings({ birth_date: birth }, [{ number: 1, date: at }])
      for (let m = 1; m <= 6; m++) {
        await insert(pool, 'milk_tests', {
          animal_id: cow,
          date: new Date(at.getTime() + m * 30 * DAY),
          lactation_number: 1,
          daily_yield: 24,
          fat_percent: 3.9,
          protein_percent: 3.2,
          somatic_cells: 140,
          source: src,
          updated_at: now,
          created_at: now,
        })
      }
    }
  })

  await plant(['index-base-mixed'], 'оценки стада ссылаются на разные базы', async () => {
    for (const base of ['2026.1', '2024.2'] as const) {
      const a = await animal({})
      await insert(pool, 'animal_evaluations', {
        animal_id: a,
        evaluated_at: daysAgo(300),
        source: 'center',
        base_version: base,
        is_current: true,
        ipc: 110,
        updated_at: now,
        created_at: now,
      })
    }
  })

  await plant(['event-year-gap'], 'в ряду лет отёлов пропущен целый год', async () => {
    const birth = yearsAgo(9)
    for (const yearsBack of [5, 4, 2, 1]) {
      await withCalvings({ birth_date: birth }, [{ number: 1, date: yearsAgo(yearsBack) }])
    }
  })

  await plant(['no-milk-tests-year'], 'дойные коровы без замеров за год', async () => {
    const birth = yearsAgo(6)
    for (let i = 0; i < 5; i++) {
      await withCalvings({ birth_date: birth }, [
        { number: 1, date: new Date(birth.getTime() + 800 * DAY) },
      ])
    }
  })

  console.log(`Посажено групп: ${planted.length}, записей: ${counter}\n`)

  /* ------------------------- Проверка самой посадки ---------------------- */

  const found = await payload.find({
    collection: 'animals',
    where: { owner: { equals: orgId } },
    limit: 1_000,
    depth: 1,
    overrideAccess: true,
  })

  const { issues } = await checkAnimals(payload, found.docs as Animal[])
  const herd = await herdIssues(payload, orgId)

  const fired = new Set<string>([
    ...issues.map((i) => i.code),
    ...herd.issues.map((i) => i.code),
  ])

  const wanted = [...new Set(planted.flatMap((p) => p.codes))]
  const missed = wanted.filter((c) => !fired.has(c))

  console.log('ПОСАЖЕНО И ПРОВЕРЕНО')
  for (const p of planted) {
    const ok = p.codes.every((c) => fired.has(c))
    console.log(`  ${ok ? '✓' : '✗'} ${p.codes.join(', ').padEnd(38)} ${p.what}`)
  }

  /*
   * Правила, до которых стенд не добрался, названы вслух. Молчание здесь
   * было бы хуже пустоты: стенд, притворяющийся полным, закрывает вопрос
   * «а всё ли проверено», не отвечая на него.
   */
  const guarded = new Set(guardedChecks().map((c) => c.code))
  const uncovered = ALL_CHECKS.map((c) => c.code)
    .filter((c) => !wanted.includes(c))
    .filter((c) => !guarded.has(c))

  console.log(`\nСработало правил: ${fired.size} из ${wanted.length} посаженных`)

  if (missed.length) {
    console.log('\nПОСАЖЕНО, НО НЕ СРАБОТАЛО')
    for (const c of missed) console.log(`  · ${c}`)
    console.log('  Либо правило не видит того, что мы посадили, либо мы неверно')
    console.log('  поняли, на что оно смотрит. И то и другое — находка.')
  }

  if (uncovered.length) {
    console.log(`\nСТЕНД НЕ ПОКРЫВАЕТ (${uncovered.length})`)
    console.log(`  ${uncovered.join(', ')}`)
  }

  console.log(`\nПрогнать все правила по стенду: npm run audit:checks -- --org=${orgId}`)
  console.log(`Убрать стенд: npm run seed:flaws -- --drop\n`)

  process.exit(0)
}

main().catch((e) => {
  console.error('\nНе отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
