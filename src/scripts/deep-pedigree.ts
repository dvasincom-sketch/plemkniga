import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { ANCESTRY_DEPTH } from '../lib/ancestry'
import { relId } from '@/lib/visibility'
import { randomUUID } from 'crypto'

/**
 * Достройка родословной вглубь — без единого удаления.
 *
 * Зачем отдельный скрипт. Глубокие колена появились в `npm run seed`, но сид
 * устроен иначе: он сначала стирает демо-данные и наполняет базу заново.
 * Для пустой базы это правильно, а на работающей системе — катастрофа:
 * запуск сида на проде уничтожает всё, что там накопилось. Смотреть разбор
 * родословной вглубь ради этого никто не подписывался.
 *
 * Этот скрипт не удаляет и не перезаписывает ничего. Он берёт одно животное,
 * идёт вверх по существующим связям и там, где ветвь обрывается, дописывает
 * недостающих предков служебными записями. Уже заведённых предков не трогает.
 *
 * Запуск:
 *   npm run pedigree:deep -- <инд-номер-или-id> [глубина]
 *
 * Например:
 *   npm run pedigree:deep -- 3662217000196.00
 *   DATABASE_URI="postgres://…" npm run pedigree:deep -- 20197 9
 *
 * Повторный запуск ничего не ломает: скрипт видит уже созданных предков
 * по служебному номеру и просто ничего не делает.
 */

const log = (m: string) => console.log(`  ${m}`)

/** Служебные записи предков помечаются номером с этим префиксом. */
const PREFIX = 'ANC'

/**
 * Сколько различных животных заводить в каждом колене.
 *
 * Ближние колена заполняются полностью (в третьем всего восемь клеток),
 * дальше пул растёт медленнее, чем удваиваются клетки: так и устроена
 * настоящая родословная — вглубь она сужается, одни и те же быки стоят
 * в десятках мест. Без записи для второго и третьего колена они брали бы
 * размер девятого и плодили сотни лишних записей.
 */
const SIZES: Record<number, number> = {
  1: 2,
  2: 4,
  3: 8,
  4: 12,
  5: 22,
  6: 40,
  7: 68,
  8: 104,
  9: 140,
}

async function main() {
  const [rawKey, rawDepth] = process.argv.slice(2)
  if (!rawKey) {
    console.error('Укажите индивидуальный номер или id животного:')
    console.error('  npm run pedigree:deep -- 3662217000196.00')
    process.exit(1)
  }
  const depth = Math.min(Number(rawDepth) || ANCESTRY_DEPTH, 12)

  const payload = await getPayload({ config })

  /* ------------------------- Находим животное ------------------------- */
  /*
   * Сначала по индивидуальному номеру, и только потом по id.
   *
   * Искать «или по id, или по номеру» одним запросом нельзя: номер — текст,
   * и он спокойно бывает длиннее, чем вмещает integer. Postgres на попытке
   * сравнить `id = 3662217000196` падает с «out of range for type integer»,
   * не добравшись до второго условия. Поэтому запроса два, и по id мы идём
   * только когда аргумент похож на id — короткое целое без точки.
   */
  const foundByNumber = await payload.find({
    collection: 'animals',
    where: { identNumber: { equals: rawKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  let animal = foundByNumber.docs[0]

  if (!animal && /^[1-9]\d{0,8}$/.test(rawKey)) {
    const byId = await payload.find({
      collection: 'animals',
      where: { id: { equals: Number(rawKey) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    animal = byId.docs[0]
  }
  if (!animal) {
    console.error(`Животное «${rawKey}» не найдено`)
    process.exit(1)
  }

  log(`Животное: ${animal.name ?? '—'}, инд. № ${animal.identNumber} (id ${animal.id})`)

  if (!relId(animal.father) || !relId(animal.mother)) {
    console.error('У животного не заполнены оба родителя — достраивать не от чего.')
    console.error('Свяжите отца и мать карточками, затем повторите запуск.')
    process.exit(1)
  }

  const orgId = relId(animal.owner)
  const authorId = relId(animal.author)

  // Владелец у животного обязателен по схеме — служебным предкам он достаётся
  // тот же, что у потомка: иначе записи повиснут ничьими
  if (!orgId) {
    console.error('У животного не заполнен владелец — служебные записи создать не от чьего имени.')
    process.exit(1)
  }

  /* ------- Уже созданные служебные предки: скрипт идемпотентен -------- */
  const existing = await payload.find({
    collection: 'animals',
    where: { identNumber: { like: `${PREFIX}-` } },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })
  const byNumber = new Map<string, number>()
  for (const d of existing.docs) byNumber.set(d.identNumber, d.id as number)
  if (byNumber.size > 0) log(`Служебных предков уже заведено: ${byNumber.size}`)

  /* -------------------- Текущее состояние по коленам ------------------ */
  // Идём вширь от животного: на каждом шаге собираем тех, у кого не хватает
  // родителей, и дописываем им предков следующего колена.
  let frontier: number[] = [animal.id as number]
  let created = 0
  let linked = 0

  for (let generation = 1; generation <= depth; generation++) {
    const docs = await payload.find({
      collection: 'animals',
      where: { id: { in: frontier } },
      limit: frontier.length,
      depth: 0,
      overrideAccess: true,
    })

    // Кому чего не хватает
    const needy = docs.docs.filter((d) => !relId(d.father) || !relId(d.mother))
    const nextIds = new Set<number>()
    for (const d of docs.docs) {
      const f = relId(d.father)
      const m = relId(d.mother)
      if (f) nextIds.add(f)
      if (m) nextIds.add(m)
    }

    if (needy.length === 0) {
      log(`Колено ${generation}: все родители на месте, дописывать нечего`)
      frontier = [...nextIds]
      if (frontier.length === 0) break
      continue
    }

    /*
     * Пул предков этого колена.
     *
     * Размер взят из таблицы, а не из формулы 2^n: настоящая родословная
     * вглубь сужается — одни и те же быки стоят в десятках мест. Если пул
     * сделать слишком узким, ветви схлопнутся к горстке основателей
     * и коэффициент инбридинга улетит за десятки процентов, чего
     * в голштинской популяции не бывает.
     */
    const size = SIZES[generation] ?? SIZES[9]
    const males = Math.ceil(size / 2)
    const femaleCount = size - males
    const pool: number[] = []

    for (let i = 0; i < size; i++) {
      const male = i < males
      const number = `${PREFIX}-${generation}-${String(i).padStart(3, '0')}`
      const known = byNumber.get(number)
      if (known) {
        pool.push(known)
        continue
      }

      const doc = await payload.create({
        collection: 'animals',
        overrideAccess: true,
        data: {
          uuid: randomUUID(),
          identNumber: number,
          idFormat: 'internal',
          name: `${male ? 'Предок' : 'Праматерь'} ${generation}-${i + 1}`,
          sex: male ? 'male' : 'female',
          state: 'sold',
          ageGroup: male ? 'bull' : 'cow3',
          birthDate: new Date(2010 - generation * 5, 0, 1).toISOString(),
          owner: orgId,
          author: authorId ?? undefined,
          // Служебные записи не поголовье: в книге и в «Моих животных»
          // они не показываются
          publicVisible: false,
          publicDetails: false,
          trustLevel: generation <= 5 ? 2 : 1,
          archived: true,
          archiveReason: 'Запись предка для построения родословной',
        },
      })
      byNumber.set(number, doc.id as number)
      pool.push(doc.id as number)
      created++
    }

    /*
     * Раздача родителей — подряд, а не с шагом.
     *
     * Шаг, кратный размеру колена, схлопывает выбор до двух-трёх животных
     * и превращает родословную в несколько замкнутых линий. Подряд повторы
     * возникают только там, где колено уже слоя потомков, и тем глубже,
     * чем дальше от животного, — именно так устроена настоящая родословная.
     * Женский индекс дополнительно сдвигается, иначе повторялась бы целиком
     * одна и та же пара и вместо общих предков вышли бы полные сибсы.
     */
    for (let i = 0; i < needy.length; i++) {
      const d = needy[i]
      const patch: Record<string, number> = {}
      if (!relId(d.father)) patch.father = pool[i % males]
      if (!relId(d.mother)) {
        patch.mother = pool[males + ((i + Math.floor(i / femaleCount)) % femaleCount)]
      }

      await payload.update({
        collection: 'animals',
        id: d.id,
        data: patch,
        overrideAccess: true,
      })
      linked++
      for (const v of Object.values(patch)) nextIds.add(v)
    }

    log(`Колено ${generation}: достроено родителей у ${needy.length} записей`)
    frontier = [...nextIds]
    if (frontier.length === 0) break
  }

  log('')
  log(`Готово. Создано служебных записей: ${created}, проставлено связей: ${linked}.`)
  log(`Откройте карточку животного, вкладка «Происхождение» — блок «Ключевые предки».`)
  log(`Ничего не удалено: скрипт только добавляет.`)

  process.exit(0)
}

main()
