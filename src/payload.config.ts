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
import { AccessRequests } from '@/collections/AccessRequests'
import { AnimalEvaluations } from '@/collections/AnimalEvaluations'
import { AnimalExteriors } from '@/collections/AnimalExteriors'
import { AnimalRevisions } from '@/collections/AnimalRevisions'
import { IndexProfiles } from '@/collections/IndexProfiles'
import { IndexValues } from '@/collections/IndexValues'
import { IndexBases } from '@/collections/IndexBases'
import { DICTIONARY_COLLECTIONS } from '@/collections/dictionaries'
import { addDomainConstraints } from '@/lib/db-constraints'
import { databaseEnvKeys, isLocalDatabase, maskUri, resolveDatabase } from '@/lib/db-url'
import { migrations } from '@/migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const { uri: databaseUri, driverUri, source: databaseSource, sslConfig, sslMode } = resolveDatabase()

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
    AnimalEvaluations,
    AnimalExteriors,
    AnimalRevisions,
    DataSubmissions,
    AccessRequests,
    IndexProfiles,
    IndexValues,
    IndexBases,
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
      connectionString: driverUri,
      // Управляемый PostgreSQL (в т.ч. Timeweb Cloud) требует TLS и обычно
      // отдаёт самоподписанный сертификат. Положите CA провайдера
      // в DATABASE_CA_CERT — тогда проверка сохранится. Быстрая альтернатива
      // на время отладки: DATABASE_SSL_REJECT_UNAUTHORIZED=false
      ssl: sslConfig,
    },
    /*
     * push приводит схему базы к конфигу на лету — удобно в разработке
     * и недопустимо где-либо ещё.
     *
     * Payload включает его по одному признаку: `NODE_ENV` не равен
     * `production`. Строку подключения он не смотрит. Из-за этого любая
     * команда, запущенная с машины разработчика против боевой базы —
     * пересчёт, выгрузка, ревизия, — молча правила боевую схему под рабочую
     * копию и оставляла в журнале отметку `dev`. Прод потом не поднимался:
     * при старте он видел отметку и спрашивал разрешения на миграции
     * у контейнера, в котором некому отвечать.
     *
     * Поэтому к условию Payload добавлено своё: база должна быть локальной.
     * Признак грубый — петлевой адрес или сокет, — и ошибиться он может
     * только в безопасную сторону: не сделать push там, где было можно.
     */
    push: process.env.PAYLOAD_DB_PUSH !== 'false' && isLocalDatabase(driverUri),
    migrationDir: path.resolve(dirname, 'migrations'),
    /*
     * Правила предметной области дописываются к схеме, которую Payload
     * построил из полей коллекций: диапазоны, знаки, запрет быть себе
     * родителем. Разбор — в самом файле.
     */
    afterSchemaInit: [addDomainConstraints],
    /*
     * На проде Payload сам прогоняет эти миграции при старте: применяются
     * только те, которых ещё нет в таблице payload_migrations, поэтому
     * повторный запуск безопасен.
     */
    prodMigrations: migrations,
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
