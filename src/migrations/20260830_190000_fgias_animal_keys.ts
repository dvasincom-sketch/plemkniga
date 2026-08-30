import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Номера, которые животному выдаёт государственный реестр.
 *
 * ## Зачем
 *
 * Все шаблоны ФГИАС, кроме «Основных сведений», называют животное
 * «Базовым номером ФГИАС ПР» — uuid, который выдаёт реестр. Своего
 * у нас для этого не было ничего: колонка `uuid` заполняется
 * `randomUUID()` при создании карточки и к реестру отношения не имеет,
 * хотя подписана была «GUID (ФГИАС ПР)».
 *
 * Пока этой колонки нет, выгрузка не может отдать ни лактации,
 * ни родословную: подставить туда свой ключ — значит завести в реестре
 * второе животное рядом с настоящим.
 *
 * ## Почему УНСМ здесь же, а не отдельно
 *
 * УНСМ — номер бирки или чипа, а не животного, и реестр требует его
 * рядом с УНЖ, различая их. Он приезжает тем же обратным файлом
 * и теми же руками, что и базовый номер, поэтому и лежит в той же группе.
 * Держать его среди `alt_ids` было бы ровнее по смыслу, но тогда две
 * половины одной операции обновления оказались бы в разных местах
 * карточки.
 *
 * ## Индексы
 *
 * По базовому номеру спрашивают в обратную сторону — «чьё это животное»
 * при разборе обратного файла, — и спрашивают на каждую его строку.
 * По УНСМ ищут дубликаты: реестр считает двух животных одним, если
 * совпал номер средства маркирования, и находить такие пары надо у себя,
 * а не узнавать о них отказом файла.
 *
 * `registration_uuid` без индекса намеренно: по нему не ищут, его
 * показывают.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "fgias_base_uuid" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "fgias_registration_uuid" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "fgias_unsm" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "fgias_synced_at" timestamp(3) with time zone;`)

  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animals_fgias_base_uuid_idx"
    ON "animals" USING btree ("fgias_base_uuid");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animals_fgias_unsm_idx"
    ON "animals" USING btree ("fgias_unsm");`)
}

/**
 * Откат убирает колонки вместе с номерами реестра.
 *
 * Потеря невосстановимая из книги, но восстановимая из реестра: обратный
 * файл можно запросить заново и разложить тем же `import:fgias-return`.
 * Это тот редкий случай, когда данные лежат не только у нас.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "animals_fgias_base_uuid_idx";`)
  await db.execute(sql`DROP INDEX IF EXISTS "animals_fgias_unsm_idx";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "fgias_base_uuid";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "fgias_registration_uuid";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "fgias_unsm";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "fgias_synced_at";`)
}
