import 'dotenv/config'
import { getPayload } from 'payload'
import type { User } from '@/payload-types'

import config from '@payload-config'

/**
 * Уровень достоверности: откуда он берётся и куда девается.
 *
 * ## Почему это отдельная проверка
 *
 * Вторая ступень — «Подтверждено лабораторией» — единственная в шкале,
 * которую никто не проставляет: она выводится из протокола. Выводимое
 * значение ломается тише проставленного. Ошибка в правиле не бросит
 * исключение и не покажет пустое место — она покажет плашку, которой
 * там быть не должно, и плашку эту прочитают как проверенные данные.
 *
 *   npm run check:trust
 *
 * Скрипт заводит свои записи с приставкой `CHK-TRUST` и убирает их за собой.
 *
 * ## Что именно проверяется
 *
 * Не «правило написано», а «правило сработало»: протокол регистрируется
 * по-настоящему, ступень перечитывается из базы. Отдельно проверяется
 * обратный ход — отзыв протокола, — потому что подъём замечают сразу,
 * а невозврат не замечают никогда.
 */

const TAG = 'CHK-TRUST'
let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  const payload = await getPayload({ config })
  const suffix = String(Date.now()).slice(-8)

  const org = await payload.create({
    collection: 'organizations',
    overrideAccess: true,
    data: { name: `${TAG} Хозяйство ${suffix}`, membership: 'member' },
  })

  const mkUser = async (mark: string, role: string, orgRole = 'head') =>
    (await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email: `${TAG.toLowerCase()}-${mark}-${suffix}@example.test`,
        password: 'proverka-dostovernosti-2026',
        lastName: 'Проверкин',
        firstName: mark,
        organization: org.id,
        role,
        orgRole,
        confirmed: true,
      } as never,
    })) as User

  const expert = await mkUser('expert', 'expert')
  const farmer = await mkUser('farmer', 'farmer')

  const animal = await payload.create({
    collection: 'animals',
    overrideAccess: true,
    data: {
      identNumber: `9${suffix}`,
      name: `${TAG} Проверка`,
      sex: 'female',
      owner: org.id,
      trustLevel: 1,
    } as never,
  })

  const level = async (): Promise<number> =>
    Number(
      (
        await payload.findByID({
          collection: 'animals',
          id: animal.id,
          depth: 0,
          overrideAccess: true,
        })
      ).trustLevel ?? 0,
    )

  const pdf = Buffer.from('%PDF-1.4 CHK-TRUST\n', 'utf8')
  const mkFile = async (mark: string) =>
    payload.create({
      collection: 'media',
      overrideAccess: true,
      data: { alt: `${TAG} протокол ${mark}`, owner: org.id, visibility: 'private' },
      file: {
        data: pdf,
        name: `${TAG}-${mark}-${suffix}.pdf`,
        mimetype: 'application/pdf',
        size: pdf.length,
      },
    })

  console.log('\nПодъём до второй ступени\n')

  check((await level()) === 1, 'исходно — «Проверено собственником»')

  /*
   * Первый протокол — неполный: файл есть, лаборатории нет. Так выглядит
   * попытка получить ступень отметкой, и её главное свойство в том,
   * что она не выглядит попыткой.
   */
  const noLab = await payload.create({
    collection: 'documents',
    overrideAccess: true,
    user: expert,
    data: {
      title: `${TAG} протокол без лаборатории`,
      type: 'genotypeReport',
      number: `${TAG}-NOLAB-${suffix}`,
      animal: animal.id,
      organization: org.id,
      issuedBy: expert.id,
      file: (await mkFile('nolab')).id,
    } as never,
  })
  check((await level()) === 1, 'протокол без названной лаборатории ступень НЕ даёт')

  /*
   * Второй — от лица хозяйства, с лабораторией и файлом, но без «кто выдал»:
   * это и есть тот путь, которым хозяйство подписало бы себя само.
   */
  const selfMade = await payload.create({
    collection: 'documents',
    overrideAccess: false,
    user: farmer,
    data: {
      title: `${TAG} самодельный протокол`,
      type: 'genotypeReport',
      number: `${TAG}-SELF-${suffix}`,
      animal: animal.id,
      organization: org.id,
      labName: 'Лаборатория имени себя',
      file: (await mkFile('self')).id,
    } as never,
  })
  check((await level()) === 1, 'протокол, заведённый хозяйством, ступень НЕ даёт')

  const good = await payload.create({
    collection: 'documents',
    overrideAccess: true,
    user: expert,
    data: {
      title: `${TAG} протокол лаборатории`,
      type: 'genotypeReport',
      number: `${TAG}-OK-${suffix}`,
      animal: animal.id,
      organization: org.id,
      issuedBy: expert.id,
      labName: 'ВНИИплем, проверочная',
      file: (await mkFile('ok')).id,
    } as never,
  })
  check((await level()) === 2, 'зарегистрированный протокол поднимает до «Подтверждено лабораторией»')

  console.log('\nОбратный ход\n')

  await payload.update({
    collection: 'documents',
    id: good.id,
    overrideAccess: true,
    data: { revoked: { at: new Date().toISOString(), by: expert.id, reason: `${TAG} проверка` } } as never,
  })
  check((await level()) === 1, 'отзыв протокола ступень снимает')

  console.log('\nПодпись Ассоциации сильнее\n')

  await payload.update({
    collection: 'animals',
    id: animal.id,
    overrideAccess: true,
    data: { trustLevel: 3 },
  })
  await payload.update({
    collection: 'documents',
    id: good.id,
    overrideAccess: true,
    data: { revoked: { at: null, by: null, reason: null } } as never,
  })
  check((await level()) === 3, 'вернувшийся протокол НЕ опускает подпись Ассоциации до второй')

  await payload.update({
    collection: 'documents',
    id: good.id,
    overrideAccess: true,
    data: { revoked: { at: new Date().toISOString(), by: expert.id, reason: `${TAG} проверка` } } as never,
  })
  check((await level()) === 3, 'отзыв протокола НЕ трогает подпись Ассоциации')

  console.log('\nСинтетика и старые записи\n')

  /*
   * Правило смотрит вперёд, а в книге уже лежат записи со второй ступенью,
   * поставленной до его появления. Это не поломка правила, но и не пустяк:
   * плашка у них означает не то, что у новых. Считаем и называем число —
   * молчать про расхождение хуже, чем показать его каждый раз.
   */
  const legacy = await payload.count({
    collection: 'animals',
    where: { trustLevel: { equals: 2 } },
    overrideAccess: true,
  })
  console.log(`  · записей со второй ступенью в книге: ${legacy.totalDocs}`)

  // ------------------------------ уборка ------------------------------ //
  for (const id of [noLab.id, selfMade.id, good.id]) {
    await payload.delete({ collection: 'documents', id, overrideAccess: true })
  }
  await payload.delete({
    collection: 'media',
    where: { alt: { like: `${TAG} протокол` } },
    overrideAccess: true,
  })
  await payload.delete({ collection: 'animals', id: animal.id, overrideAccess: true })
  await payload.delete({
    collection: 'users',
    where: { email: { like: `${TAG.toLowerCase()}-` } },
    overrideAccess: true,
  })
  await payload.delete({ collection: 'organizations', id: org.id, overrideAccess: true })

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
