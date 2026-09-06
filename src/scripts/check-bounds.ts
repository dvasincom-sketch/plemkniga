import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { compareBounds } from '@/lib/bounds-check'

/**
 * Границы в базе против границ в форме.
 *
 * Разбор — в `src/lib/bounds-check.ts`: там же объяснено, из-за чего
 * проверка появилась и почему сама сверка живёт не здесь. Скрипт печатает
 * её ответ и возвращает код.
 *
 * Пустой список правил с границами — не «всё сошлось», а поломка прогона:
 * диапазоны в предметной области есть заведомо, и их исчезновение означает,
 * что сверять стало нечего, а не что сверять нечего было.
 *
 *   npm run check:bounds
 */

async function main() {
  const payload = await getPayload({ config })
  const { ok, bad, ranged } = compareBounds(payload)

  if (!ranged) {
    console.error('✗ Ни одного правила с границами — сверять нечего, это поломка прогона')
    process.exit(1)
  }

  console.log(`\nГраницы: ограничение базы против поля формы (${ranged} правил)\n`)
  for (const line of ok) console.log(`✓ ${line}`)
  for (const line of bad) console.log(`✗ ${line}`)

  console.log(
    bad.length
      ? `\n✗ Расхождений: ${bad.length}. Форма и база разрешают разное — ` +
          'человек увидит сырое имя ограничения вместо понятного отказа.'
      : '\n✓ Все границы совпадают',
  )
  process.exit(bad.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
