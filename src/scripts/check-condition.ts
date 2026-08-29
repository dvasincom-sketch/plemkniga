import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { conditionConsistency } from '@/lib/probes'
import { biggestHerd } from '@/lib/biggest-herd'

/**
 * Сводка Ассоциации против кабинета хозяйства — прогон на живой базе.
 *
 * ## Что проверяется
 *
 * Одно и то же стадо считается двумя путями: кабинет хозяйства —
 * четырьмя запросами по своему владельцу, кабинет Ассоциации — одним
 * запросом с группировкой по всем сразу. Условия у них общие
 * (`sql-herd.ts`), но форма запроса умеет соврать там, где правило верно:
 * `left join` по владельцу без животных даёт `null` вместо нуля,
 * `distinct on` в подзапросе берёт последний замер по другому порядку,
 * `count(*) filter` считает строки соединения вместо коров.
 *
 * Цена расхождения не в числах, а в разговоре: Ассоциация звонит
 * хозяйству про передержку у двенадцати тёлок, хозяйство открывает свой
 * кабинет и видит восемь. После такого разговора не верят уже ни одному
 * числу в системе — ни нашему, ни своему.
 *
 * ## Почему расчёт не здесь
 *
 * Сама сверка живёт в `probes.ts` и оттуда же зовётся ночным прогоном.
 * Здесь остались печать и код возврата. Две реализации одной проверки
 * разошлись бы молча, и страница прогона показывала бы зелёное там,
 * где терминал говорит красное.
 *
 *   npm run check:condition
 */

async function main() {
  const payload = await getPayload({ config })

  /* То же хозяйство, что берут остальные прогоны, и берётся тем же кодом. */
  const orgId = await biggestHerd(payload)

  if (!orgId) {
    console.log('  ✗ в книге нет животных с хозяйством — проверять нечего')
    process.exit(1)
  }

  console.log(`\nСводка Ассоциации против кабинета, хозяйство #${orgId}\n`)

  const { findings, notes } = await conditionConsistency(payload, orgId)

  for (const n of notes) console.log(`  ✓ ${n}`)
  for (const f of findings) console.log(`  ✗ ${f}`)

  console.log(
    findings.length === 0
      ? '\nОба кабинета показывают одно и то же.\n'
      : `\nРасхождений: ${findings.length}. Ассоциация и хозяйство видят разное — чинить до показа.\n`,
  )
  process.exit(findings.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nПроверка не отработала:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
