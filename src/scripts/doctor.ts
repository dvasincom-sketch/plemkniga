import 'dotenv/config'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { runDoctor } from '../lib/doctor'

/**
 * Осмотр перед запуском: печать результата.
 *
 * Сам осмотр живёт в `src/lib/doctor.ts` — здесь только печать и код
 * возврата. Разделение появилось, когда осмотр понадобилось гонять
 * по расписанию и показывать на странице «Статус»: печать нельзя
 * ни сохранить, ни сравнить с прошлым разом.
 *
 *   npm run doctor
 *   DATABASE_URI='postgres://…прод…' npm run doctor
 *
 * Код возврата: 0 — можно запускаться, 1 — есть препятствие.
 */

const { uri, source } = resolveDatabase()

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  const checks = await runDoctor()
  const failed = checks.filter((c) => !c.ok)

  console.log('Проверки\n' + '─'.repeat(76))
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'}  ${c.title}`)
    if (c.detail) console.log(`     ${c.detail}`)
    if (!c.ok && c.fix) console.log(`     → ${c.fix}`)
    if (!c.ok) console.log('')
  }

  console.log('')
  if (!failed.length) {
    console.log('Препятствий к запуску не видно.\n')
    return
  }

  console.log(`Препятствий: ${failed.length}. Разберитесь с ними до выкладки.\n`)
  process.exitCode = 1
}

main().catch((e) => {
  console.error('\nОшибка осмотра:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
