import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { lactationStructure, milkByLactation } from '@/lib/herd-analytics'
import { herdDrilldown } from '@/lib/herd-drilldown'
import { drilldownConsistency } from '@/lib/probes'

/**
 * Списки животных за числами отчётов — прогон на живой базе.
 *
 * ## Что проверяется
 *
 * **Сходимость**: число в отчёте и длина списка за ним должны совпадать.
 * Условия в `herd-drilldown.ts` списаны с `herd-analytics.ts` вручную,
 * и разойтись они могут от одного лишнего `and archived is not true`,
 * добавленного из лучших побуждений.
 *
 * Расхождение здесь дороже обычной ошибки. Ошибку видно: страница падает
 * или показывает чушь. Несходящееся число выглядит правдоподобно с обеих
 * сторон — «двенадцать» в отчёте, одиннадцать строк в списке, — и человек
 * перестаёт верить не одному из них, а обоим сразу.
 *
 * ## Почему расчёт не здесь
 *
 * Сама сверка живёт в `probes.ts` и оттуда же зовётся ночным прогоном.
 * Раньше она лежала в этом скрипте, а ручка прогона считала своё —
 * и это была ровно та беда, которую скрипт ищет: две реализации одной
 * проверки, расходящиеся молча. Здесь остались печать и код возврата.
 *
 *   npm run check:drilldown
 */

async function main() {
  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'animals',
    where: { owner: { exists: true } },
    limit: 1,
    depth: 0,
    sort: '-createdAt',
    overrideAccess: true,
  })

  const owner = docs[0]?.owner
  const orgId = typeof owner === 'number' ? owner : (owner as { id?: number } | undefined)?.id

  if (!orgId) {
    console.log('  ✗ в книге нет животных с хозяйством — проверять нечего')
    process.exit(1)
  }

  console.log(`\nСходимость списков с числами, хозяйство #${orgId}\n`)

  const { findings, notes } = await drilldownConsistency(payload, orgId)

  for (const n of notes) console.log(`  ✓ ${n}`)
  for (const f of findings) console.log(`  ✗ ${f}`)

  /*
   * Два случая расходятся законно и потому печатаются, а не считаются
   * находками: «коров без отёлов» отчёт считает по всем самкам, список —
   * по числящимся коровами; «лактаций в ходу» отчёт считает строками
   * лактаций, список — коровами, а у коровы их может быть несколько.
   *
   * Молча уравнивать их было бы хуже расхождения: смысл у чисел разный,
   * и одинаковыми они станут только по недоразумению.
   */
  const structure = await lactationStructure(payload, orgId)
  if (structure) {
    const noCalvings = await herdDrilldown(payload, orgId, 'no-calvings')
    console.log(
      `  · Коров без отёлов — в отчёте ${structure.withoutCalvings} (все самки без отёлов), ` +
        `в списке ${noCalvings?.total ?? '—'} (только числящиеся коровами)`,
    )
  }

  const milk = await milkByLactation(payload, orgId)
  if (milk) {
    const inProgress = await herdDrilldown(payload, orgId, 'milk-in-progress')
    console.log(
      `  · Лактации в ходу — в отчёте ${milk.inProgress} (строк лактаций), ` +
        `в списке ${inProgress?.total ?? '—'} (коров): у коровы их может быть несколько`,
    )
  }

  console.log(
    findings.length === 0
      ? '\nВсе списки сходятся с числами.\n'
      : `\nРасхождений: ${findings.length}. Список и число говорят разное — чинить до показа.\n`,
  )
  process.exit(findings.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nПроверка не отработала:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
