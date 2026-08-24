import 'dotenv/config'

/**
 * Проверка оформления Swagger UI на живом сервере.
 *
 * ## Что здесь можно сломать и не заметить
 *
 * Оформление раздела `/api-docs` держится на трёх допущениях, и каждое
 * ломается молча — страница остаётся работоспособной, просто выглядит
 * чужой программой, вставленной в книгу.
 *
 * **Файл может не доехать.** `public/swagger/` собирается перед сборкой
 * и в репозиторий не попадает, а `public/swagger-theme.css` лежит рядом
 * и попадает. Достаточно один раз описать копирование в образ по имени
 * каталога, и тема останется на машине сборки. Ответ 404 на таблицу
 * стилей ничего не ломает: просто шрифт снова системный.
 *
 * **Переменную темы могут переименовать.** Цвета берутся из палитры книги
 * через `var(--color-…)`, чтобы не держать второй набор чисел. Но `var()`
 * с неизвестным именем — это не ошибка, а «значение не задано»: цвет
 * тихо становится тем, что было, либо запасным. Поэтому здесь сверяется,
 * что каждое имя, на которое ссылается тема, действительно объявлено
 * в таблице стилей сайта.
 *
 * **Сила селектора считается не так, как кажется.** Сплошной охват шрифта
 * стоял с исключениями — `*:not(code):not(pre):not(.microlight)` — и
 * не работал: каждое `:not()` добавляет силу своего содержимого, и они
 * складываются, а не берутся по максимуму. Охват оказался сильнее правил
 * для кода, которые сам же должен был пропустить, и моноширинный
 * не появлялся нигде. Проверка стоит на том, чтобы это не вернулось.
 *
 *   npm run check:swagger-theme
 *   BASE=https://… npm run check:swagger-theme
 */

const BASE = process.env.BASE ?? 'http://localhost:3000'

const TAG = 'CHK-SWAGGER'
let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) console.log(`  ✓ ${what}`)
  else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

const get = async (path: string) => {
  const res = await fetch(`${BASE}${path}`)
  return { status: res.status, body: res.ok ? await res.text() : '' }
}

async function main() {
  console.log(`${TAG}: оформление /api-docs, ${BASE}\n`)

  /* ------------------------- файлы на месте ------------------------- */
  console.log('Файлы отдаются')
  const theme = await get('/swagger-theme.css')
  check(theme.status === 200, '/swagger-theme.css', `ответ ${theme.status}`)
  check(theme.body.length > 1000, 'тема не пустая', `${theme.body.length} байт`)

  const lib = await get('/swagger/swagger-ui.css')
  if (lib.status !== 200) {
    /*
     * Это законное состояние: `copy-swagger` не падает, если пакета нет,
     * а страница умеет сказать об этом и увести к описанию в JSON. Но
     * молчать здесь нельзя — иначе проверка оформления пройдёт на странице,
     * где оформлять нечего.
     */
    console.log(
      `  · библиотеки нет (/swagger/swagger-ui.css → ${lib.status}); ` +
        'страница показывает ссылку на JSON, оформлять нечего',
    )
  } else {
    check(true, '/swagger/swagger-ui.css')
  }

  if (theme.status !== 200) {
    console.log('\nБез темы проверять нечего.')
    process.exit(1)
  }

  /* ---------------- ловушка со силой селектора ---------------- */
  console.log('\nСплошной охват шрифта')
  const sweep = theme.body.match(/\.swagger-ui,\s*\.swagger-ui\s+([^{]+)\{/)
  check(sweep !== null, 'правило охвата нашлось')
  if (sweep) {
    check(
      !sweep[1].includes(':not('),
      'в охвате нет `:not()`',
      'каждое `:not()` добавляет силу, и охват перебивает правила для кода',
    )
  }
  check(
    /font-family:[^;]*!important/.test(theme.body),
    'шрифт задан через !important',
    'иначе трёхклассовые правила библиотеки перебивают наследование',
  )
  check(!theme.body.includes('@import'), 'тема ни от чего не зависит через @import')

  /* ------------- переменные палитры существуют на сайте ------------- */
  console.log('\nПеременные палитры объявлены в таблице стилей сайта')
  const used = [...new Set([...theme.body.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))]
  check(used.length > 0, 'тема ссылается на переменные книги', `${used.length} имён`)

  const page = await get('/api-docs')
  check(page.status === 200, 'страница /api-docs отвечает', `ответ ${page.status}`)

  /*
   * Таблиц стилей у страницы может быть несколько, и палитра лежит
   * не обязательно в первой. Собираем все и ищем объявление в любой:
   * `@theme` выкладывает переменные на `:root` одним куском, но полагаться
   * на то, в каком именно файле он окажется, нельзя — имя файла считает
   * сборщик.
   */
  const hrefs = [...page.body.matchAll(/href="(\/_next\/static\/css\/[^"]+\.css)"/g)].map(
    (m) => m[1],
  )
  check(hrefs.length > 0, 'ссылки на таблицы стилей нашлись в разметке')

  let siteCss = ''
  for (const href of [...new Set(hrefs)]) {
    const r = await get(href)
    if (r.status === 200) siteCss += r.body
  }
  check(siteCss.length > 0, 'таблицы стилей сайта скачались', `${siteCss.length} байт`)

  const missing = used.filter((name) => !siteCss.includes(`${name}:`))
  check(
    missing.length === 0,
    'каждое имя из темы объявлено на сайте',
    missing.length ? `не найдены: ${missing.join(', ')}` : '',
  )

  console.log(failures === 0 ? '\nВсё сошлось.' : `\nНе сошлось: ${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
