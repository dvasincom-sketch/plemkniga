import { existsSync, readFileSync } from 'node:fs'
import { COMPLIANCE, STATE_ORDER, countByState } from '@/lib/compliance'
import { SITE_PREFIX, isSharedPath } from '@/lib/hosts'

/**
 * Страница соответствия не ссылается на то, чего нет.
 *
 * ## Зачем это нужно
 *
 * Страница `/compliance` заявляет соответствие двум десяткам стандартов
 * и подкрепляет каждое заявление ссылкой: имя прогона, адрес страницы,
 * путь к файлу. В этом весь её смысл — утверждение стоит ровно столько,
 * сколько стоит способ его проверить.
 *
 * Ссылка на несуществующий прогон хуже отсутствия соответствия. Пробел
 * честен: он говорит «мы этого не делаем». Битое доказательство говорит
 * «мы это делаем, вот подтверждение», и человек, пошедший по ссылке,
 * узнаёт, что подтверждения нет, — а вместе с ним перестаёт верить
 * и остальным двадцати строкам.
 *
 * ## Почему это заведомо разойдётся без прогона
 *
 * Прогоны переименовывают, файлы переносят, страницы закрывают. Ни одно
 * из этих действий не заставляет заглянуть в реестр соответствия:
 * он лежит в другой папке и с виду к делу не относится. Расхождение
 * здесь — вопрос времени, а не аккуратности.
 *
 * ## Что проверяется
 *
 * Что каждое доказательство ведёт на существующее: прогон есть
 * в `package.json`, файл есть на диске, странице соответствует файл
 * маршрута. Плюс правила самого реестра: у «выполнено» и «частично»
 * доказательство обязано быть, а у всего, кроме «выполнено» и «вне
 * области», обязано быть сказано, что дальше.
 *
 *   npm run check:compliance
 */

const fails: string[] = []
const fail = (m: string) => fails.push(m)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts?: Record<string, string>
}
const scripts = new Set(Object.keys(pkg.scripts ?? {}))

/**
 * Файлы, любой из которых означает, что адрес существует.
 *
 * Их два, и это не перестраховка. `page.tsx` — страница для человека,
 * `route.ts` — ответ для машины; и то и другое живёт по адресу, на который
 * можно сослаться. Первая редакция прогона знала только про страницы
 * и объявила несуществующими три адреса, которые прекрасно открываются.
 *
 * Запрос и якорь отбрасываются: `/evolution?tab=status` — та же страница,
 * что и `/evolution`, только с выбранной вкладкой.
 */
const pageFiles = (href: string): string[] => {
  const path = href.split(/[?#]/)[0]!
  /*
   * Сквозные страницы переехали под `site/`: они про продукт, а не про
   * книгу. Разбор — в `lib/hosts.ts`. Приставка берётся из того же
   * списка, что и переезд, — иначе прогон объявит несуществующим то,
   * что просто лежит в другой папке.
   */
  const prefix = isSharedPath(path) ? SITE_PREFIX : ''
  const clean = `${prefix}${path}`.replace(/^\/|\/$/g, '')
  const dir = `src/app/(frontend)/${clean}`
  return [`${dir}/page.tsx`, `${dir}/route.ts`]
}

let evidence = 0

for (const item of COMPLIANCE) {
  const where = `«${item.title}»`

  /* ---------------------- Правила самого реестра ---------------------- */

  if ((item.state === 'done' || item.state === 'partial') && item.evidence.length === 0) {
    fail(`${where}: состояние «${item.state}» без единого доказательства`)
  }

  if (item.state !== 'done' && item.state !== 'out' && !item.next) {
    fail(`${where}: состояние «${item.state}» без ответа на вопрос «что дальше»`)
  }

  if (item.state === 'done' && item.next) {
    fail(`${where}: помечено выполненным, но у него есть «что дальше» — значит, не выполнено`)
  }

  if (!item.what.trim() || !item.ours.trim()) {
    fail(`${where}: пустое описание требования или состояния`)
  }

  /* ------------------------- Доказательства -------------------------- */

  for (const e of item.evidence) {
    evidence++

    switch (e.kind) {
      case 'check':
        if (!scripts.has(e.value)) {
          fail(`${where}: прогона «${e.value}» нет в package.json`)
        }
        break

      case 'page': {
        const files = pageFiles(e.value)
        if (!files.some((f) => existsSync(f))) {
          fail(`${where}: адресу «${e.value}» не соответствует ни ${files.join(', ни ')}`)
        }
        break
      }

      case 'code':
      case 'doc':
        if (!existsSync(e.value)) fail(`${where}: файла «${e.value}» нет на диске`)
        break
    }
  }

  /* Ссылка на источник — только на внешний адрес по https. */
  if (item.source && !/^https:\/\//.test(item.source.href)) {
    fail(`${where}: источник «${item.source.href}» не https-адрес`)
  }
}

/* ------------------------- Ключи не повторяются ------------------------ */

const keys = new Set(COMPLIANCE.map((i) => i.key))
if (keys.size !== COMPLIANCE.length) fail('в реестре повторяются ключи позиций')

/* ------------------------------- Сводка -------------------------------- */

const counts = countByState()

console.log(`Позиций в реестре: ${COMPLIANCE.length}, доказательств: ${evidence}`)
console.log(
  '  ' +
    STATE_ORDER.map((s) => `${s}: ${counts[s]}`).join(', '),
)

/*
 * Отдельная строка про то, чего никто не считает сам: сколько позиций
 * стоят вообще без доказательства. Это не ошибка — у «плана» его и быть
 * не может, — но число полезно видеть: если оно растёт быстрее, чем
 * число подтверждённых, страница превращается в список намерений.
 */
const bare = COMPLIANCE.filter((i) => i.evidence.length === 0).length
console.log(`  без доказательства: ${bare}`)

if (fails.length) {
  console.log('')
  for (const f of fails) console.log(`  ✗ ${f}`)
  process.exit(1)
}

console.log('\n  ✓ каждое доказательство ведёт на существующее')
process.exit(0)
