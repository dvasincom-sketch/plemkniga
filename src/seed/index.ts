/**
 * Наполнение прототипа демонстрационными данными.
 * Запуск: npm run seed
 *
 * Скрипт идемпотентен: перед наполнением он удаляет ранее созданные демо-записи.
 */
import 'dotenv/config'

/*
 * Пересчёт индекса на время сида выключен: он делается одним прогоном в конце.
 * Флаг ставится до импорта Payload, потому что хуки читают его при вызове.
 */
process.env.INDEX_VALUES_SKIP = '1'

import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'
import config from '../payload.config'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { expectedFatKg, expectedProteinKg } from '../lib/pta-consistency'
import { pdfStub } from '../lib/pdf-stub'
import {
  EXTERIOR_COMPOSITES,
  EXTERIOR_TRAITS,
} from '../lib/dictionaries'
import { DICTIONARY_SEED } from './dictionaries-data'
import { randomUUID } from 'crypto'

const seedDir = path.dirname(fileURLToPath(import.meta.url))

/* ----------------------------- ГПСЧ с зерном ----------------------------- */
let seedState = 20250814
const rnd = () => {
  seedState = (seedState * 1103515245 + 12345) % 2147483648
  return seedState / 2147483648
}
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]
const between = (min: number, max: number, digits = 1) =>
  Math.round((min + rnd() * (max - min)) * 10 ** digits) / 10 ** digits
const int = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1))

/**
 * Нормальное отклонение — для племенных оценок.
 *
 * Равномерное `between(min, max)` для EBV не годится: племенная ценность
 * распределена нормально вокруг базы породы, и равномерная выборка даёт
 * неправдоподобную картину — одинаково часто встречаются средние животные
 * и рекордисты, а стандартизованное отклонение вылезает за пять сигм,
 * чего в популяции не бывает.
 *
 * Преобразование Бокса — Мюллера поверх того же детерминированного
 * генератора: сид остаётся воспроизводимым.
 */
const gauss = (mean = 0, sd = 1): number => {
  const u = Math.max(rnd(), 1e-9)
  const v = rnd()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return mean + z * sd
}

/**
 * Племенная оценка по признаку: отклонение от базы в единицах признака.
 *
 * `shift` — сдвиг в долях генетического σ. Быки-производители отобраны
 * по индексу, поэтому их оценки смещены вверх примерно на сигму; коровы
 * товарного стада держатся около базы.
 */
const round1 = (v: number) => Math.round(v * 10) / 10

const ebv = (sd: number, shift = 0, digits = 1, limit?: [number, number]) => {
  let v = gauss(shift * sd, sd)
  // У признаков экстерьера в схеме заданы границы шкалы: нормальное
  // распределение изредка выходит за три сигмы, и запись не проходит валидацию
  if (limit) v = Math.min(Math.max(v, limit[0]), limit[1])
  return Math.round(v * 10 ** digits) / 10 ** digits
}

/* --------------------------------- Данные -------------------------------- */
const FARMS = [
  { name: 'ЗАО «Назаровское»', short: 'ЗАО Назаровское', inn: '2456000101', region: 'Красноярский край' },
  { name: 'АО «Племзавод Заволжское»', short: 'АО Заволжское', inn: '6330000202', region: 'Самарская область' },
  { name: 'ООО «Русское молоко»', short: 'ООО Русское молоко', inn: '5030000303', region: 'Московская область' },
  { name: 'СПК «Красная Звезда»', short: 'СПК Красная Звезда', inn: '4312000404', region: 'Кировская область' },
  { name: 'АО «Агрофирма Дороничи»', short: 'АО Дороничи', inn: '4345000505', region: 'Кировская область' },
  { name: 'ООО «Агрокомплекс Кубань»', short: 'ООО Кубань', inn: '2312000606', region: 'Краснодарский край' },
]

const COW_NAMES = [
  'Поляна', 'Ромашка', 'Ласка', 'Зорька', 'Берёзка', 'Милка', 'Ночка', 'Звёздочка',
  'Красавица', 'Малина', 'Роза', 'Бурёнка', 'Марта', 'Ягодка', 'Лада', 'Вишня',
  'Айва', 'Груша', 'Липа', 'Рябина', 'Сирень', 'Метель', 'Радуга', 'Забава',
  'Калина', 'Верба', 'Сказка', 'Тайга', 'Нежность', 'Смородина', 'Дубрава', 'Отрада',
]

const BULL_NAMES = [
  'Атлант', 'Титан', 'Вулкан', 'Гранит', 'Кристалл', 'Магнат', 'Орион', 'Пилот',
  'Сапфир', 'Тайфун', 'Форвард', 'Эверест',
]

const SERVICE_BULLS = [
  'HOUSA0012356', 'HOUSA0148711', 'HOCAN0007392', 'HODEU0803114',
  'HOUSA0141920', 'HONLD0655321',
]

const AGE_BY_LACT = ['firstCalf', 'cow2', 'cow3'] as const

/**
 * Раскладка уровней достоверности по стаду (ТЗ, Таблица №4).
 *
 * Двадцать пять позиций на один проход: 1 отклонённая запись, 3 черновика,
 * 4 проверенных собственником, 7 подтверждённых лабораторией, 10 верифицированных
 * Ассоциацией. Пропорция повторяет жизнь — большинство записей доведено
 * до конца, но и брак, и незавершённые проверки в книге присутствуют.
 *
 * Порядок перемешан намеренно: животные создаются подряд и раскладываются
 * по хозяйствам по кругу, поэтому упорядоченный список отдал бы каждому
 * хозяйству свой уровень.
 */
const TRUST_CYCLE = [3, 2, 3, 1, 3, 2, 0, 3, 2, 3, 1, 3, -1, 2, 3, 1, 2, 3, 0, 2, 3, 1, 3, 0, 2]

/* --------------------------------- Скрипт -------------------------------- */
const run = async () => {
  const payload = await getPayload({ config })
  const log = (...a: unknown[]) => payload.logger.info(a.join(' '))

  /*
   * Предохранитель.
   *
   * Сид начинается с полной очистки: это наполнение пустой базы, а не
   * обновление данных. На рабочей системе такой запуск уничтожает всё,
   * что там накопилось, — и один раз это уже случилось на проде.
   *
   * Поэтому: если в базе уже есть животные, скрипт останавливается
   * и требует явного подтверждения переменной SEED_CONFIRM=1. Заодно
   * показывает, к какой именно базе подключился, — перепутать локальную
   * строку с прод-строкой проще, чем кажется.
   *
   * Чтобы просто углубить родословную, сид не нужен: для этого есть
   * `npm run pedigree:deep`, который ничего не удаляет.
   */
  const { totalDocs: existingAnimals } = await payload.count({
    collection: 'animals',
    overrideAccess: true,
  })

  if (existingAnimals > 0 && process.env.SEED_CONFIRM !== '1') {
    payload.logger.error(
      `В базе уже есть животные (${existingAnimals}). Сид сначала удалит их все.\n` +
        `  База: ${maskUri(resolveDatabase().uri)}\n` +
        `  Если это действительно демо-база и данные не жаль — повторите с SEED_CONFIRM=1.\n` +
        `  Если нужно только углубить родословную — используйте npm run pedigree:deep, он ничего не удаляет.`,
    )
    process.exit(1)
  }

  log('Очистка предыдущих демо-данных…')

  /**
   * Очистка идёт прямым SQL, минуя Payload. Это решение, а не срезание угла.
   *
   * ## Почему не `payload.delete`
   *
   * Три попытки подряд показали, что удалять демо-базу через прикладной слой
   * нельзя в принципе, и каждая ломалась по-своему:
   *
   *  1. список коллекций был написан руками и отстал от системы: ревизии,
   *     оценки, экстерьер, значения индекса, гранты, журнал доступа появились
   *     позже, и внешние ключи не давали удалить **ни одного** животного;
   *  2. список вывели из конфигурации — и тут же выяснилось, что удаление
   *     животного дёргает хук записи ревизий, а таблица ревизий к этому
   *     моменту уже пуста: хук падает, транзакция обрывается;
   *  3. любой первый отказ обрывает транзакцию, и всё последующее PostgreSQL
   *     отвергает с «current transaction is aborted» — сотни строк следствий,
   *     в которых причина не видна.
   *
   * Общее у всех трёх — мы просим прикладной слой сделать то, чего он делать
   * не должен: снести всё, включая порядок ссылок, хуки, права и историю
   * правок. Хуки существуют, чтобы поддерживать связность данных. Здесь
   * связность не нужна: нужна пустая база.
   *
   * ## Что делает `truncate ... cascade`
   *
   * Одной командой опустошает все таблицы схемы разом, не разбирая порядок
   * внешних ключей и не запуская ни одного хука. `restart identity` заодно
   * сбрасывает счётчики — демо-база после пересева выглядит одинаково,
   * а не накапливает разрыв в идентификаторах от прогона к прогону.
   *
   * Единственная таблица, которую нельзя трогать, — `payload_migrations`:
   * в ней журнал применённых миграций. Опустошить её значит объявить схему
   * неприменённой и получить «type ... already exists» при следующем
   * `migrate` (разбор — в шапке `src/scripts/migrate-baseline.ts`).
   *
   * ## Чего это не делает
   *
   * Не удаляет загруженные файлы с диска: их убирал хук коллекции `media`,
   * а хуков здесь нет. В каталоге media остаются файлы прошлых прогонов.
   * Для демо-базы это мусор, а не поломка, и чистить его руками дешевле,
   * чем возвращаться к удалению через прикладной слой.
   */
  const pool = (payload.db as unknown as {
    pool?: { query: (q: string, p?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }> }
  }).pool

  if (!pool) {
    throw new Error(
      'Очистка невозможна: прямой доступ к базе недоступен. ' +
        'Сид рассчитан на PostgreSQL-адаптер Payload.',
    )
  }

  const tables = await pool
    .query(
      `select tablename from pg_tables
        where schemaname = 'public'
          and tablename <> 'payload_migrations'
        order by tablename`,
    )
    .then((r) => (r.rows ?? []).map((x) => String(x.tablename)))

  if (!tables.length) {
    throw new Error('В схеме public нет ни одной таблицы — база не размечена. Выполните npm run db:sync.')
  }

  await pool.query(
    `truncate table ${tables.map((t) => `"${t}"`).join(', ')} restart identity cascade`,
  )

  log(`  опустошено таблиц: ${tables.length} (журнал миграций не тронут)`)

  /*
   * Контрольный подсчёт остаётся. `truncate` либо срабатывает целиком, либо
   * не срабатывает вовсе, так что поймать он должен не недоудаление, а случай,
   * когда животные лежат не там, где мы думаем: например, схема раскатана
   * в другую схему, а не в `public`.
   */
  const leftover = await payload.count({ collection: 'animals', overrideAccess: true })
  if (leftover.totalDocs > 0) {
    throw new Error(
      `После очистки в книге осталось ${leftover.totalDocs} животных. ` +
        'Это значит, что таблица `animals` живёт не в схеме `public`, ' +
        'и очистка опустошила не то. Наполнять базу поверх нельзя: ' +
        'номера совпадут, и сид упадёт на уникальности при создании быков.',
    )
  }

  /* ------------------------------ Справочники ----------------------------- */
  log('Наполнение справочников (НСИ)…')
  const dict: Record<string, Record<string, number>> = {}
  for (const { slug, rows } of DICTIONARY_SEED) {
    dict[slug] = {}
    for (const row of rows) {
      const created = await payload.create({
        collection: slug as never,
        overrideAccess: true,
        data: row as never,
      })
      dict[slug][row.code] = (created as { id: number }).id
    }
  }
  const ref = (slug: string, code: string) => dict[slug]?.[code]

  /* ------------------------------ Организации ----------------------------- */
  log('Создание организаций…')
  const orgs: { id: number; shortName: string }[] = []
  for (const f of FARMS) {
    orgs.push(
      (await payload.create({
        collection: 'organizations',
        overrideAccess: true,
        data: {
          name: f.name,
          shortName: f.short,
          type: 'farm',
          inn: f.inn,
          region: f.region as never,
          address: `${f.region}, с. Племенное, ул. Центральная, ${int(1, 60)}`,
          phone: `+7 8${int(10, 99)} ${int(100, 999)}-${int(10, 99)}-${int(10, 99)}`,
          email: `info@farm${f.inn.slice(-4)}.ru`,
          membership: 'member',
        },
      })) as never,
    )
  }

  const serviceOrg = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: {
      name: 'ООО «Селекционный центр Волга»',
      shortName: 'СЦ Волга',
      type: 'service',
      inn: '6316000707',
      region: 'Самарская область' as never,
      address: 'г. Самара, ул. Металлургическая, 92',
      membership: 'member',
    },
  })

  /* -------------------------------- Стада --------------------------------- */
  log('Создание стад…')
  const herds: { id: number; org: number }[] = []
  for (const org of orgs) {
    for (const suffix of ['Основное стадо', 'Ферма №2']) {
      const h = await payload.create({
        collection: 'herds',
        overrideAccess: true,
        data: {
          name: `${org.shortName} — ${suffix}`,
          code: `H${org.id}${suffix.length}`,
          organization: org.id,
        },
      })
      herds.push({ id: h.id as number, org: org.id as number })
    }
  }

  /* ----------------------------- Пользователи ----------------------------- */
  log('Создание пользователей…')
  const PASSWORD = 'plemkniga123'

  const associationUser = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      email: 'admin@holstein-russia.ru',
      password: PASSWORD,
      role: 'admin',
      lastName: 'Соколов',
      firstName: 'Андрей',
      middleName: 'Петрович',
      position: 'Главный специалист Ассоциации',
      phone: '+7 846 931 25 95',
      confirmed: true,
      acceptedPolicy: true,
    },
  })

  const farmer = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      email: 'farmer@nazarovskoe.ru',
      password: PASSWORD,
      role: 'farmer',
      lastName: 'Ковалёва',
      firstName: 'Ирина',
      middleName: 'Сергеевна',
      position: 'Зоотехник-селекционер',
      phone: '+7 391 555-12-34',
      organization: orgs[0].id,
      confirmed: true,
      acceptedPolicy: true,
    },
  })

  await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      email: 'service@sc-volga.ru',
      password: PASSWORD,
      role: 'service',
      lastName: 'Демидов',
      firstName: 'Павел',
      position: 'Руководитель лаборатории',
      organization: serviceOrg.id,
      confirmed: true,
      acceptedPolicy: true,
    },
  })

  const otherFarmers: { id: number }[] = []
  for (let i = 1; i < orgs.length; i++) {
    otherFarmers.push(
      (await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: {
          email: `farmer${i}@holstein-demo.ru`,
          password: PASSWORD,
          role: 'farmer',
          lastName: pick(['Иванов', 'Петров', 'Сидоров', 'Морозов', 'Лебедев']),
          firstName: pick(['Олег', 'Сергей', 'Дмитрий', 'Наталья', 'Елена']),
          organization: orgs[i].id,
          confirmed: true,
          acceptedPolicy: true,
        },
      })) as never,
    )
  }
  const authorFor = (orgIndex: number) =>
    orgIndex === 0 ? farmer.id : otherFarmers[orgIndex - 1].id

  /* ------------------------------- Быки ----------------------------------- */
  log('Создание быков-производителей…')
  const bulls: { id: number; identNumber: string; name: string }[] = []
  for (let i = 0; i < 12; i++) {
    const orgIndex = i % orgs.length

    /*
     * Удой и проценты разыгрываются, килограммы считаются. Разбор —
     * у самих полей ниже и в `src/lib/pta-consistency.ts`.
     */
    const bullMilk = ebv(257.1, 1, 0)
    const bullFatPct = ebv(0.09, 0.6, 2)
    const bullProteinPct = ebv(0.05, 0.5, 2)

    bulls.push(
      (await payload.create({
        collection: 'animals',
        overrideAccess: true,
        data: {
          uuid: randomUUID(),
          identNumber: `HOUSA${String(1000000 + int(100000, 999999)).slice(0, 7)}${i}`,
          idFormat: 'usa',
          name: BULL_NAMES[i],
          sex: 'male',
          state: 'alive',
          ageGroup: 'bull',
          birthDate: new Date(2010 + (i % 5), i % 12, 1 + (i % 27)).toISOString(),
          breed: ref('breeds', '1'),
          bloodPercent: 100,
          coatColor: ref('coat-colors', '1'),
          bloodGroup: ref('blood-groups', pick(['A', 'B', 'C', 'F-V'])),
          purpose: ref('animal-purposes', '1'),
          category: ref('breeding-categories', 'I'),
          registrationBasis: 'origin',
          breedingClass: ref('breeding-classes', pick(['1', '2'])),
          line: ref('lines', pick(['L-198998', 'L-1013415', 'L-95679', 'L-252803'])),
          genetics: {
            cvm: 'free',
            blad: 'free',
            dumps: 'free',
            kappaCasein: pick(['AA', 'AB', 'BB']),
            betaCasein: pick(['A1A1', 'A1A2', 'A2A2']),
          },
          owner: orgs[orgIndex].id,
          author: authorFor(orgIndex),
          publicVisible: true,
          forSale: rnd() < 0.12,
          publicDetails: true,
          trustLevel: 3,
          trustCheckedAt: new Date(2025, 2, 12).toISOString(),
          ipc: between(400, 2600, 1),
          ipcDetails: {
            forecast: between(400, 2600, 1),
            r: between(78, 96, 1),
            percentile: int(60, 99),
            /*
             * Источник у быков импортный: их оценки приходят из каталогов
             * вместе с семенем, и в жизни это чаще всего CDCB. Заполнено
             * не для красоты — без имени источника карточка не может
             * объяснить, почему привезённое число расходится с нашим.
             */
            center: 'CDCB (США)',
            base: 'CDCB-2025',
          },
          evaluationDate: new Date(2025, 2, 12).toISOString(),
          production: {
            reliabilityLevel: 4,
            // Оценки в долях генетического σ из TRAIT_BASE: быки отобраны
            // по индексу, поэтому распределение смещено вверх на сигму
            /*
             * Килограммы выводятся из удоя и процентов, а не разыгрываются
             * отдельно.
             *
             * Прежде все пять признаков брались независимо, и получались
             * записи, которых не бывает: удой минус триста при белке ноль
             * процентов и плюс тридцать килограммов белка. Проверка
             * `eval-protein-kg-mismatch` ловит теперь именно это — и первым
             * поймала бы наш собственный сид, то есть учила бы Ассоциацию
             * на неправдоподобном образце.
             */
            milk: { forecast: bullMilk, r: between(80, 95, 1) },
            fatPercent: { forecast: bullFatPct, r: between(40, 70, 1) },
            proteinPercent: { forecast: bullProteinPct, r: between(45, 75, 1) },
            fatKg: { forecast: round1(expectedFatKg(bullMilk, bullFatPct)), r: between(78, 92, 1) },
            proteinKg: {
              forecast: round1(expectedProteinKg(bullMilk, bullProteinPct)),
              r: between(80, 94, 1),
            },
            productionIndex: { forecast: between(90, 130, 1), r: between(70, 90, 1) },
          },
          reproduction: { fertility: { forecast: ebv(1.37, 0.4, 1), r: between(50, 80, 1) } },
          health: {
            reliabilityLevel: 3,
            productiveLongevity: { forecast: ebv(1.7, 0.8, 1), r: between(45, 75, 1) },
            udderHealth: { forecast: ebv(1.0, 0.5, 1), r: between(50, 78, 1) },
            calfMortality: { forecast: ebv(1.62, -0.4, 1), r: between(40, 70, 1) },
            calvingEase: { forecast: ebv(1.3, 0.5, 1), r: between(45, 72, 1) },
          },
          exterior: Object.fromEntries([
            ...EXTERIOR_TRAITS.map((t) => [t.key, ebv(1.0, 0.3, 2, [-3, 3])]),
            ...EXTERIOR_COMPOSITES.map((t) => [t.key, ebv(0.65, 0.4, 2, [-3, 3])]),
          ]),
        },
      })) as never,
    )
  }

  /* ------------------------------ Коровы ---------------------------------- */
  log('Создание коров и тёлок…')
  const TOTAL = 168
  let created = 0

  for (let i = 0; i < TOTAL; i++) {
    const orgIndex = i % orgs.length
    const org = orgs[orgIndex]
    const orgHerds = herds.filter((h) => h.org === org.id)
    const isHeifer = i % 11 === 0
    const lactCount = isHeifer ? 0 : int(1, 3)
    const ageGroup = isHeifer ? 'heifer' : AGE_BY_LACT[Math.min(lactCount, 3) - 1]

    const milk = between(5400, 12800, 0)
    const fatP = between(3.45, 4.35, 2)
    const protP = between(2.95, 3.55, 2)
    const fatKg = Math.round(((milk * fatP) / 100) * 10) / 10
    const protKg = Math.round(((milk * protP) / 100) * 10) / 10

    const publicVisible = rnd() < 0.62
    const publicDetails = publicVisible && rnd() < 0.7

    const lactations = Array.from({ length: lactCount }, (_, n) => {
      const year = 2021 + n
      const y305 = Math.round(milk * between(0.86, 1.02, 2))
      return {
        number: n + 1,
        calvingDate: new Date(year, int(0, 11), int(1, 27)).toISOString(),
        inseminationDate: new Date(year, int(2, 8), int(1, 27)).toISOString(),
        serviceBull: pick(SERVICE_BULLS),
        dd: int(280, 340),
        milkYield: Math.round(milk * between(0.9, 1.08, 2)),
        milk305: y305,
        fat305: between(3.4, 4.4, 2),
        protein305: between(2.9, 3.6, 2),
        scc: int(90, 420),
        dryOffDate: new Date(year + 1, int(0, 5), int(1, 27)).toISOString(),
      }
    })

    const father = bulls[int(0, bulls.length - 1)]

    // Килограммы считаются из удоя и процентов — как у быков выше
    const cowMilk = ebv(257.1, 0.15, 0)
    const cowFatPct = ebv(0.09, 0.1, 2)
    const cowProteinPct = ebv(0.05, 0.1, 2)

    await payload.create({
      collection: 'animals',
      overrideAccess: true,
      data: {
        // Порядковый номер в конце гарантирует уникальность: при случайной
        // генерации двенадцатизначных номеров совпадения всё-таки случаются,
        // и сид падал на валидации в середине наполнения
        uuid: randomUUID(),
        identNumber: `${int(30, 39)}${String(int(1000000, 9999999))}${String(i).padStart(4, '0')}`,
        idFormat: 'rf',
        name: pick(COW_NAMES),
        sex: 'female',
        state: rnd() < 0.9 ? 'alive' : pick(['sold', 'culled'] as const),
        ageGroup,
        birthDate: new Date(2018 + (i % 5), i % 12, 1 + (i % 27)).toISOString(),
        breed: ref('breeds', '1'),
        bloodPercent: int(75, 100),
        coatColor: ref('coat-colors', pick(['1', '2', '4'])),
        bloodGroup: ref('blood-groups', pick(['A', 'B', 'C', 'F-V', 'J', 'S'])),
        purpose: ref('animal-purposes', isHeifer ? '1' : pick(['1', '2'])),
        category: ref('breeding-categories', i % 9 === 0 ? 'II' : 'I'),
        registrationBasis: i % 9 === 0 ? 'productivity' : 'origin',
        breedingClass: ref('breeding-classes', pick(['1', '2', '3', '4'])),
        family: ref('lines', pick(['F-01', 'F-02', 'F-03'])),
        genetics: {
          cvm: pick(['unknown', 'free', 'free']),
          blad: pick(['unknown', 'free', 'free']),
          dumps: 'unknown',
        },
        owner: org.id,
        herd: orgHerds[i % orgHerds.length]?.id,
        author: authorFor(orgIndex),
        publicVisible,
        publicDetails,
        /*
         * Уровень достоверности раздаётся по фиксированному циклу, а не
         * случайно и не по признаку публичности.
         *
         * Публичность — решение владельца, достоверность — результат
         * проверки; связывать их значило бы утверждать, что закрытые данные
         * хуже проверены. Цикл же гарантирует, что в демо-базе встретятся
         * все пять ступеней, включая редкое «Отклонено»: при случайном
         * розыгрыше крайние уровни в маленькой выборке легко выпадают
         * ни разу, и шкала выглядит как один сплошной «Черновик».
         */
        trustLevel: TRUST_CYCLE[i % TRUST_CYCLE.length],
        trustCheckedAt:
          TRUST_CYCLE[i % TRUST_CYCLE.length] > 0
            ? new Date(2025, i % 12, 1 + (i % 27)).toISOString()
            : undefined,
        father: father.id,
        pedigreeText: {
          fatherId: father.identNumber,
          fatherName: father.name,
          motherId: `${int(30, 39)}${int(10000000, 99999999)}`,
          motherName: pick(COW_NAMES),
          fatherFatherId: pick(SERVICE_BULLS),
          motherFatherId: pick(SERVICE_BULLS),
        },
        /*
         * Ноль, а не `between(0, 4.2, 2)`.
         *
         * У этих животных известен один родитель — отец; матери в книге нет,
         * она есть только текстом в родословной. Пути от общего предка
         * замкнуться не могут, и настоящий коэффициент здесь равен нулю.
         * Случайное число со средним около двух процентов противоречило
         * той самой родословной, которую сид рядом и строит.
         *
         * Ревизия проверок это показала: `inbreeding-mismatch` срабатывала
         * на 78 % сверенных записей. Расхождение было настоящим — врал сид.
         * Пользы от такого прогона нет: находки, которых заведомо три
         * четверти, никто не читает, и настоящее расхождение в них тонет.
         *
         * Заодно это делает демо-базу пригодной для проверки самого расчёта.
         * После правки единственное ненулевое значение в ней — 3,13 % у
         * «Поляны», посчитанные руками по её родословной ниже (Шарлет стоит
         * и со стороны отца, и со стороны матери: (1/2)^5 = 3,125 %,
         * плюс поправка на её собственный инбридинг).
         * Если прогон не находит расхождения, обход девяти колен сошёлся
         * с расчётом на бумаге — и это единственное, чем `analyzeAncestry`
         * вообще можно подтвердить.
         */
        inbreeding: 0,
        ipc: between(-1200, 2400, 1),
        ipcDetails: {
          forecast: between(-1200, 2400, 1),
          r: between(35, 88, 1),
          percentile: int(3, 99),
          // У коров оценка отечественная: её считает региональный центр
          center: 'Региональный центр племенного животноводства',
          base: 'Голштин РФ-2025',
        },
        evaluationDate: new Date(2025, 2, 12).toISOString(),
        production: {
          reliabilityLevel: int(2, 4),
          // Товарное стадо держится около базы породы: сдвиг близок к нулю
          // Килограммы — из удоя и процентов, см. пояснение у быков
          milk: { forecast: cowMilk, r: between(55, 92, 1) },
          fatPercent: { forecast: cowFatPct, r: between(30, 60, 1) },
          proteinPercent: { forecast: cowProteinPct, r: between(38, 68, 1) },
          fatKg: { forecast: round1(expectedFatKg(cowMilk, cowFatPct)), r: between(60, 88, 1) },
          proteinKg: {
            forecast: round1(expectedProteinKg(cowMilk, cowProteinPct)),
            r: between(65, 94, 1),
          },
          productionIndex: { forecast: between(85, 122, 1), r: between(50, 84, 1) },
        },
        reproduction: { fertility: { forecast: ebv(1.37, 0, 1), r: between(30, 65, 1) } },
        health: {
          reliabilityLevel: int(2, 4),
          productiveLongevity: { forecast: ebv(1.7, 0.1, 1), r: between(28, 62, 1) },
          udderHealth: { forecast: ebv(1.0, 0, 1), r: between(32, 70, 1) },
          calfMortality: { forecast: ebv(1.62, 0, 1), r: between(25, 58, 1) },
          calvingEase: { forecast: ebv(1.3, 0, 1), r: between(30, 64, 1) },
        },
        exterior: Object.fromEntries([
          ...EXTERIOR_TRAITS.map((t) => [t.key, ebv(1.0, 0, 2, [-3, 3])]),
          ...EXTERIOR_COMPOSITES.map((t) => [t.key, ebv(0.65, 0, 2, [-3, 3])]),
        ]),
        /*
         * Собственный промер коровы — своя группа и своя шкала.
         *
         * Числа независимы от группы выше намеренно: это два разных
         * измерения. Балл говорит, какое у этой коровы вымя; отклонение
         * рядом — какое вымя будет у её дочерей. Совпадать они не обязаны,
         * и синтетика, где балл выводился бы из отклонения, учила бы
         * обратному.
         *
         * Распределение около пятёрки с разбросом в полтора балла: так
         * выглядит настоящее стадо, где крайние единицы и девятки —
         * редкость, а не половина списка.
         */
        linearScore: {
          assessedAt: new Date(2025, i % 12, 1 + (i % 27)).toISOString(),
          ...Object.fromEntries(
            EXTERIOR_TRAITS.map((t) => [
              t.key,
              Math.max(1, Math.min(9, Math.round(5 + ebv(1.5, 0, 1)))),
            ]),
          ),
        },
        summary: {
          milkYield: milk,
          fatPercent: fatP,
          proteinPercent: protP,
          fatKg,
          proteinKg: protKg,
          fatProteinSum: Math.round((fatKg + protKg) * 10) / 10,
        },
        lactations,
      },
    })
    created++
  }

  /* --------------------- Протоколы лабораторий ---------------------------- */
  /*
   * Вторая ступень достоверности выводится из протокола (`src/lib/trust.ts`),
   * а не проставляется. Значит синтетика, где ступень стоит, а протокола нет,
   * показывает состояние, которого система больше не создаёт, — и первый же,
   * кто откроет такую карточку, увидит плашку без документа за ней.
   *
   * Поэтому протоколы заводятся по-настоящему: файлом, с лабораторией
   * и с «кем выдан». Файл один на всех — это демо-данные, и полсотни
   * одинаковых PDF в хранилище ничего не добавили бы.
   */
  log('Создание протоколов лаборатории…')

  const labFile = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: 'Протокол лаборатории (демонстрационный)', visibility: 'private' },
    file: (() => {
      // Настоящий PDF: файл лежит в карточке животного, и его однажды нажмут
      const data = pdfStub('Genotype report (demo)')
      return { data, name: 'protokol-laboratorii.pdf', mimetype: 'application/pdf', size: data.length }
    })(),
  })

  const labAnimals = await payload.find({
    collection: 'animals',
    where: { trustLevel: { equals: 2 } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  let protocols = 0
  for (const a of labAnimals.docs) {
    protocols += 1
    await payload.create({
      collection: 'documents',
      overrideAccess: true,
      user: associationUser,
      data: {
        title: `Протокол генотипирования № ГТ-${String(protocols).padStart(4, '0')} — ${a.identNumber}`,
        type: 'genotypeReport',
        number: `ЛП-2025-${String(protocols).padStart(4, '0')}`,
        issuedAt: new Date(2025, protocols % 12, 1 + (protocols % 27)).toISOString(),
        animal: a.id,
        organization: typeof a.owner === 'object' && a.owner ? a.owner.id : a.owner,
        issuedBy: associationUser.id,
        labName: `${serviceOrg.name}`,
        file: labFile.id,
      } as never,
    })
  }
  log(`  протоколов: ${protocols}`)

  /* ------------- Родословная эталонной карточки: девять колен ------------- */
  log('Создание предков для генеалогического древа…')

  type Anc = { code: string; name: string; num: string; sex: 'male' | 'female'; year: number }

  /*
   * Три ближних колена заданы поимённо: они попадают в дерево карточки
   * и в оба документа, поэтому клички и номера здесь не случайные.
   * Колена с четвёртого по девятое строятся дальше по коду.
   *
   * Порядок списка — от дальних колен к ближним: связи ставятся сразу при
   * создании, поэтому родитель должен существовать раньше потомка.
   * Ключи условные, не коды позиций: одно животное стоит в разных местах древа.
   */
  const ancestors: (Anc & { trust?: number })[] = [
    // 3-е колено и ближе — они же участвуют в древе и в документах
    { code: 'enhancer', name: 'Г.Энханкер', num: '343514', sex: 'male', year: 2000, trust: 3 },
    { code: 'pinkey', name: 'Пинкей', num: '3243815', sex: 'female', year: 2000, trust: 1 },
    { code: 'sharlet', name: 'Шарлет', num: '11206193', sex: 'female', year: 2000, trust: 3 },
    { code: 'jupiter', name: 'С.М.Юпитер', num: '1666290', sex: 'male', year: 2000, trust: 3 },
    { code: 'klay', name: 'Клай Эрдел', num: '8989355', sex: 'female', year: 2000, trust: 1 },
    { code: 'fagin', name: 'Фагин', num: '168939', sex: 'male', year: 2000, trust: 3 },
    { code: 'dubras', name: 'Дубрас', num: '376602', sex: 'male', year: 2005, trust: 3 },
    { code: 'shfsharlet', name: 'Ш.Ф.Шарлет', num: '11681841', sex: 'female', year: 2005, trust: 3 },
    { code: 'ralf', name: 'Ральф', num: '1748622', sex: 'male', year: 2005, trust: 3 },
    { code: 'prelest', name: 'Прелесть', num: '28151', sex: 'female', year: 2005, trust: 3 },
    { code: 'palash', name: 'Палаш', num: '5', sex: 'male', year: 2010, trust: 3 },
    { code: 'pastila', name: 'Пастила', num: '20197', sex: 'female', year: 2010, trust: 3 },
  ]

  /**
   * Связи в трёх видимых рядах подобраны так, чтобы древо демонстрировало
   * обе ситуации:
   *  — Шарлет стоит и у отца (ММО), и у матери (МММ) — общий предок,
   *    даёт вклад в коэффициент инбридинга животного: (1/2)^5 = 3,125%,
   *    домноженный на (1 + F) самой Шарлет. Это **вклад одного предка**,
   *    а не коэффициент животного: ниже достраиваются колена с четвёртого
   *    по девятое, и они добавляют свои общие пути;
   *  — Г.Энханкер дважды встречается только со стороны отца (ООО и ОМО) —
   *    инбредным оказывается сам отец, на COI потомка это не влияет.
   *
   * Глубже связи достраиваются кодом — см. ниже.
   */
  const parentsOf: Record<string, [string | null, string | null]> = {
    palash: ['dubras', 'shfsharlet'],
    pastila: ['ralf', 'prelest'],
    dubras: ['enhancer', 'pinkey'],
    shfsharlet: ['enhancer', 'sharlet'],
    ralf: ['jupiter', 'klay'],
    prelest: ['fagin', 'sharlet'],

  }

  const ancIds: Record<string, number> = {}
  for (const a of ancestors) {
    const [fCode, mCode] = parentsOf[a.code] ?? [null, null]
    const created = await payload.create({
      collection: 'animals',
      overrideAccess: true,
      data: {
        uuid: randomUUID(),
        identNumber: a.num,
        idFormat: 'internal',
        name: a.name,
        sex: a.sex,
        state: 'sold',
        ageGroup: a.sex === 'male' ? 'bull' : 'cow3',
        birthDate: new Date(a.year, 0, 1).toISOString(),
        breed: ref('breeds', '1'),
        owner: orgs[0].id,
        author: farmer.id,
        publicVisible: true,
        publicDetails: true,
        trustLevel: a.trust ?? 3,
        father: fCode ? ancIds[fCode] : undefined,
        mother: mCode ? ancIds[mCode] : undefined,
        archived: true,
        archiveReason: 'Запись предка для построения родословной',
      },
    })
    ancIds[a.code] = (created as { id: number }).id
  }

  /* --------------- Колена с четвёртого по девятое: генерация -------------- */

  /*
   * Дальние колена перечислять вручную бессмысленно: их сотни, клички там
   * никто не читает, а нужны они ради одного — чтобы разбор родословной
   * вглубь имел что показать.
   *
   * Размеры колен подобраны по жизни, а не по формуле 2^n. Настоящая
   * родословная в глубину сужается: слоты удваиваются, а разных животных
   * становится всё меньше, потому что одни и те же быки стоят в десятках
   * мест. Если же взять слишком узкое колено, ветви схлопнутся к горстке
   * основателей и коэффициент инбридинга улетит к десяткам процентов —
   * такого в голштинской популяции не бывает.
   */
  const DEEP_SIZES: Record<number, number> = { 4: 12, 5: 22, 6: 40, 7: 68, 8: 104, 9: 140 }

  /** Предки третьего колена — от них начинается достройка вглубь. */
  const GEN3 = ['enhancer', 'pinkey', 'sharlet', 'jupiter', 'klay', 'fagin']

  const deepName = (generation: number, index: number, male: boolean) =>
    `${male ? 'Предок' : 'Праматерь'} ${generation}-${index + 1}`

  let previous = GEN3

  for (let generation = 4; generation <= 9; generation++) {
    const size = DEEP_SIZES[generation]
    const males = Math.ceil(size / 2)
    const codes: string[] = []

    for (let i = 0; i < size; i++) {
      const male = i < males
      const code = `g${generation}_${i}`
      codes.push(code)

      const created = await payload.create({
        collection: 'animals',
        overrideAccess: true,
        data: {
          uuid: randomUUID(),
          identNumber: `${generation}${String(i).padStart(3, '0')}${male ? '1' : '2'}00`,
          idFormat: 'internal',
          name: deepName(generation, i, male),
          sex: male ? 'male' : 'female',
          state: 'sold',
          ageGroup: male ? 'bull' : 'cow3',
          birthDate: new Date(2010 - generation * 5, 0, 1).toISOString(),
          breed: ref('breeds', '1'),
          owner: orgs[0].id,
          author: farmer.id,
          // Записи предков в книге не показываются: они не поголовье,
          // а строительный материал родословных
          publicVisible: false,
          publicDetails: false,
          /*
           * Предкам — первая ступень. Вторая теперь означает «есть протокол
           * лаборатории», а протоколов на архивные записи родословной никто
           * не носит: это строительный материал дерева, а не поголовье.
           */
          trustLevel: 1,
          archived: true,
          archiveReason: 'Запись предка для построения родословной',
        },
      })
      ancIds[code] = (created as { id: number }).id
    }

    /*
     * Раздача родителей.
     *
     * Подряд, а не с шагом. Шаг казался способом «перемешать» родителей,
     * но кратный размеру колена он схлопывает выбор до двух-трёх животных:
     * при шаге 3 и шести быках отцами становятся только первый и четвёртый.
     * Родословная вырождалась в несколько замкнутых линий, а коэффициент
     * инбридинга улетал за 20 % — таких животных в породе не бывает.
     *
     * Подряд же повторы возникают ровно там, где колено уже слоя потомков,
     * и тем глубже, чем дальше от животного: именно так устроена настоящая
     * родословная. Женский индекс дополнительно сдвигается, иначе одна и та же
     * пара родителей повторялась бы целиком и вместо общих предков появились
     * бы полные сибсы.
     */
    const femalesFrom = males
    const femaleCount = size - males

    for (let i = 0; i < previous.length; i++) {
      const father = codes[i % males]
      const mother = codes[femalesFrom + ((i + Math.floor(i / femaleCount)) % femaleCount)]
      await payload.update({
        collection: 'animals',
        id: ancIds[previous[i]],
        overrideAccess: true,
        data: { father: ancIds[father], mother: ancIds[mother] },
      })
    }

    previous = codes
  }

  /* ------------------- Показательная карточка «Поляна» --------------------- */
  log('Создание эталонной карточки животного…')
  const polyana = await payload.create({
    collection: 'animals',
    overrideAccess: true,
    data: {
      uuid: randomUUID(),
      identNumber: '3662217000196.00',
      idFormat: 'rf',
      name: 'Поляна',
      sex: 'female',
      state: 'alive',
      ageGroup: 'cow3',
      birthDate: new Date(2017, 4, 18).toISOString(),
      breed: ref('breeds', '1'),
      bloodPercent: 94,
      coatColor: ref('coat-colors', '1'),
      bloodGroup: ref('blood-groups', 'B'),
      purpose: ref('animal-purposes', '1'),
      category: ref('breeding-categories', 'I'),
      registrationBasis: 'origin',
      breedingClass: ref('breeding-classes', '2'),
      line: ref('lines', 'L-198998'),
      family: ref('lines', 'F-01'),
      altIds: {
        isoId: 'RU 3662217000196',
        internationalId: 'HOLRU51275',
        earTag: '0196',
        inventoryNumber: '196',
        chipNumber: '643000012345678',
        chipDate: new Date(2017, 6, 2).toISOString(),
        gpkMark: 'ГПК',
        gpkNumber: '12-0196',
      },
      genetics: {
        cvm: 'free',
        blad: 'free',
        dumps: 'free',
        kappaCasein: 'AB',
        betaCasein: 'A2A2',
        betaLactoglobulin: 'AB',
      },
      haplotypes: [
        { type: ref('haplotype-types', 'HH1'), status: 'free', date: new Date(2024, 10, 6).toISOString() },
        { type: ref('haplotype-types', 'HH3'), status: 'free', date: new Date(2024, 10, 6).toISOString() },
      ],
      /*
       * Вывод теста проставлен явно, и это не украшение.
       *
       * Поле `verdict` появилось позже самого сида, и записи остались
       * без него — при том что в `result` прямым текстом написано
       * «происхождение подтверждено». Показательная запись книги
       * от этого не могла получить свидетельство: `parentageRequirement`
       * спрашивает вывод, а не текст протокола, и справедливо отвечал
       * «у теста не проставлен вывод». Демонстрация упиралась в дыру
       * в собственных данных.
       */
      dnaTests: [
        {
          type: ref('dna-test-types', 'SNP60K'),
          date: new Date(2024, 10, 6).toISOString(),
          laboratory: serviceOrg.id,
          verdict: 'confirmed',
          result: 'Геномная оценка выполнена, происхождение подтверждено',
        },
        {
          type: ref('dna-test-types', 'PARENT'),
          date: new Date(2024, 10, 6).toISOString(),
          laboratory: serviceOrg.id,
          verdict: 'confirmed',
          result: 'Отцовство подтверждено',
        },
      ],
      arrivalDate: new Date(2017, 4, 18).toISOString(),
      owner: orgs[0].id,
      herd: herds.find((h) => h.org === orgs[0].id)?.id,
      author: farmer.id,
      publicVisible: true,
      publicDetails: true,
      trustLevel: 3,
      trustCheckedAt: new Date(2025, 2, 12).toISOString(),
      father: ancIds.palash,
      mother: ancIds.pastila,
      pedigreeText: {
        fatherId: '5',
        fatherName: 'Палаш',
        motherId: '20197',
        motherName: 'Пастила',
        fatherFatherId: '376602',
        motherFatherId: '1748622',
      },
      /*
       * 8,57 % — коэффициент по **всей** родословной, а не по трём видимым
       * коленам.
       *
       * Раньше здесь стояло 3,13 % с объяснением «Шарлет стоит и со стороны
       * отца, и со стороны матери: (1/2)^5 = 3,125». Объяснение верное,
       * число — нет: это вклад **одной Шарлет**, записанный так, будто это
       * коэффициент Поляны. Пока родословная кончалась третьим коленом, одно
       * совпадало с другим. Потом ниже достроились колена с четвёртого
       * по девятое — 398 различных предков, повторы начиная с пятого, —
       * и разошлось.
       *
       * Ревизия это и нашла: `npm run audit:checks --animal=3662217000196.00`
       * дал 8,57 против заявленных 3,13.
       *
       * ## Почему это число теперь можно ставить, не впадая в круг
       *
       * Оно посчитано нашим же кодом, и взять его на веру было бы кругом:
       * расчёт подтверждает сам себя. Круга нет по двум причинам.
       *
       * Первая: сам расчёт подтверждён отдельно и не этим числом. В разборе
       * родословной вклад Шарлет вышел 3,1494140625 %, тогда как (1/2)^5 —
       * ровно 3,125. Разница не ошибка, а множитель (1 + F) из формулы
       * Райта: у самой Шарлет после достройки колен F = (1/2)^7 = 0,78125 %,
       * и 3,125 × 1,0078125 = 3,1494140625 — до последнего знака. Величина
       * посчитана по учебнику вне нашего кода, включая поправку, которой
       * автор этой карточки в уме не держал.
       *
       * Вторая: число заморожено. Генератор родословной детерминирован
       * (ГПСЧ с зерном), значит 8,57 воспроизводится при каждом пересеве.
       * Изменится расчёт — константа разойдётся с ним, и проверка это
       * покажет. То есть отсюда оно работает не подтверждением, а сторожем.
       *
       * Меняли `DEEP_SIZES` или раздачу родителей ниже — это число нужно
       * пересчитать: `npm run audit:checks -- --animal=3662217000196.00`.
       */
      inbreeding: 8.57,
      ipc: 1284.5,
      ipcDetails: {
        forecast: 1284.5,
        r: 71.4,
        percentile: 88,
        center: 'Региональный центр племенного животноводства',
        base: 'Голштин РФ-2025',
      },
      evaluationDate: new Date(2025, 2, 12).toISOString(),
      production: {
        reliabilityLevel: 3,
        milk: { forecast: -200, r: 86.3 },
        fatPercent: { forecast: 0.05, r: 36.4 },
        proteinPercent: { forecast: -0.03, r: 54.7 },
        fatKg: { forecast: 12.6, r: 82.1 },
        proteinKg: { forecast: -1.56, r: 92.4 },
        productionIndex: { forecast: 104.2, r: 78.0 },
      },
      reproduction: { fertility: { forecast: 0.8, r: 44.2 } },
      health: {
        reliabilityLevel: 3,
        productiveLongevity: { forecast: 1.4, r: 39.5 },
        udderHealth: { forecast: 0.6, r: 51.2 },
        calfMortality: { forecast: -0.9, r: 33.8 },
        calvingEase: { forecast: 1.1, r: 42.7 },
      },
      exterior: {
        height: -1.3,
        chestWidth: 1.3,
        bodyDepth: -0.63,
        bodyType: -2.0,
        rumpAngle: 0.27,
        rumpWidth: 1.9,
        rearLegsRear: -0.5,
        rearLegsSide: 1.24,
        hoofAngle: 0.3,
        frontLegs: 1.6,
        movement: -1.3,
        foreUdder: 1.2,
        frontTeatPlacement: 0.9,
        teatLength: -0.1,
        udderDepth: -1.6,
        rearUdder: 1.4,
        centralLigament: 1.1,
        rearTeatPlacement: -1.5,
        bodyComposite: -0.9,
        udderComposite: 1.3,
        legsComposite: -0.63,
      },
      summary: {
        milkYield: 8960,
        fatPercent: 3.88,
        proteinPercent: 3.21,
        fatKg: 347.6,
        proteinKg: 287.6,
        fatProteinSum: 635.2,
      },
      lactations: [
        {
          number: 1,
          calvingDate: new Date(2019, 0, 1).toISOString(),
          inseminationDate: new Date(2019, 2, 1).toISOString(),
          serviceBull: 'HOUSA0012356',
          dd: 300,
          milkYield: 8960,
          milk305: 8960,
          fat305: 3.88,
          protein305: 3.21,
          scc: 200,
          dryOffDate: new Date(2019, 8, 1).toISOString(),
          endDate: new Date(2019, 10, 27).toISOString(),
          fatKg: 347.6,
          proteinKg: 287.6,
        },
        {
          number: 2,
          calvingDate: new Date(2020, 0, 1).toISOString(),
          inseminationDate: new Date(2020, 2, 1).toISOString(),
          serviceBull: 'HOUSA0012356',
          dd: 305,
          milkYield: 9420,
          milk305: 9310,
          fat305: 3.92,
          protein305: 3.18,
          scc: 174,
          dryOffDate: new Date(2020, 9, 1).toISOString(),
          endDate: new Date(2020, 11, 2).toISOString(),
          fatKg: 364.9,
          proteinKg: 296.0,
        },
        {
          number: 3,
          calvingDate: new Date(2021, 0, 1).toISOString(),
          inseminationDate: new Date(2021, 2, 1).toISOString(),
          serviceBull: 'HOCAN0007392',
          dd: 298,
          milkYield: 10120,
          milk305: 9980,
          fat305: 3.84,
          protein305: 3.25,
          scc: 156,
          dryOffDate: new Date(2021, 9, 1).toISOString(),
          endDate: new Date(2021, 11, 14).toISOString(),
          fatKg: 383.2,
          proteinKg: 324.4,
        },
      ],
    },
  })

  /* ---------------- Воспроизводство: осеменения, дойки, здоровье ----------- */
  log('Создание техников, осеменений, контрольных доек и событий здоровья…')

  const technicians: { id: number }[] = []
  for (const t of [
    { fullName: 'Смирнов Алексей Викторович', certificateNumber: 'ИО-2019-0142' },
    { fullName: 'Гусева Марина Олеговна', certificateNumber: 'ИО-2021-0388' },
    { fullName: 'Неизвестный техник #1', certificateNumber: '' },
  ]) {
    technicians.push(
      (await payload.create({
        collection: 'technicians',
        overrideAccess: true,
        data: { ...t, organization: orgs[0].id, isActive: true },
      })) as never,
    )
  }
  const techId = (i: number) => (technicians[i] as { id: number }).id

  // Полный репродуктивный цикл эталонной коровы: 3 отёла
  for (let n = 1; n <= 3; n++) {
    const year = 2018 + n
    await payload.create({
      collection: 'inseminations',
      overrideAccess: true,
      data: {
        animal: polyana.id,
        lactationNumber: n,
        date: new Date(year, 2, 1).toISOString(),
        bull: bulls[n % bulls.length].id,
        semenType: ref('semen-types', n === 3 ? '2' : '1'),
        method: ref('reproduction-methods', '1'),
        doses: 1,
        attemptNumber: n === 2 ? 2 : 1,
        technician: techId(n % 2),
        result: ref('insemination-results', '1'),
        pregnancyCheckDate: new Date(year, 4, 5).toISOString(),
        source: 'manual',
      },
    })
  }

  // Отёлы — таблица межотельного цикла
  /*
   * «Результат» — тип рождения, а пол приплода стоит числами рядом:
   * реестр спрашивает их порознь, и книга с некоторых пор тоже.
   */
  const calvingPlan = [
    { number: 1, year: 2019, result: 'one', heifers: 1, bulls: 0, milkingDays: 300, ease: 'easy' },
    {
      number: 2,
      year: 2020,
      result: 'one',
      heifers: 0,
      bulls: 1,
      milkingDays: 305,
      ease: 'assisted',
    },
    { number: 3, year: 2021, result: 'twins', heifers: 1, bulls: 1, milkingDays: 298, ease: 'hard' },
  ] as const

  for (const c of calvingPlan) {
    await payload.create({
      collection: 'calvings',
      overrideAccess: true,
      data: {
        animal: polyana.id,
        number: c.number,
        date: new Date(c.year, 0, 1).toISOString(),
        result: c.result,
        liveHeifers: c.heifers,
        liveBulls: c.bulls,
        stillborn: 0,
        milkingDays: c.milkingDays,
        dryOffDate: new Date(c.year, 8 + (c.number - 1), 1).toISOString(),
        ease: c.ease,
        calfWeight: int(32, 44),
      },
    })
  }

  // Контрольные дойки третьей лактации — помесячно
  for (let m = 0; m < 10; m++) {
    await payload.create({
      collection: 'milk-tests',
      overrideAccess: true,
      data: {
        animal: polyana.id,
        lactationNumber: 3,
        date: new Date(2021, m, 15).toISOString(),
        dailyYield: between(24, 41, 1),
        fatPercent: between(3.6, 4.1, 2),
        proteinPercent: between(3.05, 3.4, 2),
        somaticCells: int(90, 260),
        laboratory: serviceOrg.id,
        source: 'lab',
      },
    })
  }

  await payload.create({
    collection: 'health-events',
    overrideAccess: true,
    data: {
      animal: polyana.id,
      type: ref('health-event-types', 'HOOF'),
      date: new Date(2025, 6, 21).toISOString(),
      title: 'Плановая расчистка копыт',
      severity: 'mild',
      reportedBy: farmer.id,
    },
  })

  await payload.create({
    collection: 'health-events',
    overrideAccess: true,
    data: {
      animal: polyana.id,
      type: ref('health-event-types', 'MAST'),
      date: new Date(2021, 4, 3).toISOString(),
      title: 'Субклинический мастит, четверть ЛП',
      severity: 'moderate',
      startDate: new Date(2021, 4, 3).toISOString(),
      endDate: new Date(2021, 4, 19).toISOString(),
      excludeFromAnalytics: true,
      description: 'Повышение соматических клеток по контрольной дойке, курс лечения 14 дней',
      reportedBy: farmer.id,
    },
  })

  /* --------------------- Пакеты загрузки данных ---------------------------- */
  log('Создание пакетов загрузки данных…')

  const errorProtocol = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: 'Протокол ошибок проверки пакета данных' },
    filePath: path.resolve(seedDir, 'assets/protokol-oshibok.xlsx'),
  })

  const submissionPlan = [
    {
      number: '123456',
      kind: 'events' as const,
      status: 'checked' as const,
      submittedAt: new Date(2025, 3, 10, 9, 24),
      checkedAt: new Date(2025, 3, 12, 16, 53),
      comment:
        'Часть данных не прошла проверку. Ознакомьтесь с протоколом ошибок: 7 строк требуют исправления, остальные записи готовы к публикации.',
      total: 412,
      accepted: 405,
      rejected: 7,
      withProtocol: true,
    },
    {
      number: '123441',
      kind: 'productivity' as const,
      status: 'accepted' as const,
      submittedAt: new Date(2025, 2, 3, 11, 2),
      checkedAt: new Date(2025, 2, 4, 10, 15),
      comment: 'Все данные прошли успешную проверку.',
      total: 1280,
      accepted: 1280,
      rejected: 0,
      withProtocol: false,
    },
    {
      number: '121678',
      kind: 'events' as const,
      status: 'rejected' as const,
      submittedAt: new Date(2025, 0, 8, 10, 15),
      checkedAt: new Date(2025, 0, 8, 18, 40),
      comment:
        'Возможная причина отказа в рассмотрении данных: в файле не заполнены индивидуальные номера у 34 записей, формат дат не соответствует ISO 8601.',
      total: 210,
      accepted: 0,
      rejected: 210,
      withProtocol: true,
    },
    {
      number: '123402',
      kind: 'animals' as const,
      status: 'checking' as const,
      submittedAt: new Date(2025, 4, 22, 15, 40),
      checkedAt: null,
      comment: '',
      total: 96,
      accepted: 0,
      rejected: 0,
      withProtocol: false,
    },
  ]

  /*
   * Пакетам нужны записи: публикация поднимает уровень достоверности именно
   * им, и пакет без записей демонстрировал бы половину сценария.
   */
  const packAnimals = await payload.find({
    collection: 'animals',
    where: { and: [{ owner: { equals: orgs[0].id } }, { archived: { not_equals: true } }] },
    limit: 60,
    depth: 0,
    sort: 'id',
    overrideAccess: true,
  })
  const packIds = packAnimals.docs.map((a) => a.id as number)
  let packAt = 0

  for (const sp of submissionPlan) {
    const slice = packIds.slice(packAt, packAt + 20)
    packAt += 20

    await payload.create({
      collection: 'data-submissions',
      overrideAccess: true,
      data: {
        number: sp.number,
        kind: sp.kind,
        status: sp.status,
        organization: orgs[0].id,
        submittedBy: farmer.id,
        submittedAt: sp.submittedAt.toISOString(),
        animals: slice,
        intake: {
          rows: sp.total,
          created: Math.round(sp.total * 0.3),
          updated: sp.total - Math.round(sp.total * 0.3),
          skipped: 0,
        },
        review: {
          checkedAt: sp.checkedAt ? sp.checkedAt.toISOString() : undefined,
          comment: sp.comment || undefined,
          totalRows: sp.total,
          acceptedRows: sp.accepted,
          rejectedRows: sp.rejected,
          errorProtocol: sp.withProtocol ? errorProtocol.id : undefined,
        },
        consent:
          sp.status === 'accepted'
            ? {
                agreed: true,
                agreedAt: new Date(2025, 2, 4, 12, 0).toISOString(),
                publishedAt: new Date(2025, 2, 4, 12, 0).toISOString(),
              }
            : { agreed: false },
        history: [
          { at: sp.submittedAt.toISOString(), status: 'uploaded' as const, actor: farmer.id },
          ...(sp.checkedAt
            ? [
                {
                  at: sp.checkedAt.toISOString(),
                  status: sp.status === 'rejected' ? ('rejected' as const) : ('checked' as const),
                  actor: farmer.id,
                },
              ]
            : [
                {
                  at: new Date(sp.submittedAt.getTime() + 36e5).toISOString(),
                  status: 'checking' as const,
                  actor: farmer.id,
                },
              ]),
          ...(sp.status === 'accepted'
            ? [
                {
                  at: new Date(2025, 2, 4, 12, 0).toISOString(),
                  status: 'accepted' as const,
                  actor: farmer.id,
                  note: 'Владелец подтвердил согласие на публикацию',
                },
              ]
            : []),
        ],
      },
    })
  }

  /* ------------------------------- События -------------------------------- */
  log('Создание событий и документов…')
  const eventSamples = [
    { type: 'move', title: 'Перевод в группу раздоя', date: new Date(2025, 0, 14) },
    { type: 'dryOff', title: 'Запуск', date: new Date(2025, 7, 2) },
  ] as const

  for (const e of eventSamples) {
    await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: {
        type: e.type,
        date: e.date.toISOString(),
        title: e.title,
        animal: polyana.id,
        author: farmer.id,
        status: 'accepted',
      },
    })
  }

  await payload.create({
    collection: 'documents',
    overrideAccess: true,
    data: {
      title: 'Племенное свидетельство на корову Поляна',
      type: 'pedigreeCertificate',
      number: 'ПС-2025-000196',
      issuedAt: new Date(2025, 2, 12).toISOString(),
      animal: polyana.id,
      organization: orgs[0].id,
      /*
       * Кто выдал — обязательно для свидетельства.
       *
       * Поле оставалось пустым, и до появления колонки «кем выдан»
       * это было незаметно. Как только колонка появилась, кабинет
       * стал показывать племенное свидетельство как загруженное самим
       * хозяйством — то есть бумагу, за которую Ассоциация не отвечает.
       * Свидетельство без выдавшего есть противоречие: подписывать
       * его больше некому.
       */
      issuedBy: associationUser.id,
    },
  })

  await payload.create({
    collection: 'documents',
    overrideAccess: true,
    data: {
      title: 'Отчёт о генотипировании (SNP-чип 60K)',
      type: 'genotypeReport',
      number: 'GT-2024-1187',
      issuedAt: new Date(2024, 10, 6).toISOString(),
      animal: polyana.id,
      organization: orgs[0].id,
    },
  })

  /*
   * Пересчёт индекса — одним прогоном в конце, а не хуком на каждом животном.
   * Хуки на время сида выключены (`INDEX_VALUES_SKIP`): пересчитывать
   * пять с лишним сотен животных по одному значило бы растянуть наполнение
   * базы на десятки минут ради значений, которые всё равно переписываются.
   */
  const { recomputeAll } = await import('../lib/index-values')
  const { profiles: profileCount, rows } = await recomputeAll(payload)
  log(`Индекс рассчитан: профилей ${profileCount}, значений ${rows}.`)

  log(`Готово. Организаций: ${orgs.length + 1}, животных: ${created + bulls.length + 1}.`)
  log(`Демо-вход: farmer@nazarovskoe.ru / ${PASSWORD}`)
  process.exit(0)
}

/**
 * Разбор ошибки перед выходом.
 *
 * `ValidationError` из Payload печатается как «Следующее поле
 * недействительно: identNumber», а сам разбор — какое значение и чем именно
 * не устроило — лежит в `data.errors` и в консоль выводится как `[Object]`.
 * Отладка по такому сообщению превращается в гадание: нарушен формат,
 * нарушена уникальность и обязательное поле пусто выглядят одинаково.
 *
 * Сид падает редко, но каждый раз после того, как уже стёр базу, — то есть
 * в единственный момент, когда цена непонятной ошибки максимальна.
 */
const describeValidation = (e: unknown): string[] => {
  const errors = (e as { data?: { errors?: unknown[] } })?.data?.errors
  if (!Array.isArray(errors)) return []
  return errors.map((raw) => {
    const it = raw as { path?: string; label?: string; message?: string; value?: unknown }
    const where = it.path ?? it.label ?? 'поле не названо'
    const value = it.value === undefined ? '' : ` (значение: ${JSON.stringify(it.value)})`
    return `${where}: ${it.message ?? 'причина не указана'}${value}`
  })
}

run().catch((e) => {
  const details = describeValidation(e)
  if (details.length) {
    console.error('\nЧто именно не прошло проверку:')
    for (const d of details) console.error(`  ${d}`)
    console.error('')
  }
  console.error(e)
  process.exit(1)
})
