import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Закрыть файлы: владелец и видимость у каждого.
 *
 * Коллекция `media` стояла с `read: anyone`, и это была не поблажка,
 * а дыра в самом дорогом месте. Payload отдаёт файлы по адресу
 * `/api/media/file/<имя>` и применяет к нему правило чтения коллекции;
 * при `anyone` оно не ограничивало ничего. А лежат там исходники
 * загрузок — CSV и XLSX со всем стадом построчно, — протоколы ДНК,
 * протоколы ошибок проверки и файлы выданных документов. Мы затягивали
 * доступ к карточке, дойкам и отёлам и оставили открытой дверь,
 * за которой те же данные лежат одним файлом.
 *
 * ## Как восстанавливается владелец
 *
 * Ни в одном файле не записано, чей он: до сих пор это было не нужно.
 * Владелец берётся из тех таблиц, что на файл ссылаются, — по одному
 * запросу на связь. Порядок важен: сперва самые надёжные источники
 * (пакет данных знает свою организацию точно), потом производные
 * (документ через животное).
 *
 * Файл, для которого владелец не нашёлся, остаётся ничьим — виден
 * только Ассоциации. Это осознанно: неизвестное происхождение файла
 * не повод отдавать его наугад.
 *
 * ## Почему публичными становятся только фотографии открытых карточек
 *
 * Из пяти видов файлов открытым должен быть один — фотография животного,
 * которое хозяйство само показало в книге. Дальше согласованность
 * держит хук карточки: закрыли карточку — закрылась и фотография.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_media_visibility" AS ENUM('private', 'public');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "owner_id" integer;
  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "visibility" "enum_media_visibility" DEFAULT 'private';

  UPDATE "media" SET "visibility" = 'private' WHERE "visibility" IS NULL;

  DO $$ BEGIN
    ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "media_owner_idx" ON "media" USING btree ("owner_id");
  CREATE INDEX IF NOT EXISTS "media_visibility_idx" ON "media" USING btree ("visibility");`)

  // -------------------------- владелец файла --------------------------- //
  await db.execute(sql`
  UPDATE "media" m
     SET "owner_id" = s."organization_id"
    FROM "data_submissions" s
   WHERE m."owner_id" IS NULL
     AND s."organization_id" IS NOT NULL
     AND (s."source_file_id" = m."id" OR s."review_error_protocol_id" = m."id");`)

  await db.execute(sql`
  UPDATE "media" m
     SET "owner_id" = a."owner_id"
    FROM "animals" a
   WHERE m."owner_id" IS NULL AND a."photo_id" = m."id";`)

  await db.execute(sql`
  UPDATE "media" m
     SET "owner_id" = a."owner_id"
    FROM "animals_dna_tests" t
    JOIN "animals" a ON a."id" = t."_parent_id"
   WHERE m."owner_id" IS NULL AND t."file_id" = m."id";`)

  await db.execute(sql`
  UPDATE "media" m
     SET "owner_id" = d."organization_id"
    FROM "documents" d
   WHERE m."owner_id" IS NULL AND d."file_id" = m."id" AND d."organization_id" IS NOT NULL;`)

  await db.execute(sql`
  UPDATE "media" m
     SET "owner_id" = a."owner_id"
    FROM "documents" d
    JOIN "animals" a ON a."id" = d."animal_id"
   WHERE m."owner_id" IS NULL AND d."file_id" = m."id";`)

  // ------------------ открыты только фото открытых карточек ------------- //
  await db.execute(sql`
  UPDATE "media" m
     SET "visibility" = 'public'
    FROM "animals" a
   WHERE a."photo_id" = m."id" AND a."public_visible" = true;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_owner_id_fk";
  DROP INDEX IF EXISTS "media_owner_idx";
  DROP INDEX IF EXISTS "media_visibility_idx";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "owner_id";
  ALTER TABLE "media" DROP COLUMN IF EXISTS "visibility";
  DROP TYPE IF EXISTS "public"."enum_media_visibility";`)
}
