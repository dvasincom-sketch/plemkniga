/**
 * Поиск строки подключения к PostgreSQL.
 *
 * Разные платформы называют переменную по-разному: DATABASE_URI (Payload),
 * DATABASE_URL (Prisma, Heroku, Timeweb), POSTGRES_URL (Vercel), а иногда
 * не отдают строку вовсе — только отдельные хост/порт/пользователя.
 * Чтобы деплой не падал из-за одной буквы в имени, проверяем всё это по
 * очереди и запоминаем, откуда взяли значение — источник видно в /healthz.
 */

const URI_KEYS = [
  'DATABASE_URI',
  'DATABASE_URL',
  'POSTGRES_URI',
  'POSTGRES_URL',
  'POSTGRESQL_URL',
  'PG_URI',
  'PG_URL',
  'DB_URI',
  'DB_URL',
] as const

const PART_KEYS = {
  host: ['POSTGRES_HOST', 'PGHOST', 'DB_HOST', 'DATABASE_HOST'],
  port: ['POSTGRES_PORT', 'PGPORT', 'DB_PORT', 'DATABASE_PORT'],
  user: ['POSTGRES_USER', 'PGUSER', 'DB_USER', 'DATABASE_USER'],
  password: ['POSTGRES_PASSWORD', 'PGPASSWORD', 'DB_PASSWORD', 'DATABASE_PASSWORD'],
  database: ['POSTGRES_DB', 'PGDATABASE', 'DB_NAME', 'DATABASE_NAME'],
} as const

type Env = Record<string, string | undefined>

const pick = (env: Env, keys: readonly string[]): { value: string; key: string } | null => {
  for (const key of keys) {
    const value = env[key]?.trim()
    if (value) return { value, key }
  }
  return null
}

export type ResolvedDatabase = {
  /** Готовая строка подключения либо пустая строка, если ничего не нашлось. */
  uri: string
  /** Имя переменной (или «части»), откуда взята строка. */
  source: string | null
  /** Нужен ли TLS. */
  ssl: boolean
}

export function resolveDatabase(env: Env = process.env as Env): ResolvedDatabase {
  const direct = pick(env, URI_KEYS)

  let uri = ''
  let source: string | null = null

  if (direct) {
    uri = direct.value
    source = direct.key
  } else {
    const host = pick(env, PART_KEYS.host)
    const user = pick(env, PART_KEYS.user)
    const database = pick(env, PART_KEYS.database)

    if (host && user && database) {
      const password = pick(env, PART_KEYS.password)?.value ?? ''
      const port = pick(env, PART_KEYS.port)?.value ?? '5432'
      const auth = password
        ? `${encodeURIComponent(user.value)}:${encodeURIComponent(password)}`
        : encodeURIComponent(user.value)
      uri = `postgres://${auth}@${host.value}:${port}/${database.value}`
      source = 'отдельные переменные хоста, пользователя и базы'
    }
  }

  const ssl =
    /[?&]sslmode=(require|verify-ca|verify-full)/i.test(uri) || env.DATABASE_SSL === 'true'

  return { uri, source, ssl }
}

/** Строка подключения без пароля — можно показывать и писать в лог. */
export function maskUri(uri: string): string {
  if (!uri) return ''
  return uri.replace(/(:\/\/[^:/@]+):[^@]*@/, '$1:***@')
}

/**
 * Все переменные окружения, похожие на настройки базы, с замаскированными
 * значениями. Нужна, чтобы увидеть, под каким именем платформа реально
 * передала строку подключения в контейнер.
 */
export function databaseEnvKeys(env: Env = process.env as Env): Record<string, string> {
  const out: Record<string, string> = {}
  const secretish = /PASS|SECRET|TOKEN/i

  for (const [key, raw] of Object.entries(env)) {
    if (!/DATABASE|POSTGRES|^PG[A-Z]|^DB_/i.test(key)) continue
    const value = raw?.trim() ?? ''
    if (!value) {
      out[key] = '(пусто)'
    } else if (secretish.test(key)) {
      out[key] = '***'
    } else if (/:\/\//.test(value)) {
      out[key] = maskUri(value)
    } else {
      out[key] = value
    }
  }
  return out
}
