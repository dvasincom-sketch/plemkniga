/**
 * Наполнение прототипа демонстрационными данными.
 * Запуск: npm run seed
 *
 * Скрипт идемпотентен: перед наполнением он удаляет ранее созданные демо-записи.
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import {
  EXTERIOR_COMPOSITES,
  EXTERIOR_TRAITS,
  REGIONS,
} from '../lib/dictionaries'

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

/* --------------------------------- Данные -------------------------------- */
const FARMS = [
  { name: 'ЗАО «Назаровское»', short: 'ЗАО Назаровское', inn: '2456000101', region: REGIONS[4] },
  { name: 'АО «Племзавод Заволжское»', short: 'АО Заволжское', inn: '6330000202', region: REGIONS[0] },
  { name: 'ООО «Русское молоко»', short: 'ООО Русское молоко', inn: '5030000303', region: REGIONS[1] },
  { name: 'СПК «Красная Звезда»', short: 'СПК Красная Звезда', inn: '4312000404', region: REGIONS[8] },
  { name: 'АО «Агрофирма Дороничи»', short: 'АО Дороничи', inn: '4345000505', region: REGIONS[8] },
  { name: 'ООО «Агрокомплекс Кубань»', short: 'ООО Кубань', inn: '2312000606', region: REGIONS[3] },
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

/* --------------------------------- Скрипт -------------------------------- */
const run = async () => {
  const payload = await getPayload({ config })
  const log = (...a: unknown[]) => payload.logger.info(a.join(' '))

  log('Очистка предыдущих демо-данных…')
  for (const collection of ['documents', 'events', 'animals', 'herds', 'users', 'organizations'] as const) {
    await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true })
  }

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
      region: REGIONS[0] as never,
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

  await payload.create({
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
    bulls.push(
      (await payload.create({
        collection: 'animals',
        overrideAccess: true,
        data: {
          identNumber: `HOUSA${String(1000000 + int(100000, 999999)).slice(0, 7)}${i}`,
          idFormat: 'usa',
          name: BULL_NAMES[i],
          kind: 'bull',
          sex: 'male',
          state: 'alive',
          ageGroup: 'bull',
          birthDate: new Date(2016 + (i % 5), i % 12, 1 + (i % 27)).toISOString(),
          breed: 'Голштинская',
          bloodPercent: 100,
          owner: orgs[orgIndex].id,
          author: authorFor(orgIndex),
          publicVisible: true,
          publicDetails: true,
          ipc: between(400, 2600, 1),
          ipcDetails: {
            forecast: between(400, 2600, 1),
            r: between(78, 96, 1),
            percentile: int(60, 99),
          },
          evaluationDate: new Date(2025, 2, 12).toISOString(),
          production: {
            reliabilityLevel: 4,
            milk: { forecast: between(200, 1400, 0), r: between(80, 95, 1) },
            fatPercent: { forecast: between(-0.05, 0.25, 2), r: between(40, 70, 1) },
            proteinPercent: { forecast: between(-0.04, 0.14, 2), r: between(45, 75, 1) },
            fatKg: { forecast: between(10, 60, 1), r: between(78, 92, 1) },
            proteinKg: { forecast: between(8, 45, 1), r: between(80, 94, 1) },
            productionIndex: { forecast: between(90, 130, 1), r: between(70, 90, 1) },
          },
          reproduction: { fertility: { forecast: between(-1.5, 2.5, 1), r: between(50, 80, 1) } },
          health: {
            reliabilityLevel: 3,
            productiveLongevity: { forecast: between(-0.5, 3, 1), r: between(45, 75, 1) },
            udderHealth: { forecast: between(-1, 2.5, 1), r: between(50, 78, 1) },
            calfMortality: { forecast: between(-2, 2, 1), r: between(40, 70, 1) },
            calvingEase: { forecast: between(-1, 2, 1), r: between(45, 72, 1) },
          },
          exterior: Object.fromEntries([
            ...EXTERIOR_TRAITS.map((t) => [t.key, between(-2, 2, 2)]),
            ...EXTERIOR_COMPOSITES.map((t) => [t.key, between(-1.5, 1.8, 2)]),
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

    await payload.create({
      collection: 'animals',
      overrideAccess: true,
      data: {
        identNumber: `${int(30, 39)}${String(int(10000000, 99999999))}${String(int(10, 99))}`,
        idFormat: 'rf',
        name: pick(COW_NAMES),
        kind: isHeifer ? 'heifer' : 'cow',
        sex: 'female',
        state: rnd() < 0.9 ? 'alive' : pick(['sold', 'culled'] as const),
        ageGroup,
        birthDate: new Date(2018 + (i % 5), i % 12, 1 + (i % 27)).toISOString(),
        breed: 'Голштинская',
        bloodPercent: int(75, 100),
        owner: org.id,
        herd: orgHerds[i % orgHerds.length]?.id,
        author: authorFor(orgIndex),
        publicVisible,
        publicDetails,
        father: father.id,
        pedigreeText: {
          fatherId: father.identNumber,
          fatherName: father.name,
          motherId: `${int(30, 39)}${int(10000000, 99999999)}`,
          motherName: pick(COW_NAMES),
          fatherFatherId: pick(SERVICE_BULLS),
          motherFatherId: pick(SERVICE_BULLS),
        },
        inbreeding: between(0, 4.2, 2),
        ipc: between(-1200, 2400, 1),
        ipcDetails: {
          forecast: between(-1200, 2400, 1),
          r: between(35, 88, 1),
          percentile: int(3, 99),
        },
        evaluationDate: new Date(2025, 2, 12).toISOString(),
        production: {
          reliabilityLevel: int(2, 4),
          milk: { forecast: between(-600, 900, 0), r: between(55, 92, 1) },
          fatPercent: { forecast: between(-0.12, 0.2, 2), r: between(30, 60, 1) },
          proteinPercent: { forecast: between(-0.09, 0.12, 2), r: between(38, 68, 1) },
          fatKg: { forecast: between(-10, 42, 1), r: between(60, 88, 1) },
          proteinKg: { forecast: between(-8, 34, 1), r: between(65, 94, 1) },
          productionIndex: { forecast: between(85, 122, 1), r: between(50, 84, 1) },
        },
        reproduction: { fertility: { forecast: between(-2, 2.4, 1), r: between(30, 65, 1) } },
        health: {
          reliabilityLevel: int(2, 4),
          productiveLongevity: { forecast: between(-1.2, 2.6, 1), r: between(28, 62, 1) },
          udderHealth: { forecast: between(-1.6, 2.2, 1), r: between(32, 70, 1) },
          calfMortality: { forecast: between(-2.4, 1.8, 1), r: between(25, 58, 1) },
          calvingEase: { forecast: between(-1.4, 2.1, 1), r: between(30, 64, 1) },
        },
        exterior: Object.fromEntries([
          ...EXTERIOR_TRAITS.map((t) => [t.key, between(-2, 2, 2)]),
          ...EXTERIOR_COMPOSITES.map((t) => [t.key, between(-1.6, 1.6, 2)]),
        ]),
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

  /* ------------------- Показательная карточка «Поляна» --------------------- */
  log('Создание эталонной карточки животного…')
  const polyana = await payload.create({
    collection: 'animals',
    overrideAccess: true,
    data: {
      identNumber: '3662217000196.00',
      idFormat: 'rf',
      name: 'Поляна',
      kind: 'cow',
      sex: 'female',
      state: 'alive',
      ageGroup: 'cow3',
      birthDate: new Date(2017, 4, 18).toISOString(),
      breed: 'Голштинская',
      bloodPercent: 94,
      owner: orgs[0].id,
      herd: herds.find((h) => h.org === orgs[0].id)?.id,
      author: farmer.id,
      publicVisible: true,
      publicDetails: true,
      father: bulls[0].id,
      pedigreeText: {
        fatherId: bulls[0].identNumber,
        fatherName: bulls[0].name,
        motherId: '3662217000042',
        motherName: 'Ромашка',
        fatherFatherId: 'HOUSA0012356',
        motherFatherId: 'HOCAN0007392',
      },
      inbreeding: 1.56,
      ipc: 1284.5,
      ipcDetails: { forecast: 1284.5, r: 71.4, percentile: 88 },
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
        },
      ],
    },
  })

  /* ------------------------------- События -------------------------------- */
  log('Создание событий и документов…')
  const eventSamples = [
    { type: 'calving', title: 'Отёл, тёлочка 38 кг', date: new Date(2025, 0, 14) },
    { type: 'insemination', title: 'Осеменение, HOUSA0148711', date: new Date(2025, 2, 30) },
    { type: 'milkTest', title: 'Контрольная дойка, 34,2 л', date: new Date(2025, 4, 12) },
    { type: 'exteriorScore', title: 'Линейная оценка экстерьера', date: new Date(2025, 5, 3) },
    { type: 'vetTreatment', title: 'Обработка копыт', date: new Date(2025, 6, 21) },
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

  log(`Готово. Организаций: ${orgs.length + 1}, животных: ${created + bulls.length + 1}.`)
  log(`Демо-вход: farmer@nazarovskoe.ru / ${PASSWORD}`)
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
