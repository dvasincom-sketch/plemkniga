import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { MATING_DEPTH, matingPlan } from '@/lib/mating'

/**
 * Подбор пар — проверка на случаях с известным ответом.
 *
 * ## Зачем именно так
 *
 * Прогнать расчёт по стаду и посмотреть на числа — не проверка: правильных
 * ответов там никто не знает, и коэффициент 3,7 % выглядит одинаково
 * убедительно, будь он верен или вдвое занижен. Поэтому здесь строится
 * маленькая родословная, у которой ответ известен из учебника, и сверяются
 * четыре случая:
 *
 * - **не родственники** — 0 %;
 * - **полусибсы** (общий отец) — 12,5 %;
 * - **полные сибсы** (общие отец и мать) — 25 %;
 * - **отец и дочь** — 25 %.
 *
 * Последний случай и есть причина, по которой животное считается
 * собственным предком нулевого колена. Без этой строки он даёт ноль,
 * и ошибка тихая: у отца с дочерью нет общего предка **выше** отца,
 * а сам он в свой список предков не попадает.
 *
 * ## Что скрипт делает с базой
 *
 * Заводит семь животных с номерами `TEST-MATING-*`, считает, сверяет
 * и удаляет их — независимо от того, сошлись числа или нет. Оставить
 * их значило бы каждым прогоном добавлять в книгу по семь фальшивых
 * записей, а они выглядят настоящими.
 *
 *   npm run check:mating
 */

let failures = 0

const near = (a: number, b: number) => Math.abs(a - b) < 0.01

const check = (what: string, got: number, want: number) => {
  if (near(got, want)) console.log(`  ✓ ${what} — ${got} %`)
  else {
    failures += 1
    console.log(`  ✗ ${what} — получено ${got} %, ожидалось ${want} %`)
  }
}

const PREFIX = 'TEST-MATING-'

async function main() {
  const payload = await getPayload({ config })

  console.log(`\nПодбор пар: сверка на известных случаях (глубина ${MATING_DEPTH} колен)\n`)

  /*
   * Своё хозяйство, а не первое попавшееся.
   *
   * Первая редакция брала любое существующее — и проверка сломалась
   * на втором же прогоне: подбор отдаёт не больше трёхсот коров,
   * от самых засидевшихся после отёла, а в чужом стаде тысячи коров
   * без отёлов, и все они встают впереди. Контрольные животные
   * до выдачи не доходили, и все три случая отвечали «не найдено».
   *
   * Проверка не должна зависеть от того, что в базе лежит рядом.
   * Отсюда своё хозяйство на семь голов: в нём потолок недостижим,
   * и порядок выдачи ничего не решает.
   */
  const org = await payload.create({
    collection: 'organizations',
    data: {
      name: 'Контрольное хозяйство проверки подбора',
      shortName: 'TEST-MATING',
      inn: '0000000000',
    },
    overrideAccess: true,
  })
  const orgId = org.id as number

  const made: number[] = []

  /**
   * Даты рождения по поколениям.
   *
   * Все семеро рождались одним днём, и книга отвергла первую же связь:
   * потомок не может родиться раньше родителя, а равенство дат — тот же
   * случай. Проверка родословной падала на собственной родословной,
   * и это правильный отказ: она строила невозможное животное.
   *
   * Три года между поколениями — с запасом над границей `PARENT_AGE`
   * (девятнадцать месяцев). Впритык ставить нельзя: проверка сломалась бы
   * от любого ужесточения правила, и виновата была бы не она.
   */
  const BORN = { old: '2018-01-01', young: '2021-01-01' } as const

  const animal = async (
    suffix: string,
    sex: 'male' | 'female',
    father?: number,
    mother?: number,
  ): Promise<number> => {
    const doc = await payload.create({
      collection: 'animals',
      data: {
        identNumber: `${PREFIX}${suffix}`,
        /*
         * Формат номера — внутрихозяйственный.
         *
         * По умолчанию книга ждёт российский национальный: от шести
         * до пятнадцати цифр, и на первом прогоне проверка упала именно
         * на этом. Подставлять цифровой номер было бы хуже: он выглядел
         * бы как настоящий, и запись, пережившая сбой уборки, оказалась
         * бы неотличима от животного. «TEST-MATING-*» видно с первого
         * взгляда.
         */
        idFormat: 'internal',
        name: `Проверка ${suffix}`,
        sex,
        state: 'alive',
        ageGroup: sex === 'male' ? 'bull' : 'cow2',
        /*
         * Дата рождения нужна отбору коров: без неё тёлка не проходит
         * по возрасту. Поколение определяется наличием родителей —
         * у кого они есть, тот младше.
         */
        birthDate: new Date(father || mother ? BORN.young : BORN.old).toISOString(),
        owner: orgId,
        father,
        mother,
        // Метка на случай, если уборка не отработает, — в самом номере:
        // отдельного поля для заметок у животного нет
      },
      overrideAccess: true,
    })
    made.push(doc.id as number)
    return doc.id as number
  }

  const cleanup = async () => {
    /*
     * Удаление в обратном порядке: потомки заведены после родителей,
     * и снимать связи иначе пришлось бы вручную.
     */
    for (const id of [...made].reverse()) {
      try {
        await payload.delete({ collection: 'animals', id, overrideAccess: true })
      } catch {
        console.log(`  · не удалось удалить запись ${id} — уберите вручную по номеру ${PREFIX}`)
      }
    }

    /* Хозяйство — последним: пока в нём есть животные, его не удалить. */
    try {
      await payload.delete({ collection: 'organizations', id: orgId, overrideAccess: true })
    } catch {
      console.log(`  · не удалось удалить хозяйство ${orgId} — уберите вручную`)
    }
  }

  try {
    /*
     * Родословная проверки:
     *
     *   ОТЕЦ ── ДОЧЬ-А ┐
     *        └─ ДОЧЬ-Б ┘  общий отец, разные матери → полусибсы
     *
     *   ОТЕЦ + МАТЬ ── СЕСТРА, БРАТ            → полные сибсы
     *   ЧУЖОЙ (без родни) × ДОЧЬ-А             → не родственники
     */
    const father = await animal('FATHER', 'male')
    const mother = await animal('MOTHER', 'female')
    const other = await animal('OTHER', 'female')

    const halfA = await animal('HALF-A', 'female', father)
    const brother = await animal('BROTHER', 'male', father, mother)
    const sister = await animal('SISTER', 'female', father, mother)
    const stranger = await animal('STRANGER', 'male')

    const plan = await matingPlan(payload, orgId, [father, brother, stranger])
    if (!plan) {
      console.log('  ✗ расчёт не вернул результата (нет пула соединений?)')
      failures += 1
    } else {
      const coi = (cow: number, bull: number): number =>
        plan.rows.find((r) => r.id === cow)?.cells.find((c) => c.bullId === bull)?.coi ?? -1

      check('Не родственники', coi(other, stranger), 0)
      check('Полусибсы (общий отец)', coi(halfA, brother), 12.5)
      check('Полные сибсы', coi(sister, brother), 25)
      check('Отец и дочь', coi(halfA, father), 25)
    }
  } finally {
    await cleanup()
  }

  console.log(
    failures === 0
      ? '\nРасчёт сходится с известными ответами.\n'
      : `\nРасхождений: ${failures}. Коэффициент считается неверно — показывать нельзя.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nПроверка не отработала:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
