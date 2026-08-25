import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { recomputeAll, recomputeAnimal } from '../lib/index-values'
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
 * И четвёртый случай, ради которого появился `--ident`: пересчёт **одного**
 * животного, у которого хук не отработал. Такое бывает не от ошибки в коде,
 * а от обрыва связи: правка сохранилась, пересчёт следом за ней не прошёл
 * и сказал об этом в лог. Тогда в карточке остаётся индекс, посчитанный
 * из прежних признаков, — и это хуже пустого места, потому что выглядит
 * посчитанным. Гнать ради одной записи полный прогон по книге в триста тысяч
 * животных незачем и вредно: он переписывает всю таблицу значений
 * и оставляет за собой столько же мёртвых строк.
 *
 *   npm run backfill:index
 *   npm run backfill:index -- --ident HOUSA15504581   — только это животное
 */

const { uri, source } = resolveDatabase()

const identArg = (): string | null => {
  const i = process.argv.indexOf('--ident')
  const v = i === -1 ? null : (process.argv[i + 1] ?? null)
  return v && !v.startsWith('--') ? v : null
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})`)
  console.log(`Версия базы сравнения: ${BASE_VERSION}\n`)

  // Хуки в этом процессе не нужны: скрипт и есть пересчёт
  process.env.INDEX_VALUES_SKIP = '1'

  const payload = await getPayload({ config })
  const started = Date.now()

  /* ------------------------- Одно животное ------------------------- */
  const ident = identArg()
  if (ident) {
    const found = await payload.find({
      collection: 'animals',
      where: { identNumber: { equals: ident } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const animal = found.docs[0]
    if (!animal) {
      console.error(`Животное с номером ${ident} не найдено.\n`)
      process.exit(1)
    }

    const written = await recomputeAnimal(payload, animal)
    console.log(
      `Пересчитано: № ${animal.identNumber}${animal.name ? ` «${animal.name}»` : ''}, ` +
        `профилей ${written}, за ${((Date.now() - started) / 1000).toFixed(1)} с\n`,
    )
    process.exit(0)
  }

  const { profiles, rows } = await recomputeAll(payload, (msg) => console.log(`  ${msg}`))

  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\nГотово: профилей ${profiles}, строк ${rows}, за ${seconds} с`)
  process.exit(0)
}

main().catch((e) => {
  console.error('\nОшибка пересчёта:', e instanceof Error ? e.message : e)
  process.exit(1)
})
