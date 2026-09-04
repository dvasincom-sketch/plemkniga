import { existsSync, readFileSync } from 'node:fs'

import { NOTES } from '@/lib/notes'
import { SITE_URL } from '@/lib/hosts'
import { ICAR_FETCHED_AT, ICAR_SOURCE } from '@/lib/breeds-catalog'
import { PAGE_MESSAGES } from '@/lib/i18n/page-messages'
import {
  breadcrumbLd,
  breedsLd,
  graph,
  noteLd,
  organizationLd,
  websiteLd,
  type JsonLd,
} from '@/lib/jsonld'

/**
 * Разметка для поисковых систем не врёт и не ссылается в пустоту.
 *
 * ## Что здесь можно проверить, а что нельзя
 *
 * Совпадение разметки с текстом страницы проверять нечем и незачем:
 * она из этого текста и собрана (`lib/jsonld.ts`), и сверять её
 * с источником значило бы сверять число с самим собой. Ошибка,
 * которая тут возможна, другого рода — и вся она про ссылки наружу.
 *
 * **Ссылка на несуществующий файл.** Знак организации и картинка
 * разбора названы адресами в `public`. Переименованный файл ничего
 * не ломает: страница открывается, разметка остаётся правильной
 * на вид, и только робот получает отказ там, где ему обещали знак.
 * Увидеть это на странице нельзя вовсе — картинка в разметке нигде
 * не показывается.
 *
 * **Ссылка на неопределённый узел.** Разбор говорит «издатель — вот
 * тот» и называет `@id`. Если узла с таким `@id` не окажется ни
 * на одной странице, заявление повиснет: формально разметка верна,
 * а издателя нет. Поэтому здесь собираются оба списка — что объявлено
 * и на что сослались, — и сверяются.
 *
 * **Заявление, повисшее из-за страницы.** Узлы с `@id` объявляет
 * главная, и только она. Уберут вызов с главной — сломаются
 * одиннадцать разборов сразу, и ни один из них об этом не узнает.
 * Поэтому проверяется и сам вызов, текстом по файлу страницы.
 *
 * **Дата, которую нельзя прочитать.** `datePublished` разбирает робот,
 * а не человек: «4 сентября» ему не дата. Проверяется формат и то,
 * что дата не из будущего — разбор с завтрашним числом выглядит
 * подделкой ровно там, где мы просим верить числам.
 *
 * ## Почему проверяются построители, а не страницы
 *
 * Страницу пришлось бы поднимать и разбирать её разметку — это прогон
 * с сервером, и он есть отдельно (`check:nav`). Здесь достаточно
 * построителей: страницы не пишут разметку руками, они зовут их.
 *
 *   npm run check:jsonld
 */

let failures = 0
const fail = (text: string) => {
  failures += 1
  console.log(`  ✗ ${text}`)
}

/* --------------------------- Что и как собрано ---------------------------- */

const blocks: { where: string; data: JsonLd }[] = [
  { where: 'главная', data: graph(organizationLd(), websiteLd('ru')) },
  {
    where: 'каталог пород',
    data: graph(
      breedsLd({
        locale: 'ru',
        name: PAGE_MESSAGES.ru.pages.breeds.title,
        description: PAGE_MESSAGES.ru.pages.breeds.lead,
        icarSource: ICAR_SOURCE,
        icarFetchedAt: ICAR_FETCHED_AT,
      }),
    ),
  },
  ...NOTES.map((n) => ({
    where: `разбор ${n.slug}`,
    data: graph(
      noteLd(n),
      breadcrumbLd([
        { name: 'Разборы', path: '/ru/razbory' },
        { name: n.title, path: `/ru/razbory/${n.slug}` },
      ]),
    ),
  })),
]

console.log(`Блоков разметки: ${blocks.length}`)

/* ------------------------- 1. Собирается и не рвёт ------------------------- */

for (const { where, data } of blocks) {
  let text: string
  try {
    text = JSON.stringify(data)
  } catch {
    fail(`${where} — разметка не собирается в строку`)
    continue
  }

  /*
     Ровно та последовательность, из-за которой блок закрывается посреди
     объекта и разметка страницы дальше едет. Экранирование стоит
     в `components/JsonLd.tsx`; здесь проверяется, что оно там осталось.
  */
  if (text.replace(/</g, '\\u003c').includes('</script')) {
    fail(`${where} — экранирование не сработало`)
  }

  if (/"undefined"|:null[,}]/.test(text)) {
    fail(`${where} — в разметке пустое значение`)
  }
}

/* -------------------- 2. Ссылки на файлы и на узлы ------------------------- */

const declared = new Set<string>()
const referenced = new Map<string, string>()
const assets = new Map<string, string>()

const walkNode = (node: unknown, where: string): void => {
  if (Array.isArray(node)) {
    for (const item of node) walkNode(item, where)
    return
  }
  if (node === null || typeof node !== 'object') return

  const obj = node as Record<string, unknown>

  const id = obj['@id']
  if (typeof id === 'string') {
    /* Узел объявлен, если у него есть тип; иначе это ссылка на чужой. */
    if (typeof obj['@type'] === 'string') declared.add(id)
    else referenced.set(id, where)
  }

  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.startsWith(SITE_URL)) {
      const path = value.slice(SITE_URL.length).split('#')[0]!
      if (/\.(png|svg|jpg|webp|ico)$/.test(path)) assets.set(path, where)
    }
    walkNode(value, where)
  }
}

for (const { where, data } of blocks) walkNode(data, where)

for (const [path, where] of assets) {
  if (!existsSync(`public${path}`)) fail(`${where} — нет файла public${path}`)
}
console.log(`Файлов, названных разметкой: ${assets.size}`)

for (const [id, where] of referenced) {
  if (!declared.has(id)) fail(`${where} — ссылка на неопределённый узел ${id}`)
}
console.log(`Узлов объявлено: ${declared.size}, ссылок на них: ${referenced.size}`)

/*
 * Узлы организации и сайта объявляет главная страница витрины,
 * и на них ссылаются все остальные. Проверка текстовая — здесь важно
 * не то, как построена разметка, а то, что её на этой странице вообще
 * зовут: без этого вызова ссылки одиннадцати разборов повиснут молча.
 */
const HOME = 'src/app/(frontend)/site/[locale]/page.tsx'
const home = readFileSync(HOME, 'utf8')
if (!/organizationLd\(\)/.test(home) || !/websiteLd\(/.test(home)) {
  fail(`${HOME} — на главной не объявлены организация и сайт, ссылаться будет не на что`)
}

/* ---------------------------- 3. Разборы ----------------------------------- */

const today = new Date().toISOString().slice(0, 10)

for (const note of NOTES) {
  const ld = noteLd(note) as Record<string, unknown>

  if (!/^\d{4}-\d{2}-\d{2}$/.test(note.date)) {
    fail(`разбор ${note.slug} — дата «${note.date}» не читается роботом`)
  } else if (note.date > today) {
    fail(`разбор ${note.slug} — дата из будущего: ${note.date}`)
  }

  const headline = ld.headline
  if (typeof headline !== 'string' || headline.trim() === '') {
    fail(`разбор ${note.slug} — пустой заголовок в разметке`)
  }

  if (note.sources.length === 0) {
    fail(`разбор ${note.slug} — ни одного источника: разбору не на что опереться`)
  }

  for (const s of note.sources) {
    if (s.title.trim() === '') fail(`разбор ${note.slug} — источник без названия`)
    if (s.url && !/^https?:\/\//.test(s.url)) {
      fail(`разбор ${note.slug} — адрес источника не абсолютный: ${s.url}`)
    }
  }
}

console.log(`Разборов: ${NOTES.length}`)

console.log(
  failures === 0
    ? '\n  ✓ разметка для поисковых систем ни на что не ссылается в пустоту'
    : `\n  ✗ мест с неверной разметкой: ${failures}`,
)
process.exit(failures === 0 ? 0 : 1)
