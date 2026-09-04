import 'dotenv/config'

/**
 * Каждый адрес витрины открывается.
 *
 * ## Почему этого прогона не было и чем это кончилось
 *
 * Проверки витрины у нас разбирали её по частям: метатеги, разметку
 * для поисковых систем, переводы, ссылки внутри разметки. Все они
 * читают код и ни одна не открывает страницу.
 *
 * И вот чем это кончилось. Словарь и раздел исследований выложились
 * с ошибкой сервера на каждом адресе статьи: у маршрута два изменяемых
 * куска, `[locale]` и `[slug]`, а список для предварительной сборки
 * перечислял один. Сборка прошла. Типы сошлись. Указатели обоих разделов
 * открывались, и потому поломка выглядела бедой отдельных страниц,
 * а не раздела целиком.
 *
 * Заметить это можно было ровно одним способом — открыв адрес. Отсюда
 * прогон.
 *
 * ## Почему по карте сайта, а не по списку
 *
 * Список адресов пришлось бы вести руками, и он отстал бы на первом же
 * новом разделе — то есть повторил бы ту самую беду, от которой заведён.
 * Карта сайта уже собирается из кода и уже перечисляет всё, что мы
 * обещаем поисковой системе. Новый раздел, попавший в карту, попадает
 * под прогон сам; не попавший в карту — не показывается роботу вовсе,
 * и это отдельная беда, о которой скажет `check:seo`.
 *
 * ## Что считается ответом
 *
 * Только 200. Перенаправление здесь — ошибка: карта сайта обязана звать
 * робота на конечный адрес, а не на промежуточный, иначе он тратит
 * бюджет обхода на переезды.
 *
 *   npm run check:site                      # против http://localhost:3000
 *   BASE=https://plem.online npm run check:site
 */

const TAG = 'check:site'
const BASE = process.env.BASE ?? 'http://localhost:3000'

/*
 * Домен подставляется заголовком, а не адресом: сервер один, а сайта
 * на нём два, и без заголовка своя сборка отдала бы страницы книги.
 * У боевого адреса заголовок совпадает с ним самим и ничего не меняет.
 */
const SITE_HEADERS = { host: 'plem.online' }

/** Сколько адресов тянуть разом: сервер один, и его не надо ронять. */
const BATCH = 8

const get = async (url: string) => {
  const res = await fetch(url, { headers: SITE_HEADERS, redirect: 'manual' })
  return res.status
}

async function main() {
  console.log(`${TAG}: адреса витрины, ${BASE}\n`)

  /*
   * Отказ соединения — не поломка витрины, а незапущенный сервер,
   * и говорить об этом надо словами. Развёрнутый след `ECONNREFUSED`
   * читается как «сломалось что-то в проверке», и первое, что делает
   * получивший его, — лезет в проверку вместо того, чтобы поднять `next`.
   */
  const mapRes = await fetch(`${BASE}/sitemap.xml`, { headers: SITE_HEADERS }).catch(() => null)
  if (!mapRes) {
    console.log(`  ✗ ${BASE} не отвечает — прогон ходит по страницам снаружи и требует сервера`)
    console.log('    Поднимите его: npm run dev (или npm run build && npm run start)')
    console.log('    Против боевого: BASE=https://plem.online npm run check:site')
    process.exit(1)
  }

  if (!mapRes.ok) {
    console.log(`  ✗ карта сайта не отдалась: ${mapRes.status}`)
    process.exit(1)
  }

  const xml = await mapRes.text()
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1]!)
    .map((u) => new URL(u).pathname)

  if (paths.length === 0) {
    console.log('  ✗ в карте сайта нет ни одного адреса')
    process.exit(1)
  }

  console.log(`Адресов в карте: ${paths.length}`)

  const bad: { path: string; status: number }[] = []

  for (let i = 0; i < paths.length; i += BATCH) {
    const part = paths.slice(i, i + BATCH)
    const statuses = await Promise.all(part.map((p) => get(`${BASE}${p}`)))

    part.forEach((p, k) => {
      const status = statuses[k]!
      if (status !== 200) bad.push({ path: p, status })
    })
  }

  if (bad.length === 0) {
    console.log(`\n  ✓ все ${paths.length} адресов отдают 200`)
    process.exit(0)
  }

  console.log('')
  for (const b of bad) console.log(`  ✗ ${b.status}  ${b.path}`)
  console.log(`\n  ✗ адресов с ошибкой: ${bad.length} из ${paths.length}`)
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
