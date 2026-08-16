import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { recomputeAll } from '../lib/index-values'
import { BASE_VERSION } from '../lib/breeding-index'

/**
 * Полный пересчёт хранимых значений индекса.
 *
 * Обычно значения поддерживаются хуками: изменилось животное — пересчитан
 * он, изменились веса — пересчитан профиль. Полный прогон нужен в трёх
 * случаях:
 *
 *  — после первого разворачивания, когда значений ещё нет;
 *  — после смены версии базы сравнения (`BASE_VERSION` в коде): она меняет
 *    все значения разом, а хук об этом узнать не может;
 *  — после массовой загрузки с выключенными хуками (`INDEX_VALUES_SKIP=1`),
 *    например после сида.
 *
 * Скрипт ничего не удаляет из данных: он переписывает только служебные строки
 * `index-values`, которые сам же и создаёт.
 *
 *   npm run backfill:index
 */

const { uri, source } = resolveDatabase()

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})`)
  console.log(`Версия базы сравнения: ${BASE_VERSION}\n`)

  // Хуки в этом процессе не нужны: скрипт и есть пересчёт
  process.env.INDEX_VALUES_SKIP = '1'

  const payload = await getPayload({ config })
  const started = Date.now()

  const { profiles, rows } = await recomputeAll(payload, (msg) => console.log(`  ${msg}`))

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\nГотово: профилей ${profiles}, строк ${rows}, за ${seconds} с`)
  process.exit(0)
}

main().catch((e) => {
  console.error('\nОшибка пересчёта:', e instanceof Error ? e.message : e)
  process.exit(1)
})
