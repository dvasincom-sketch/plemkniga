import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { User } from '@/payload-types'
import { forgetGrants } from '@/lib/grants'
import { ACCESS_SCOPES } from '@/lib/dictionaries'

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
const idOf = (v: unknown): number | null =>
  typeof v === 'number' ? v : typeof v === 'object' && v && 'id' in v ? (v as { id: number }).id : null

const ok = (line: string) => console.log(`  ✓  ${line}`)
const bad = (step: string, detail: string) => {
  findings.push({ step, detail })
  console.log(`  ✗  ${detail}`)
}
const skip = (line: string) => console.log(`  ·  ${line}`)

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
    return
  }
  const myOrg = idOf(viewer.organization)
  if (myOrg === null) {
    console.log('\nУ найденного фермера нет организации — грант выдавать некому.\n')
    return
  }

  // Чужое закрытое животное: другой владелец, в книге не показано
  const foreign = await payload.find({
    collection: 'animals',
    where: { and: [{ owner: { not_equals: myOrg } }, { publicVisible: { not_equals: true } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const victim = foreign.docs[0]
  if (!victim) {
    console.log('\nЧужих закрытых записей в базе нет — проверять нечего.\n')
    return
  }
  const ownerOrg = idOf(victim.owner)
  if (ownerOrg === null) {
    console.log('\nУ найденной чужой записи не заполнен владелец — проверять нечего.\n')
    return
  }

  console.log(`\nСмотрит: ${viewer.email} (организация ${myOrg})`)
  console.log(`Чужая закрытая запись: № ${victim.identNumber} (владелец ${ownerOrg})`)
  console.log(`Области: ${ACCESS_SCOPES.map((s) => s.value).join(', ')}\n`)

  /** Пробуем прочитать документ по идентификатору от лица посетителя. */
  const readable = async (collection: string, id: number | string): Promise<boolean> => {
    try {
      const doc = await payload.findByID({
        collection: collection as never,
        id,
        depth: 0,
        overrideAccess: false,
        user: viewer,
      })
      return Boolean(doc)
    } catch {
      // Отказ Payload возвращает исключением — ожидаемый исход
      return false
    }
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
    // Владельца подставит хук по животному; выдающим считаем администратора
    user: { id: 0, role: 'admin' } as never,
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

  const parents = [idOf(victim.father), idOf(victim.mother)].filter((v): v is number => v !== null)
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
    user: { id: 0, role: 'admin', organization: ownerOrg } as never,
  })
  forgetGrants(myOrg)

  if (await readable('animals', victim.id)) {
    ok('грант на стадо открыл запись хозяйства')
  } else {
    bad('стадо', 'грант на стадо выдан, а запись этого хозяйства не открылась')
  }

  /* ------------------------------- Уборка ---------------------------------- */

  for (const id of [grant.id, herdGrant.id]) {
    await payload.delete({ collection: 'access-grants', id, overrideAccess: true })
  }
  forgetGrants()

  /* -------------------------------- Итог ----------------------------------- */

  console.log('\n' + '─'.repeat(74))
  if (!findings.length) {
    console.log('\nТочечный доступ ведёт себя как обещано: область открывает только своё,')
    console.log('предки закрыты, срок и отзыв действуют.\n')
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

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
