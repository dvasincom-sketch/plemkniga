import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { orgNameKey } from '@/lib/movements'

/**
 * Заполнить ключ названия у хозяйств, заведённых до появления поиска дублей.
 *
 * Ключ считает `orgNameKey`, и повторять её правила на SQL в миграции было бы
 * ошибкой: две реализации одного нормализатора расходятся на первом же
 * исключении, а расхождение здесь означает необнаруженный дубль — то есть
 * ровно то, ради чего ключ и заведён.
 *
 *   npm run backfill:name-key            # посмотреть, скольким нужно
 *   npm run backfill:name-key -- --apply # записать
 *
 * Скрипт идёт через Payload, а не напрямую в базу: тот же хук коллекции
 * пересчитает ключ при сохранении, и результат гарантированно совпадёт
 * с тем, что получится при обычной правке карточки.
 */

const apply = process.argv.includes('--apply')

async function main() {
  const payload = await getPayload({ config })

  const all = await payload.find({
    collection: 'organizations',
    limit: 10_000,
    depth: 0,
    overrideAccess: true,
  })

  const stale = all.docs.filter((o) => o.nameKey !== orgNameKey(o.name))

  console.log(`Хозяйств: ${all.docs.length}, ключ отсутствует или устарел у ${stale.length}`)

  if (!stale.length) {
    process.exit(0)
  }

  if (!apply) {
    for (const o of stale.slice(0, 20)) {
      console.log(`  ${o.name} → ${orgNameKey(o.name)}`)
    }
    if (stale.length > 20) console.log(`  … и ещё ${stale.length - 20}`)
    console.log('\nЗапустите с --apply, чтобы записать.')
    process.exit(0)
  }

  for (const o of stale) {
    await payload.update({
      collection: 'organizations',
      id: o.id,
      overrideAccess: true,
      data: { name: o.name },
    })
  }

  /*
   * Совпадения показываются после записи, а не вместо неё: они не мешают
   * ключу быть проставленным, но Ассоциации о них знать полезно — это
   * список готовых кандидатов на слияние.
   */
  const byKey = new Map<string, string[]>()
  for (const o of all.docs) {
    const key = orgNameKey(o.name)
    byKey.set(key, [...(byKey.get(key) ?? []), o.name])
  }
  const dupes = [...byKey.values()].filter((names) => names.length > 1)

  console.log(`Записано: ${stale.length}`)
  if (dupes.length) {
    console.log(`\nПохоже на дубли — ${dupes.length}. Разбирать в «Справочнике» Ассоциации:`)
    for (const names of dupes.slice(0, 20)) console.log(`  ${names.join(' · ')}`)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
