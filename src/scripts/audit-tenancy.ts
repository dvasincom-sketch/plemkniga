import 'dotenv/config'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import type { User } from '@/payload-types'

/**
 * Ревизия мультиарендности: не отдаёт ли система чужие записи.
 *
 * Принадлежность данных хозяйству держится на связях — `animal.owner`,
 * `organization` — и на правилах доступа в `src/access/index.ts`. База сама
 * по себе не гарантирует ничего: `select * from milk_tests` вернёт дойки
 * всех хозяйств сразу. Единственная защита — то, что каждый запрос идёт
 * через Payload с правилом чтения и с пользователем.
 *
 * Проверка идёт от лица настоящего пользователя, а не разбором кода. Разбор
 * показал бы, какое правило написано у коллекции; здесь проверяется, что
 * оно делает. Два способа, потому что ловят разное:
 *
 *  1. **Списки.** Берём страницу записей от лица фермера и смотрим, нет ли
 *     среди них чужих. Ловит неверное правило, но не докажет отсутствия
 *     утечки: чужая запись может просто не попасть на первую страницу.
 *  2. **Прицельное чтение.** Берём заведомо чужую закрытую запись и пробуем
 *     прочитать её по идентификатору. Здесь случайности нет: либо отдало,
 *     либо нет. Это и есть настоящая проверка.
 *
 * Что считается своим. Животное — своё, если владелец совпадает с
 * организацией пользователя, и чужое-но-разрешённое, если помечено
 * публичным. Всё, что висит на животном (дойки, отёлы, осеменения, здоровье,
 * события, оценки, значения индекса), наследует его видимость: увидеть
 * надой чужой закрытой коровы — та же утечка, что увидеть её карточку.
 *
 * Скрипт только читает. Ненулевой код возврата означает найденную утечку.
 *
 *   npm run audit:tenancy
 */

const ru = (n: number) => n.toLocaleString('ru-RU')

/** Коллекции, висящие на животном: их видимость равна видимости животного. */
const ANIMAL_SCOPED = [
  'calvings',
  'milk-tests',
  'inseminations',
  'health-events',
  'events',
  'animal-evaluations',
  'animal-exteriors',
  'index-values',
] as const

/** Коллекции, привязанные к организации напрямую. */
const ORG_SCOPED = ['data-submissions', 'documents'] as const

type Finding = { collection: string; detail: string }

const idOf = (v: unknown): number | null =>
  typeof v === 'number' ? v : typeof v === 'object' && v && 'id' in v ? (v as { id: number }).id : null

async function main() {
  const payload = await getPayload({ config })
  const findings: Finding[] = []
  const checked: string[] = []

  /* --------------------- Кого и на чём проверяем -------------------------- */

  const farmers = await payload.find({
    collection: 'users',
    where: { and: [{ role: { equals: 'farmer' } }, { organization: { exists: true } }] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  })

  const user = farmers.docs[0] as User | undefined
  if (!user) {
    console.log('\nНет ни одного фермера с организацией — проверять не от чьего лица.')
    return
  }
  const myOrg = idOf(user.organization)

  // Чужая закрытая запись: другая организация и без публичной видимости
  const foreign = await payload.find({
    collection: 'animals',
    where: {
      and: [{ owner: { not_equals: myOrg } }, { publicVisible: { not_equals: true } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const victim = foreign.docs[0]

  console.log(`\nПроверяем от лица: ${user.email} (организация ${myOrg})`)
  console.log(
    victim
      ? `Чужая закрытая запись для прицельной проверки: ${victim.identNumber} (владелец ${idOf(victim.owner)})\n`
      : 'Чужих закрытых записей в базе нет — прицельная проверка невозможна.\n',
  )

  /* ------------------------- 1. Списки записей ---------------------------- */

  console.log('Списки от лица фермера\n' + '─'.repeat(74))

  /** Видимость животного для нашего пользователя. */
  const allowedAnimal = (animal: unknown): boolean => {
    if (!animal || typeof animal !== 'object') return true // связь не раскрыта — судить нечем
    const a = animal as { owner?: unknown; publicVisible?: boolean | null }
    if (a.publicVisible) return true
    return idOf(a.owner) === myOrg
  }

  const scanList = async (collection: string, limit = 200) => {
    const res = await payload.find({
      collection: collection as never,
      limit,
      depth: 1,
      overrideAccess: false,
      user,
    })

    const docs = res.docs as Record<string, unknown>[]
    const leaked = docs.filter((d) => {
      /*
       * Сама книга — особый случай: чужое животное в ней законно, если
       * помечено публичным. Первая версия проверки об этом забыла и объявила
       * утечкой все 200 показанных записей. Ревизия, которая кричит на
       * исправное, быстро перестаёт что-либо значить.
       */
      if (collection === 'animals') return !allowedAnimal(d)

      // Запись на животном судится по животному, но только если связь заполнена
      if (d.animal) return !allowedAnimal(d.animal)

      const org = idOf(d.organization ?? d.owner)
      return org !== null && org !== myOrg
    })

    checked.push(`${collection}: просмотрено ${ru(docs.length)} из ${ru(res.totalDocs ?? 0)}`)

    if (leaked.length) {
      findings.push({
        collection,
        detail:
          `в списке ${ru(leaked.length)} чужих записей из ${ru(docs.length)} показанных ` +
          `(например, id=${leaked[0]!.id})`,
      })
      console.log(`  ✗  ${collection} — чужих записей: ${ru(leaked.length)} из ${ru(docs.length)}`)
    } else {
      console.log(`  ✓  ${collection}`)
    }
  }

  await scanList('animals')
  for (const c of ANIMAL_SCOPED) await scanList(c)
  for (const c of ORG_SCOPED) await scanList(c)
  await scanList('index-profiles')
  await scanList('users')

  /* --------------------- 2. Прицельное чтение ----------------------------- */

  if (victim) {
    console.log('\nПрицельное чтение чужой закрытой записи\n' + '─'.repeat(74))

    /** Пробуем прочитать документ по id от лица пользователя. */
    const probe = async (collection: string, id: number | string, what: string) => {
      try {
        const doc = await payload.findByID({
          collection: collection as never,
          id,
          depth: 0,
          overrideAccess: false,
          user,
        })
        if (doc) {
          findings.push({ collection, detail: `${what} читается по идентификатору` })
          console.log(`  ✗  ${collection} — ${what}: отдано`)
          return
        }
      } catch {
        // Отказ в доступе Payload возвращает исключением — это ожидаемый исход
      }
      console.log(`  ✓  ${collection} — ${what}: отказано`)
    }

    await probe('animals', victim.id, 'карточка чужой коровы')

    for (const collection of ANIMAL_SCOPED) {
      const row = await payload.find({
        collection: collection as never,
        where: { animal: { equals: victim.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const first = row.docs[0] as { id: number | string } | undefined
      if (!first) {
        console.log(`  ·  ${collection} — у этой коровы записей нет, проверять нечего`)
        continue
      }
      await probe(collection, first.id, 'запись чужой коровы')
    }
  }

  /* -------------------------------- Итог ---------------------------------- */

  console.log('\n' + '─'.repeat(74))
  for (const line of checked) console.log(`  ${line}`)

  console.log('')
  if (!findings.length) {
    console.log('Утечек не найдено: ни один список и ни одно чтение не отдали чужого.\n')
    return
  }

  console.log(`Найдено утечек: ${ru(findings.length)}\n`)
  for (const f of findings) console.log(`  ${f.collection}: ${f.detail}`)
  console.log(
    '\nЭто не ошибка запроса, а правило доступа коллекции: смотрите `access.read`\n' +
      'в её описании (`src/collections/`). Правило `isAuthenticated` означает\n' +
      '«виден любому вошедшему» — для данных о продуктивности чужого стада\n' +
      'это почти всегда не то, что имелось в виду.\n',
  )
  process.exitCode = 1
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
