import 'dotenv/config'

// Пересчёт индекса при массовой записи ни к чему: животных скрипт не трогает
process.env.INDEX_VALUES_SKIP = '1'

import { getPayload } from 'payload'
import config from '../payload.config'
import { maskUri, resolveDatabase } from '../lib/db-url'
import type { Animal } from '../payload-types'

/**
 * История за последний год — без единого удаления.
 *
 * В сиде развёрнутая история есть только у эталонной коровы, и та датирована
 * 2019–2021 годами. Владелец, открывая карточку своего животного, видел пустые
 * таблицы: отёлов нет, доек нет, событий нет. Проверить на таком стаде ни ленту
 * событий, ни динамику продуктивности нельзя.
 *
 * Скрипт достраивает каждой корове двенадцать месяцев жизни, считая назад
 * от сегодняшнего дня: помесячные контрольные дойки по лактационной кривой,
 * отёл, осеменения после него, редкие ветеринарные события и записи в ленту.
 *
 * Ничего не удаляет и не переписывает. Корова, у которой контрольные дойки
 * за последний год уже есть, пропускается — повторный запуск не удваивает
 * историю. Это осознанно: скрипт задуман как безопасный для базы с данными,
 * в отличие от сида.
 *
 *   npm run seed:history            # достроить всем, кому не хватает
 *   npm run seed:history -- --limit 20
 */

const args = process.argv.slice(2)
const limitArg = (() => {
  const at = args.indexOf('--limit')
  return at >= 0 ? Number(args[at + 1]) : undefined
})()

const { uri, source } = resolveDatabase()

/* --------------------------- Немного случайности ------------------------- */

let seed = 20260816
/** Свой генератор: прогон должен повторяться, а Math.random — нет. */
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const between = (a: number, b: number, digits = 1) =>
  Math.round((a + rnd() * (b - a)) * 10 ** digits) / 10 ** digits
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1))
const chance = (p: number) => rnd() < p
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]

/**
 * Суточный удой на n-м дне лактации — кривая Вуда в упрощённом виде.
 *
 * Раздой до пика примерно на шестидесятом дне, дальше плавный спад.
 * Без кривой помесячные дойки выглядели бы случайным шумом, и график
 * динамики ничего бы не показывал.
 */
const dailyYield = (day: number, peak: number) => {
  if (day <= 0) return 0
  const rise = 1 - Math.exp(-day / 22)
  const decline = Math.exp(-0.0022 * Math.max(0, day - 60))
  return Math.max(4, peak * rise * decline)
}

const daysAgo = (from: Date, days: number) => {
  const d = new Date(from)
  d.setDate(d.getDate() - days)
  return d
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})\n`)
  const payload = await getPayload({ config })

  /** Справочники по коду: id нужны для ссылок в записях. */
  const dict = async (collection: string, code: string): Promise<number | undefined> => {
    const r = await payload.find({
      collection: collection as 'health-event-types',
      where: { code: { equals: code } },
      limit: 1,
      overrideAccess: true,
    })
    return r.docs[0]?.id as number | undefined
  }

  const [semenConventional, methodAI, resultPositive, resultNegative] = await Promise.all([
    dict('semen-types', '1'),
    dict('reproduction-methods', '1'),
    dict('insemination-results', '1'),
    dict('insemination-results', '2'),
  ])
  const healthTypes = {
    mastitis: await dict('health-event-types', 'MAST'),
    hoof: await dict('health-event-types', 'HOOF'),
    ketosis: await dict('health-event-types', 'KETO'),
  }

  const bulls = await payload.find({
    collection: 'animals',
    where: { sex: { equals: 'male' } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  const bullIds = bulls.docs.map((b) => b.id as number)

  const labs = await payload.find({
    collection: 'organizations',
    where: { type: { equals: 'service' } },
    limit: 5,
    overrideAccess: true,
  })
  const labId = labs.docs[0]?.id as number | undefined

  const techs = await payload.find({ collection: 'technicians', limit: 10, overrideAccess: true })
  const techIds = techs.docs.map((t) => t.id as number)

  /*
   * Берём только коров и первотёлок: у тёлок лактации ещё нет, у быков
   * её не будет никогда, а служебные записи предков — вообще не поголовье.
   */
  const cows = await payload.find({
    collection: 'animals',
    where: {
      and: [
        { sex: { equals: 'female' } },
        { ageGroup: { in: ['firstCalf', 'cow2', 'cow3'] } },
        { or: [{ archived: { equals: false } }, { archived: { exists: false } }] },
      ],
    },
    limit: limitArg ?? 1000,
    depth: 0,
    sort: 'id',
    overrideAccess: true,
  })

  const today = new Date()
  const yearAgo = daysAgo(today, 365)
  console.log(`Коров в работе: ${cows.totalDocs}\n`)

  let touched = 0
  let skipped = 0
  const counts = { tests: 0, calvings: 0, inseminations: 0, health: 0, events: 0 }

  for (const animal of cows.docs as Animal[]) {
    // Уже есть история за год — не трогаем
    const existing = await payload.count({
      collection: 'milk-tests',
      where: {
        and: [{ animal: { equals: animal.id } }, { date: { greater_than: yearAgo.toISOString() } }],
      },
      overrideAccess: true,
    })
    if ((existing.totalDocs ?? 0) > 0) {
      skipped += 1
      continue
    }

    const lactationNumber =
      animal.ageGroup === 'firstCalf' ? 1 : animal.ageGroup === 'cow2' ? 2 : int(3, 5)

    /*
     * Отёл ставится в промежуток от 40 до 330 дней назад: так в стаде
     * оказываются коровы на разных стадиях лактации — кто-то в раздое,
     * кто-то на спаде, кто-то в запуске. Ровный по стаду день лактации
     * выглядел бы сгенерированным и не дал бы проверить ни один отчёт.
     */
    const calvingDaysAgo = int(40, 330)
    const calvingDate = daysAgo(today, calvingDaysAgo)

    await payload.create({
      collection: 'calvings',
      overrideAccess: true,
      data: {
        animal: animal.id,
        number: lactationNumber,
        date: calvingDate.toISOString(),
        result: pick(['heifer', 'bull', 'heifer', 'bull', 'twins', 'stillborn'] as const),
        ease: pick(['easy', 'easy', 'easy', 'assisted', 'hard'] as const),
        calfWeight: int(30, 46),
        comment: '',
      },
    })
    counts.calvings += 1

    // Контрольные дойки: раз в месяц от отёла до сегодня
    const peak = between(28, 46, 1)
    let month = 1
    for (let day = 20; day <= calvingDaysAgo; day += 30) {
      const date = new Date(calvingDate)
      date.setDate(date.getDate() + day)
      if (date > today) break

      const yieldDay = dailyYield(day, peak)
      await payload.create({
        collection: 'milk-tests',
        overrideAccess: true,
        data: {
          animal: animal.id,
          date: date.toISOString(),
          lactationNumber,
          dailyYield: Math.round(yieldDay * 10) / 10,
          // Жир и белок растут к концу лактации — обратная зависимость с удоем
          fatPercent: between(3.5 + day / 900, 4.2 + day / 900, 2),
          proteinPercent: between(3.0 + day / 1500, 3.45 + day / 1500, 2),
          somaticCells: int(60, 420),
          laboratory: labId,
          source: 'lab',
        },
      })
      counts.tests += 1
      month += 1
    }

    // Осеменения: первое через 60–90 дней после отёла, дальше при неудаче
    let attempt = 1
    let inseminationDay = int(60, 95)
    while (inseminationDay <= calvingDaysAgo && attempt <= 3) {
      const date = new Date(calvingDate)
      date.setDate(date.getDate() + inseminationDay)
      const success = chance(attempt === 1 ? 0.45 : 0.6)

      await payload.create({
        collection: 'inseminations',
        overrideAccess: true,
        data: {
          animal: animal.id,
          lactationNumber,
          date: date.toISOString(),
          bull: bullIds.length ? pick(bullIds) : undefined,
          semenType: semenConventional,
          method: methodAI,
          doses: 1,
          attemptNumber: attempt,
          technician: techIds.length ? pick(techIds) : undefined,
          result: success ? resultPositive : resultNegative,
          pregnancyCheckDate: daysAgo(date, -35).toISOString(),
          source: 'manual',
        },
      })
      counts.inseminations += 1

      if (success) break
      attempt += 1
      inseminationDay += int(21, 24)
    }

    // Ветеринарные события — редкие, как в жизни
    if (chance(0.22) && healthTypes.mastitis) {
      const date = daysAgo(today, int(10, 300))
      await payload.create({
        collection: 'health-events',
        overrideAccess: true,
        data: {
          animal: animal.id,
          type: healthTypes.mastitis,
          date: date.toISOString(),
          title: pick([
            'Клинический мастит, четверть ЛП',
            'Субклинический мастит, четверть ПЗ',
            'Клинический мастит, четверть ПП',
          ]),
          severity: pick(['mild', 'moderate', 'severe'] as const),
          startDate: date.toISOString(),
          endDate: daysAgo(date, -int(4, 12)).toISOString(),
        },
      })
      counts.health += 1
    }
    if (chance(0.35) && healthTypes.hoof) {
      const date = daysAgo(today, int(20, 340))
      await payload.create({
        collection: 'health-events',
        overrideAccess: true,
        data: {
          animal: animal.id,
          type: healthTypes.hoof,
          date: date.toISOString(),
          title: 'Плановая расчистка копыт',
          severity: 'mild',
        },
      })
      counts.health += 1
    }
    if (chance(0.12) && healthTypes.ketosis) {
      const date = new Date(calvingDate)
      date.setDate(date.getDate() + int(5, 30))
      if (date <= today) {
        await payload.create({
          collection: 'health-events',
          overrideAccess: true,
          data: {
            animal: animal.id,
            type: healthTypes.ketosis,
            date: date.toISOString(),
            title: 'Субклинический кетоз после отёла',
            severity: 'moderate',
          },
        })
        counts.health += 1
      }
    }

    /*
     * Лента событий: то, что не попало в специализированные коллекции —
     * запуск, оценка экстерьера, перевод между группами. Без них хроника
     * состояла бы из одних доек.
     */
    if (calvingDaysAgo > 300) {
      const dryOff = new Date(calvingDate)
      dryOff.setDate(dryOff.getDate() + 305)
      if (dryOff <= today) {
        await payload.create({
          collection: 'events',
          overrideAccess: true,
          data: {
            type: 'dryOff',
            date: dryOff.toISOString(),
            animal: animal.id,
            title: 'Запуск перед отёлом',
            status: 'accepted',
          },
        })
        counts.events += 1
      }
    }
    /*
     * Оценка экстерьера больше не заводится событием: у неё своя таблица
     * со всеми линейными признаками. Демонстрационные оценки создаёт
     * `backfill:evaluations`, здесь дублировать их отметкой без цифр незачем.
     */
    if (chance(0.18)) {
      await payload.create({
        collection: 'events',
        overrideAccess: true,
        data: {
          type: 'move',
          date: daysAgo(today, int(15, 350)).toISOString(),
          animal: animal.id,
          title: pick([
            'Перевод в группу раздоя',
            'Перевод в группу середины лактации',
            'Перевод в сухостойную группу',
          ]),
          status: 'accepted',
        },
      })
      counts.events += 1
    }

    touched += 1
    if (touched % 25 === 0) console.log(`  обработано коров: ${touched}`)
  }

  console.log(
    `\nГотово. Коров достроено: ${touched}, пропущено (история уже есть): ${skipped}.\n` +
      `  контрольные дойки: ${counts.tests}\n` +
      `  отёлы: ${counts.calvings}\n` +
      `  осеменения: ${counts.inseminations}\n` +
      `  события здоровья: ${counts.health}\n` +
      `  записи в ленте: ${counts.events}`,
  )
  process.exit(0)
}

main().catch((e) => {
  console.error('\nОшибка:', e instanceof Error ? e.message : e)
  process.exit(1)
})
