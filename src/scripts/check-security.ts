import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { User } from '@/payload-types'
import { relId } from '@/lib/visibility'

/**
 * Проверка двух закрытых дыр — на живой базе, попытками.
 *
 * ## Почему именно попытками
 *
 * Обе дыры выглядели в коде как защищённые места. У поля `role` стояло
 * правило доступа — только не на том действии. У файлов стояло правило
 * чтения — только `anyone`. Разбор кода такое пропускает: он показывает,
 * что правило есть, а вопрос в том, что оно делает. Поэтому здесь
 * не разбор, а попытки сделать то, чего делать нельзя.
 *
 *   npm run check:security
 *
 * Скрипт заводит свои записи с приставкой `CHK-SEC` и убирает их за собой.
 */

const TAG = 'CHK-SEC'
let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

const tried = async (fn: () => Promise<unknown>): Promise<boolean> =>
  fn()
    .then(() => true)
    .catch(() => false)

async function main() {
  const payload = await getPayload({ config })
  const suffix = String(Date.now()).slice(-8)

  const victim = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Жертва ${suffix}`, membership: 'member' },
  })
  const other = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Посторонние ${suffix}`, membership: 'member' },
  })

  const mkUser = async (mark: string, org: number, role = 'farmer') =>
    (await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: `${TAG.toLowerCase()}-${mark}-${suffix}@example.test`,
        password: 'proverka-bezopasnosti-2026',
        lastName: 'Проверкин',
        firstName: mark,
        organization: org,
        role,
        orgRole: 'head',
        confirmed: true,
      } as never,
    })) as User

  const insider = await mkUser('insider', victim.id)
  const outsider = await mkUser('outsider', other.id)
  const expert = await mkUser('expert', other.id, 'expert')

  console.log('\nЭскалация роли при регистрации\n')

  check(
    !(await tried(() =>
      payload.create({
        collection: 'users',
        overrideAccess: false,
        data: {
          email: `${TAG.toLowerCase()}-anon-${suffix}@example.test`,
          password: 'proverka-bezopasnosti-2026',
          lastName: 'Злоумышленников',
          firstName: 'Аноним',
          role: 'admin',
        } as never,
      }),
    )),
    'аноним НЕ заводит себе учётную запись через API',
  )

  check(
    !(await tried(() =>
      payload.create({
        collection: 'users',
        user: outsider,
        overrideAccess: false,
        data: {
          email: `${TAG.toLowerCase()}-esc-${suffix}@example.test`,
          password: 'proverka-bezopasnosti-2026',
          lastName: 'Злоумышленников',
          firstName: 'Свой',
          role: 'admin',
          organization: victim.id,
        } as never,
      }),
    )),
    'участник НЕ заводит запись с чужой организацией и ролью admin',
  )

  await payload
    .update({
      collection: 'users',
      id: outsider.id,
      user: outsider,
      overrideAccess: false,
      data: { organization: victim.id, role: 'admin', confirmed: true } as never,
    })
    .catch(() => null)

  const after = (await payload.findByID({
    collection: 'users',
    id: outsider.id,
    depth: 0,
    overrideAccess: true,
  })) as User

  check(relId(after.organization) === other.id, 'участник НЕ переписал себе организацию на чужую')
  check(after.role !== 'admin', 'участник НЕ повысил себе роль')

  console.log('\nФайлы\n')

  const csv = Buffer.from('ident;kg\n123;30\n', 'utf8')

  const secret = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: `${TAG} выгрузка стада`, owner: victim.id, visibility: 'private' },
    file: { data: csv, name: `${TAG}-${suffix}.csv`, mimetype: 'text/csv', size: csv.length },
  })

  const canRead = async (user: User | null) =>
    payload
      .findByID({
        collection: 'media',
        id: secret.id,
        depth: 0,
        overrideAccess: false,
        ...(user ? { user } : {}),
      })
      .then(Boolean)
      .catch(() => false)

  check(!(await canRead(null)), 'аноним НЕ читает чужую выгрузку')
  check(!(await canRead(outsider)), 'соседнее хозяйство НЕ читает чужую выгрузку')
  check(await canRead(insider), 'своё хозяйство свою выгрузку читает')
  check(await canRead(expert), 'Ассоциация читает')

  const listedForOutsider = await payload.find({
    collection: 'media',
    user: outsider,
    overrideAccess: false,
    depth: 0,
    limit: 200,
  })
  check(
    !listedForOutsider.docs.some((d) => d.id === secret.id),
    'чужая выгрузка не попадает в список файлов',
  )

  check(
    !(await tried(() =>
      payload.update({
        collection: 'media',
        id: secret.id,
        user: outsider,
        overrideAccess: false,
        data: { alt: 'подменено' },
      }),
    )),
    'соседнее хозяйство НЕ правит чужой файл',
  )

  console.log('\nФото открытой карточки\n')

  const photo = await payload.create({
    collection: 'media',
    overrideAccess: true,
    data: { alt: `${TAG} фото`, owner: victim.id },
    file: {
      data: Buffer.from('ident;kg\n1;1\n', 'utf8'),
      name: `${TAG}-photo-${suffix}.csv`,
      mimetype: 'text/csv',
      size: 14,
    },
  })

  const animal = await payload.create({
    collection: 'animals',
    overrideAccess: true,
    data: {
      identNumber: `7${suffix}`,
      name: `${TAG} Проверка`,
      sex: 'female',
      owner: victim.id,
      photo: photo.id,
      publicVisible: true,
    } as never,
  })

  const reread = async () =>
    (await payload.findByID({ collection: 'media', id: photo.id, depth: 0, overrideAccess: true }))
      .visibility

  check((await reread()) === 'public', 'фото открытой карточки открыто всем')

  await payload.update({
    collection: 'animals',
    id: animal.id,
    overrideAccess: true,
    data: { publicVisible: false },
  })
  check((await reread()) === 'private', 'закрыли карточку — закрылось и фото')

  // ------------------------------ уборка ------------------------------ //
  await payload.delete({ collection: 'animals', id: animal.id, overrideAccess: true })
  for (const id of [secret.id, photo.id]) {
    await payload.delete({ collection: 'media', id, overrideAccess: true })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: `${TAG.toLowerCase()}-` } },
    overrideAccess: true,
  })
  for (const id of [victim.id, other.id]) {
    await payload.delete({ collection: 'organizations', id, overrideAccess: true })
  }

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
