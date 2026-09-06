import 'dotenv/config'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import type { User } from '@/payload-types'
import { forgetGrants } from '@/lib/grants'
import { ACCESS_SCOPES } from '@/lib/dictionaries'
import { relId } from '@/lib/visibility'
import { attempt } from '@/lib/access-attempt'

/** Сколько чужих закрытых записей просматривается в поиске пригодной. */
const CANDIDATES = 25

/**
 * Ревизия точечного доступа: открывает ли грант ровно то, что обещает.
 *
 * Правило чтения можно прочесть глазами и убедиться, что оно написано верно.
 * Здесь проверяется другое — что оно **делает**, и делает от лица настоящего
 * пользователя на настоящих данных. Разбор кода не поймал бы главного:
 * область живёт не только на экране, и грант на происхождение не должен
 * открывать надои ни через страницу, ни через `/api/milk-tests`.
 *
 * Пять шагов раздела 5.7 в `docs/tochechnyy-dostup.md`:
 *
 *  1. выдать грант на `origin` одному чужому закрытому животному;
 *  2. карточка открывается, происхождение видно, продуктивность и оценка —
 *     нет, причём проверяется прицельным чтением по идентификатору,
 *     а не отсутствием в списке;
 *  3. предки закрытого животного остаются закрытыми;
 *  4. отзыв — не отдаётся ничего;
 *  5. срок в прошлом — то же самое.
 *
 * Прицельное чтение важнее просмотра списков: список может не дотянуться
 * до строки случайно, и «в выдаче чисто» ничего не доказывает (решение №24).
 *
 * Скрипт **меняет данные**: заводит грант и в конце его удаляет. На боевой
 * базе запускать не нужно — он для локальной и для копии.
 *
 *   npm run audit:grants
 */

type Finding = { step: string; detail: string }

const findings: Finding[] = []

/**
 * Сообщение вместе со всеми вложенными причинами.
 *
 * Drizzle заворачивает ошибку драйвера в свою: наверху остаётся
 * «Failed query: insert into …» со списком параметров, а настоящая причина —
 * например, нарушение внешнего ключа — лежит в `cause`. Без разворачивания
 * ревизия показывает симптом вместо причины, и разбираться приходится
 * по номерам параметров. Тот же приём, что в `/healthz`.
 */
function describeError(e: unknown): string {
  const parts: string[] = []
  let current: unknown = e
  const seen = new Set<unknown>()

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const err = current as {
      message?: string
      code?: string
      detail?: string
      constraint?: string
      cause?: unknown
    }
    const own = [
      err.message?.trim(),
      err.code ? `код ${err.code}` : null,
      err.constraint ? `ограничение ${err.constraint}` : null,
      err.detail?.trim(),
    ]
      .filter(Boolean)
      .join(' · ')

    if (own && !parts.includes(own)) parts.push(own)
    current = err.cause
  }

  return parts.join('\n  ← ') || String(e)
}

/**
 * Пропущенные проверки считаются наравне с найденным.
 *
 * Первый прогон закончился словами «ведёт себя как обещано», хотя две
 * проверки из шести не выполнялись вовсе: у выбранной коровы не было
 * документов, а единственный её предок оказался публичным. Пропуск
 * не ошибка — данные бывают всякие, — но молчаливый пропуск превращает
 * ревизию в поздравление. Итог теперь называет непроверенное вслух.
 */
const skipped: string[] = []

/*
 * Выполненные утверждения считаются: ревизия, не сделавшая ни одного,
 * не имеет права печатать «ведёт себя как обещано». Пять выходов
 * «проверять нечего» возвращали ноль, и прогон, ничего не проверивший,
 * был неотличим от прогона, где всё сошлось.
 */
let done = 0
const ok = (line: string) => {
  done += 1
  console.log(`  ✓  ${line}`)
}
const bad = (step: string, detail: string) => {
  findings.push({ step, detail })
  console.log(`  ✗  ${detail}`)
}
const skip = (line: string) => {
  skipped.push(line)
  console.log(`  ·  ${line}  (не проверено)`)
}

/** Коллекции, приписанные к области. Читается прицельно, по одной строке. */
const BY_SCOPE = {
  production: ['calvings', 'milk-tests', 'inseminations', 'health-events', 'events'],
  evaluation: ['animal-evaluations', 'animal-exteriors', 'index-values'],
  documents: ['documents'],
} as const

async function main() {
  const payload = await getPayload({ config })

  /* ------------------------ Кого и на чём проверяем ----------------------- */

  const users = await payload.find({
    collection: 'users',
    where: { and: [{ role: { equals: 'farmer' } }, { organization: { exists: true } }] },
    limit: 5,
    depth: 0,
    overrideAccess: true,
  })

  const viewer = users.docs[0] as User | undefined
  if (!viewer) {
    console.log('\nНет ни одного фермера с организацией — проверять не от чьего лица.\n')
    process.exitCode = 1
    return
  }
  const myOrg = relId(viewer.organization)
  if (myOrg === null) {
    console.log('\nУ найденного фермера нет организации — грант выдавать некому.\n')
    process.exitCode = 1
    return
  }

  /*
   * Чужое закрытое животное — и по возможности живое, а не служебный предок.
   *
   * Первый запуск выбрал запись с номером `ANC-…`: такие заводятся ради
   * построения родословных, в стаде никогда не стояли и висящих на них
   * записей не имеют вовсе. Проверка на них проходит с «проверять нечего»
   * почти на каждом шаге и ничего не доказывает. Поэтому архив исключён,
   * а среди оставшихся ищется запись, у которой есть хотя бы дойка или отёл.
   */
  const candidates = await payload.find({
    collection: 'animals',
    where: {
      and: [
        { owner: { not_equals: myOrg } },
        { publicVisible: { not_equals: true } },
        { or: [{ archived: { equals: false } }, { archived: { exists: false } }] },
      ],
    },
    limit: CANDIDATES,
    depth: 0,
    overrideAccess: true,
  })

  /*
   * Выбираем не первую попавшуюся, а самую пригодную для проверки.
   *
   * Пригодность — это сколько проверок на ней вообще выполнится: есть ли
   * записи каждой области и есть ли закрытый предок. Первый прогон взял
   * первую попавшуюся, и две проверки из шести не выполнились ни разу.
   * Ревизия на неподходящих данных отвечает не «всё хорошо», а «не знаю»,
   * и разница между этими ответами — вся её ценность.
   */
  const anyRow = async (collection: string, animalId: number | string): Promise<boolean> => {
    const res = await payload.find({
      collection: collection as never,
      where: { animal: { equals: animalId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return res.docs.length > 0
  }

  const closedParent = async (a: { father?: unknown; mother?: unknown }): Promise<boolean> => {
    for (const parent of [relId(a.father), relId(a.mother)]) {
      if (parent === null) continue
      const doc = await payload.findByID({
        collection: 'animals',
        id: parent,
        depth: 0,
        overrideAccess: true,
      })
      if (doc && !doc.publicVisible) return true
    }
    return false
  }

  let victim = candidates.docs[0]
  let best = -1

  for (const candidate of candidates.docs) {
    let score = 0
    if (await anyRow('milk-tests', candidate.id)) score++
    if (await anyRow('animal-evaluations', candidate.id)) score++
    if (await anyRow('documents', candidate.id)) score++
    if (await closedParent(candidate)) score++

    if (score > best) {
      best = score
      victim = candidate
    }
    if (score === 4) break
  }

  if (!victim) {
    console.log('\nЧужих закрытых записей в базе нет — проверять нечего.\n')
    process.exitCode = 1
    return
  }
  const ownerOrg = relId(victim.owner)
  if (ownerOrg === null) {
    console.log('\nУ найденной чужой записи не заполнен владелец — проверять нечего.\n')
    process.exitCode = 1
    return
  }

  /*
   * Грант выдаёт настоящий сотрудник хозяйства-владельца, а не выдуманный
   * пользователь.
   *
   * В первой версии здесь стоял `{ id: 0, role: 'admin' }` — и вставка
   * упала нарушением внешнего ключа: пользователя с нулевым идентификатором
   * в базе нет. Настоящий сотрудник лучше не только этим: грант проходит
   * ровно тот путь, которым его выдаёт живой человек, вместе с проверкой
   * «открыть можно только свои данные» в хуке коллекции.
   */
  const issuers = await payload.find({
    collection: 'users',
    where: { organization: { equals: ownerOrg } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const issuer = issuers.docs[0] as User | undefined
  if (!issuer) {
    console.log(`\nУ хозяйства ${ownerOrg} нет ни одного пользователя — выдавать грант некому.\n`)
    process.exitCode = 1
    return
  }

  console.log(`\nСмотрит:  ${viewer.email} (организация ${myOrg})`)
  console.log(`Выдаёт:   ${issuer.email} (организация ${ownerOrg})`)
  console.log(`Запись:   № ${victim.identNumber}, закрыта, владелец ${ownerOrg}`)
  console.log(`Области:  ${ACCESS_SCOPES.map((s) => s.value).join(', ')}\n`)

  /**
   * Пробуем прочитать документ по идентификатору от лица посетителя.
   *
   * На этом ответе держатся все отрицательные выводы ревизии: «карточка
   * закрыта», «область отказала», «истёкший грант ничего не открывает»,
   * «отозванный закрывает сразу». Прежде здесь стоял голый `catch`,
   * возвращавший `false`, — и любой сбой (опечатка в имени коллекции,
   * обрыв соединения, отсутствующая колонка) читался как отказ по правам,
   * то есть как зелёный ответ. Теперь отказ отличается от поломки:
   * поломка считается отдельно и краснеет.
   */
  let broken = 0
  const readable = async (collection: string, id: number | string): Promise<boolean> => {
    /*
     * Как и в ревизии мультиарендности: закрытая запись не отвергается,
     * а перестаёт находиться. Идентификатор сюда приходит из запроса
     * с `overrideAccess`, то есть запись заведомо есть, и «не найдено»
     * означает единственное — правило чтения сработало.
     */
    const tried = await attempt(
      () =>
        payload.findByID({
          collection: collection as never,
          id,
          depth: 0,
          overrideAccess: false,
          user: viewer,
        }),
      { missingIsDenial: true },
    )
    if (tried.allowed) return true
    if (!tried.denied) {
      broken += 1
      bad(collection, `проба чтения не состоялась: ${tried.error ?? 'причина неизвестна'}`)
    }
    return false
  }

  /** Первая строка коллекции, привязанная к этому животному. */
  const rowOf = async (collection: string): Promise<number | string | null> => {
    const res = await payload.find({
      collection: collection as never,
      where: { animal: { equals: victim.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return (res.docs[0] as { id: number | string } | undefined)?.id ?? null
  }

  /* ----------------------- 0. До гранта не видно ничего -------------------- */

  console.log('До гранта\n' + '─'.repeat(74))

  if (await readable('animals', victim.id)) {
    bad('до гранта', 'чужая закрытая карточка читается без всякого гранта')
  } else {
    ok('карточка закрыта')
  }

  /* -------------------- 1. Грант на происхождение -------------------------- */

  const grant = await payload.create({
    collection: 'access-grants',
    data: {
      // Владельца всё равно перепишет хук по животному — здесь он только
      // ради обязательного поля в типе
      owner: ownerOrg,
      animal: victim.id,
      grantee: myOrg,
      scopes: ['origin'],
      note: 'Ревизия npm run audit:grants',
    },
    overrideAccess: true,
    // Владельца подставит хук по животному; выдаёт сотрудник этого хозяйства
    user: issuer,
  })
  forgetGrants(myOrg)

  console.log('\nГрант на происхождение\n' + '─'.repeat(74))

  if (await readable('animals', victim.id)) {
    ok('карточка открылась')
  } else {
    bad('грант', 'грант выдан, а карточка всё равно не читается')
  }

  /* --------------- 2. Открыта ровно одна область, остальные нет ------------ */

  for (const [scope, collections] of Object.entries(BY_SCOPE)) {
    for (const collection of collections) {
      const id = await rowOf(collection)
      if (id === null) {
        skip(`${collection} — записей у этой коровы нет, проверять нечего`)
        continue
      }
      const got = await readable(collection, id)
      if (got) {
        bad(
          'область',
          `${collection} (${scope}) читается по гранту на origin — область живёт только на экране`,
        )
      } else {
        ok(`${collection} (${scope}) — отказано`)
      }
    }
  }

  /* ---------------------- 3. Предки остаются закрытыми --------------------- */

  console.log('\nПредки\n' + '─'.repeat(74))

  const parents = [relId(victim.father), relId(victim.mother)].filter((v): v is number => v !== null)
  if (!parents.length) {
    skip('у записи не заполнены отец и мать — проверять нечего')
  }
  for (const parent of parents) {
    const doc = await payload.findByID({
      collection: 'animals',
      id: parent,
      depth: 0,
      overrideAccess: true,
    })
    if (doc?.publicVisible) {
      skip(`предок ${parent} и так публичный`)
      continue
    }
    if (await readable('animals', parent)) {
      bad('предки', `закрытый предок ${parent} открылся вместе с потомком`)
    } else {
      ok(`закрытый предок ${parent} остался закрыт`)
    }
  }

  /* ------------------------------ 4. Срок ---------------------------------- */

  console.log('\nСрок и отзыв\n' + '─'.repeat(74))

  await payload.update({
    collection: 'access-grants',
    id: grant.id,
    data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
    overrideAccess: true,
  })
  forgetGrants(myOrg)

  if (await readable('animals', victim.id)) {
    bad('срок', 'срок гранта в прошлом, а карточка всё ещё читается')
  } else {
    ok('истёкший грант ничего не открывает')
  }

  await payload.update({
    collection: 'access-grants',
    id: grant.id,
    data: { expiresAt: null },
    overrideAccess: true,
  })
  forgetGrants(myOrg)

  if (!(await readable('animals', victim.id))) {
    bad('срок', 'срок снят, а карточка не вернулась')
  } else {
    ok('без срока грант снова действует')
  }

  /* ------------------------------ 5. Отзыв --------------------------------- */

  await payload.update({
    collection: 'access-grants',
    id: grant.id,
    data: { revokedAt: new Date().toISOString() },
    overrideAccess: true,
  })

  /*
   * `forgetGrants` здесь намеренно не вызывается: отзыв должен сбрасывать
   * память сам, хуком коллекции. Если вызвать вручную, проверка станет
   * проверкой самой себя.
   */
  if (await readable('animals', victim.id)) {
    bad('отзыв', 'грант отозван, а карточка читается — хук отзыва не сбросил память')
  } else {
    ok('отозванный грант закрывает доступ сразу')
  }

  /* ------------------------- 6. Грант на стадо ----------------------------- */

  console.log('\nГрант на всё стадо\n' + '─'.repeat(74))

  const herdGrant = await payload.create({
    collection: 'access-grants',
    data: {
      owner: ownerOrg,
      grantee: myOrg,
      scopes: ['origin'],
      note: 'Ревизия npm run audit:grants — на стадо',
    },
    overrideAccess: true,
    user: issuer,
  })
  forgetGrants(myOrg)

  if (await readable('animals', victim.id)) {
    ok('грант на стадо открыл запись хозяйства')
  } else {
    bad('стадо', 'грант на стадо выдан, а запись этого хозяйства не открылась')
  }

  /* ------------------------------- Уборка ---------------------------------- */

  await cleanup(payload, [grant.id, herdGrant.id])

  /* -------------------------------- Итог ----------------------------------- */

  console.log('\n' + '─'.repeat(74))

  if (skipped.length) {
    console.log(`\nНе проверено: ${skipped.length}\n`)
    for (const line of skipped) console.log(`  · ${line}`)
    console.log(
      `\nЭто не находки, а пробелы в данных: на выбранной записи такой проверке\n` +
        `не на чем было выполниться. Ревизия выбирает запись с наибольшим охватом\n` +
        `из ${CANDIDATES} кандидатов — то есть пробел означает «не нашлось среди них»,\n` +
        `а не «нет во всей базе». Прежде здесь стояло второе, и это было неправдой:\n` +
        `двадцать пять записей ничего не говорят о тысячах.`,
    )
  }

  if (done === 0) {
    console.log(
      '\nНи одно утверждение не проверено: на выбранной записи выполниться\n' +
        'было нечему. Это не «доступ ведёт себя как обещано».\n',
    )
    process.exitCode = 1
    return
  }

  if (!findings.length) {
    console.log(
      skipped.length
        ? `\nИз ${done} выполненных проверок не сработала ни одна: область открывает только своё,\nсрок и отзыв действуют. Пропущенное выше остаётся непроверенным.\n`
        : `\nТочечный доступ ведёт себя как обещано (${done} проверок): область открывает\nтолько своё, предки закрыты, срок и отзыв действуют.\n`,
    )
    return
  }

  console.log(`\nНайдено расхождений: ${findings.length}\n`)
  for (const f of findings) console.log(`  ${f.step}: ${f.detail}`)
  console.log(
    '\nСмотрите `src/access/index.ts` — правила чтения — и приписку коллекции\n' +
      'к области в её описании. Область, которая работает только на экране,\n' +
      'обходится через API: ровно эта ошибка разобрана в решении №24.\n',
  )
  process.exitCode = 1
}

/*
 * Уборка вынесена и зовётся из `finally`: висящая ссылка на родителя
 * бросала исключение посреди проверок, выход уходил в общий `catch`,
 * и выданные гранты оставались в базе — то есть ревизия доступа
 * оставляла после себя настоящий доступ.
 */
async function cleanup(payload: Payload, ids: (number | string)[]) {
  for (const id of ids) {
    await payload
      .delete({ collection: 'access-grants', id, overrideAccess: true })
      .catch((e: unknown) => console.error(`  грант ${id} не убран: ${describeError(e)}`))
  }
  forgetGrants()
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('\nОшибка:\n  ' + describeError(e) + '\n')
    process.exit(1)
  })
