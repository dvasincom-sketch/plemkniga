import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Положить файлы Swagger UI в `public/swagger`.
 *
 * ## Почему свои файлы, а не CDN
 *
 * Страница с внешним скриптом перестаёт работать ровно тогда, когда
 * до внешнего адреса не дотянуться, — а система разворачивается
 * в хозяйствах и ведомствах, где до половины интернета не дотягиваются
 * штатно. Документация API, которая открывается не у всех, — это
 * документация, на которую нельзя сослаться.
 *
 * ## Почему три файла, а не весь пакет
 *
 * В `swagger-ui-dist` двенадцать мегабайт: карты исходников, варианты
 * сборки, примеры. Странице нужны ровно три файла на 1,9 МБ. Копировать
 * пакет целиком значит носить в образе одиннадцать мегабайт, которые
 * никто никогда не запросит.
 *
 * ## Почему это шаг сборки, а не файлы в репозитории
 *
 * Скопированные в репозиторий, они стали бы третьей копией библиотеки —
 * рядом с записью в package.json и содержимым node_modules — и первая же
 * смена версии оставила бы их прежними. Здесь источник один: пакет.
 *
 * Запускается автоматически перед `dev` и `build`. Если пакета нет,
 * скрипт не падает: страница `/api-docs` умеет сказать об этом сама
 * и увести к описанию в формате JSON, которое от Swagger UI не зависит.
 */

const FILES = ['swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js', 'swagger-ui.css']

const from = path.resolve(process.cwd(), 'node_modules/swagger-ui-dist')
const to = path.resolve(process.cwd(), 'public/swagger')

if (!existsSync(from)) {
  console.warn(
    '[plemkniga] swagger-ui-dist не установлен — страница /api-docs покажет ' +
      'ссылку на описание в формате JSON вместо интерактивной документации. ' +
      'Установить: npm i swagger-ui-dist',
  )
  process.exit(0)
}

mkdirSync(to, { recursive: true })

let copied = 0
for (const file of FILES) {
  const src = path.join(from, file)
  if (!existsSync(src)) {
    console.warn(`[plemkniga] в swagger-ui-dist нет файла ${file} — пропущен`)
    continue
  }
  copyFileSync(src, path.join(to, file))
  copied += 1
}

console.log(`[plemkniga] Swagger UI: файлов скопировано в public/swagger — ${copied}`)
