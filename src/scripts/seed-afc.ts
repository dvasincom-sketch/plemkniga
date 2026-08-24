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
 * ## Про то, в какую базу он пишет
 *
 * В ту, которую назовёт `DATABASE_URI`, — а он берётся из `.env`, где стоит
 * база разработки. Прогон «у себя» наполняет localhost и не трогает прод:
 * прод ходит в управляемый PostgreSQL на другом хосте, и деплой кода данные
 * туда не переносит. Ровно на этом здесь и споткнулись: страница
 * на localhost ожила, на проде осталась пустой, и выглядело это как
 * незавершённый деплой.
 *
 * Поэтому база печатается первой строкой, а запись в неместную требует
 * `--remote`. Не из чрезмерной осторожности: скрипт сочиняет записи,
 * и ошибиться базой здесь дороже, чем в скрипте, который только читает.
 * Отката это не отменяет, но откат — уже уборка, а не отсутствие мусора.
 *
 *   npm run seed:afc                       # демонстрационное хозяйство
 *   npm run seed:afc -- --org 3
 *   npm run seed:afc -- --limit 100        # взять меньше коров
 *   npm run seed:afc -- --dry              # только показать, что сделает
 *   npm run seed:afc -- --undo             # убрать записанное этим скриптом
 *
 *   # прод: строку подключения берём из окружения развёртывания
 *   DATABASE_URI='postgres://…' npm run seed:afc -- --dry
 *   DATABASE_URI='postgres://…' npm run seed:afc -- --remote
 */

const args = process.argv.slice(2)
const argOf = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const DRY = args.includes('--dry')
const UNDO = args.includes('--undo')
const REMOTE = args.includes('--remote')
const ORG_ARG = argOf('org') ? Number(argOf('org')) : undefined

/**
 * Сколько коров брать за прогон.
 *
 * Потолок нужен из-за сети: на своей машине разница незаметна, а через
 * канал до управляемой базы каждая запись — это обмен по сети, и стадо
 * в несколько тысяч голов превращает демонстрацию в получасовое ожидание.
 * Для отчёта столько и не нужно: он показывает распределение, а не перепись.
 */
const LIMIT = Number(argOf('limit') ?? 400)

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

/**
 * База на этой же машине?
 *
 * Проверка по хосту в строке подключения, а не по имени окружения:
 * `NODE_ENV` говорит, как собрано приложение, и ничего не говорит о том,
 * куда оно смотрит. Запустить сборку разработки против боевой базы —
 * обычное дело, и именно этот случай надо поймать.
 */
const isLocal = (connection: string): boolean =>
  /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:/]/.test(connection) ||
  connection.includes('/var/run/postgresql')

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})`)
  if (DRY) console.log('Пробный прогон: ничего не записывается\n')

  /*
   * Отказ до подключения, а не после: узнать, что писали не туда, надо
   * раньше первой записи, а не по её следам.
   */
  if (!DRY && !isLocal(uri ?? '') && !REMOTE) {
    console.error(
      '\nЭта база не на вашей машине, а скрипт сочиняет записи.\n' +
        'Если вы правда хотите наполнить её — повторите с --remote:\n' +
        '  npm run seed:afc -- --remote\n' +
        'Посмотреть, что будет сделано, можно без ключа: npm run seed:afc -- --dry\n',
    )
    process.exit(1)
  }

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
    /*
     * Дата рождения быка нужна не для отчёта, а чтобы не сочинить
     * невозможное: у карточки животного стоит проверка «потомок не может
     * родиться раньше родителя», и она права. Скрипт проставлял отца
     * случайным из стада — и на первом же быке, который моложе коровы,
     * запись отвергалась, а прогон обрывался целиком.
     */
    birth: b.birthDate ? new Date(b.birthDate).getTime() : null,
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
    limit: LIMIT,
    overrideAccess: true,
  })

  console.log(`Коров в стаде: ${cows.docs.length} (потолок за прогон: ${LIMIT})`)

  /*
   * Кто уже отелился — одним запросом, а не по корове.
   *
   * Раньше на каждую корову шёл свой `count`, и на своей машине это ничего
   * не стоило: тысяча запросов к базе на том же хосте укладывается в секунды.
   * Через сеть до управляемой базы та же тысяча превращается в тысячу
   * обменов по сети и в минуты ожидания — при том, что ответ на все
   * умещается в один запрос.
   */
  const cowIds = cows.docs.map((c) => c.id as number)
  const already = new Set<number>()
  if (cowIds.length > 0) {
    const existing = await payload.find({
      collection: 'calvings',
      where: { and: [{ animal: { in: cowIds } }, { number: { equals: 1 } }] },
      depth: 0,
      limit: 100_000,
      overrideAccess: true,
    })
    for (const row of existing.docs) {
      const id = typeof row.animal === 'number' ? row.animal : (row.animal as { id?: number })?.id
      if (id) already.add(id)
    }
  }

  let withCalving = 0
  let born = 0
  let fathered = 0
  let first = 0
  let second = 0
  let skipped = 0
  let noSire = 0
  /** Кого база не приняла и почему — печатается в конце, а не глотается. */
  const rejected: string[] = []

  const today = new Date()

  for (const cow of cows.docs) {
    const cowId = cow.id as number

    /*
     * Первый отёл уже есть — корова не трогается вовсе. Дописать ей второй
     * отёл было бы соблазнительно, но скрипт не знает, откуда взялся первый:
     * настоящую запись хозяйства он бы дополнил выдуманной.
     */
    if (already.has(cowId)) {
      withCalving += 1
      continue
    }

    /*
     * Сначала дата рождения, потом отец — порядок обязателен.
     *
     * Отец выбирается из тех быков, что родились раньше коровы, а значит
     * знать её дату надо до выбора. В обратном порядке — сначала случайный
     * бык, потом дата — скрипт и сочинял невозможное: корову старше
     * собственного отца.
     *
     * Дата берётся своя, если есть. Иначе такая, чтобы корова успела
     * отелиться и пожить после: от года до пяти лет назад плюс сам возраст
     * первого отёла. Возраст здесь считается без поправки на быка — она
     * меньше пары месяцев и на выбор даты не влияет, а зависимость
     * «дата от быка, бык от даты» замкнула бы круг.
     */
    const patch: Record<string, unknown> = {}
    const patched: string[] = []
    let birth = cow.birthDate ? new Date(cow.birthDate) : null
    if (!birth || Number.isNaN(birth.getTime())) {
      birth = addMonths(today, -(drawAfc(0) + int(12, 60)))
      patch.birthDate = iso(birth)
      patched.push('дата рождения')
    }

    /*
     * Бык без даты рождения годится: проверка сравнивает две даты и при
     * отсутствии одной из них не срабатывает. Это не лазейка — про такого
     * быка просто ничего не известно, и запретить связь было бы
     * утверждением, которого никто не проверял.
     */
    const eligible = sires.filter((s) => s.birth === null || s.birth < birth.getTime())
    const sire = eligible.length ? eligible[int(0, eligible.length - 1)] : null
    const afc = drawAfc(sire?.shift ?? 0)

    if (!cow.father && sire) {
      patch.father = sire.id
      patched.push('отец')
    } else if (!cow.father && sires.length > 0) {
      /*
       * Быки в стаде есть, но все моложе этой коровы. Молча оставить её
       * без отца можно — отчёт по стаду от этого не пострадает, — но
       * в разрезе по быкам её не будет, и знать об этом полезно.
       */
      noSire += 1
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
        /*
         * Отказ на одной корове не должен обрывать прогон, но и молчать
         * о нём нельзя: карточка могла копить противоречие годами, и запрет
         * на запись — это отчёт о нём, а не помеха. Причина запоминается
         * и печатается в конце; корова пропускается целиком, потому что
         * без даты рождения отёл, который мы ей припишем, в отчёт всё равно
         * не попадёт — получилась бы запись, не делающая ничего.
         */
        try {
          await payload.update({
            collection: 'animals',
            id: cowId,
            data: patch as never,
            overrideAccess: true,
          })
        } catch (e) {
          rejected.push(
            `${cow.identNumber ?? cowId}: ${e instanceof Error ? e.message : String(e)}`,
          )
          continue
        }
      }
    }

    /*
     * Счётчики после записи, а не до неё.
     *
     * Считать в момент, когда поле только собрались записать, — значит
     * посчитать и то, что база потом отвергла: итог показывал бы работу,
     * которой не было. В пробном прогоне записи нет вовсе, и там считается
     * намерение — это и есть его смысл.
     */
    if (patched.includes('дата рождения')) born += 1
    if (patched.includes('отец')) fathered += 1

    if (!DRY) {
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
  if (noSire > 0) console.log(`  осталось без отца (все быки моложе):  ${noSire}`)

  if (rejected.length > 0) {
    console.log(`\n  База не приняла ${rejected.length}:`)
    for (const line of rejected.slice(0, 20)) console.log(`    ${line}`)
    if (rejected.length > 20) console.log(`    …и ещё ${rejected.length - 20}`)
  }

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
