import { existsSync, readFileSync } from 'node:fs'
import { NOTES } from '@/lib/notes'
import { BASE_SOURCE } from '@/lib/index-base-source'
import { TRAIT_BASE } from '@/lib/breeding-index'

/**
 * Разборы: страница на месте, паспорт заполнен, источники ведут наружу.
 *
 * ## Что здесь может сломаться молча
 *
 * Разбор существует в двух местах сразу: строкой в списке (`lib/notes.ts`)
 * и страницей под своим адресом. Список показывается всем, страница —
 * только тому, кто нажал. Разъехаться они могут в обе стороны, и обе
 * тихие: строка без страницы даёт «страница не найдена» тому, кого мы
 * позвали читать; страница без строки лежит в сети, куда никто не ведёт.
 *
 * ## Почему проверяются источники, а не только их наличие
 *
 * Разбор без работающей ссылки на первоисточник — тот самый пересказ,
 * от которого весь раздел и отличается (`docs/kontent-plan.md`). Сетевая
 * доступность здесь не проверяется: чужой сайт может лежать, и падать
 * из-за этого своей проверкой значит поставить свою сборку в зависимость
 * от чужого хостинга. Проверяется то, за что отвечаем мы: ссылка есть,
 * она внешняя и сказано, что именно по ней взято.
 *
 * ## Что проверяется у базы сравнения
 *
 * Что происхождение описано у всех признаков базы. Полноту гарантирует
 * и язык (`Record<TraitKey, …>`), но проверка ловит второй случай,
 * которого язык не видит: признак, выброшенный из базы и забытый
 * в описании источника, — то есть строку про число, которого больше нет.
 */

const PAGES = 'src/app/(frontend)/site/[locale]/razbory'

let failures = 0
const fail = (text: string) => {
  failures += 1
  console.log(`  ✗ ${text}`)
}

const today = new Date().toISOString().slice(0, 10)

for (const note of NOTES) {
  const page = `${PAGES}/${note.slug}/page.tsx`

  if (!existsSync(page)) {
    fail(`${note.slug} — есть в списке, страницы нет: ${page}`)
    continue
  }

  const src = readFileSync(page, 'utf8')
  /* Страница знает свой слуг сама: расхождение здесь ломает метатеги. */
  if (!src.includes(`const SLUG = '${note.slug}'`)) {
    fail(`${note.slug} — страница называет себя иначе, чем список`)
  }

  if (note.passport.length < 3) fail(`${note.slug} — паспорт короче трёх строк`)
  if (!note.author) fail(`${note.slug} — разбор без имени автора`)
  if (note.date > today) fail(`${note.slug} — дата разбора в будущем: ${note.date}`)
  if (note.sources.length === 0) fail(`${note.slug} — разбор без источников`)

  for (const s of note.sources) {
    if (!s.url?.startsWith('https://')) fail(`${note.slug} — источник без внешней ссылки: ${s.title}`)
    if (!s.what) fail(`${note.slug} — не сказано, что взято из источника: ${s.title}`)
  }

  console.log(`  ✓ ${note.slug}`)
}

/* --------------------- Происхождение чисел базы --------------------------- */

const keys = new Set(TRAIT_BASE.map((t) => t.key))
for (const key of Object.keys(BASE_SOURCE)) {
  if (!keys.has(key as never)) fail(`Описан источник для признака «${key}», а в базе его нет`)
}

console.log(
  failures === 0
    ? `\nРазборов: ${NOTES.length}, все со страницей, паспортом и источниками.`
    : `\nНеувязок: ${failures}`,
)
process.exit(failures === 0 ? 0 : 1)
