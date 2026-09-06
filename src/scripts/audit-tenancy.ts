import 'dotenv/config'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import type { User } from '@/payload-types'
import { relId } from '@/lib/visibility'
import { attempt, attemptDetail } from '@/lib/access-attempt'

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
 * Скрипт читает и пишет: раздел «Прицельная запись в чужое» пробует
 * переписать чужую строку и намеренно оставляет след, если запись прошла.
 * В шапке стояло «только читает», и это расходилось с реестром прогонов,
 * где у ревизии честно стоит `writes: true`, — а шапку читают раньше.
 *
 * ## Почему отказ узнаётся по типу, а не по факту исключения
 *
 * Все выводы здесь отрицательные: «чужая карточка НЕ читается», «чужая
 * строка НЕ переписывается». Доказываются они попыткой, и попытка
 * проваливается по десятку причин: опечатка в имени коллекции,
 * отсутствующее поле, обрыв соединения, отказ валидации. Голый `catch`
 * выдавал любую из них за отказ по правам и печатал зелёную строку,
 * ничего не проверив, — ровно та беда, ради которой заведены
 * `lib/access-attempt.ts` и `access/denied.ts`. Соседние прогоны
 * (`check:security`, `check:team`, `check:journal`) ими уже пользуются;
 * две ревизии доступа — последний рубеж — не пользовались.
 *
 * Ненулевой код возврата означает найденную утечку либо пробу, которая
 * не смогла состояться.
 *
 *   npm run audit:tenancy
 */

const ru = (n: number) => n.toLocaleString('ru-RU')

/** Сколько отрицательных утверждений вправду доказано попыткой. */
let probes = 0

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
  const myOrg = relId(user.organization)

  /*
   * Чужая закрытая запись — не первая попавшаяся, а самая пригодная.
   *
   * Прежде бралась первая: `limit: 1`, без отбора. Если у неё не оказалось
   * ни одной привязанной записи — а так и вышло на живой базе, — восемь
   * прицельных чтений из девяти и все пять прицельных записей печатали
   * «проверять нечего», а итог всё равно объявлял, что утечек нет.
   * Ревизия границ должна выбирать животное, на котором есть что
   * проверять; тот же приём давно применён в ревизии точечного доступа.
   */
  const CANDIDATES = 25
  const foreign = await payload.find({
    collection: 'animals',
    where: {
      and: [{ owner: { not_equals: myOrg } }, { publicVisible: { not_equals: true } }],
    },
    limit: CANDIDATES,
    depth: 0,
    overrideAccess: true,
  })

  /** Сколько привязанных записей у животного: чем больше, тем полнее проба. */
  const attachedCount = async (animalId: number | string): Promise<number> => {
    let n = 0
    for (const collection of ANIMAL_SCOPED) {
      const res = await payload.count({
        collection: collection as never,
        where: { animal: { equals: animalId } },
        overrideAccess: true,
      })
      n += res.totalDocs
    }
    return n
  }

  let victim = foreign.docs[0]
  let best = -1
  for (const candidate of foreign.docs) {
    const n = await attachedCount(candidate.id)
    if (n > best) {
      best = n
      victim = candidate
    }
    /* Больше пяти коллекций проверять нечем — этого уже достаточно. */
    if (best >= ANIMAL_SCOPED.length) break
  }

  console.log(`\nПроверяем от лица: ${user.email} (организация ${myOrg})`)
  console.log(
    victim
      ? `Чужая закрытая запись для прицельной проверки: ${victim.identNumber} ` +
        `(владелец ${relId(victim.owner)}, привязанных записей ${best}, ` +
        `выбрана из ${foreign.docs.length})\n`
      : 'Чужих закрытых записей в базе нет — прицельная проверка невозможна.\n',
  )

  /* ------------------------- 1. Списки записей ---------------------------- */

  console.log('Списки от лица фермера\n' + '─'.repeat(74))

  /** Видимость животного для нашего пользователя. */
  const allowedAnimal = (animal: unknown): boolean => {
    if (!animal || typeof animal !== 'object') return true // связь не раскрыта — судить нечем
    const a = animal as { owner?: unknown; publicVisible?: boolean | null }
    if (a.publicVisible) return true
    return relId(a.owner) === myOrg
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

      const org = relId(d.organization ?? d.owner)
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
      /*
       * «Не найдено» здесь и есть отказ по правам: запись только что
       * найдена запросом с `overrideAccess`, значит она существует,
       * а правило чтения у Payload не отвергает документ, а сужает
       * выборку — и он перестаёт находиться. Разбор — в шапке
       * `lib/access-attempt.ts`.
       */
      const tried = await attempt(
        () =>
          payload.findByID({
            collection: collection as never,
            id,
            depth: 0,
            overrideAccess: false,
            user,
          }),
        { missingIsDenial: true },
      )

      if (tried.allowed) {
        findings.push({ collection, detail: `${what} читается по идентификатору` })
        console.log(`  ✗  ${collection} — ${what}: отдано`)
        return
      }
      if (!tried.denied) {
        findings.push({
          collection,
          detail: `${what}: проба не состоялась — ${tried.error ?? 'причина неизвестна'}`,
        })
        console.log(`  ✗  ${collection} — ${what}: ${attemptDetail(tried)}`)
        return
      }
      probes += 1
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

  /* --------------------- 3. Прицельная запись ----------------------------- */

  /*
   * Читать чужое и писать в чужое — разные права, и проверять их надо
   * отдельно.
   *
   * Первая версия этой ревизии смотрела только чтение и объявляла «утечек
   * не найдено», пока у отёлов, доек, осеменений, событий, документов
   * и стад изменение стояло `isAuthenticated`: посторонний мог не прочитать
   * чужую запись, а переписать её. Интерфейс так никогда не делал, но API
   * работает в обход интерфейса — а ревизия ходит именно туда.
   *
   * Запись пробуется настоящая, но безвредная: в поле заметки кладётся
   * строка проверки. Если запись прошла — это находка, и текст в базе
   * остаётся как след; убирать его ревизия не станет, потому что уборка
   * скрыла бы улику.
   */
  console.log('\nПрицельная запись в чужое\n' + '─'.repeat(74))

  const MARK = 'ревизия мультиарендности: эта строка не должна была записаться'

  const probeWrite = async (
    collection: string,
    id: number | string,
    field: string,
    what: string,
  ) => {
    const tried = await attempt(() =>
      payload.update({
        collection: collection as never,
        id,
        data: { [field]: MARK } as never,
        overrideAccess: false,
        user,
      }),
    )

    if (tried.allowed) {
      findings.push({ collection, detail: `${what} — чужая запись переписана` })
      console.log(`  ✗  ${collection} — ${what}: записалось`)
      return
    }
    if (!tried.denied) {
      findings.push({
        collection,
        detail: `${what}: проба записи не состоялась — ${tried.error ?? 'причина неизвестна'}`,
      })
      console.log(`  ✗  ${collection} — ${what}: ${attemptDetail(tried)}`)
      return
    }
    probes += 1
    console.log(`  ✓  ${collection} — ${what}: отказано`)
  }

  if (victim) {
    for (const collection of ['calvings', 'milk-tests', 'inseminations', 'health-events', 'events'] as const) {
      const row = await payload.find({
        collection,
        where: { animal: { equals: victim.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const first = row.docs[0] as { id: number | string } | undefined
      if (!first) {
        console.log(`  ·  ${collection} — у этой коровы записей нет, писать некуда`)
        continue
      }
      /*
       * Поле берётся по коллекции: `comment` есть у отёлов, осеменений
       * и событий, а у доек и случаев болезни его нет вовсе. Прежде
       * во все пять писался `comment`, и для двух коллекций обещание
       * «строка останется как след» было ложным: писать было некуда,
       * а зелёная строка печаталась.
       */
      const field = collection === 'milk-tests' || collection === 'health-events' ? 'note' : 'comment'
      await probeWrite(collection, first.id, field, 'запись чужой коровы')
    }

    await probeWrite('animals', victim.id, 'notes', 'карточка чужой коровы')
  }

  // Чужое стадо: имя стоит в публичной таблице книги, но правит его хозяйство
  const foreignHerd = await payload.find({
    collection: 'herds',
    where: { organization: { not_equals: myOrg } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const herd = foreignHerd.docs[0] as { id: number | string } | undefined
  if (herd) await probeWrite('herds', herd.id, 'name', 'чужое стадо')
  else console.log('  ·  herds — чужих стад в базе нет')

  // Чужая организация: сама запись и поля решения о членстве
  const foreignOrg = await payload.find({
    collection: 'organizations',
    where: { id: { not_equals: myOrg } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const org = foreignOrg.docs[0] as { id: number | string } | undefined
  if (org) await probeWrite('organizations', org.id, 'name', 'чужая организация')

  /*
   * Своё членство — отдельная проверка и, пожалуй, самая показательная.
   * Организацию хозяйство правит законно, поэтому запрос пройдёт; вопрос
   * в том, изменится ли поле, которое хозяйство менять не вправе.
   */
  if (myOrg) {
    const triedOwn = await attempt(() =>
      payload.update({
        collection: 'organizations',
        id: myOrg,
        data: { membershipReview: { comment: MARK, since: '2020-01-01T00:00:00.000Z' } } as never,
        overrideAccess: false,
        user,
      }),
    )

    if (!triedOwn.allowed && !triedOwn.denied) {
      findings.push({
        collection: 'organizations',
        detail: `своё решение о членстве: проба не состоялась — ${triedOwn.error ?? '—'}`,
      })
      console.log(`  ✗  organizations — своё решение о членстве: ${attemptDetail(triedOwn)}`)
    } else if (!triedOwn.allowed) {
      probes += 1
      console.log('  ✓  organizations — своё решение о членстве: отказано')
    } else {
      const after = await payload.findByID({
        collection: 'organizations',
        id: myOrg,
        depth: 0,
        overrideAccess: true,
      })
      const wrote = (after as { membershipReview?: { comment?: string | null } })?.membershipReview
      if (wrote?.comment === MARK) {
        findings.push({
          collection: 'organizations',
          detail: 'хозяйство переписало себе решение Ассоциации о членстве',
        })
        console.log('  ✗  organizations — своё решение о членстве: записалось')
      } else {
        probes += 1
        console.log('  ✓  organizations — своё решение о членстве: поле не изменилось')
      }
    }
  }

  /* -------------------------------- Итог ---------------------------------- */

  console.log('\n' + '─'.repeat(74))
  for (const line of checked) console.log(`  ${line}`)

  console.log('')
  /*
   * Пустая ревизия — не успех.
   *
   * Если подходящей жертвы не нашлось, разделы прицельного чтения
   * и записи пропускаются целиком, а итог печатал «утечек не найдено» —
   * то есть утверждение о безопасности, сделанное без единой пробы.
   */
  if (probes === 0) {
    console.log(
      'Ни одна проба не состоялась: подходящей чужой записи не нашлось.\n' +
        'Это не «утечек нет», это «проверить было нечем».\n',
    )
    process.exitCode = 1
    return
  }

  if (!findings.length) {
    console.log(`Утечек не найдено. Проб выполнено: ${ru(probes)}.\n`)
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
