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

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: {
      titleSuffix: '— Племенная книга',
    },
  },
  collections: [Users, Organizations, Herds, Animals, Events, Documents, Media],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'dev-secret-change-me',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
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
