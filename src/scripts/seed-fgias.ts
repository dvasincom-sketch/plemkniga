import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { biggestHerd } from '@/lib/biggest-herd'
import { maskUri, resolveDatabase } from '@/lib/db-url'
import { WEIGHING_SIGNS } from '@/lib/weighing'
import { ISAG_LOCI, isagField } from '@/lib/isag'

/**
 * Демонстрационные данные под то, что заведено ради ФГИАС ПР.
 *
 * ## Зачем
 *
 * Выставки, взвешивания, бонитировки и подробности ДНК-теста завелись
 * за последние дни, и в книге их нет ни у одного животного. Поля есть,
 * разделы карточки написаны, выгрузка собирается — а показать нечего:
 * каждый раздел не отрисовывается, потому что пуст.
 *
 * Пустой раздел и работающий раздел выглядят одинаково, и различить их
 * можно только данными. Пока их нет, ни мы, ни хозяйство не знаем,
 * что из написанного действительно работает.
 *
 * ## Почему демонстрационные, а не «примерно как в жизни»
 *
 * Числа здесь правдоподобны, но выдуманы, и это сказано вслух в примечании
 * каждой записи. Смешать их с настоящими значило бы посчитать однажды
 * среднюю массу по стаду и получить нашу выдумку — беда, которая
 * в этом проекте уже случалась с проверками (решение про стенд
 * `seed:flaws`).
 *
 * Поэтому у каждой записи в примечании стоит «демонстрационная запись»,
 * а у скрипта есть `--drop`, убирающий ровно их.
 *
 *   npm run seed:fgias                      — завести
 *   npm run seed:fgias -- --drop            — убрать
 *   npm run seed:fgias -- --org 12          — в хозяйство по номеру
 *   npm run seed:fgias -- --org Назаровское — или по части названия
 *
 * Без `--org` берётся наибольшее стадо, а смотреть данные человек будет
 * в своём. Это разные хозяйства чаще, чем кажется.
 *
 * В удалённую базу — только с подтверждением, см. `isLocalDatabase` ниже:
 *
 *   DATABASE_URI="postgresql://…" SEED_CONFIRM=1 npm run seed:fgias
 *
 * ## Почему не на всё стадо
 *
 * Двадцати животных хватает, чтобы увидеть каждый раздел и каждый вид
 * записи. Полторы тысячи взвешиваний не покажут ничего сверх двадцати,
 * зато испортят любую сводку по массе — а сводки эти скоро появятся.
 */

const DROP = process.argv.includes('--drop')
const NOTE = 'демонстрационная запись'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

/** Сколько животных трогаем. */
const HOW_MANY = 20

/** Дата за N месяцев до сегодня — ГГГГ-ММ-ДД, без зависимости от пояса. */
const monthsAgo = (n: number): string => {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Предохранитель: в удалённую базу выдумка не поедет без слова вслух.
 *
 * ## Почему он здесь появился
 *
 * Этот сид не стирает ничего — тем он и отличается от `npm run seed`,
 * у которого предохранитель стоит с тех пор, как его запуск однажды
 * уничтожил данные на проде. Но он делает другое и по-своему скверное:
 * дописывает выдуманные записи к настоящим животным настоящего
 * хозяйства.
 *
 * Стереть можно восстановить из копии. Смешать выдумку с настоящими
 * данными нельзя «откатить»: часть пометок сотрут при первой же правке
 * руками, и через месяц никто не скажет, какие взвешивания наши.
 *
 * ## Почему по признаку «не локальная», а не по `NODE_ENV`
 *
 * `NODE_ENV` описывает, как собрано приложение, а не куда смотрит база.
 * Скрипт запускают со своей машины с прод-строкой в переменной — ровно
 * так, как в документации запускают миграции, — и `NODE_ENV` там
 * остаётся `development`. Спрашивать надо про базу, а спрашивает
 * `NODE_ENV` про сборку.
 *
 * Локальная база узнаётся по хосту. Всё остальное считается чужим,
 * включая базы коллег: писать выдумку в чужую книгу без спроса не лучше,
 * чем в прод.
 */
const isLocalDatabase = (uri: string): boolean =>
  /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(uri) || !/@/.test(uri)

/**
 * Хозяйство по номеру или по части названия.
 *
 * Неоднозначность не разрешается за человека: два хозяйства со словом
 * «Заря» в названии — повод спросить, а не повод угадать. Сид пишет
 * записи в чужое стадо, и ошибка выбора стоит дороже лишнего вопроса.
 */
async function resolveOrg(
  payload: Awaited<ReturnType<typeof getPayload>>,
  what: string,
): Promise<number | null> {
  const asNumber = Number(what)
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber

  const { docs } = await payload.find({
    collection: 'organizations',
    where: { name: { like: what } },
    limit: 10,
    depth: 0,
    overrideAccess: true,
  })

  if (docs.length === 0) {
    console.error(`\nХозяйства со словом «${what}» в названии не нашлось.\n`)
    return null
  }

  if (docs.length > 1) {
    console.error(`\nПод «${what}» подходит несколько хозяйств — уточните номером:\n`)
    for (const o of docs) console.error(`  --org ${o.id}   ${(o as { name?: string }).name ?? ''}`)
    console.error('')
    return null
  }

  return docs[0]!.id as number
}

async function main() {
  const db = resolveDatabase()
  const local = isLocalDatabase(db.uri ?? '')

  console.log(`\nБаза: ${maskUri(db.uri ?? '')}`)

  if (!local && process.env.SEED_CONFIRM !== '1') {
    console.error(
      '\nЭто не локальная база, а сид пишет в неё демонстрационные записи —\n' +
        'взвешивания, выставки и реквизиты ДНК-теста настоящим животным.\n\n' +
        'Стереть лишнее можно (--drop), но не всё: ДНК-подробности дописаны\n' +
        'к чужим записям, и отличить их от внесённых руками потом нельзя.\n\n' +
        'Если это осознанно — тем же запуском с подтверждением:\n' +
        '  SEED_CONFIRM=1 npm run seed:fgias\n',
    )
    process.exit(1)
  }

  const payload = await getPayload({ config })

  /*
   * `--org` принимает и номер, и часть названия.
   *
   * Наибольшее стадо — разумное умолчание для проверок, но не для показа:
   * первый прогон завёл демо-данные хозяйству «Синтетика», а смотрит
   * их человек, вошедший под «ЗАО Назаровское». Разделы карточки
   * остались пустыми, и виноватым выглядел код, а не выбор хозяйства.
   *
   * Номер своего хозяйства человек не знает и знать не должен — он знает
   * его название. Поиск по части названия дешевле, чем поход в базу
   * за идентификатором ради запуска сида.
   */
  const orgId = arg('org') ? await resolveOrg(payload, arg('org')!) : await biggestHerd(payload)
  if (!orgId) {
    console.error('\nНе нашлось хозяйства с животными. Укажите его: --org N или --org Назаровское\n')
    process.exit(1)
  }

  const org = await payload.findByID({
    collection: 'organizations',
    id: orgId,
    depth: 0,
    overrideAccess: true,
  })

  console.log(`\nХозяйство: ${(org as { name?: string })?.name ?? orgId} (id ${orgId})`)

  /* ------------------------------ Уборка ------------------------------ */

  if (DROP) {
    /*
     * Взвешивания узнаются по примечанию — тому самому, которым они
     * помечены при посадке. Удалять по дате или по хозяйству нельзя:
     * так под нож попали бы настоящие записи, если хозяйство успело
     * завести свои.
     */
    const doomed = await payload.find({
      collection: 'weighings',
      where: { note: { equals: NOTE } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })

    for (const w of doomed.docs) {
      await payload.delete({ collection: 'weighings', id: w.id, overrideAccess: true })
    }

    /*
     * Выставки лежат массивом, поэтому убираются правкой животного:
     * из массива вынимаются те, у кого место проведения помечено нашим
     * примечанием. Остальные остаются на месте.
     */
    const withShows = await payload.find({
      collection: 'animals',
      where: { owner: { equals: orgId } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })

    let cleaned = 0
    for (const a of withShows.docs) {
      const shows = Array.isArray(a.shows) ? a.shows : []
      const keep = shows.filter((s) => (s as { place?: string }).place !== NOTE)
      if (keep.length === shows.length) continue
      await payload.update({
        collection: 'animals',
        id: a.id,
        overrideAccess: true,
        context: { skipJournal: true },
        data: { shows: keep } as never,
      })
      cleaned += shows.length - keep.length
    }

    /*
     * Бонитировки узнаются тем же примечанием. Класс в карточке при этом
     * остаётся: снимок обновляет только запись бонитировки, а на удаление
     * никто не подписан — и это честнее, чем стереть класс, который
     * мог стоять там до сида.
     */
    const doomedGrades = await payload.find({
      collection: 'gradings',
      where: { note: { equals: NOTE } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })

    for (const g of doomedGrades.docs) {
      await payload.delete({ collection: 'gradings', id: g.id, overrideAccess: true })
    }

    console.log(
      `Убрано: взвешиваний ${doomed.docs.length}, выставок ${cleaned}, ` +
        `бонитировок ${doomedGrades.docs.length}`,
    )
    console.log('ДНК-подробности не убираются: они дописаны к настоящим тестам,')
    console.log('и отличить наши поля от внесённых руками уже нельзя.\n')
    process.exit(0)
  }

  /* ------------------------------ Посадка ----------------------------- */

  const { docs: herd } = await payload.find({
    collection: 'animals',
    where: { owner: { equals: orgId }, archived: { not_equals: true } },
    limit: HOW_MANY,
    sort: 'id',
    depth: 0,
    overrideAccess: true,
  })

  if (herd.length === 0) {
    console.error('\nВ хозяйстве нет животных.\n')
    process.exit(1)
  }

  console.log(`Животных в работе: ${herd.length}\n`)

  let weighings = 0
  let shows = 0
  let dna = 0
  let gradings = 0

  for (const [i, a] of herd.entries()) {
    /* ------------------------- Взвешивания ------------------------- */

    /*
     * По три взвешивания на животное и с разными признаками: одно
     * взвешивание показало бы таблицу, но не показало бы, зачем нужен
     * признак. Здесь видно, что «при рождении» и «на возраст» — разные
     * строки об одном животном.
     */
    const plan: { sign: string; months: number; weight: number }[] = [
      { sign: 'birth', months: 36, weight: 32 + (i % 7) },
      { sign: 'age', months: 12, weight: 380 + (i % 11) * 7 },
      { sign: 'age', months: 1, weight: 520 + (i % 13) * 9 },
    ]

    for (const p of plan) {
      /*
       * Повторный прогон не задваивает: пара «животное + день + признак» —
       * тот же ключ, которым загрузка отличает дубли.
       */
      const exists = await payload.find({
        collection: 'weighings',
        where: {
          animal: { equals: a.id },
          date: { equals: `${monthsAgo(p.months)}T00:00:00.000Z` },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (exists.totalDocs > 0) continue

      await payload.create({
        collection: 'weighings',
        overrideAccess: true,
        data: {
          animal: a.id,
          ownerOrg: orgId,
          date: `${monthsAgo(p.months)}T00:00:00.000Z`,
          weight: p.weight,
          sign: p.sign,
          note: NOTE,
        } as never,
      })
      weighings += 1
    }

    /* --------------------------- Выставки --------------------------- */

    /*
     * Выставки не у всех: их и в жизни не у всех, а раздел, который
     * есть у каждого животного, перестаёт что-либо значить. Каждое
     * третье — и у одного из них без приза, чтобы было видно, что
     * пустая ячейка это нормальное состояние, а не пробел.
     */
    if (i % 3 === 0) {
      const had = Array.isArray(a.shows) ? a.shows : []
      if (!had.some((s) => (s as { place?: string }).place === NOTE)) {
        await payload.update({
          collection: 'animals',
          id: a.id,
          overrideAccess: true,
          context: { skipJournal: true },
          data: {
            shows: [
              ...had,
              {
                date: `${monthsAgo(8)}T00:00:00.000Z`,
                title: 'Агроферма-2026',
                place: NOTE,
                awards: i % 6 === 0 ? 'Диплом I степени' : 'Участник',
                prize: i % 6 === 0 ? '120 000 руб.' : undefined,
              },
            ],
          } as never,
        })
        shows += 1
      }
    }

    /* -------------------------- ДНК-тесты --------------------------- */

    /*
     * Подробности дописываются к уже существующему тесту, а не заводится
     * новый: тест — утверждение лаборатории, и сочинять его целиком
     * значило бы придумать факт. Дописать сертификат и генотип к тому,
     * что уже есть, — тоже выдумка, но выдумка о реквизитах, и она
     * помечена в результате теста.
     *
     * Животным без теста ничего не добавляется вовсе.
     */
    const tests = Array.isArray(a.dnaTests) ? (a.dnaTests as Record<string, unknown>[]) : []
    if (tests.length > 0 && !tests[0]!.certificateNumber) {
      const loci: Record<string, string> = {}
      for (const [n, l] of ISAG_LOCI.entries()) {
        /* Пары аллелей правдоподобные и разные — иначе панель выглядит опечаткой. */
        loci[isagField(l)] = `${115 + ((i + n) % 40)}/${127 + ((i * 3 + n) % 40)}`
      }

      await payload.update({
        collection: 'animals',
        id: a.id,
        overrideAccess: true,
        context: { skipJournal: true },
        data: {
          dnaTests: tests.map((t, n) =>
            n === 0
              ? {
                  ...t,
                  certificateNumber: `ГС-2026-${String(1000 + i)}`,
                  certificateDate: `${monthsAgo(6)}T00:00:00.000Z`,
                  authMethod: i % 4 === 0 ? 'byM' : 'byOM',
                  snpCount: i % 2 === 0 ? 100_000 : 54_000,
                  ...loci,
                  result: [t.result, NOTE].filter(Boolean).join(' · '),
                }
              : t,
          ),
        } as never,
      })
      dna += 1
    }

    /* ------------------------- Бонитировки -------------------------- */

    /*
     * По две на животное и с разными классами: одна показала бы таблицу,
     * но не показала бы, ради чего заведена история. Здесь видно главное —
     * класс меняется, и в карточке стоит последний, а не лучший.
     *
     * У каждого пятого он падает. Так бывает и в жизни: корова, ушедшая
     * в раздой хуже прошлогоднего, теряет класс.
     */
    const gradePlan =
      i % 5 === 0
        ? [
            { months: 26, grade: 'elite', score: 78 + (i % 5) },
            { months: 2, grade: 'first', score: 71 + (i % 5) },
          ]
        : [
            { months: 26, grade: 'first', score: 70 + (i % 6) },
            { months: 2, grade: 'elite', score: 80 + (i % 6) },
          ]

    for (const g of gradePlan) {
      const at = `${monthsAgo(g.months)}T00:00:00.000Z`
      const exists = await payload.find({
        collection: 'gradings',
        where: { animal: { equals: a.id }, date: { equals: at } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (exists.totalDocs > 0) continue

      await payload.create({
        collection: 'gradings',
        overrideAccess: true,
        data: {
          animal: a.id,
          ownerOrg: orgId,
          date: at,
          grade: g.grade,
          score: g.score,
          assessorOrg: orgId,
          note: NOTE,
        } as never,
      })
      gradings += 1
    }
  }

  console.log(
    `Заведено: взвешиваний ${weighings}, выставок ${shows}, ` +
      `ДНК-подробностей ${dna}, бонитировок ${gradings}`,
  )
  console.log('\nВсё помечено словами «демонстрационная запись»: взвешивания')
  console.log('и бонитировки — в примечании, выставки — в месте проведения,')
  console.log('ДНК — в результате теста.')
  console.log('Убрать: npm run seed:fgias -- --drop\n')

  process.exit(0)
}

main().catch((e) => {
  console.error('\nНе отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
