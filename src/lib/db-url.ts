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

export type SslConfig = { ca?: string; rejectUnauthorized: boolean }

export type ResolvedDatabase = {
  /** Строка подключения как её задал человек — для показа и логов. */
  uri: string
  /**
   * Строка для драйвера: без `sslmode`.
   *
   * node-postgres, увидев `sslmode` в строке подключения, **игнорирует**
   * переданный отдельно объект настроек TLS и берёт настройки из строки.
   * При этом `sslmode=require` он трактует как `verify-full` — то есть
   * включает полную проверку сертификата, хотя в PostgreSQL этот режим
   * означает «шифруй, но не проверяй». Из-за такой пары решений строка
   * подключения, работающая в psql и в других проектах, здесь падала
   * с «self-signed certificate in certificate chain», и никакие переменные
   * окружения на это не влияли — их просто не читали.
   *
   * Поэтому `sslmode` из строки убирается, а режим TLS задаётся объектом
   * `sslConfig`: тогда решение принимаем мы, а не разбор строки.
   */
  driverUri: string
  /** Имя переменной (или «части»), откуда взята строка. */
  source: string | null
  /** Нужен ли TLS. */
  ssl: boolean
  /** Готовые настройки TLS для драйвера pg (undefined, если TLS не нужен). */
  sslConfig?: SslConfig
  /** Как описать режим TLS человеку. */
  sslMode: string
}

/**
 * Сертификат удостоверяющего центра базы.
 *
 * Управляемый PostgreSQL обычно выдаётся с самоподписанным сертификатом,
 * и драйвер отвергает соединение с ошибкой «self-signed certificate in
 * certificate chain». Правильное решение — положить CA-сертификат провайдера
 * в переменную окружения: соединение остаётся проверяемым. Значение можно
 * передать как PEM целиком или в base64 — второе удобнее для панелей,
 * которые не любят многострочные значения.
 */
const readCaCert = (env: Env): string | undefined => {
  const raw = env.DATABASE_CA_CERT?.trim()
  if (!raw) return undefined
  if (raw.includes('BEGIN CERTIFICATE')) return raw
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8')
    return decoded.includes('BEGIN CERTIFICATE') ? decoded : undefined
  } catch {
    return undefined
  }
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

  const sslmode = /[?&]sslmode=([a-z-]+)/i.exec(uri)?.[1]?.toLowerCase()
  const ssl =
    sslmode === 'require' ||
    sslmode === 'verify-ca' ||
    sslmode === 'verify-full' ||
    env.DATABASE_SSL === 'true'

  // Убираем sslmode (и совместимый флаг libpq) — режим задаём объектом
  const driverUri = uri
    .replace(/([?&])sslmode=[^&]*&?/gi, '$1')
    .replace(/([?&])uselibpqcompat=[^&]*&?/gi, '$1')
    .replace(/[?&]$/, '')

  if (!ssl) return { uri, driverUri, source, ssl, sslMode: 'выключен' }

  const ca = readCaCert(env)

  /*
   * Проверять ли сертификат — решаем по sslmode, как это делает libpq.
   *
   * Это важная тонкость: `sslmode=require` в PostgreSQL означает «шифруй,
   * но сертификат не проверяй». Проверку включают только `verify-ca`
   * и `verify-full`. Драйвер node-postgres таких правил не знает и проверяет
   * всегда, когда ему передали объект настроек, — поэтому строка подключения,
   * с которой прекрасно работают psql и другие клиенты, здесь падала
   * с «self-signed certificate in certificate chain».
   *
   * Теперь поведение совпадает с общепринятым: та же строка подключения
   * работает так же, как везде. Проверку можно включить явно —
   * поставив в строке verify-full или задав DATABASE_CA_CERT.
   */
  const verifyByMode = sslmode === 'verify-ca' || sslmode === 'verify-full'
  const explicit = env.DATABASE_SSL_REJECT_UNAUTHORIZED
  const rejectUnauthorized =
    explicit === 'false' ? false : explicit === 'true' ? true : verifyByMode || Boolean(ca)

  return {
    uri,
    driverUri,
    source,
    ssl,
    sslConfig: ca && rejectUnauthorized ? { ca, rejectUnauthorized } : { rejectUnauthorized },
    sslMode: !rejectUnauthorized
      ? `шифрование без проверки сертификата (sslmode=${sslmode ?? 'не задан'})`
      : ca
        ? 'с проверкой по своему сертификату'
        : 'с проверкой по системным корневым сертификатам',
  }
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
