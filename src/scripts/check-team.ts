import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { attempt, attemptDetail } from '@/lib/access-attempt'
import type { User } from '@/payload-types'
import { newInviteToken, resolveInvite } from '@/lib/invitations'

/**
 * Сквозная проверка ролей, приглашений и блокировки на живой базе.
 *
 * Права — та часть системы, про которую разбор кода говорит меньше всего.
 * Правило читается как «свои данные правит хозяйство», и вопрос ровно
 * в том, кого система считает хозяйством после того, как у него появились
 * роли. Поэтому здесь не разбор, а попытки: каждая роль пробует сделать
 * то, чего ей делать нельзя, и отказ — такой же результат, как успех.
 *
 *   npm run check:team
 */

const TAG = 'CHK-TEAM'
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

  console.log('Готовим хозяйство\n')

  const org = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Хозяйство ${suffix}`, membership: 'member', presence: 'registered' },
  })

  const mkUser = async (mark: string, orgRole: 'head' | 'operator' | 'viewer') =>
    (await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: `${TAG.toLowerCase()}-${mark}-${suffix}@example.test`,
        password: 'proverka-roley-2026',
        lastName: 'Проверкин',
        firstName: mark,
        organization: org.id,
        orgRole,
        confirmed: true,
      } as never,
    })) as User

  const head = await mkUser('head', 'head')
  const operator = await mkUser('operator', 'operator')
  const viewer = await mkUser('viewer', 'viewer')

  const animal = await payload.create({
    collection: 'animals',
    overrideAccess: true,
    data: {
      identNumber: `8${suffix}`,
      name: `${TAG} Проверка`,
      sex: 'female',
      owner: org.id,
      state: 'alive',
    } as never,
  })

  const milkTest = (user: User, day: string) =>
    payload.create({
      collection: 'milk-tests',
      user,
      overrideAccess: false,
      data: { animal: animal.id, date: `2026-0${day}-10T00:00:00.000Z`, dailyYield: 25 } as never,
    })

  const movement = (user: User, day: string) =>
    payload.create({
      collection: 'movements',
      user,
      overrideAccess: false,
      data: {
        animal: animal.id,
        date: `2026-0${day}-11T00:00:00.000Z`,
        kind: 'cull',
        from: org.id,
      },
    })

  console.log('Что может каждая роль\n')

  await allows(() => milkTest(head, '1'), 'руководитель вносит дойку')
  await allows(() => milkTest(operator, '2'), 'зоотехник вносит дойку')
  await denies(() => milkTest(viewer, '3'), 'наблюдатель дойку НЕ вносит')

  await denies(() => movement(operator, '4'), 'зоотехник перемещение НЕ оформляет')
  await denies(() => movement(viewer, '5'), 'наблюдатель перемещение НЕ оформляет')
  await allows(() => movement(head, '6'), 'руководитель оформляет перемещение')

  const rename = (user: User, name: string) =>
    payload.update({
      collection: 'animals',
      id: animal.id,
      user,
      overrideAccess: false,
      data: { name },
    })

  await allows(() => rename(operator, `${TAG} Правка зоотехника`), 'зоотехник правит карточку')
  await denies(() => rename(viewer, `${TAG} Правка наблюдателя`), 'наблюдатель карточку НЕ правит')

  console.log('\nБлокировка\n')

  await payload.update({
    collection: 'users',
    id: operator.id,
    overrideAccess: true,
    data: { blockedAt: new Date().toISOString(), blockReason: 'проверка' } as never,
  })

  const blocked = (await payload.findByID({
    collection: 'users',
    id: operator.id,
    depth: 0,
    overrideAccess: true,
  })) as User

  await denies(() => milkTest(blocked, '7'), 'заблокированный дойку НЕ вносит')
  await denies(() => rename(blocked, `${TAG} Правка заблокированного`), 'заблокированный карточку НЕ правит')

  const stillThere = await payload.find({
    collection: 'milk-tests',
    where: { animal: { equals: animal.id } },
    depth: 0,
    overrideAccess: true,
  })
  check(
    stillThere.totalDocs >= 2,
    'записи заблокированного остались на месте',
    `доек: ${stillThere.totalDocs}`,
  )

  console.log('\nПриглашения\n')

  const token = newInviteToken()
  const invite = await payload.create({
    collection: 'invitations',
    overrideAccess: true,
    data: {
      email: `${TAG.toLowerCase()}-new-${suffix}@example.test`,
      orgRole: 'operator',
      organization: org.id,
      token,
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      invitedBy: head.id,
    },
  })

  check((await resolveInvite(payload, token))?.organization === org.id, 'действующее приглашение разбирается')
  check((await resolveInvite(payload, 'нет-такого-токена-вообще')) === null, 'выдуманный токен — ничего')

  await payload.update({
    collection: 'invitations',
    id: invite.id,
    overrideAccess: true,
    data: { revokedAt: new Date().toISOString() },
  })
  check((await resolveInvite(payload, token)) === null, 'отозванное приглашение — ничего')

  const expiredToken = newInviteToken()
  const expired = await payload.create({
    collection: 'invitations',
    overrideAccess: true,
    data: {
      email: `${TAG.toLowerCase()}-old-${suffix}@example.test`,
      orgRole: 'viewer',
      organization: org.id,
      token: expiredToken,
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      invitedBy: head.id,
    },
  })
  check((await resolveInvite(payload, expiredToken)) === null, 'просроченное приглашение — ничего')

  console.log('\nЧужое приглашение\n')

  const other = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Соседи ${suffix}`, membership: 'member' },
  })
  const stranger = (await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      email: `${TAG.toLowerCase()}-stranger-${suffix}@example.test`,
      password: 'proverka-roley-2026',
      lastName: 'Соседов',
      firstName: 'Сосед',
      organization: other.id,
      orgRole: 'head',
      confirmed: true,
    } as never,
  })) as User

  const seen = await payload.find({
    collection: 'invitations',
    user: stranger,
    overrideAccess: false,
    depth: 0,
  })
  check(
    !seen.docs.some((i) => i.id === invite.id || i.id === expired.id),
    'соседнее хозяйство чужих приглашений не видит',
  )

  // ------------------------------ уборка ------------------------------ //
  await payload.delete({
    collection: 'milk-tests',
    where: { animal: { equals: animal.id } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'movements',
    where: { animal: { equals: animal.id } },
    overrideAccess: true,
  })
  await payload.delete({ collection: 'animals', id: animal.id, overrideAccess: true })
  await payload.delete({
    collection: 'invitations',
    where: { organization: { equals: org.id } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'users',
    where: { email: { like: `${TAG.toLowerCase()}-` } },
    overrideAccess: true,
  })
  for (const id of [org.id, other.id]) {
    await payload.delete({ collection: 'organizations', id, overrideAccess: true })
  }
  void viewer

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
