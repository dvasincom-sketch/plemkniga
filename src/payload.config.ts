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
import { Movements } from '@/collections/Movements'
import { Documents } from '@/collections/Documents'
import { SavedSearches } from '@/collections/SavedSearches'
import { BenchRuns } from '@/collections/BenchRuns'
import { Media } from '@/collections/Media'
import { Inseminations } from '@/collections/Inseminations'
import { MilkTests } from '@/collections/MilkTests'
import { HealthEvents } from '@/collections/HealthEvents'
import { Calvings } from '@/collections/Calvings'
import { DataSubmissions } from '@/collections/DataSubmissions'
import { AccessRequests } from '@/collections/AccessRequests'
import { AccessGrants } from '@/collections/AccessGrants'
import { AccessViews } from '@/collections/AccessViews'
import { CheckSettings } from '@/collections/CheckSettings'
import { CheckThresholds } from '@/collections/CheckThresholds'
import { AnimalEvaluations } from '@/collections/AnimalEvaluations'
import { AnimalExteriors } from '@/collections/AnimalExteriors'
import { AnimalRemovals } from '@/collections/AnimalRemovals'
import { ShareLinks } from '@/collections/ShareLinks'
import { Invitations } from '@/collections/Invitations'
import { Operations } from '@/collections/Operations'
import { AnimalRevisions } from '@/collections/AnimalRevisions'
import { VerificationRequests } from '@/collections/VerificationRequests'
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
    Movements,
    Calvings,
    Inseminations,
    MilkTests,
    HealthEvents,
    AnimalEvaluations,
    AnimalExteriors,
    AnimalRevisions,
    AnimalRemovals,
    DataSubmissions,
    VerificationRequests,
    Invitations,
    Operations,
    AccessRequests,
    AccessGrants,
    AccessViews,
    ShareLinks,
    CheckSettings,
    CheckThresholds,
    IndexProfiles,
    IndexValues,
    IndexBases,
    Events,
    Documents,
    Media,
    SavedSearches,
    BenchRuns,
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
      /*
       * Срок на установление соединения. По умолчанию у pg стоит ноль —
       * «ждать сколько угодно», — и это не безобидная настройка.
       *
       * База может не отказать в соединении, а промолчать: закрытый файрвол
       * и список доверенных IP не отвечают «нельзя», они выбрасывают пакеты.
       * Отказ (`ECONNREFUSED`) приходит мгновенно, тишина (`ETIMEDOUT`) —
       * через минуты. Так и вышло на проде: страница не показывала экран
       * ошибки, а висела, пока шлюз не сдавался. Хуже того, молчала и проба
       * `/healthz` — единственный инструмент, которым эту причину узнают.
       *
       * Пять секунд выбраны из того, что живая база отвечает за десятки
       * миллисекунд, и разница между «медленно» и «не отвечает вовсе» должна
       * быть видна сразу. Значение переопределяется переменной — на случай
       * сети, где рукопожатие TLS честно занимает дольше.
       */
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS) || 5000,
      /*
       * Держим соединение живым на уровне TCP.
       *
       * База у нас на другом хосте, и между нами сеть провайдера. Молчащее
       * соединение такие сети закрывают сами, ничего не сообщая обеим
       * сторонам: приложение узнаёт об этом только когда попробует читать —
       * и получает `ETIMEDOUT` через минуты. В логе прода это выглядело
       * именно так.
       *
       * Keep-alive не чинит обрыв, он его предотвращает: пустой пакет раз
       * в некоторое время не даёт посреднику посчитать соединение
       * заброшенным. Обработка обрыва при этом остаётся на месте
       * (`guardPool` в `src/lib/payload.ts`) — сеть может пропасть
       * и по-настоящему.
       */
      keepAlive: true,
      /*
       * Размер пула и срок жизни простаивающего соединения — по умолчанию
       * как у pg (десять клиентов, простой десять секунд), но задаются
       * переменными. Заведены они не для настройки прода, а после случая,
       * который иначе не лечится.
       *
       * Канал до управляемой базы Timeweb с машины разработчика
       * пробивается примерно одним подключением из трёх: остальные
       * молча отваливаются по таймауту. Пока это считалось «база
       * недоступна», ответ был прост — повторять команду. Но повтор
       * помогает только если лотерея разыгрывается один раз за прогон,
       * а она разыгрывается на каждом новом соединении пула: Payload
       * поднялся, а первый же запрос умер, потому что пул открывал
       * под него второе соединение. И даже одного клиента мало —
       * простояв десять секунд без дела, он закрывается сам, и следующий
       * запрос снова тянет билет.
       *
       * Отсюда `DATABASE_POOL_MAX=1` и `DATABASE_IDLE_TIMEOUT_MS=0`
       * для разовых прогонов против прод-базы: одно пробившееся
       * соединение держится до конца работы скрипта.
       *
       * Это заплатка поверх нездоровой сети, а не решение: чинить надо
       * канал, и разговор об этом — с провайдером. Но заплатка честная —
       * она ничего не скрывает, обрыв по-прежнему доходит до лога.
       */
      max: Number(process.env.DATABASE_POOL_MAX) || undefined,
      idleTimeoutMillis:
        process.env.DATABASE_IDLE_TIMEOUT_MS === undefined
          ? undefined
          : Number(process.env.DATABASE_IDLE_TIMEOUT_MS),
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
