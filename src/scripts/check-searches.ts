import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { User } from '@/payload-types'
import { buildAnimalWhere, FILTER_KEYS, type SearchParams } from '@/lib/animal-query'
import { describeFilter } from '@/lib/filter-labels'
import { filterQueryOf } from '@/lib/saved-searches'

/**
 * Сквозная проверка именованных отборов (ТЗ, требование №6).
 *
 * ## Что проверяется
 *
 * Три утверждения, и все три ломаются молча.
 *
 * Первое: сохраняется отбор, а не состояние экрана. Номер страницы,
 * порядок строк и профиль индекса в набор попадать не должны — иначе
 * «коровы с высоким удоем» открываются на семнадцатой странице, потому
 * что на ней их завели.
 *
 * Второе: сохранённый отбор находит то же, что находил в момент
 * сохранения. Это круг, и без него проверка сводится к «строка записалась
 * в базу», что о деле не говорит ничего.
 *
 * Третье: чужой личный отбор не виден, а открытый хозяйству — виден.
 * Видимость здесь единственное, что отделяет рабочий черновик зоотехника
 * от общего достояния, и проверять её надо на живых правилах доступа,
 * а не на своём представлении о них.
 *
 *   npm run check:searches
 *
 * Скрипт заводит свои записи с приставкой `CHK-SRCH` и убирает их за собой.
 */

const TAG = 'CHK-SRCH'
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

  /* ---------------------------------------------------------------- */
  console.log('\nСтрока отбора собирается из условий, и только из них\n')

  const sp: SearchParams = {
    sex: 'female',
    milk: '9000',
    trust: '3',
    /* Всё, что ниже, — способ смотреть на результат, а не условие. */
    page: '17',
    sort: 'ipc',
    profile: 'cheese',
    perPage: '500',
    shown: '36',
    tab: 'herd',
  }

  const query = filterQueryOf(sp)
  const keys = [...new URLSearchParams(query).keys()]

  check(keys.includes('sex') && keys.includes('milk') && keys.includes('trust'), 'условия попали')
  check(
    !keys.some((k) => ['page', 'sort', 'profile', 'perPage', 'shown', 'tab'].includes(k)),
    'настройки показа не попали',
    keys.join(', '),
  )

  /*
   * Порядок ключей задаётся списком, а не порядком в адресе. Иначе один
   * и тот же отбор, собранный двумя путями, даёт две разные строки —
   * и «сохранить поверх прежнего» перестаёт узнавать прежний.
   */
  const other = filterQueryOf({ trust: '3', milk: '9000', sex: 'female' })
  check(query === other, 'порядок ключей не зависит от порядка в адресе', `${query} / ${other}`)

  /* ---------------------------------------------------------------- */
  console.log('\nКровность и ДНК: отбор виден человеку\n')

  /*
   * Оба ключа отбор задавали давно — они есть в `buildAnimalWhere`
   * и в плашках быстрого отбора, — но в `FILTER_KEYS` их не было.
   * Значит выдача сужалась, а панель условий об этом молчала, и снять
   * условие можно было только «сбросить всё». Проверка стоит здесь,
   * чтобы пропуск не вернулся тихо.
   */
  check(FILTER_KEYS.includes('blood' as never), '«Кровность» в списке условий')
  check(FILTER_KEYS.includes('dna' as never), '«Происхождение по ДНК» в списке условий')
  check(describeFilter('blood', '93.75') !== null, 'кровность подписывается словами')
  check(describeFilter('dna', '1') !== null, 'ДНК подписывается словами')

  const preset = filterQueryOf({ blood: '93.75' })
  check(preset === 'blood=93.75', 'плашка «Чистопородные» сохраняется целиком', preset)

  /* ---------------------------------------------------------------- */
  console.log('\nСохранённый отбор находит то же, что находил\n')

  const before = await payload.count({
    collection: 'animals',
    where: buildAnimalWhere(sp),
    overrideAccess: true,
  })

  /*
   * Строка разбирается обратно в параметры — ровно так, как это делает
   * страница, открытая по ссылке отбора. Круг замыкается здесь: условия
   * прошли через строку запроса и обязаны дать тот же счёт.
   */
  const restored: SearchParams = {}
  for (const [k, v] of new URLSearchParams(query)) restored[k] = v

  const after = await payload.count({
    collection: 'animals',
    where: buildAnimalWhere(restored),
    overrideAccess: true,
  })

  check(
    before.totalDocs === after.totalDocs,
    `отбор через строку даёт тот же счёт (${before.totalDocs})`,
    `${before.totalDocs} против ${after.totalDocs}`,
  )

  /* ---------------------------------------------------------------- */
  console.log('\nВидимость: своё, чужое и общее\n')

  const org = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Хозяйство ${suffix}`, membership: 'member', presence: 'registered' },
  })

  const mk = async (login: string, orgRole: 'head' | 'operator') =>
    (await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: `${login}.${suffix}@chk-srch.test`,
        password: `${TAG}-${suffix}`,
        lastName: TAG,
        firstName: login,
        role: 'farmer',
        organization: org.id,
        orgRole,
      },
    })) as User

  const head = await mk('head', 'head')
  const mate = await mk('mate', 'operator')
  const stranger = await payload.create({
    collection: 'users',
    overrideAccess: true,
    data: {
      email: `outsider.${suffix}@chk-srch.test`,
      password: `${TAG}-${suffix}`,
      lastName: TAG,
      firstName: 'чужой',
      role: 'farmer',
    },
  })

  const mine = await payload.create({
    collection: 'saved-searches',
    overrideAccess: true,
    data: {
      name: `${TAG} личный ${suffix}`,
      query: 'sex=female&milk=9000',
      place: 'herd',
      scope: 'private',
      author: head.id,
      organization: org.id,
    },
  })

  const seen = async (user: unknown, id: number | string) => {
    const res = await payload.find({
      collection: 'saved-searches',
      where: { id: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: user as User,
    })
    return res.docs.length > 0
  }

  check(await seen(head, mine.id), 'автор видит свой отбор')
  check(!(await seen(mate, mine.id)), 'коллега не видит чужой личный отбор')
  check(!(await seen(stranger, mine.id)), 'человек из другого хозяйства не видит вовсе')

  await payload.update({
    collection: 'saved-searches',
    id: mine.id,
    data: { scope: 'organization' },
    overrideAccess: true,
  })

  check(await seen(mate, mine.id), 'открытый хозяйству отбор виден коллеге')
  check(!(await seen(stranger, mine.id)), 'и всё равно не виден чужому хозяйству')

  /*
   * Правка чужого отбора запрещена даже руководителю: сдвинутый порог
   * превращает «кандидатов на выбраковку» в другой список под тем же
   * названием, и тот, кто на него опирался, узнаёт об этом последним.
   */
  const mateSearch = await payload.create({
    collection: 'saved-searches',
    overrideAccess: true,
    data: {
      name: `${TAG} общий коллеги ${suffix}`,
      query: 'sex=male',
      place: 'herd',
      scope: 'organization',
      author: mate.id,
      organization: org.id,
    },
  })

  let renamed = false
  try {
    await payload.update({
      collection: 'saved-searches',
      id: mateSearch.id,
      data: { name: 'переименован руководителем' },
      overrideAccess: false,
      user: head,
    })
    renamed = true
  } catch {
    renamed = false
  }
  check(!renamed, 'руководитель не может переименовать чужой общий отбор')

  /*
   * Удалить — может, и это не противоречие. Человека у нас блокируют,
   * а не удаляют (решение №109), значит автор ушедшего зоотехника
   * формально жив, и правило «только автор» держало бы его наборы
   * в списке хозяйства вечно. Исчезнувший отбор виден сразу,
   * подменённый не виден никогда.
   */
  let removed = false
  try {
    await payload.delete({
      collection: 'saved-searches',
      id: mateSearch.id,
      overrideAccess: false,
      user: head,
    })
    removed = true
  } catch {
    removed = false
  }
  check(removed, 'руководитель может удалить общий отбор хозяйства')

  /* ---------------------------------------------------------------- */
  console.log('\nУбираем за собой\n')

  await payload.delete({
    collection: 'saved-searches',
    where: { name: { like: TAG } },
    overrideAccess: true,
  })
  for (const u of [head, mate, stranger])
    await payload.delete({ collection: 'users', id: u.id, overrideAccess: true })
  await payload.delete({ collection: 'organizations', id: org.id, overrideAccess: true })

  const left = await payload.count({
    collection: 'saved-searches',
    where: { name: { like: TAG } },
    overrideAccess: true,
  })
  check(left.totalDocs === 0, 'следов проверки не осталось', String(left.totalDocs))

  console.log(failures === 0 ? '\nВсё сходится.\n' : `\nНе сходится: ${failures}.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
