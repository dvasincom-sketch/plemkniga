import fs from 'fs'
import path from 'path'

/**
 * Поиск файла в /public по имени без расширения.
 *
 * Позволяет заменять картинки простым копированием файла в /public,
 * без правок в коде: положили `public/images/cow-head.jpg` — он подхватился.
 */
const EXTENSIONS = ['.svg', '.webp', '.avif', '.jpg', '.jpeg', '.png'] as const

const cache = new Map<string, string | null>()

export function findPublicAsset(basename: string, extensions?: string[]): string | null {
  /*
   * Расширения можно задать свои: у знака они одни, у записи работы
   * в кабинете другие. Ключ кэша при этом обязан их учитывать —
   * иначе первый же поиск запомнил бы ответ для чужого набора.
   */
  const list = extensions ? extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)) : EXTENSIONS
  const key = extensions ? `${basename}|${list.join(',')}` : basename

  if (cache.has(key)) return cache.get(key)!

  const publicDir = path.join(process.cwd(), 'public')
  let found: string | null = null

  for (const ext of list) {
    const rel = `${basename}${ext}`
    if (fs.existsSync(path.join(publicDir, rel))) {
      found = `/${rel}`
      break
    }
  }

  // В dev пересканируем каждый раз, чтобы новый файл появлялся без перезапуска.
  if (process.env.NODE_ENV === 'production') cache.set(key, found)
  return found
}
