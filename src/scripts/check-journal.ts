import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { attempt, attemptDetail } from '@/lib/access-attempt'
import type { User } from '@/payload-types'
import { OPERATIONS, recordOperation } from '@/lib/operations'

/**
 * Проверка сводного журнала на живой базе.
 *
 * Журнал проверяется не тем, что в него пишется, а тем, что из него
 * читается: кому какие строки видны и переживают ли они свой предмет.
 * Второе особенно: журнал, исчезающий вместе с удалённой записью,
 * бесполезен ровно в том случае, ради которого его завели.
 *
 *   npm run check:journal
 */

const TAG = 'CHK-LOG'
let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Попытка сделать запрещённое — с разбором причины отказа.
 *
 * Прежде здесь стояло `fn().then(() => true).catch(() => false)`, и любая
 * неудача читалась как «нельзя»: отсутствующая колонка, непрошедшая
 * валидация, обрыв соединения. Утверждение «чужой НЕ может» становилось
 * истинным от поломки запроса — то есть прогон отвечал зелёным ровно
 * тогда, когда проверять было нечем. Разбор — в `lib/access-attempt.ts`.
 */
const denies = async (fn: () => Promise<unknown>, what: string) => {
  const a = await attempt(fn)
  check(a.denied, what, attemptDetail(a))
}

const allows = async (fn: () => Promise<unknown>, what: string) => {
  const a = await attempt(fn)
  check(a.allowed, what, a.error ?? '')
}

async function main() {
  const payload = await getPayload({ config })
  const suffix = String(Date.now()).slice(-8)

  const mine = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Своё ${suffix}`, membership: 'member' },
  })
  const other = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Чужое ${suffix}`, membership: 'member' },
  })

  const mkUser = async (mark: string, org: number, role = 'farmer') =>
    (await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: `${TAG.toLowerCase()}-${mark}-${suffix}@example.test`,
        password: 'proverka-zhurnala-2026',
        lastName: 'Проверкин',
        firstName: mark,
        organization: org,
        role,
        orgRole: 'head',
        confirmed: true,
      } as never,
    })) as User

  const insider = await mkUser('insider', mine.id)
  const outsider = await mkUser('outsider', other.id)
  const expert = await mkUser('expert', other.id, 'expert')

  const animal = await payload.create({
    collection: 'animals',
    overrideAccess: true,
    data: {
      identNumber: `6${suffix}`,
      name: `${TAG} Проверка`,
      sex: 'female',
      owner: mine.id,
    } as never,
  })

  console.log('\nЗапись и чтение\n')

  await recordOperation(payload, {
    action: 'animal-archived',
    actor: insider,
    organization: mine.id,
    subjectType: 'animal',
    subjectId: Number(animal.id),
    subject: String(animal.identNumber),
    summary: 'проверка журнала',
  })

  const found = await payload.find({
    collection: 'operations',
    where: { subjectId: { equals: Number(animal.id) } },
    depth: 0,
    overrideAccess: true,
  })
  const row = found.docs[0]
  check(Boolean(row), 'операция записана')
  check(row?.actorName === 'Проверкин insider', 'имя автора сохранено снимком', row?.actorName ?? '')

  /*
   * Отказ доступа Payload отдаёт исключением, а не пустой выдачей.
   * Для проверки это одно и то же — «не видит», — и обрабатывать их
   * по-разному значило бы считать отказ ошибкой скрипта.
   */
  const visible = async (user: User | null) =>
    payload
      .find({
        collection: 'operations',
        where: { subjectId: { equals: Number(animal.id) } },
        depth: 0,
        overrideAccess: false,
        ...(user ? { user } : {}),
      })
      .then((r) => r.docs.length > 0)
      .catch(() => false)

  check(await visible(insider), 'своё хозяйство свою операцию видит')
  check(!(await visible(outsider)), 'чужое хозяйство операцию НЕ видит')
  check(await visible(expert), 'Ассоциация видит')
  check(!(await visible(null)), 'аноним НЕ видит')

  console.log('\nЖурнал не подделывается\n')

  await denies(
    () =>
      payload.create({
        collection: 'operations',
        user: expert,
        overrideAccess: false,
        data: { at: new Date().toISOString(), action: 'login', actorName: 'Кто угодно' },
      }),
    'даже Ассоциация НЕ может вписать строку через API',
  )

  await denies(
    () =>
      payload.update({
        collection: 'operations',
        id: row!.id,
        user: expert,
        overrideAccess: false,
        data: { summary: 'переписано' },
      }),
    'строку журнала НЕЛЬЗЯ переписать',
  )

  console.log('\nЖурнал переживает предмет\n')

  await payload.delete({ collection: 'animals', id: animal.id, overrideAccess: true })

  const afterDelete = await payload.find({
    collection: 'operations',
    where: { subjectId: { equals: Number(animal.id) } },
    depth: 0,
    overrideAccess: true,
  })
  check(afterDelete.docs.length > 0, 'запись журнала осталась после удаления животного')
  check(
    afterDelete.docs[0]?.subject === String(animal.identNumber),
    'номер удалённого животного читается из журнала',
  )

  console.log('\nСправочник действий\n')

  const groups = new Set(OPERATIONS.map((o) => o.group))
  check(groups.size === 4, 'все действия разложены по четырём разделам', `разделов: ${groups.size}`)
  check(
    new Set(OPERATIONS.map((o) => o.value)).size === OPERATIONS.length,
    'в справочнике нет повторов',
  )

  // ------------------------------ уборка ------------------------------ //
  await payload.delete({
    collection: 'operations',
    where: { subjectId: { equals: Number(animal.id) } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { email: { like: `${TAG.toLowerCase()}-` } },
    overrideAccess: true,
  })
  for (const id of [mine.id, other.id]) {
    await payload.delete({ collection: 'organizations', id, overrideAccess: true })
  }

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
