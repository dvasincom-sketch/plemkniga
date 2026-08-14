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

export function findPublicAsset(basename: string): string | null {
  if (cache.has(basename)) return cache.get(basename)!

  const publicDir = path.join(process.cwd(), 'public')
  let found: string | null = null

  for (const ext of EXTENSIONS) {
    const rel = `${basename}${ext}`
    if (fs.existsSync(path.join(publicDir, rel))) {
      found = `/${rel}`
      break
    }
  }

  // В dev пересканируем каждый раз, чтобы новый файл появлялся без перезапуска.
  if (process.env.NODE_ENV === 'production') cache.set(basename, found)
  return found
}
