import 'dotenv/config'

// Пересчёт индекса при массовой записи ни к чему: продуктивность скрипт не трогает
process.env.INDEX_VALUES_SKIP = '1'

import { getPayload } from 'payload'
import config from '../payload.config'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { AFC_PLAUSIBLE } from '../lib/afc'

/**
 * Данные для отчёта «Возраст первого отёла».
 *
 * ## Зачем
 *
 * Отчёт считается из того, что уже введено, — из даты рождения коровы
 * и записи об отёле с номером 1. В демонстрационном стаде не было ни одной
 * коровы, у которой заполнено и то и другое, и страница честно отвечала
 * «пока считать не по чему». Честно и бесполезно: показать раздел нельзя,
 * проверить его на живых данных — тоже.
 *
 * Скрипт достраивает недостающее: дату рождения там, где её нет, отца
 * из числа быков хозяйства и первый отёл. Части коров дописывает второй —
 * без него не считаются дожитие до второй лактации и межотельный период,
 * то есть две колонки из четырёх в разбивке по группам.
 *
 * ## Что он не делает
 *
 * Ничего не удаляет и не переписывает. Корова, у которой первый отёл уже
 * есть, пропускается целиком; заполненная дата рождения остаётся своей.
 * Повторный запуск не удваивает историю — это не удобство, а условие
 * применимости: скрипт задуман для базы, в которой уже есть данные.
 *
 * ## Почему возрасты не случайны
 *
 * Ровное распределение по всему диапазону дало бы отчёт, в котором все
 * четыре группы одинаковы, — то есть картинку, из которой ничего
 * не следует. У настоящего стада возраст первого отёла собран около
 * двадцати шести месяцев с хвостом вправо: ранние отёлы редки, поздние
 * тянутся до трёх лет. Такое распределение и построено — иначе демонстрация
 * показывала бы работу таблицы, но не работу отчёта.
 *
 * Быки различаются намеренно: у одного дочери телятся раньше, у другого
 * позже. Разрез по быкам — половина смысла отчёта, и на стаде, где все быки
 * одинаковы, он выглядит колонкой одинаковых чисел.
 *
 * ## Как это убрать
 *
 * Записанное помечено в поле «Комментарий», и там же сказано, что скрипт
 * дозаполнил у самой коровы: дату рождения, отца или оба. Отметка нужна
 * не для порядка — она и есть способ откатиться. Держать список сделанного
 * рядом со скриптом (в файле, в отдельной таблице) значило бы завести второй
 * источник правды о том, что произошло с записью; список разъедется
 * с базой при первом же ручном удалении. Запись, которая сама помнит,
 * откуда взялась, не разъедется ни с чем.
 *
 *   npm run seed:afc                       # демонстрационное хозяйство
 *   npm run seed:afc -- --org 3
 *   npm run seed:afc -- --dry              # только показать, что сделает
 *   npm run seed:afc -- --undo             # убрать записанное этим скриптом
 */

const args = process.argv.slice(2)
const argOf = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const DRY = args.includes('--dry')
const UNDO = args.includes('--undo')
const ORG_ARG = argOf('org') ? Number(argOf('org')) : undefined

/**
 * Метка в комментарии записи.
 *
 * По ней запись находят при откате, поэтому менять её нельзя, не убрав
 * прежде записанное старой версией: изменённая метка означает, что
 * прошлые записи больше не найти, и они останутся в базе навсегда,
 * выглядя настоящими.
 */
const MARK = 'seed:afc'
const patchNote = (fields: string[]): string =>
  `Демонстрационные данные (${MARK})${fields.length ? `; заполнено у животного: ${fields.join(', ')}` : ''}`

/** Хозяйство по умолчанию — то, под которым показывают систему. */
const DEMO_ORG_EMAIL = 'farmer@nazarovskoe.ru'

const { uri, source } = resolveDatabase()

/* --------------------------- Немного случайности ------------------------- */

let seed = 20260824
/** Свой генератор: прогон должен повторяться, а Math.random — нет. */
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1))
const chance = (p: number) => rnd() < p

/**
 * Возраст первого отёла в месяцах.
 *
 * Сумма трёх случайных чисел вместо одного: так получается горб вместо
 * ровной полки — приём старый и здесь достаточный, городить нормальное
 * распределение ради демонстрационных данных незачем. Сдвиг `shift`
 * задаёт быка: у одного дочери телятся на пару месяцев раньше, у другого
 * позже.
 */
const drawAfc = (shift: number): number => {
  const base = (int(0, 7) + int(0, 7) + int(0, 7)) / 3
  const months = Math.round(22 + base + shift)
  /*
   * Обрезка по тем же границам, по которым отчёт отбрасывает записи.
   * Выйдя за них, запись не попадёт в отчёт вовсе — то есть скрипт
   * сделает вид, что заполнил, а страница этого не увидит.
   */
  return Math.min(Math.max(months, AFC_PLAUSIBLE.min + 1), AFC_PLAUSIBLE.max - 6)
}

const addMonths = (d: Date, months: number): Date => {
  const out = new Date(d)
  out.setMonth(out.getMonth() + months)
  return out
}
const addDays = (d: Date, days: number): Date => {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}
const iso = (d: Date): string => d.toISOString()

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})`)
  if (DRY) console.log('Пробный прогон: ничего не записывается\n')

  const payload = await getPayload({ config })

  /* --------------------------- Чьё стадо --------------------------- */

  let orgId = ORG_ARG
  if (!orgId) {
    const owner = await payload.find({
      collection: 'users',
      where: { email: { equals: DEMO_ORG_EMAIL } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    const rel = owner.docs[0]?.organization
    orgId = typeof rel === 'number' ? rel : ((rel as { id?: number } | null)?.id ?? undefined)
  }

  if (!orgId) {
    console.error(
      `Не нашёл хозяйство: ни --org, ни учётной записи ${DEMO_ORG_EMAIL}. ` +
        'Укажите хозяйство явно: npm run seed:afc -- --org <id>',
    )
    process.exit(1)
  }

  const org = await payload.findByID({
    collection: 'organizations',
    id: orgId,
    depth: 0,
    overrideAccess: true,
  })
  console.log(`Хозяйство: ${org.name} (id ${orgId})\n`)

  /* ------------------------------ Откат ------------------------------ */

  if (UNDO) {
    const mine = await payload.find({
      collection: 'calvings',
      where: { and: [{ ownerOrg: { equals: orgId } }, { comment: { like: MARK } }] },
      depth: 0,
      limit: 5000,
      overrideAccess: true,
    })

    let removed = 0
    let reverted = 0

    for (const row of mine.docs) {
      const note = String(row.comment ?? '')
      const animalId = typeof row.animal === 'number' ? row.animal : (row.animal as { id: number })?.id

      /*
       * Сначала возвращаются поля животного, потом удаляется запись:
       * в обратном порядке отметка о том, что именно чинить, исчезнет
       * раньше, чем ею воспользуются.
       */
      const revert: Record<string, unknown> = {}
      if (note.includes('дата рождения')) revert.birthDate = null
      if (note.includes('отец')) revert.father = null

      if (!DRY) {
        if (animalId && Object.keys(revert).length > 0) {
          await payload.update({
            collection: 'animals',
            id: animalId,
            data: revert as never,
            overrideAccess: true,
          })
          reverted += 1
        }
        await payload.delete({ collection: 'calvings', id: row.id, overrideAccess: true })
      }
      removed += 1
    }

    console.log(`  отёлов убрано:            ${removed}`)
    console.log(`  животных возвращено:      ${reverted}`)
    console.log(DRY ? '\nПробный прогон окончен.' : '\nГотово.')
    process.exit(0)
  }

  /* ------------------------------ Быки ------------------------------ */

  const bulls = await payload.find({
    collection: 'animals',
    where: { and: [{ owner: { equals: orgId } }, { sex: { equals: 'male' } }] },
    depth: 0,
    limit: 50,
    overrideAccess: true,
  })

  if (bulls.docs.length === 0) {
    console.error(
      'В хозяйстве нет быков. Разрез отчёта по быкам строится от поля «отец», ' +
        'и без единого быка отчёт покажет только свод по стаду.',
    )
  }

  /*
   * Сдвиг возраста у каждого быка свой и назначается по порядку, а не
   * случайно: так у первого дочери заведомо телятся раньше, а у последнего
   * позже, и разрез по быкам показывает разницу, а не шум.
   */
  const sires = bulls.docs.map((b, i) => ({
    id: b.id as number,
    name: b.name ?? String(b.identNumber),
    shift: -2 + (i % 5) * 1.5,
  }))

  /* ------------------------------ Коровы ------------------------------ */

  const cows = await payload.find({
    collection: 'animals',
    where: {
      and: [
        { owner: { equals: orgId } },
        { sex: { equals: 'female' } },
        { archived: { not_equals: true } },
      ],
    },
    depth: 0,
    limit: 1000,
    overrideAccess: true,
  })

  console.log(`Коров в стаде: ${cows.docs.length}`)

  let withCalving = 0
  let born = 0
  let fathered = 0
  let first = 0
  let second = 0
  let skipped = 0

  const today = new Date()

  for (const cow of cows.docs) {
    const cowId = cow.id as number

    /*
     * Первый отёл уже есть — корова не трогается вовсе. Дописать ей второй
     * отёл было бы соблазнительно, но скрипт не знает, откуда взялся первый:
     * настоящую запись хозяйства он бы дополнил выдуманной.
     */
    const existing = await payload.count({
      collection: 'calvings',
      where: { and: [{ animal: { equals: cowId } }, { number: { equals: 1 } }] },
      overrideAccess: true,
    })
    if (existing.totalDocs > 0) {
      withCalving += 1
      continue
    }

    const sire = sires.length ? sires[int(0, sires.length - 1)] : null
    const afc = drawAfc(sire?.shift ?? 0)

    /*
     * Дата рождения: своя, если есть. Иначе такая, чтобы корова успела
     * отелиться и пожить после — от года до пяти лет назад плюс сам возраст
     * первого отёла. Родить сегодня и отелиться завтра она не может.
     */
    const patch: Record<string, unknown> = {}
    const patched: string[] = []
    let birth = cow.birthDate ? new Date(cow.birthDate) : null
    if (!birth || Number.isNaN(birth.getTime())) {
      birth = addMonths(today, -(afc + int(12, 60)))
      patch.birthDate = iso(birth)
      patched.push('дата рождения')
      born += 1
    }

    if (!cow.father && sire) {
      patch.father = sire.id
      patched.push('отец')
      fathered += 1
    }

    const firstDate = addMonths(birth, afc)
    /*
     * Отёл в будущем означал бы корову, которая ещё не телилась, — а мы
     * как раз записываем, что телилась. Такая запись прошла бы в базу
     * и попала бы в отчёт числом, которого не может быть.
     */
    if (firstDate.getTime() > today.getTime()) {
      skipped += 1
      continue
    }

    if (!DRY) {
      if (Object.keys(patch).length > 0) {
        await payload.update({
          collection: 'animals',
          id: cowId,
          data: patch as never,
          overrideAccess: true,
        })
      }

      await payload.create({
        collection: 'calvings',
        data: {
          animal: cowId,
          number: 1,
          date: iso(firstDate),
          result: chance(0.48) ? 'heifer' : 'bull',
          comment: patchNote(patched),
        } as never,
        overrideAccess: true,
      })
    }
    first += 1

    /*
     * Второй отёл — примерно двум коровам из трёх. Не всем: доля доживших
     * до второй лактации и есть то, что показывает отчёт, и стадо, где
     * дожили все, отвечает на этот вопрос «сто процентов» во всех группах.
     *
     * Дожитие связано с возрастом первого отёла — ради этой связи отчёт
     * и написан, — поэтому у поздно отелившихся оно ниже.
     */
    const survives = chance(afc <= 27 ? 0.78 : 0.55)
    const secondDate = addDays(firstDate, int(370, 430))
    if (survives && secondDate.getTime() <= today.getTime()) {
      if (!DRY) {
        await payload.create({
          collection: 'calvings',
          data: {
            animal: cowId,
            number: 2,
            date: iso(secondDate),
            result: chance(0.48) ? 'heifer' : 'bull',
            /* У второго отёла отметки о правках нет: поля животного чинил первый */
            comment: patchNote([]),
          } as never,
          overrideAccess: true,
        })
      }
      second += 1
    }
  }

  console.log('')
  console.log(`  первый отёл записан:      ${first}`)
  console.log(`  второй отёл записан:      ${second}`)
  console.log(`  дата рождения заполнена:  ${born}`)
  console.log(`  отец проставлен:          ${fathered}`)
  console.log(`  уже были с первым отёлом: ${withCalving}`)
  if (skipped > 0) console.log(`  пропущено (отёл вышел бы в будущем): ${skipped}`)

  /*
   * Разрез по быкам показывается только для тех, у кого не меньше трёх
   * дочерей: число, посчитанное на двух коровах, читают как число.
   * Если после прогона таких быков не набралось, отчёт покажет свод
   * и пустую таблицу быков — и это стоит сказать сразу, а не оставить
   * человеку гадать, почему её нет.
   */
  if (!DRY && sires.length > 0) {
    console.log(`\n  быков в хозяйстве: ${sires.length}; в разрез попадут те, у кого от 3 дочерей`)
  }

  console.log(DRY ? '\nПробный прогон окончен.' : '\nГотово. Откройте «Стадо → Отчёты».')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
