import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { ru } from '@payloadcms/translations/languages/ru'
import sharp from 'sharp'

import { Users } from '@/collections/Users'
import { Organizations } from '@/collections/Organizations'
import { Herds } from '@/collections/Herds'
import { Animals } from '@/collections/Animals'
import { Events } from '@/collections/Events'
import { Documents } from '@/collections/Documents'
import { Media } from '@/collections/Media'
import { Inseminations } from '@/collections/Inseminations'
import { MilkTests } from '@/collections/MilkTests'
import { HealthEvents } from '@/collections/HealthEvents'
import { Calvings } from '@/collections/Calvings'
import { DataSubmissions } from '@/collections/DataSubmissions'
import { DICTIONARY_COLLECTIONS } from '@/collections/dictionaries'
import { databaseEnvKeys, maskUri, resolveDatabase } from '@/lib/db-url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const { uri: databaseUri, source: databaseSource, sslConfig, sslMode } = resolveDatabase()

if (databaseUri) {
  console.info(
    `[plemkniga] Строка подключения взята из ${databaseSource}: ${maskUri(databaseUri)} (TLS: ${sslMode})`,
  )
} else {
  console.warn(
    '[plemkniga] Строка подключения не найдена. Проверены переменные DATABASE_URI, DATABASE_URL, POSTGRES_URL и др. Видны только: ' +
      (Object.keys(databaseEnvKeys()).join(', ') || 'ни одной переменной про базу'),
  )
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: '— Племенная книга',
    },
  },
  collections: [
    Users,
    Organizations,
    Herds,
    Animals,
    Calvings,
    Inseminations,
    MilkTests,
    HealthEvents,
    DataSubmissions,
    Events,
    Documents,
    Media,
    ...DICTIONARY_COLLECTIONS,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'dev-secret-change-me',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: databaseUri,
      // Управляемый PostgreSQL (в т.ч. Timeweb Cloud) требует TLS и обычно
      // отдаёт самоподписанный сертификат. Положите CA провайдера
      // в DATABASE_CA_CERT — тогда проверка сохранится. Быстрая альтернатива
      // на время отладки: DATABASE_SSL_REJECT_UNAUTHORIZED=false
      ssl: sslConfig,
    },
    // На проде выключите (PAYLOAD_DB_PUSH=false) и работайте через миграции:
    // npm run payload migrate:create && npm run payload migrate
    push: process.env.PAYLOAD_DB_PUSH !== 'false',
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  sharp,
  cors: [process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'],
  csrf: [process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'],
  i18n: {
    supportedLanguages: { ru },
    fallbackLanguage: 'ru',
  },
  telemetry: false,
})
