import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  culling,
  geneticTrend,
  heiferAges,
  lactationStructure,
  milkByLactation,
  udderHealth,
} from '@/lib/herd-analytics'
import { herdDrilldown } from '@/lib/herd-drilldown'

/**
 * Списки животных за числами отчётов — прогон на живой базе.
 *
 * ## Что здесь проверяется на самом деле
 *
 * Не «запрос выполняется» — это заодно, — а **сходимость**: число
 * в отчёте и длина списка за ним должны совпадать. Условия в
 * `herd-drilldown.ts` списаны с `herd-analytics.ts` вручную, и разойтись
 * они могут от одного лишнего `and archived is not true`, добавленного
 * из лучших побуждений.
 *
 * Расхождение здесь дороже обычной ошибки. Ошибку видно: страница падает
 * или показывает чушь. Несходящееся число выглядит правдоподобно с обеих
 * сторон — «двенадцать» в отчёте, одиннадцать строк в списке, — и человек
 * перестаёт верить не одному из них, а обоим сразу, вместе со всем
 * остальным, что книга насчитала.
 *
 * Исключение одно и оговорено ниже: «лактаций в ходу» отчёт считает
 * строками лактаций, а список — коровами. Одна корова может иметь две
 * незакрытые лактации, и числа законно разные.
 *
 *   npm run check:drilldown
 */

let failures = 0

const ok = (what: string, detail = '') =>
  console.log(`  ✓ ${what}${detail ? ` — ${detail}` : ''}`)

const bad = (what: string, detail = '') => {
  failures += 1
  console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
}

/** Число из отчёта против итога списка. `null` в отчёте — проверять нечего. */
const agree = (name: string, reported: number | null, drilled: number | null) => {
  if (reported === null) return console.log(`  · ${name} — отчёт не посчитан, пропуск`)
  if (drilled === null) return bad(name, 'список не собрался (нет пула соединений?)')
  if (reported === drilled) return ok(name, `${reported}`)
  bad(name, `отчёт ${reported}, список ${drilled}`)
}

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

  const orgId =
    typeof docs[0]?.owner === 'number' ? docs[0].owner : (docs[0]?.owner as { id?: number })?.id

  if (!orgId) {
    console.log('  ✗ в книге нет животных с хозяйством — проверять нечего')
    process.exit(1)
  }

  console.log(`\nСходимость списков с числами, хозяйство #${orgId}\n`)

  const total = async (code: string): Promise<number | null> => {
    const d = await herdDrilldown(payload, orgId, code)
    return d ? d.total : null
  }

  /* ------------------------- Ремонтный молодняк ------------------------ */
  const heifers = await heiferAges(payload, orgId)
  if (heifers) {
    await agree('Тёлки до 13 мес.', heifers.young, await total('heifers-young'))
    await agree('Тёлки 13–15 мес.', heifers.ready, await total('heifers-ready'))
    await agree('Тёлки в передержке', heifers.overdue, await total('heifers-overdue'))
  }

  /* ---------------------------- Инбридинг ------------------------------ */
  const trend = await geneticTrend(payload, orgId)
  if (trend) {
    await agree('Инбридинг выше порога', trend.aboveThreshold, await total('inbreeding-above'))
  }

  /* ------------------------- Здоровье вымени --------------------------- */
  const udder = await udderHealth(payload, orgId)
  if (udder) {
    await agree('Соматика выше порога', udder.above, await total('scc-above'))
  }

  /* ----------------------------- Выбытие ------------------------------- */
  const cull = await culling(payload, orgId)
  if (cull) {
    await agree('Выбыло за год', cull.total, await total('culled-year'))
  }

  /* ------------------------ Структура стада ---------------------------- */
  const structure = await lactationStructure(payload, orgId)
  if (structure) {
    for (const row of structure.byLactation) {
      await agree(row.label, row.cows, await total(`lactation-${row.lactation}`))
    }

    /*
     * «Коров без отёлов» в отчёте и в списке считаются по-разному
     * намеренно: отчёт берёт всех самок без отёлов (включая тёлок),
     * список — только тех, кто числится коровой. Сравнивать их нельзя,
     * поэтому здесь только вывод числа: расхождение осмысленное,
     * и молча уравнивать его было бы хуже.
     */
    const noCalvings = await total('no-calvings')
    console.log(
      `  · Коров без отёлов — в отчёте ${structure.withoutCalvings} (все самки без отёлов), ` +
        `в списке ${noCalvings} (только числящиеся коровами)`,
    )
  }

  /* ------------------------ Лактации в ходу ---------------------------- */
  const milk = await milkByLactation(payload, orgId)
  if (milk) {
    const inProgress = await total('milk-in-progress')
    console.log(
      `  · Лактации в ходу — в отчёте ${milk.inProgress} (строк лактаций), ` +
        `в списке ${inProgress} (коров): у коровы их может быть несколько`,
    )
    if (inProgress !== null && inProgress > milk.inProgress) {
      bad('Лактации в ходу', `коров ${inProgress} больше, чем самих лактаций ${milk.inProgress}`)
    }
  }

  /* ------------------ Неизвестный код не должен молчать ---------------- */
  const nonsense = await herdDrilldown(payload, orgId, 'нет-такого-кода')
  if (nonsense === null) ok('Неизвестный код отклонён')
  else bad('Неизвестный код', 'вернулся список вместо отказа')

  console.log(
    failures === 0
      ? '\nВсе списки сходятся с числами.\n'
      : `\nРасхождений: ${failures}. Список и число говорят разное — чинить до показа.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nПроверка не отработала:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
