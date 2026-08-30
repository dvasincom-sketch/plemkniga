import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Место рождения, тип породы, способ получения и даты определения.
 *
 * ## Что закрывает
 *
 * Шаблон «Основные сведения» — сорок шесть колонок, книга заполняла
 * восемнадцать. Здесь добавляются девять: страна, регион и район
 * рождения, хозяйство при рождении, тип породы, способ получения, даты
 * определения породы и назначения.
 *
 * ## Три территориальных справочника
 *
 * Реестр требует страну, регион и район ключами, а районов у него тысячи.
 * Список меняет государство, поэтому он загружается однажды
 * (`npm run sync:fgias-geo`) и живёт справочником — как порода и линия,
 * с той же колонкой `fgias_uuid`.
 *
 * Взять ключ на лету нельзя: выгрузка обязана работать там, где стоит
 * компьютер, а не там, где есть интернет.
 *
 * ## Регион организации не трогается
 *
 * У хозяйства своё поле `region` — выбор из наших констант, по нему ищут
 * и отчитываются. Здесь другой вопрос: где родилось животное. Свести их
 * в одно значило бы привязать поиск по книге к чужому справочнику ради
 * одной колонки выгрузки.
 *
 * ## Хозяйство при рождении — связь и текст
 *
 * Оно чаще всего не заведено в книге: чужое, зарубежное или закрытое.
 * Связь заполняется, когда оно есть, текст — когда нет. Тот же приём,
 * что у родословной: запись со слов документа лучше пустоты, а связь
 * лучше записи со слов.
 *
 * Это **не** «предыдущее хозяйство»: то меняется с каждой продажей,
 * а хозяйство рождения не меняется никогда — и после второй продажи
 * связь с ним теряется навсегда, если её не записать.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "countries" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "name" varchar NOT NULL,
    "sort_order" numeric DEFAULT 100,
    "description" varchar,
    "is_active" boolean DEFAULT true,
    "fgias_uuid" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "countries_fgias_uuid_idx" ON "countries" USING btree ("fgias_uuid");`)
  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "countries_code_idx" ON "countries" USING btree ("code");`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "regions" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "name" varchar NOT NULL,
    "sort_order" numeric DEFAULT 100,
    "description" varchar,
    "is_active" boolean DEFAULT true,
    "fgias_uuid" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "regions_fgias_uuid_idx" ON "regions" USING btree ("fgias_uuid");`)
  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "regions_code_idx" ON "regions" USING btree ("code");`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "districts" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "name" varchar NOT NULL,
    "sort_order" numeric DEFAULT 100,
    "description" varchar,
    "is_active" boolean DEFAULT true,
    "fgias_uuid" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "districts_fgias_uuid_idx" ON "districts" USING btree ("fgias_uuid");`)
  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "districts_code_idx" ON "districts" USING btree ("code");`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "breed_types" (
    "id" serial PRIMARY KEY NOT NULL,
    "code" varchar NOT NULL,
    "name" varchar NOT NULL,
    "sort_order" numeric DEFAULT 100,
    "description" varchar,
    "is_active" boolean DEFAULT true,
    "fgias_uuid" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "breed_types_fgias_uuid_idx" ON "breed_types" USING btree ("fgias_uuid");`)
  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "breed_types_code_idx" ON "breed_types" USING btree ("code");`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "breed_type_id" integer;`)
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "animals_breed_type_id_fk"
      FOREIGN KEY ("breed_type_id") REFERENCES "breed_types"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "birth_place_country_id" integer;`)
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "animals_birth_place_country_id_fk"
      FOREIGN KEY ("birth_place_country_id") REFERENCES "countries"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "birth_place_region_id" integer;`)
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "animals_birth_place_region_id_fk"
      FOREIGN KEY ("birth_place_region_id") REFERENCES "regions"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "birth_place_district_id" integer;`)
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "animals_birth_place_district_id_fk"
      FOREIGN KEY ("birth_place_district_id") REFERENCES "districts"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "birth_place_farm_id" integer;`)
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "animals_birth_place_farm_id_fk"
      FOREIGN KEY ("birth_place_farm_id") REFERENCES "organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "receipt_method_id" integer;`)
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "animals_receipt_method_id_fk"
      FOREIGN KEY ("receipt_method_id") REFERENCES "reproduction_methods"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "birth_place_farm_name" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "breed_date" timestamp(3) with time zone;`)
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "purpose_date" timestamp(3) with time zone;`)
}

/**
 * Откат уносит и колонки, и три справочника. Потеря восстановимая:
 * территориальные списки грузятся из открытого реестра заново одной
 * командой, а проставленные значения — нет.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "breed_type_id";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "birth_place_country_id";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "birth_place_region_id";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "birth_place_district_id";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "birth_place_farm_id";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "birth_place_farm_name";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "receipt_method_id";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "breed_date";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "purpose_date";`)
  await db.execute(sql`DROP TABLE IF EXISTS "countries" CASCADE;`)
  await db.execute(sql`DROP TABLE IF EXISTS "regions" CASCADE;`)
  await db.execute(sql`DROP TABLE IF EXISTS "districts" CASCADE;`)
  await db.execute(sql`DROP TABLE IF EXISTS "breed_types" CASCADE;`)
}
