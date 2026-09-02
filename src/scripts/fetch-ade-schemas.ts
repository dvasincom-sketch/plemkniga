import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Обновление копии схем ICAR ADE в дереве проекта.
 *
 * ## Почему клон целиком, а не выборка нужного
 *
 * Первая редакция тянула только замкнутый круг ссылок от тех ресурсов,
 * которые книга отдаёт, — файлов сорок вместо трёхсот. Выглядело
 * бережливо и оказалось ловушкой: запущенная поверх полной копии,
 * она бы её **молча урезала**. Каталоги `enums/` и `url-schemes/`
 * исчезли бы, а прогоны, которые на них смотрят, объявили бы, что
 * сверять нечего, — и никто бы не понял, почему.
 *
 * Триста маленьких файлов ничего не стоят, а один способ обновления
 * вместо двух стоит многого: второй способ — это второе состояние
 * копии, и расходятся они в тот день, когда обновляет не тот, кто
 * заводил.
 *
 * ## Что копируется
 *
 * Каталоги схем и адресов, лицензия и отметка об источнике с точным
 * коммитом. `.git` клона не переносится: подмодуль здесь не нужен,
 * а лишний служебный каталог внутри нашего репозитория — источник
 * странных вопросов при первом же `git status`.
 *
 * ## Почему копия, а не подмодуль
 *
 * Подмодуль пинит коммит точнее и обновляется одной командой, но требует
 * `--recurse-submodules` при клонировании. Кто этого не сделал —
 * а это будет каждый второй, включая того, кому систему передадут, —
 * получит пустой каталог и прогон, падающий «схем нет» без всякой
 * своей вины.
 *
 * Копия работает у всех, кто просто склонировал репозиторий, и её
 * обновление видно построчным сравнением: расхождение со стандартом
 * становится событием, которое кто-то прочитал и принял.
 *
 * ## Про лицензию
 *
 * `adewg/ICAR` под Apache 2.0 — копирование разрешено. Файл лицензии
 * переносится вместе со схемами, происхождение записано рядом: копия
 * без указания источника через год читается как наша выдумка.
 *
 *   npm run ade:schemas
 */

const BRANCH = process.env.ADE_BRANCH ?? 'ADE-1'
const REPO = 'https://github.com/adewg/ICAR'
const OUT = 'vendor/icar-ade'

/** Что переносим из клона. Всё прочее — история, разметка, служебное. */
const KEEP = ['resources', 'types', 'enums', 'collections', 'url-schemes']

const git = (args: string[], cwd?: string): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()

const tmp = mkdtempSync(join(tmpdir(), 'icar-ade-'))

try {
  console.log(`Клонирую ${REPO}, ветка ${BRANCH}…`)
  git(['clone', '--depth', '1', '--branch', BRANCH, REPO, tmp])

  const commit = git(['rev-parse', 'HEAD'], tmp)

  /*
   * Старая копия сносится целиком, а не дополняется.
   *
   * Иначе файл, удалённый в стандарте, остался бы у нас навсегда —
   * и прогон продолжал бы сверяться со схемой, которой больше нет.
   * Это ровно тот вид неправды, от которого копия и заводилась.
   */
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const copied: string[] = []
  for (const dir of KEEP) {
    const from = join(tmp, dir)
    if (!existsSync(from)) {
      console.error(`  ✗ в клоне нет каталога «${dir}» — состав репозитория изменился`)
      process.exit(1)
    }
    cpSync(from, join(OUT, dir), { recursive: true })
    copied.push(dir)
  }

  for (const file of ['LICENSE', 'NOTICE']) {
    const from = join(tmp, file)
    if (existsSync(from)) cpSync(from, join(OUT, file))
  }

  writeFileSync(
    join(OUT, 'SOURCE.json'),
    `${JSON.stringify(
      { repository: REPO, branch: BRANCH, commit, fetchedAt: new Date().toISOString() },
      null,
      2,
    )}\n`,
  )

  writeFileSync(
    join(OUT, 'LICENSE-NOTICE.md'),
    [
      '# Схемы ICAR ADE',
      '',
      `Копия из [adewg/ICAR](${REPO}), ветка \`${BRANCH}\`, коммит \`${commit}\`,`,
      'под лицензией Apache License 2.0. Файлы не изменялись.',
      '',
      'Обновление: `npm run ade:schemas` — команда сносит копию и кладёт новую',
      'целиком. Дополнять её нельзя: файл, удалённый в стандарте, остался бы',
      'у нас навсегда, и прогон продолжал бы сверяться со схемой, которой',
      'больше нет.',
      '',
      '## Почему копия лежит в дереве',
      '',
      'Прогон, ходящий в сеть, падает, когда чужой сервер недоступен,',
      'и — хуже — зеленеет, когда недоступен незаметно. Копия делает',
      'обновление событием, которое видно построчным сравнением: расхождение',
      'со стандартом кто-то прочитал и принял, а не пропустил.',
      '',
      '## Кто сюда смотрит',
      '',
      '- `npm run check:ade-schema` — сверяет отдаваемые ресурсы со схемами;',
      '  `resources/`, `types/`, `enums/`, `collections/`.',
      '- `url-schemes/` — документы OpenAPI, а не JSON Schema. В сверку схем',
      '  они не идут: Ajv, приняв их за схемы, объявил бы годным почти',
      '  любой документ.',
      '',
    ].join('\n'),
  )

  console.log(`\n  ✓ копия обновлена: ${copied.join(', ')}`)
  console.log(`  ветка ${BRANCH}, коммит ${commit}`)
  console.log('  Посмотрите `git diff vendor/icar-ade` — изменения стандарта видны там.')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
