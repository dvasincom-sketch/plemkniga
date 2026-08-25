import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { EXTERIOR_COMPOSITES, EXTERIOR_TRAITS, HEALTH_TRAITS } from '@/lib/dictionaries'
import { bullStatus, reliabilityOf } from '@/lib/bull-status'
import { TRAIT_BASE } from '@/lib/breeding-index'

/**
 * Эталонная карточка быка: показать, к чему стремиться.
 *
 * ## Зачем
 *
 * Настоящих данных в книге пока нет ни на проде, ни у разработчика.
 * Карточка при этом должна показывать не «что удалось собрать», а полный
 * вид: все признаки заполнены, оценка официальная, достоверность честная.
 * Это образец для Ассоциации — так выглядит бык, о котором книга знает
 * всё, что должна знать.
 *
 * ## Чем это отличается от `seed:bulk`
 *
 * Массовый сид набирает объём: сотни тысяч записей, лишь бы правдоподобно
 * распределённых. Здесь наоборот — одно животное, но заполненное так,
 * как заполняют настоящую карточку: с согласованными между собой числами.
 *
 * ## Главное правило: числа согласованы, а не независимы
 *
 * Соблазн был расставить случайные значения в допустимых границах.
 * Так делать нельзя, и вот почему: карточка читается целиком, и человек
 * замечает несогласие раньше, чем отдельное число. Бык с надёжностью
 * 90 % и десятью дочерями — невозможен; бык с высоким удоем дочерей
 * и нулевой разницей со сверстницами — тоже. Поэтому здесь сначала
 * задаётся число дочерей, а из него считается достоверность по той же
 * формуле, что и в карточке; жир и белок в килограммах выводятся
 * из процентов и удоя, а не берутся сами по себе.
 *
 *   npm run seed:bull-card                    — эталонный бык (первый в книге)
 *   npm run seed:bull-card -- --ident RU123   — конкретный бык по номеру
 *   npm run seed:bull-card -- --daughters 60  — сколько дочерей ему приписать
 *   npm run seed:bull-card -- --undo          — убрать дописанное
 *
 * ## Про заведение дочерей
 *
 * Первая редакция обещала животных не заводить: плодить синтетику двумя
 * способами незачем, для этого есть `seed:bulk`. Обещание оказалось
 * недостижимым — свободных коров без отца на заполненной базе четыре,
 * а эталонной карточке нужно полсотни. Выбор был между «завести»
 * и «не показать образец вовсе».
 *
 * Поэтому порядок такой: сначала берутся коровы без отца, и только
 * недостающих скрипт заводит сам. Приписанную дочь откат отпускает
 * (она существовала до нас), заведённую — удаляет.
 */

const TAG = 'SEED-BULL-CARD'

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(`--${name}`)
  const v = i === -1 ? null : (process.argv[i + 1] ?? null)
  return v && !v.startsWith('--') ? v : null
}

const num = (name: string, fallback: number): number => {
  const v = Number(arg(name))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

const UNDO = process.argv.includes('--undo')
const DRY = process.argv.includes('--dry')

/**
 * Сколько дочерей приписать.
 *
 * По умолчанию — на десять больше порога официальной оценки: карточка
 * должна показывать не «впритык», а уверенно, иначе образец учит
 * балансировать на границе.
 */
const DAUGHTERS = num('daughters', 55)

const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits

/**
 * Значение в границах, слегка смещённое к лучшему.
 *
 * Эталонный бык должен быть хорош, но не идеален: карточка,
 * где все восемнадцать признаков в плюсе, выглядит рекламой,
 * а не записью в книге. Смещение небольшое и одно на все признаки —
 * так у карточки появляется характер, а не набор случайностей.
 */
const shifted = (min: number, max: number, i: number): number => {
  const span = max - min
  /*
   * Псевдослучайность детерминированная: одно и то же животное при
   * повторном запуске получает те же числа. Иначе каждый прогон менял
   * бы карточку, и сравнить «до и после» правки показа стало бы нельзя.
   */
  const t = (Math.sin(i * 12.9898) * 43758.5453) % 1
  const u = Math.abs(t)
  return min + span * (0.45 + u * 0.5)
}

async function main() {
  const payload = await getPayload({ config })

  /*
   * Бык по умолчанию выбирается не «первый попавшийся».
   *
   * Первый прогон взял «Молодого быка» — запись из `seed:checks`,
   * заведённую ровно для случая «дочерей слишком мало, оценку показывать
   * рано». Делать эталон из неё — всё равно что учить на исключении.
   *
   * Поэтому требуется заполненная оценка: у служебных записей её нет,
   * а у настоящего быка она есть по определению. И берётся лучший
   * по индексу: образец должен показывать полную карточку, а полная
   * она у того, о ком книга знает больше.
   */
  const ident = arg('ident')
  const found = await payload.find({
    collection: 'animals',
    where: ident
      ? { identNumber: { equals: ident } }
      : {
          and: [
            { kind: { equals: 'bull' } },
            { archived: { not_equals: true } },
            { ipc: { exists: true } },
          ],
        },
    limit: 1,
    depth: 0,
    sort: '-ipc',
    overrideAccess: true,
  })

  const bull = found.docs[0]
  if (!bull) {
    console.error(
      ident
        ? `Бык с номером ${ident} не найден.`
        : 'В книге нет ни одного быка. Сначала наполните базу: npm run seed или npm run seed:bulk.',
    )
    process.exit(1)
  }

  console.log(`\nБык № ${bull.identNumber}${bull.name ? ` «${bull.name}»` : ''}`)

  /* ---------------------------------------------------------------- */
  if (UNDO) {
    /*
     * Откат возвращает поля, а не удаляет животное: бык мог существовать
     * до нас, и убрать его целиком значило бы унести чужую запись.
     * Приписанных дочерей откат тоже отпускает — по отметке, которую
     * сам же и поставил.
     */
    const daughters = await payload.find({
      collection: 'animals',
      where: { and: [{ father: { equals: bull.id } }, { notes: { like: TAG } }] },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })

    /*
     * Откат различает две судьбы, и это важнее краткости.
     *
     * Приписанную дочь мы только пометили — она существовала до нас,
     * и удалить её значило бы унести чужую запись. Заведённую дочь мы
     * создали сами, и оставить её после отката значит оставить в книге
     * животное, которого не было и не будет.
     *
     * Различаются они по тексту отметки: «отец приписан» против «дочь
     * заведена». Отметка в самой записи здесь работает как единственный
     * достоверный след — списка рядом со скриптом мы намеренно не ведём.
     */
    const created = daughters.docs.filter((d) => String(d.notes ?? '').includes('дочь заведена'))
    const linked = daughters.docs.filter((d) => !String(d.notes ?? '').includes('дочь заведена'))

    console.log(`Отпускаем приписанных: ${linked.length}, удаляем заведённых: ${created.length}`)

    if (!DRY) {
      for (const d of linked)
        await payload.update({
          collection: 'animals',
          id: d.id,
          data: { father: null, notes: String(d.notes ?? '').replace(new RegExp(`\\s*${TAG}[^\\n]*`), '') },
          overrideAccess: true,
        })

      for (const d of created)
        await payload
          .delete({ collection: 'animals', id: d.id, overrideAccess: true })
          /*
           * Отказ удаления не роняет откат: на дочь могли успеть
           * сослаться — выдать свидетельство, записать отёл. Такая
           * запись остаётся, и об этом сказано вслух: молчаливый пропуск
           * означал бы «убрано всё», что неправда.
           */
          .catch((e: unknown) => {
            console.error(`  ! ${d.identNumber} не удалена: ${e instanceof Error ? e.message : e}`)
          })
    }

    if (!DRY)
      await payload.update({
        collection: 'animals',
        id: bull.id,
        /*
         * Группа обнуляется по полям, а не целиком: Payload не принимает
         * `null` вместо группы, и попытка стереть её разом падает
         * на типе. Обнулённые поля читаются как «не заполнено» — то есть
         * ровно как до нашего вмешательства.
         */
        data: { semen: { conception: { forecast: null, r: null }, inseminations: null }, grade: null, notes: String(bull.notes ?? '').replace(new RegExp(`\\s*${TAG}[^\\n]*`), '') },
        overrideAccess: true,
      })

    console.log('Готово: поля семени и класса очищены.\n')
    process.exit(0)
  }

  /* ---------------------------------------------------------------- */
  console.log('\nШаг 1. Дочери\n')

  const already = await payload.count({
    collection: 'animals',
    where: { father: { equals: bull.id } },
    overrideAccess: true,
  })

  const need = Math.max(0, DAUGHTERS - already.totalDocs)
  console.log(`  дочерей сейчас: ${already.totalDocs}, нужно ${DAUGHTERS}, добираем ${need}`)

  /*
   * Сначала берутся коровы без отца, и только потом заводятся новые.
   *
   * Приписать себе чужую дочь значит испортить чужую карточку заодно
   * со своей, поэтому кандидаты — только записи без отца. Их на живой
   * базе почти нет: массовый сид всем дочерям отца проставляет.
   *
   * Первая редакция на этом и останавливалась — брала сколько нашлось
   * и печатала, что набрала пятьдесят пять. Это ровно та ошибка,
   * за которую в этом проекте ругают чужой код: показывать намерение
   * вместо факта. Теперь недостающих заводим, а печатаем то, что вышло.
   */
  const free = need
    ? await payload.find({
        collection: 'animals',
        where: {
          and: [
            { sex: { equals: 'female' } },
            { father: { exists: false } },
            { archived: { not_equals: true } },
            { 'summary.milkYield': { exists: true } },
          ],
        },
        limit: need,
        depth: 0,
        overrideAccess: true,
      })
    : { docs: [] as { id: number | string; notes?: unknown }[] }

  console.log(`  свободных коров нашлось: ${free.docs.length}`)

  if (!DRY)
    for (const cow of free.docs)
      await payload.update({
        collection: 'animals',
        id: cow.id,
        data: {
          father: bull.id,
          /*
           * Отметка в самой записи, а не список рядом со скриптом:
           * запись, которая помнит, откуда взялась, не разъедется
           * с базой при первом же ручном удалении. Тот же приём,
           * что в `seed:afc` (решение №126).
           */
          notes: `${String(cow.notes ?? '')}\n${TAG}: отец приписан для эталонной карточки`.trim(),
        },
        overrideAccess: true,
      })

  /* ---------------------------------------------------------------- */
  const toCreate = Math.max(0, need - free.docs.length)

  /*
   * Сколько стад будет задействовано — считается до записи, потому что
   * это число нужно и предсказанию при `--dry`, и решению, хватит ли
   * их для официальной оценки.
   */
  let plannedHerds = 0

  if (toCreate > 0) {
    /*
     * Заводить животных пришлось, хотя первая редакция скрипта обещала
     * этого не делать.
     *
     * Обещание было разумным — плодить синтетику двумя способами незачем,
     * — и недостижимым: свободных коров на заполненной базе четыре,
     * а эталонной карточке нужно полсотни. Выбор был между «завести»
     * и «не показать образец вовсе».
     *
     * Заведённые дочери помечены и убираются откатом целиком, в отличие
     * от приписанных — тем откат только возвращает отца в пустое.
     */
    const herdsRes = await payload.find({
      collection: 'herds',
      limit: 12,
      depth: 1,
      overrideAccess: true,
    })

    if (!herdsRes.docs.length) {
      console.log('  ! стад в книге нет — завести дочерей некуда. Сначала npm run seed')
    } else {
      plannedHerds = Math.min(herdsRes.docs.length, toCreate)
      console.log(`  заводим новых: ${toCreate} в ${plannedHerds} стадах`)

      const stamp = String(Date.now()).slice(-7)

      let made = 0
      for (let i = 0; i < toCreate * 2 && made < toCreate && !DRY; i++) {
        /*
         * Дочери раскладываются по стадам по кругу, а не сваливаются
         * в одно. При одном хозяйстве эффект стада неотделим от эффекта
         * быка, и карточка никогда не покажет официальную оценку —
         * то есть образец учил бы неверному.
         */
        const herd = herdsRes.docs[i % herdsRes.docs.length]!
        const owner =
          typeof herd.organization === 'object' && herd.organization
            ? (herd.organization as { id: number }).id
            : (herd.organization as number | undefined)

        /*
         * Стадо без организации пропускается, а не заводится с пустым
         * владельцем: владелец у животного обязателен, и запись без него
         * не примет ни база, ни правила видимости — она была бы невидима
         * всем, включая того, кто её завёл.
         */
        if (typeof owner !== 'number') continue

        const milk = Math.round(shifted(6800, 11200, i + 100))
        const fat = round(shifted(3.5, 4.3, i + 200), 2)
        const protein = round(shifted(3.0, 3.5, i + 300), 2)

        await payload.create({
          collection: 'animals',
          overrideAccess: true,
          data: {
            identNumber: `98${stamp}${String(i).padStart(3, '0')}`,
            idFormat: 'internal',
            name: `Дочь ${i + 1}`,
            sex: 'female',
            kind: 'cow',
            ageGroup: i % 3 === 0 ? 'firstCalf' : 'cow2',
            state: 'alive',
            owner,
            herd: herd.id,
            /*
             * Дата рождения разложена по годам: карточка показывает
             * дочерей по годам рождения, и все ровесницы превратили бы
             * этот разбор в одну строку.
             */
            birthDate: new Date(
              Date.UTC(2019 + (i % 5), (i * 3) % 12, 1 + (i % 27)),
            ).toISOString(),
            summary: {
              milkYield: milk,
              fatPercent: fat,
              proteinPercent: protein,
              fatKg: round((milk * fat) / 100, 1),
              proteinKg: round((milk * protein) / 100, 1),
              fatProteinSum: round((milk * (fat + protein)) / 100, 1),
            },
            father: bull.id,
            notes: `${TAG}: дочь заведена для эталонной карточки`,
          },
        })
        made += 1
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /*
   * Факт, а не намерение: считаем то, что получилось, и печатаем это.
   * При пробном прогоне цифры остаются прежними — и сказано, почему.
   */
  const after = await payload.find({
    collection: 'animals',
    where: { father: { equals: bull.id } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const actual = after.docs.length
  const actualHerds = new Set(
    after.docs
      .map((d) => (typeof d.herd === 'object' && d.herd ? (d.herd as { id: number }).id : d.herd))
      .filter((v) => v !== null && v !== undefined),
  ).size

  /*
   * Пробный прогон предсказывает, а не описывает текущее.
   *
   * Первая редакция при `--dry` печатала девять дочерей и надёжность
   * 42 % — то есть состояние до работы, — а записал бы прогон пятьдесят
   * пять и 82 %. Формально не соврала: «ничего не менялось» стояло тут же.
   * По существу — бесполезна: пробный прогон затевают, чтобы увидеть,
   * что будет, а не то, что и так на экране.
   *
   * Поэтому при `--dry` числа считаются ожидаемые, и сказано, что это
   * прогноз. Стада при этом берутся из тех, где дочери появятся: на живой
   * базе их двенадцать, и от их числа зависит статус не меньше, чем
   * от числа дочерей.
   */
  const daughters = DRY ? Math.max(actual, DAUGHTERS) : actual
  const herds = DRY ? Math.max(actualHerds, plannedHerds) : actualHerds

  const status = bullStatus(daughters, herds)
  console.log(
    DRY
      ? `  сейчас ${actual} дочерей в ${actualHerds} стадах; станет ${daughters} в ${herds} → ${status.label.toLowerCase()}`
      : `  стало: ${daughters} дочерей в ${herds} стадах → ${status.label.toLowerCase()}`,
  )
  if (status.missing) console.log(`  ! до следующей ступени: ${status.missing}`)

  /* ---------------------------------------------------------------- */
  console.log('\nШаг 2. Признаки — числа согласованы между собой\n')

  /*
   * Достоверность каждого признака считается по числу дочерей и его же
   * наследуемости — той самой формулой, по которой карточка показывает
   * статус. Проставить сюда произвольные восемьдесят процентов значило бы
   * поставить в образец то, за что мы ругаем чужие карточки.
   */
  const rOf = (h: number) => Math.round(reliabilityOf(daughters, h) * 100)

  const milk = round(shifted(400, 900, 1), 0)
  const fatPercent = round(shifted(0.02, 0.16, 2), 2)
  const proteinPercent = round(shifted(0.01, 0.08, 3), 2)

  /*
   * Жир и белок в килограммах выводятся из процентов и удоя, а не
   * берутся сами по себе. Независимые случайные числа дали бы карточку,
   * в которой прибавка жира не следует из прибавки молока, — и зоотехник
   * увидит это раньше, чем прочтёт заголовок.
   *
   * Складываются два вклада, и оба со своим коэффициентом:
   *
   *   от молока   — прибавка удоя, умноженная на базовую жирность (3,8 %)
   *   от процента — прибавка процента, умноженная на базовый удой (9 000 кг),
   *                 то есть на 90 в пересчёте на проценты
   *
   * Первая редакция брала для второго вклада 300 вместо 90 — жир выходил
   * около шестидесяти килограммов при восьмистах пятидесяти килограммах
   * молока, чего у быков не бывает: в мировых каталогах прибавка жира
   * укладывается в 15–35 кг. Ошибка не в формуле, а в множителе, и она
   * ровно того рода, ради которой эталон и заводится: неправдоподобное
   * число в образце учит неправдоподобию.
   */
  const BASE_FAT = 3.8
  const BASE_MILK_PER_PERCENT = 90

  const fatKg = round((milk * BASE_FAT) / 100 + fatPercent * BASE_MILK_PER_PERCENT, 1)
  const proteinKg = round((milk * 3.2) / 100 + proteinPercent * BASE_MILK_PER_PERCENT, 1)

  const production = {
    milk: { forecast: milk, r: rOf(0.3) },
    fatPercent: { forecast: fatPercent, r: rOf(0.3) },
    proteinPercent: { forecast: proteinPercent, r: rOf(0.3) },
    fatKg: { forecast: fatKg, r: rOf(0.3) },
    proteinKg: { forecast: proteinKg, r: rOf(0.3) },
    productionIndex: { forecast: round(shifted(95, 125, 5), 1), r: rOf(0.3) },
    reliabilityLevel: 4,
  }

  const heritabilityOf = (key: string): number =>
    (TRAIT_BASE as unknown as { key: string; heritability: number }[]).find((t) => t.key === key)
      ?.heritability ?? 0.1

  const health = Object.fromEntries(
    HEALTH_TRAITS.map((t, i) => [
      t.key,
      {
        forecast: round(shifted(t.key === 'calfMortality' ? -3 : 0.5, t.key === 'calfMortality' ? -0.2 : 3.2, i + 10), 1),
        r: rOf(heritabilityOf(t.key)),
      },
    ]),
  )

  const exterior = {
    ...Object.fromEntries(
      EXTERIOR_TRAITS.map((t, i) => [
        t.key,
        /*
         * У признаков с оптимумом посередине значение держится ближе
         * к нулю: эталонный бык не должен быть крайним там, где крайность
         * нежелательна. Это и есть проверка нового показа на осмысленность
         * — если синтетика ставит «Длину сосков +1,9», значит блок
         * с оптимумом посередине не выполняет свою работу.
         */
        round(t.optimum === 'middle' ? shifted(-0.5, 0.5, i + 30) : shifted(0.2, 1.9, i + 30), 2),
      ]),
    ),
    ...Object.fromEntries(
      EXTERIOR_COMPOSITES.map((t, i) => [t.key, round(shifted(0.8, 2.0, i + 60), 2)]),
    ),
  }

  const semen = {
    conception: {
      /*
       * Оплодотворяющая способность — отклонение от среднего по породе
       * в процентных пунктах. В США публикуемые значения укладываются
       * в ±4, и эталон держится в этих же границах: карточка-образец
       * не должна учить тому, чего не бывает.
       */
      forecast: round(shifted(0.5, 3.2, 7), 1),
      /*
       * Достоверность семени зависит от числа осеменений, а не от числа
       * дочерей: это разные измерения. Формула та же, наследуемость
       * признака низкая — оттого и осеменений нужны тысячи.
       */
      r: Math.round(reliabilityOf(Math.round(shifted(900, 2600, 8)) / 100, 0.05) * 100),
    },
    inseminations: Math.round(shifted(900, 2600, 8)),
  }

  const data = {
    production,
    reproduction: { fertility: { forecast: round(shifted(0.3, 2.4, 9), 1), r: rOf(0.04) } },
    health: { ...health, reliabilityLevel: 4 },
    exterior,
    semen,
    grade: 'eliteRecord' as const,
    notes: `${String(bull.notes ?? '')}\n${TAG}: карточка заполнена как эталонная`.trim(),
  }

  console.log(`  удой ${milk} кг (R ${rOf(0.3)} %), жир ${fatKg} кг, белок ${proteinKg} кг`)
  console.log(
    `  семя: ${semen.conception.forecast} п.п. по ${semen.inseminations} осеменениям ` +
      `(R ${semen.conception.r} %)`,
  )
  console.log(`  фертильность дочерей: R ${rOf(0.04)} % — она всегда ниже, наследуемость 0,04`)
  console.log(`  класс: элита-рекорд`)

  if (DRY) {
    console.log('\nПробный прогон: ничего не записано.\n')
    process.exit(0)
  }

  await payload.update({ collection: 'animals', id: bull.id, data, overrideAccess: true })

  console.log(`\nГотово. Карточка: /animals/${bull.id}?tab=evaluation`)
  console.log(`Убрать дописанное: npm run seed:bull-card -- --ident ${bull.identNumber} --undo\n`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
