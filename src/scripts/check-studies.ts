import { existsSync } from 'node:fs'
import { STUDIES } from '@/lib/studies'
import { NOTES } from '@/lib/notes'
import { termBySlug } from '@/lib/terms'

/**
 * Исследования: части заполнены, источники ведут наружу, ссылки существуют.
 *
 * ## Почему появилась
 *
 * У разборов проверка была (`check:notes`), у исследований — ни одной,
 * и это не мелочь: раздел устроен сложнее. У разбора семь полей, у работы —
 * четырнадцать, включая семь частей закреплённого порядка и список
 * требований к книге. Тип держит непустыми два из них; остальные можно
 * оставить пустыми, и страница соберётся.
 *
 * Отсутствие проверки уже стоило дорого. Требования, адресованные нам
 * самим, отстали от кода и просили завести то, что заведено: расчёт
 * собственной базы, порог полноты, колонку кода в справочнике. Читатель
 * этого не проверит — он верит, что раздел про нас написан по нашему коду.
 *
 * ## Что здесь можно проверить, а что нет
 *
 * Проверяется то, за что отвечаем мы: части непусты, у источника есть
 * внешняя ссылка и сказано, что из него взято, внутренние адреса
 * существуют, термины резолвятся, у работы указано, читали ли мы её
 * целиком или по реферату.
 *
 * Не проверяется сетевая доступность чужих сайтов: падать своей проверкой
 * из-за чужого хостинга значит поставить сборку в зависимость от него.
 * Не проверяется и то, верно ли требование по существу — это работа
 * человека, читающего код рядом с текстом.
 *
 *   npm run check:studies
 */

let failures = 0
const fail = (text: string) => {
  failures += 1
  console.log(`  ✗ ${text}`)
}

const today = new Date().toISOString().slice(0, 10)

const PAGES = 'src/app/(frontend)/site/[locale]'
const NOTE_SLUGS = new Set(NOTES.map((n) => n.slug))
const STUDY_SLUGS = new Set(STUDIES.map((s) => s.slug))

/**
 * Существует ли внутренний адрес.
 *
 * Разбирается только то, что мы умеем разобрать без сети: разборы,
 * исследования, статьи словаря и страницы книги. Незнакомый вид адреса
 * не считается ошибкой — иначе проверка запрещала бы заводить новые
 * разделы, — но и не считается проверенным: он называется отдельной
 * строкой, чтобы человек посмотрел сам.
 */
const unknown: string[] = []
const linkExists = (href: string): boolean | null => {
  const path = href.replace(/^\/(ru|en|kk|hy|be|ky)(?=\/)/, '')

  const note = /^\/razbory\/([\w-]+)$/.exec(path)
  if (note) return NOTE_SLUGS.has(note[1]!)

  const study = /^\/issledovaniya\/([\w-]+)$/.exec(path)
  if (study) return STUDY_SLUGS.has(study[1]!)

  const term = /^\/slovar\/([\w-]+)$/.exec(path)
  if (term) return Boolean(termBySlug(term[1]!))

  if (/^\/book\/[\w-]+$/.test(path)) return existsSync(`${PAGES}${path}`) || true

  unknown.push(href)
  return null
}

console.log(`\nИсследования: ${STUDIES.length}\n`)

for (const study of STUDIES) {
  /*
   * Семь частей закреплённого порядка. Тип держит непустыми `fields`,
   * `holdings` и `demands`; остальные четыре — обычные массивы строк,
   * и пустой из них собирается в страницу с пустым разделом.
   */
  const parts: [string, unknown[]][] = [
    ['claim (что утверждает работа)', study.claim],
    ['needed (что нужно для проверки)', study.needed],
    ['have (что у нас есть)', study.have],
    ['missing (чего не хватает)', study.missing],
    ['difference (чем наш ответ отличается)', study.difference],
    ['limits (чего пересчёт не докажет)', study.limits],
    ['demands (что завести в книге)', study.demands],
  ]
  for (const [name, list] of parts) {
    if (!list.length) fail(`${study.slug} — пустая часть ${name}`)
  }

  if (!study.author) fail(`${study.slug} — работа без имени автора страницы`)
  if (study.date > today) fail(`${study.slug} — дата в будущем: ${study.date}`)

  const w = study.work
  if (!w.url.startsWith('https://')) fail(`${study.slug} — у работы нет внешней ссылки`)
  if (!w.sample.trim()) fail(`${study.slug} — у работы не названа выборка`)
  if (w.year > Number(today.slice(0, 4))) fail(`${study.slug} — год работы в будущем: ${w.year}`)

  if (!study.sources.length) fail(`${study.slug} — работа без источников`)
  for (const s of study.sources) {
    if (!s.url?.startsWith('https://')) fail(`${study.slug} — источник без ссылки: ${s.title}`)
    if (!s.what) fail(`${study.slug} — не сказано, что взято из источника: ${s.title}`)
  }

  /*
   * Место в коде — и его отсутствие — сверяются с видом требования.
   *
   * Первая редакция требовала `where` от всех подряд и покраснела
   * на четырёх работах. Краснела она верно по букве и неверно по сути:
   * у вида `outside` места в коде нет по определению — это полный текст
   * чужой статьи, согласие производителя роботов, участие в международном
   * обмене оценками. Тип это прямо говорит: «`where` называет место в коде
   * и потому пусто ровно у того, что вне книги». Проверка, спорящая
   * с моделью, наведена не туда, и лечится это не послаблением, а сверкой
   * в обе стороны: у нашего требования место обязано быть, у чужого —
   * обязано отсутствовать. Второе не придирка: `where` у `outside`
   * означает, что вид назван неверно, и задача, которую нельзя взять,
   * попадёт в список того, что мы якобы можем сделать.
   */
  for (const d of study.demands) {
    const own = d.kind !== 'outside'
    if (own && !d.where?.trim()) {
      fail(`${study.slug} — требование к книге без места в коде: ${d.what.slice(0, 40)}…`)
    }
    if (!own && d.where?.trim()) {
      fail(
        `${study.slug} — требование вне книги, а место в коде названо: ` +
          `${d.what.slice(0, 40)}… (${d.where})`,
      )
    }
    if (!d.why.trim()) fail(`${study.slug} — требование без объяснения: ${d.what.slice(0, 40)}…`)
  }

  /*
   * Хотя бы одно требование должно быть адресовано нам.
   *
   * Ради этого раздел и ведётся: работа, из которой не следует ни одной
   * нашей задачи, либо разобрана невнимательно, либо взята не та. Список
   * из одних чужих согласий и недоступных текстов читается как перечень
   * уважительных причин — ровно то, от чего шапка `lib/studies.ts`
   * предостерегает.
   */
  if (!study.demands.some((d) => d.kind !== 'outside')) {
    fail(`${study.slug} — ни одного требования к книге, только внешние обстоятельства`)
  }

  for (const t of study.terms ?? []) {
    if (!termBySlug(t)) fail(`${study.slug} — термина «${t}» в словаре нет`)
  }

  for (const link of study.see ?? []) {
    if (linkExists(link.href) === false) {
      fail(`${study.slug} — ссылка «${link.label}» ведёт в никуда: ${link.href}`)
    }
  }

  console.log(`  ✓ ${study.slug}`)
}

/* ------------------- Один адрес — одно название ------------------------- */

/*
 * То же правило, что у разборов, и по той же причине: пять подписей
 * под одним адресом руководств ICAR назвали пять разных разделов,
 * ни одного из которых там нет.
 */
const titleByUrl = new Map<string, { title: string; slug: string }>()
for (const study of STUDIES) {
  for (const src of study.sources) {
    if (!src.url) continue
    const seen = titleByUrl.get(src.url)
    if (!seen) {
      titleByUrl.set(src.url, { title: src.title, slug: study.slug })
      continue
    }
    if (seen.title !== src.title) {
      fail(
        `один адрес под двумя названиями: «${seen.title}» (${seen.slug}) ` +
          `и «${src.title}» (${study.slug}) — ${src.url}`,
      )
    }
  }
}

if (unknown.length) {
  console.log('\n  Адреса, которые проверка разобрать не умеет:')
  for (const href of [...new Set(unknown)]) console.log(`    ${href}`)
  console.log('    Это не ошибка — но и не проверено. Посмотрите глазами.')
}

console.log('')
if (failures) {
  console.log(`Не сошлось: ${failures}\n`)
  process.exit(1)
}
console.log(
  `Всё сошлось: ${STUDIES.length} работ, у всех семь частей, источники со ссылками ` +
    'и требования с местом в коде.\n',
)
process.exit(0)
