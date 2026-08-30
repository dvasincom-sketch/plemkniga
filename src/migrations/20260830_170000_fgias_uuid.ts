import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Ключ ФГИАС ПР во всех справочниках.
 *
 * ## Зачем
 *
 * Двадцать шаблонов ФГИАС заполняются ключами, а не словами: порода —
 * это `1bd6b3f1-648a-…`, а не «Голштинская». Без этой колонки выгрузка
 * в государственный реестр безадресна.
 *
 * ## Почему всем пятнадцати, а не семи сопоставленным
 *
 * Справочники собираются одной фабрикой `dictionary()`, и поле заведено
 * в её общих полях — иначе пришлось бы разводить фабрику на две, «с ключом»
 * и «без», ради разницы, которой завтра не будет: сегодня пары в реестре
 * нет у восьми справочников, но реестр пополняется, и первый же новый
 * потребовал бы миграции и правки фабрики.
 *
 * Пустая колонка в справочнике на два десятка строк не стоит ничего.
 * Развилка в фабрике стоила бы того, что о ней надо помнить.
 *
 * ## Индекс
 *
 * По ключу спрашивают в обратную сторону — «чей это uuid» при разборе
 * файла ФГИАС, — и спрашивают на каждую строку файла. Пятнадцать индексов
 * по короткой колонке дешевле одного перебора десятитысячного справочника
 * линий.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "breeds" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "breeds_fgias_uuid_idx" ON "breeds" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "lines" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "lines_fgias_uuid_idx" ON "lines" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "breeding_categories" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "breeding_categories_fgias_uuid_idx" ON "breeding_categories" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "breeding_classes" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "breeding_classes_fgias_uuid_idx" ON "breeding_classes" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "animal_purposes" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animal_purposes_fgias_uuid_idx" ON "animal_purposes" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "disposal_reasons" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "disposal_reasons_fgias_uuid_idx" ON "disposal_reasons" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "coat_colors" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "coat_colors_fgias_uuid_idx" ON "coat_colors" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "blood_groups" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "blood_groups_fgias_uuid_idx" ON "blood_groups" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "reproduction_methods" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "reproduction_methods_fgias_uuid_idx" ON "reproduction_methods" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "semen_types" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "semen_types_fgias_uuid_idx" ON "semen_types" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "insemination_results" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "insemination_results_fgias_uuid_idx" ON "insemination_results" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "dna_test_types" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "dna_test_types_fgias_uuid_idx" ON "dna_test_types" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "haplotype_types" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "haplotype_types_fgias_uuid_idx" ON "haplotype_types" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "health_event_types" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "health_event_types_fgias_uuid_idx" ON "health_event_types" USING btree ("fgias_uuid");`)

  await db.execute(sql`
  ALTER TABLE "technicians" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "technicians_fgias_uuid_idx" ON "technicians" USING btree ("fgias_uuid");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "breeds_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "breeds" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "lines_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "lines" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "breeding_categories_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "breeding_categories" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "breeding_classes_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "breeding_classes" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "animal_purposes_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "animal_purposes" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "disposal_reasons_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "disposal_reasons" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "coat_colors_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "coat_colors" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "blood_groups_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "blood_groups" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "reproduction_methods_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "reproduction_methods" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "semen_types_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "semen_types" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "insemination_results_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "insemination_results" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "dna_test_types_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "dna_test_types" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "haplotype_types_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "haplotype_types" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "health_event_types_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "health_event_types" DROP COLUMN IF EXISTS "fgias_uuid";`)

  await db.execute(sql`DROP INDEX IF EXISTS "technicians_fgias_uuid_idx";`)
  await db.execute(sql`ALTER TABLE "technicians" DROP COLUMN IF EXISTS "fgias_uuid";`)
}
