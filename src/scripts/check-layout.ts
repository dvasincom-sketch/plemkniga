import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Порядок частей на страницах кабинетов — одинаковый везде.
 *
 * Проверка нужна потому, что ошибка не видна при просмотре одной страницы:
 * каждая по отдельности выглядит разумно, а разнобой замечает только тот,
 * кто переходит между ними и видит, как меню прыгает.
 *
 * Утверждение простое: меню кабинета стоит раньше заголовка страницы.
 * Всё, что выше неизменного, заставляет искать неизменное заново
 * при каждом переходе.
 */

const ROOT = process.argv[2] ?? 'src/app/(frontend)'
let failures = 0

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('page.tsx') ? [full] : []
  })

for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8')

  const nav = Math.max(src.indexOf('<AccountNav'), src.indexOf('<AssociationNav'))
  if (nav === -1) continue

  /* Страница на общем каркасе порядок задать неверно не может */
  if (src.includes('<CabinetPage')) {
    console.log(`  ✓ ${file} — на общем каркасе`)
    continue
  }

  const title = src.indexOf('<h1')
  if (title === -1) {
    console.log(`  ✓ ${file} — без заголовка страницы`)
    continue
  }

  if (nav < title) {
    console.log(`  ✓ ${file}`)
  } else {
    failures += 1
    console.log(`  ✗ ${file} — заголовок стоит выше меню кабинета`)
  }
}

console.log(failures === 0 ? '\nПорядок везде одинаковый.' : `\nРазнобой: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
