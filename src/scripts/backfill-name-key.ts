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

  /*
   * Постраничный обход, а не одна страница на десять тысяч.
   *
   * Здесь стоял `limit: 10_000`, и это была не страховка, а потолок:
   * при большем числе хозяйств скрипт чинил первые десять тысяч,
   * печатал их число как полное число книги и выходил с нулём. Поиск
   * дублей считался по той же усечённой выборке, то есть дубль
   * с хозяйством номер 10 001 не нашёлся бы никогда.
   */
  const docs: { id: number | string; name: string; nameKey?: string | null }[] = []
  for (let page = 1; ; page++) {
    const res = await payload.find({
      collection: 'organizations',
      limit: 500,
      page,
      sort: 'id',
      depth: 0,
      overrideAccess: true,
    })
    docs.push(...(res.docs as never as typeof docs))
    if (!res.hasNextPage) break
  }

  const stale = docs.filter((o) => o.nameKey !== orgNameKey(o.name))

  console.log(`Хозяйств: ${docs.length}, ключ отсутствует или устарел у ${stale.length}`)

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

  /*
   * Отказ на одном хозяйстве не обрывает работу.
   *
   * Прежде цикл шёл без перехвата: одна не прошедшая валидацию строка
   * оставляла часть хозяйств с новым ключом, часть со старым, отчёт
   * не печатался вовсе, и узнать, где остановились, было нечем.
   */
  let done = 0
  const failed: string[] = []
  for (const o of stale) {
    try {
      await payload.update({
        collection: 'organizations',
        id: o.id,
        overrideAccess: true,
        data: { name: o.name },
      })
      done += 1
    } catch (e) {
      failed.push(`${o.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /*
   * Совпадения показываются после записи, а не вместо неё: они не мешают
   * ключу быть проставленным, но Ассоциации о них знать полезно — это
   * список готовых кандидатов на слияние.
   */
  const byKey = new Map<string, string[]>()
  for (const o of docs) {
    const key = orgNameKey(o.name)
    byKey.set(key, [...(byKey.get(key) ?? []), o.name])
  }
  const dupes = [...byKey.values()].filter((names) => names.length > 1)

  /* Печатается сделанное, а не намеченное: раньше здесь стояло `stale.length`. */
  console.log(`Записано: ${done} из ${stale.length}`)
  if (failed.length) {
    console.log(`\nНе записалось — ${failed.length}:`)
    for (const f of failed.slice(0, 20)) console.log(`  ${f}`)
  }
  if (dupes.length) {
    console.log(`\nПохоже на дубли — ${dupes.length}. Разбирать в «Справочнике» Ассоциации:`)
    for (const names of dupes.slice(0, 20)) console.log(`  ${names.join(' · ')}`)
  }
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
