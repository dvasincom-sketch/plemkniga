import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { runAfterCommitProbe } from '@/lib/after-commit-probe'

/**
 * Следствия записи вправду наступают после коммита — на живой базе.
 *
 * Разбор — в `src/lib/after-commit.ts` и `src/lib/after-commit-probe.ts`.
 * Скрипт печатает ответ пробы и возвращает код.
 *
 *   npm run check:after-commit
 */

async function main() {
  const payload = await getPayload({ config })
  const { findings, notes } = await runAfterCommitProbe(payload)

  console.log('\nОтложенные следствия записи\n')
  for (const n of notes) console.log(`  ✓ ${n}`)
  for (const f of findings) console.log(`  ✗ ${f}`)

  console.log('')
  if (findings.length) {
    console.log(`Не сошлось: ${findings.length}\n`)
    process.exit(1)
  }
  console.log('Всё сошлось: работа ждёт коммита, откат её выбрасывает.\n')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
