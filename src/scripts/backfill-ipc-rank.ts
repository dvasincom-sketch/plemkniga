import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Разовый пересчёт служебного поля `ipcRank` для уже существующих записей.
 *
 * Нужен один раз после появления поля: у старых строк оно пустое, а PostgreSQL
 * при сортировке по убыванию ставит NULL первыми — из-за этого животные без
 * оценки оказывались в начале племенной книги. Новые и изменённые записи
 * заполняют поле сами, хуком коллекции.
 *
 * Запуск: npm run backfill:ipc-rank
 */
const run = async () => {
  const payload = await getPayload({ config })

  const limit = 200
  let page = 1
  let updated = 0

  for (;;) {
    const { docs, totalPages } = await payload.find({
      collection: 'animals',
      limit,
      page,
      depth: 0,
      overrideAccess: true,
    })

    for (const animal of docs) {
      const rank = typeof animal.ipc === 'number' ? animal.ipc : -1_000_000
      if (animal.ipcRank === rank) continue

      await payload.update({
        collection: 'animals',
        id: animal.id,
        data: { ipcRank: rank },
        depth: 0,
        overrideAccess: true,
      })
      updated += 1
    }

    if (page >= totalPages) break
    page += 1
  }

  console.log(`[plemkniga] Пересчитан ранг сортировки у ${updated} записей`)
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
