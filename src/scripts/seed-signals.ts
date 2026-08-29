import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Payload } from 'payload'
import { relId } from '@/lib/visibility'
import {
  INBREEDING_LABEL,
  INBREEDING_THRESHOLD,
  SCC_LABEL,
  SCC_THRESHOLD,
} from '@/lib/herd-analytics'

/**
 * Демо-стадо, в котором есть что делать.
 *
 * ## Зачем
 *
 * Полоса «Требует решения» на «Обзоре» — половина смысла кабинета:
 * передержанная тёлка стоит корма каждый день, скрытый мастит съедает
 * удой и сортность. Написана она давно, а показать её было некому.
 *
 * У демо-хозяйства беды не было ни одной: инбридинг 0,11 %, выше порога
 * ноль, передержки нет, выбытия нет. Полоса при этом не показывается
 * вовсе — и это верно, молчание означает «всё в порядке». А у хозяйств,
 * где беда есть, нет учётных записей: `seed:bulk` заводит организации
 * «Синтетика — хозяйство № N» без единого пользователя. Получалось,
 * что тревогу видит только тот, кто не может войти.
 *
 * Скрипт делает демо-стадо похожим на работающее: не идеальное
 * и не катастрофическое, а такое, где зоотехнику есть чем заняться
 * в понедельник.
 *
 *   npm run seed:signals                  завести
 *   npm run seed:signals -- --mass        довести соматику до большинства
 *   npm run seed:signals -- --clean       убрать заведённое
 *   npm run seed:signals -- --org=12      другое хозяйство
 *
 * Прогонять можно сколько угодно раз: каждый начинается с уборки
 * предыдущего. Числа при этом сбрасываются, а не накапливаются —
 * иначе «шесть тёлок в передержке» превратилось бы в двенадцать
 * от второго запуска, и полоса врала бы уже про наши же данные.
 *
 * ## Почему не «покрасивее»
 *
 * Соблазн был сделать стадо образцовым — на демонстрации приятнее
 * показывать зелёное. Но продукт про то, чтобы вовремя увидеть беду,
 * и стадо без единой беды показывает ровно ту его часть, которая
 * ничего не стоит. Числа взяты из практики: 10-15 % коров выше порога
 * соматики — обычное дело, передержка у четверти молодняка — повод
 * для разговора, а не для паники.
 *
 * ## Почему добавляет, а не правит
 *
 * Тёлки и выбывшие заводятся новыми записями с приставкой в номере,
 * замеры помечаются лабораторией с той же приставкой — и `--clean`
 * убирает их по этим меткам.
 *
 * Два места правят существующие записи и убраться за собой не могут:
 * коэффициент инбридинга и незакрытая лактация лежат в самой карточке
 * коровы, рядом с настоящими значениями, и стереть их выборочно нельзя.
 * Инбридинг пересчитывается `backfill:index`, лактацию придётся убрать
 * руками. Это названо в выводе `--clean`, а не оставлено на догадку:
 * уборка, молчащая о том, чего не убрала, хуже отсутствия уборки.
 */

const TAG = 'DEMO-SIG'
const args = process.argv.slice(2)
const has = (f: string) => args.includes(f)
const argOf = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const clean = has('--clean')
const mass = has('--mass')

/** День в миллисекундах — сроки здесь считаются днями, а не месяцами. */
const DAY = 86_400_000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)
const int = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))

async function orgOf(payload: Payload): Promise<number | null> {
  const explicit = argOf('org')
  if (explicit) return Number(explicit)

  /*
   * Хозяйство демо-фермера, а не первое попавшееся: скрипт существует
   * ради того, чтобы человек увидел полосу, войдя под этой учётной
   * записью. Взять чужое стадо значило бы снова наполнить то,
   * куда никто не заходит.
   */
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: 'farmer@nazarovskoe.ru' } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return relId(docs[0]?.organization)
}

async function main() {
  const payload = await getPayload({ config })
  const orgId = await orgOf(payload)

  if (!orgId) {
    console.log('\nХозяйство не найдено. Укажите его явно: --org=<id>\n')
    process.exit(1)
  }

  console.log(`\nХозяйство #${orgId}\n`)

  /*
   * Помеченная лаборатория — способ узнать свои замеры потом.
   *
   * Замеры добавляются существующим коровам, и приставкой в номере
   * животного их не отличить. Свободного поля у замера нет, поэтому
   * меткой служит лаборатория: у настоящих замеров она своя, у наших —
   * эта. Заодно честно: в карточке будет написано, откуда число.
   */
  const labName = `${TAG} лаборатория`
  const findLab = async () =>
    payload
      .find({
        collection: 'organizations',
        where: { name: { equals: labName } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      .then((r) => r.docs[0]?.id as number | undefined)

  /* ------------------------------ Уборка ------------------------------ */

  /*
   * Убрать за собой — и перед тем, как заводить заново.
   *
   * Второй прогон падал: номер животного уникален, а скрипт заводил
   * те же самые. Падал уже после того, как что-то успел записать, —
   * то есть оставлял стадо в состоянии между двумя прогонами, которого
   * никто не задумывал.
   *
   * Особенно это мешало `--mass`: чтобы увидеть второй вид полосы, надо
   * прогнать скрипт ещё раз, и именно там он и спотыкался.
   */
  const wipe = async () => {
    const mine = await payload.find({
      collection: 'animals',
      where: { identNumber: { like: TAG } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    })
    const ids = mine.docs.map((d) => d.id as number)

    /*
     * Порядок обратный порядку создания: сначала то, что ссылается
     * на животных, потом сами животные. Внешние ключи не дадут удалить
     * животное, у которого остался отёл, и удаление молча провалилось бы
     * посреди списка.
     */
    let calvings = 0
    if (ids.length) {
      const res = await payload.delete({
        collection: 'calvings',
        where: { animal: { in: ids } },
        overrideAccess: true,
      })
      calvings = res.docs?.length ?? 0
    }

    const lab = await findLab()
    let tests = 0
    if (lab) {
      const res = await payload.delete({
        collection: 'milk-tests',
        where: { laboratory: { equals: lab } },
        overrideAccess: true,
      })
      tests = res.docs?.length ?? 0
    }

    let animals = 0
    if (ids.length) {
      const res = await payload.delete({
        collection: 'animals',
        where: { id: { in: ids } },
        overrideAccess: true,
      })
      animals = res.docs?.length ?? 0
    }

    if (lab) {
      await payload.delete({ collection: 'organizations', id: lab, overrideAccess: true })
    }

    return { animals, calvings, tests }
  }

  if (clean) {
    const done = await wipe()
    console.log(
      `  Убрано: животных ${done.animals}, отёлов ${done.calvings}, замеров ${done.tests}`,
    )
    console.log('  Инбридинг и незакрытые лактации у существующих коров остаются:')
    console.log('  они правились в самих записях, и стереть их безопасно нельзя —')
    console.log('  рядом могут лежать настоящие. Инбридинг пересчитает backfill:index.\n')
    process.exit(0)
  }

  const before = await wipe()
  if (before.animals || before.tests) {
    console.log(
      `  Прежний прогон убран: животных ${before.animals}, отёлов ${before.calvings}, ` +
        `замеров ${before.tests}`,
    )
  }

  /* --------------------------- Молодняк ------------------------------- */

  /*
   * Ремонтный молодняк тремя возрастами сразу: младше 13 месяцев —
   * растут, 13–15 — пора осеменять, старше 15 без отёла — передержка.
   * Полоса показывает два последних, и увидеть их рядом важнее, чем
   * каждый по отдельности: «пора осеменять» это работа на этой неделе,
   * «передержка» — упущенная работа прошлого квартала.
   */
  const HEIFERS: { months: number; count: number; what: string }[] = [
    { months: 8, count: 9, what: 'растут' },
    { months: 14, count: 7, what: 'пора осеменять' },
    { months: 19, count: 6, what: 'передержка' },
  ]

  const breed = await payload
    .find({ collection: 'breeds', limit: 1, depth: 0, overrideAccess: true })
    .then((r) => r.docs[0]?.id)

  let heifers = 0
  for (const group of HEIFERS) {
    for (let i = 0; i < group.count; i++) {
      await payload.create({
        collection: 'animals',
        overrideAccess: true,
        data: {
          identNumber: `${TAG}-T${group.months}-${i + 1}`,
          idFormat: 'internal',
          name: `Тёлка ${group.months} мес. № ${i + 1}`,
          kind: 'heifer',
          sex: 'female',
          state: 'alive',
          ageGroup: 'heifer',
          birthDate: daysAgo(group.months * 30 + int(0, 20)).toISOString(),
          breed,
          owner: orgId,
          trustLevel: 1,
        } as never,
      })
      heifers += 1
    }
  }
  console.log(`  Заведено тёлок: ${heifers} (${HEIFERS.map((g) => `${g.count} ${g.what}`).join(', ')})`)

  /* ---------------------------- Выбытие ------------------------------- */

  /*
   * Выбывшие заводятся отдельными записями, а не переводом существующих
   * коров: перевести живую корову в выбывшие значит убрать её из стада,
   * и все остальные числа демо-хозяйства поехали бы следом.
   *
   * Две первотёлки из пяти — это сорок процентов выбытия, и полоса
   * назовёт их отдельно: первотёлка не окупает даже выращивания.
   */
  const reason = await payload
    .find({ collection: 'disposal-reasons', limit: 1, depth: 0, overrideAccess: true })
    .then((r) => r.docs[0]?.id)

  const GONE = [
    { lact: 1, months: 30 },
    { lact: 1, months: 34 },
    { lact: 3, months: 62 },
    { lact: 4, months: 74 },
    { lact: 2, months: 48 },
  ]

  let gone = 0
  for (const [i, g] of GONE.entries()) {
    const animal = await payload.create({
      collection: 'animals',
      overrideAccess: true,
      data: {
        identNumber: `${TAG}-V${i + 1}`,
        idFormat: 'internal',
        name: `Выбывшая № ${i + 1}`,
        kind: 'cow',
        sex: 'female',
        state: 'culled',
        ageGroup: g.lact <= 1 ? 'firstCalf' : g.lact === 2 ? 'cow2' : 'cow3',
        birthDate: daysAgo(g.months * 30).toISOString(),
        disposalDate: daysAgo(int(30, 300)).toISOString(),
        disposalReason: reason,
        breed,
        owner: orgId,
        trustLevel: 1,
      } as never,
    })

    /*
     * Отёлы нужны, чтобы «первотёлка» была первотёлкой: число лактаций
     * считается строками отёлов, а не полем в карточке. Поле человек
     * заполняет и забывает, отёл — событие с датой.
     */
    for (let n = 1; n <= g.lact; n++) {
      await payload.create({
        collection: 'calvings',
        overrideAccess: true,
        data: {
          animal: animal.id,
          number: n,
          date: daysAgo((g.months - 22 - (g.lact - n) * 13) * 30).toISOString(),
          result: 'heifer',
        } as never,
      })
    }
    gone += 1
  }
  console.log(`  Заведено выбывших за год: ${gone} (из них первотёлок: 2)`)

  /* --------------------------- Соматика ------------------------------- */

  const cows = await payload.find({
    collection: 'animals',
    where: {
      and: [
        { owner: { equals: orgId } },
        { sex: { equals: 'female' } },
        { state: { equals: 'alive' } },
        { kind: { equals: 'cow' } },
        { archived: { not_equals: true } },
      ],
    },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  /*
   * Доля больных задаётся долей стада, а не числом голов: на двадцати
   * восьми коровах «три штуки» и «одиннадцать процентов» совпадают,
   * а на пятистах разойдутся вдесятеро.
   *
   * Обычный прогон делает 12 % — столько бывает у работающего стада.
   * С `--mass` доля переваливает за половину, и полоса меняет совет
   * с «разберите коров» на «проверьте, все ли замеры приехали»: это
   * второй вид отображения, и увидеть его иначе негде.
   */
  const share = mass ? 0.6 : 0.12
  const sick = Math.max(1, Math.round(cows.docs.length * share))

  const lab =
    (await findLab()) ??
    ((
      await payload.create({
        collection: 'organizations',
        overrideAccess: true,
        data: { name: labName, shortName: TAG, type: 'service', membership: 'none' } as never,
      })
    ).id as number)

  let tests = 0
  for (const [i, cow] of cows.docs.entries()) {
    const high = i < sick
    await payload.create({
      collection: 'milk-tests',
      overrideAccess: true,
      data: {
        animal: cow.id,
        date: daysAgo(int(3, 20)).toISOString(),
        lactationNumber: 1,
        dailyYield: int(22, 38),
        fatPercent: 3.7,
        proteinPercent: 3.2,
        // Выше порога — но правдоподобно: 250–600, а не миллион
        somaticCells: high ? int(SCC_THRESHOLD + 50, 600) : int(60, 180),
        laboratory: lab,
        source: 'lab',
      } as never,
    })
    tests += 1
  }
  console.log(
    `  Замеров добавлено: ${tests}, из них выше ${SCC_LABEL}: ${sick} ` +
      `(${Math.round(share * 100)} % стада)${mass ? ' — режим «беда у большинства»' : ''}`,
  )

  /* --------------------------- Инбридинг ------------------------------ */

  /*
   * Единственное место, где правятся существующие записи. Инбридинг
   * пересчитывается по родословной, а её у демо-животных нет глубже
   * двух колен — посчитать честно нечего, поэтому значение ставится
   * прямо. Это видно в журнале правок и откатывается пересчётом.
   */
  const inbred = cows.docs.slice(0, 2)
  for (const cow of inbred) {
    await payload.update({
      collection: 'animals',
      id: cow.id,
      overrideAccess: true,
      data: { inbreeding: INBREEDING_THRESHOLD + 2.5 },
    })
  }
  console.log(`  Инбридинг выше ${INBREEDING_LABEL} проставлен: ${inbred.length}`)

  /* ---------------------- Незакрытые лактации -------------------------- */

  /*
   * Корова с удоем за 305 дней и без даты окончания — та, что доит
   * сейчас. В средние она не входит, и на «Обзоре» про неё сказано
   * отдельно: «ещё доит» не то же, что «мало надоила».
   */
  let inProgress = 0
  let already = 0
  for (const cow of cows.docs.slice(0, 3)) {
    const full = await payload.findByID({
      collection: 'animals',
      id: cow.id,
      depth: 0,
      overrideAccess: true,
    })
    const rows = Array.isArray(full.lactations) ? full.lactations : []

    /*
     * Незакрытая лактация — единственное, что уборка не забирает
     * (она лежит в карточке рядом с настоящими). Значит повторный прогон
     * дописал бы вторую, потом третью, и «коров доят сейчас» росло бы
     * с каждым запуском, ничего не означая. Есть уже — не трогаем.
     */
    const hasOpen = rows.some(
      (l) =>
        l &&
        typeof l === 'object' &&
        !(l as { endDate?: unknown }).endDate &&
        Number((l as { milk305?: unknown }).milk305 ?? 0) > 0 &&
        Number((l as { dd?: unknown }).dd ?? 0) < 305,
    )
    if (hasOpen) {
      already += 1
      continue
    }

    await payload.update({
      collection: 'animals',
      id: cow.id,
      overrideAccess: true,
      data: {
        lactations: [
          ...rows,
          {
            number: rows.length + 1,
            calvingDate: daysAgo(int(120, 200)).toISOString(),
            dd: int(120, 200),
            milk305: int(6500, 9500),
            fat305: 3.8,
            protein305: 3.2,
          },
        ],
      } as never,
    })
    inProgress += 1
  }
  console.log(
    `  Коров с незакрытой лактацией: ${inProgress}` +
      (already ? ` (у ${already} она уже была — не трогали)` : ''),
  )

  console.log('\nГотово. Откройте /account — полоса «Требует решения» должна показать')
  console.log('передержку, соматику, инбридинг, первотёлок в выбытии и тёлок к осеменению.')
  console.log('Убрать заведённое: npm run seed:signals -- --clean\n')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
