import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { fetchRegistry, type NsiRecord } from '@/lib/fgias-nsi'

/**
 * Молочные породы КРС из открытого реестра ФГИАС ПР.
 *
 * ## Зачем
 *
 * Породных разделов книги должно быть ровно столько, сколько молочных
 * пород признано государством, — и список этот не наш, а реестра.
 * Составить его руками значило бы завести седьмую копию справочника
 * и спорить с зоотехником о том, считать ли красно-пёструю отдельной
 * породой. Реестр уже ответил.
 *
 * ## Почему это стало возможно только сейчас
 *
 * Открытая часть ФГИАС отдаёт **справочники, а не животных**: пятьдесят
 * один реестр, и записей о конкретных коровах там нет вовсе. Долгое
 * время из этого следовало, что засеять книгу извне нечем.
 *
 * Оказалось, следует другое. У породы в реестре есть `direction_name` —
 * «Молочное», «Мясное», «Универсальное» — и `species_name`. То есть
 * молочный крупный рогатый скот выбирается точно, а не на глаз,
 * и с государственным ключом у каждой породы.
 *
 * Животных это не даёт и дать не может: они приходят только от хозяйств.
 * Но пустой раздел с именем породы, её государственным ключом и числом
 * линий — уже не пустая страница, а место, куда понятно как встать.
 *
 * ## Почему сухой прогон по умолчанию
 *
 * Тот же довод, что у сверки справочников: первое обращение книги наружу
 * за чужими ключами не должно молча править наши данные. Без `--apply`
 * скрипт только показывает, что нашёл и что собирается сделать.
 *
 * ## Что скрипт не делает
 *
 * Не удаляет наши породы, которых в реестре нет. Такая порода —
 * не ошибка, а вопрос: возможно, у неё другое название, возможно,
 * реестр её не ведёт. Удалить её значило бы потерять привязанных к ней
 * животных ради опрятности справочника.
 *
 *   npm run sync:fgias-breeds            — посмотреть
 *   npm run sync:fgias-breeds -- --apply — записать недостающие
 */

/** Реестр «Породы животных» — постоянный ключ открытой части ФГИАС. */
const BREEDS_REGISTRY = 'b0647b61-dc45-4c30-a0e2-0e74208d9e93'

const APPLY = process.argv.includes('--apply')

/**
 * Что считаем молочным КРС.
 *
 * Оба условия обязательны. Одного вида мало: у крупного рогатого скота
 * есть и мясные, и универсальные породы. Одного направления мало тем
 * более — «Молочное» стоит и у коз, и у буйволов, и раздел молочных
 * пород книги пополнился бы зааненской козой.
 *
 * «Универсальное» сюда не входит, и это решение, а не недосмотр:
 * симментальская в реестре может стоять как универсальная, а книга ведёт
 * её как молочную. Спорные случаи скрипт печатает отдельным списком —
 * решает человек, а не приведение строк.
 */
const SPECIES = 'Крупный рогатый скот'
const DAIRY = 'Молочное'

/*
 * Поля реестра читаются как есть. Приведение типа здесь стояло раньше
 * и было бесполезным: `fetchRegistry` собирал новый объект из трёх
 * полей, а приведение не создаёт данных, которых нет. Выборка молча
 * возвращала ноль пород, и это ровно тот вид неправды, за которым
 * мы гоняемся: ответ есть, ответ пустой, ошибки нет.
 */
type BreedRow = NsiRecord & {
  species_name?: string | null
  direction_name?: string | null
  category_name?: string | null
}

const norm = (s?: string | null): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]+/g, ' ')
    .trim()

async function main(): Promise<void> {
  const all = (await fetchRegistry(BREEDS_REGISTRY)) as BreedRow[]

  const cattle = all.filter((b) => b.species_name === SPECIES)
  const dairy = cattle.filter((b) => b.direction_name === DAIRY)
  const universal = cattle.filter((b) => b.direction_name === 'Универсальное')

  console.log(`В реестре пород всего: ${all.length}`)
  console.log(`Из них крупный рогатый скот: ${cattle.length}`)
  console.log(`Молочного направления: ${dairy.length}`)
  console.log(`Универсального (спорные, решает человек): ${universal.length}`)

  const payload = await getPayload({ config })
  const ours = await payload.find({ collection: 'breeds', limit: 1000, depth: 0 })

  const byName = new Map<string, { id: number | string; name: string }>()
  for (const b of ours.docs) byName.set(norm(b.name as string), { id: b.id, name: b.name as string })

  const missing: BreedRow[] = []
  const matched: [our: string, their: string][] = []

  for (const b of dairy) {
    const hit = byName.get(norm(b.name))
    if (hit) matched.push([hit.name, b.name])
    else missing.push(b)
  }

  console.log(`\nСовпало с нашими: ${matched.length}`)
  for (const [our, their] of matched) {
    console.log(`  ${our}${our === their ? '' : `  ←  «${their}» в реестре`}`)
  }

  console.log(`\nНет у нас: ${missing.length}`)
  for (const b of missing) console.log(`  ${b.name}`)

  /*
   * Универсальные печатаются списком, но не заводятся. Симментальская
   * стоит там же, где абердин-ангусская, и разделить их может только
   * тот, кто знает, что ведёт книга.
   */
  if (universal.length) {
    console.log(`\nУниверсального направления — решайте сами (${universal.length}):`)
    for (const b of universal.slice(0, 40)) console.log(`  ${b.name}`)
    if (universal.length > 40) console.log(`  … и ещё ${universal.length - 40}`)
  }

  if (!APPLY) {
    console.log('\n  Сухой прогон. Записать недостающие: npm run sync:fgias-breeds -- --apply')
    process.exit(0)
  }

  let created = 0
  for (const b of missing) {
    await payload.create({
      collection: 'breeds',
      data: {
        name: b.name,
        /*
         * Государственный ключ кладётся сразу. Порода, заведённая
         * без него, потом ищется по названию — а именно от поиска
         * по названию мы и уходим: «Чёрно-пёстрая» и «Черно-пестрая»
         * в реестре соседствуют.
         */
        fgiasUuid: b.uuid,
        code: b.code ?? undefined,
      } as never,
      overrideAccess: true,
    })
    created += 1
  }

  console.log(`\n  ✓ заведено пород: ${created}`)
  process.exit(0)
}

void main()
