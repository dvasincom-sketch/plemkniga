import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { User } from '@/payload-types'
import { relId } from '@/lib/visibility'
import { attempt, attemptDetail } from '@/lib/access-attempt'

/**
 * Сквозная проверка перемещений на живой базе.
 *
 * Проверяет не сборку, а поведение: что после продажи владелец сменился,
 * прежний остался в истории, дойки продавца ему видны, а дойки покупателя —
 * нет. Разбором кода это не доказывается: правило доступа читается как
 * «видит своё», а вопрос ровно в том, что система считает своим после
 * смены владельца.
 *
 *   npm run check:movements
 *
 * Скрипт заводит собственные записи с приставкой `CHK-MOVE` и удаляет их
 * за собой. На боевой базе запускать незачем, но и вреда он не нанесёт:
 * ничего чужого не трогает.
 */

const TAG = 'CHK-MOVE'
let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${what}`)
  } else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const payload = await getPayload({ config })
  const suffix = String(Date.now()).slice(-8)

  console.log('Готовим участников\n')

  const seller = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Продавец ${suffix}`, membership: 'member', presence: 'registered' },
  })

  const buyer = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Покупатель ${suffix}`, membership: 'member', presence: 'registered' },
  })

  const outsider = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Вне книги ${suffix}`, presence: 'referenced' },
  })

  const mkUser = async (org: number, mark: string) =>
    (await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: `${TAG.toLowerCase()}-${mark}-${suffix}@example.test`,
        password: 'proverka-peremeshcheniy-2026',
        lastName: 'Проверкин',
        firstName: 'Пров',
        organization: org,
        confirmed: true,
      } as never,
    })) as User

  const sellerUser = await mkUser(seller.id, 'seller')
  const buyerUser = await mkUser(buyer.id, 'buyer')

  const animal = await payload.create({
    collection: 'animals',
    overrideAccess: true,
    data: {
      identNumber: `9${suffix}`,
      name: `${TAG} Проверка`,
      sex: 'female',
      owner: seller.id,
      state: 'alive',
      publicVisible: false,
      publicDetails: false,
    } as never,
  })

  // Дойка продавца — до продажи
  const beforeSale = await payload.create({
    collection: 'milk-tests',
    overrideAccess: true,
    data: { animal: animal.id, date: '2026-01-15T00:00:00.000Z', dailyYield: 28 } as never,
  })

  check(
    relId((beforeSale as { ownerOrg?: unknown }).ownerOrg) === seller.id,
    'дойка до продажи проштампована продавцом',
    `штамп: ${JSON.stringify((beforeSale as { ownerOrg?: unknown }).ownerOrg)}`,
  )

  console.log('\nЧужое животное себе\n')

  /*
   * Покупатель пробует записать продажу чужой коровы самому себе —
   * от своего лица, как это пришло бы прямым запросом к `/api/movements`.
   * Хук обязан спросить владельца животного, а не только «моя ли это
   * сторона»: получатель тоже сторона, и одного этого было достаточно,
   * чтобы забрать любую карточку книги.
   */
  const grab = await attempt(() =>
    payload.create({
      collection: 'movements',
      user: buyerUser,
      overrideAccess: false,
      data: {
        animal: animal.id,
        date: '2026-02-20T00:00:00.000Z',
        kind: 'sale',
        from: seller.id,
        to: buyer.id,
      },
    }),
  )
  check(
    grab.denied && /владелец/.test(grab.error ?? ''),
    'получатель НЕ может записать продажу чужого животного себе',
    attemptDetail(grab),
  )
  const ownerAfterGrab = await payload.findByID({
    collection: 'animals',
    id: animal.id,
    depth: 0,
    overrideAccess: true,
  })
  check(relId(ownerAfterGrab.owner) === seller.id, 'владелец после попытки не изменился')

  console.log('\nПродажа члену Ассоциации\n')

  await payload.create({
    collection: 'movements',
    overrideAccess: true,
    data: {
      animal: animal.id,
      date: '2026-03-01T00:00:00.000Z',
      kind: 'sale',
      from: seller.id,
      to: buyer.id,
    },
  })

  let after = await payload.findByID({
    collection: 'animals',
    id: animal.id,
    depth: 0,
    overrideAccess: true,
  })

  check(relId(after.owner) === buyer.id, 'владелец сменился на покупателя')
  check(
    (after.pastOwners ?? []).map(relId).includes(seller.id),
    'продавец остался в прежних владельцах',
  )
  check(after.state === 'alive', 'животное осталось в стаде: покупатель ведёт книгу')

  // Дойка покупателя — после продажи
  const afterSale = await payload.create({
    collection: 'milk-tests',
    overrideAccess: true,
    data: { animal: animal.id, date: '2026-04-15T00:00:00.000Z', dailyYield: 31 } as never,
  })

  check(
    relId((afterSale as { ownerOrg?: unknown }).ownerOrg) === buyer.id,
    'дойка после продажи проштампована покупателем',
  )

  console.log('\nЧто видит каждая сторона\n')

  const asSeller = await payload.find({
    collection: 'milk-tests',
    user: sellerUser,
    overrideAccess: false,
    depth: 0,
    where: { animal: { equals: animal.id } },
  })
  const sellerIds = asSeller.docs.map((d) => d.id)

  check(sellerIds.includes(beforeSale.id), 'продавец видит свою дойку')
  check(!sellerIds.includes(afterSale.id), 'продавец НЕ видит дойку покупателя')

  const asBuyer = await payload.find({
    collection: 'milk-tests',
    user: buyerUser,
    overrideAccess: false,
    depth: 0,
    where: { animal: { equals: animal.id } },
  })
  const buyerIds = asBuyer.docs.map((d) => d.id)

  check(buyerIds.includes(beforeSale.id), 'покупатель видит историю продавца')
  check(buyerIds.includes(afterSale.id), 'покупатель видит свою дойку')

  const cardForSeller = await payload
    .findByID({ collection: 'animals', id: animal.id, user: sellerUser, overrideAccess: false })
    .catch(() => null)
  check(cardForSeller !== null, 'карточка проданного животного продавцу видна')

  /*
   * Отказ должен быть отказом по правам, а не любой неудачей: иначе
   * утверждение «продавец больше не может» становится истинным
   * от опечатки в поле. Разбор — в `lib/access-attempt.ts`.
   */
  const editBySeller = await attempt(() =>
    payload.update({
      collection: 'animals',
      id: animal.id,
      user: sellerUser,
      overrideAccess: false,
      data: { name: 'Переименовано продавцом' },
    }),
  )
  check(editBySeller.denied, 'продавец больше не может править карточку', attemptDetail(editBySeller))

  console.log('\nПродажа тому, кто книгу не ведёт\n')

  await payload.create({
    collection: 'movements',
    overrideAccess: true,
    data: {
      animal: animal.id,
      date: '2026-05-01T00:00:00.000Z',
      kind: 'sale',
      from: buyer.id,
      to: outsider.id,
    },
  })

  after = await payload.findByID({
    collection: 'animals',
    id: animal.id,
    depth: 0,
    overrideAccess: true,
  })
  check(relId(after.owner) === outsider.id, 'владелец — карточка вне книги')
  check(after.state === 'sold', 'для книги животное выбыло: записей о нём больше не придёт')
  check(
    Boolean(after.disposalDate),
    'дата выбытия проставлена: иначе продажа наружу не попадёт в отчёты о выбытии',
    `disposalDate: ${String(after.disposalDate)}`,
  )

  console.log('\nЗапись задним числом\n')

  const backdated = await payload.create({
    collection: 'movements',
    overrideAccess: true,
    data: {
      animal: animal.id,
      date: '2026-02-01T00:00:00.000Z',
      kind: 'lease',
      from: seller.id,
      to: buyer.id,
    },
  })

  const reread = await payload.findByID({
    collection: 'movements',
    id: backdated.id,
    depth: 0,
    overrideAccess: true,
  })
  check(reread.applied === false, 'перемещение задним числом помечено как не отражённое')

  after = await payload.findByID({
    collection: 'animals',
    id: animal.id,
    depth: 0,
    overrideAccess: true,
  })
  check(relId(after.owner) === outsider.id, 'запись задним числом не вернула прежнего владельца')

  console.log('\nВыбраковка ставит дату выбытия\n')

  /*
   * Отчёты о выбытии считают по `disposalDate`, а не по состоянию.
   * Пока перемещение её не ставило, хозяйство, ведущее выбраковку
   * и падёж перемещениями, не теряло коров ни в одном отчёте — и при
   * этом получало находку «выбытие без причины» на каждой такой записи.
   */
  const retired = await payload.create({
    collection: 'animals',
    overrideAccess: true,
    data: {
      identNumber: `9${suffix}1`,
      name: `${TAG} Выбраковка`,
      sex: 'female',
      owner: outsider.id,
      state: 'alive',
      publicVisible: false,
      publicDetails: false,
    } as never,
  })

  await payload.create({
    collection: 'movements',
    overrideAccess: true,
    data: {
      animal: retired.id,
      date: '2026-06-10T00:00:00.000Z',
      kind: 'cull',
      from: outsider.id,
    },
  })

  const afterCull = await payload.findByID({
    collection: 'animals',
    id: retired.id,
    depth: 0,
    overrideAccess: true,
  })
  check(afterCull.state === 'culled', 'состояние стало «выбраковано»')
  check(
    Boolean(afterCull.disposalDate),
    'дата выбытия проставлена — иначе животное не попадёт ни в один отчёт о выбытии',
    `disposalDate: ${String(afterCull.disposalDate)}`,
  )

  await payload.delete({
    collection: 'movements',
    where: { animal: { equals: retired.id } },
    overrideAccess: true,
  })
  await payload.delete({ collection: 'animals', id: retired.id, overrideAccess: true })

  console.log('\nПроверки формы\n')

  const noBuyer = await attempt(() =>
    payload.create({
      collection: 'movements',
      overrideAccess: true,
      data: { animal: animal.id, date: '2026-06-01T00:00:00.000Z', kind: 'sale', from: seller.id },
    }),
  )
  check(
    !noBuyer.allowed && /покупател/i.test(noBuyer.error ?? ''),
    'продажа без покупателя не записывается',
    noBuyer.allowed ? 'запись прошла' : `отказ не тот: ${noBuyer.error ?? '—'}`,
  )

  const future = await attempt(() =>
    payload.create({
      collection: 'movements',
      overrideAccess: true,
      data: {
        animal: animal.id,
        date: new Date(Date.now() + 86_400_000).toISOString(),
        kind: 'cull',
        from: seller.id,
      },
    }),
  )
  check(
    !future.allowed && /будущ/i.test(future.error ?? ''),
    'перемещение будущей датой не записывается',
    future.allowed ? 'запись прошла' : `отказ не тот: ${future.error ?? '—'}`,
  )

  // ------------------------------ уборка ------------------------------ //
  await payload.delete({
    collection: 'movements',
    where: { animal: { equals: animal.id } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'milk-tests',
    where: { animal: { equals: animal.id } },
    overrideAccess: true,
  })
  await payload.delete({ collection: 'animals', id: animal.id, overrideAccess: true })
  await payload.delete({
    collection: 'users',
    where: { email: { like: `${TAG.toLowerCase()}-` } },
    overrideAccess: true,
  })
  for (const org of [seller.id, buyer.id, outsider.id]) {
    await payload.delete({ collection: 'organizations', id: org, overrideAccess: true })
  }

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
