import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Взвешивания и организация-оценщик.
 *
 * ## Живая масса
 *
 * Книга знала одну массу — телёнка при рождении, полем на отёле. Между тем
 * «Живая масса» отдельный шаблон ФГИАС ПР и ежемесячная отчётность:
 * хозяйство взвешивает постоянно, а положить это было некуда.
 *
 * Таблица повторяет контрольные дойки по составу и по индексам: животное,
 * дата, число, номер лактации. Совпадение не случайно — это одно и то же
 * по форме событие, и разводить их устройством значило бы завести две
 * разные дороги к одному.
 *
 * ## Признак взвешивания перечислением, а не справочником
 *
 * Список закрытый: его держит реестр, хозяйство пополнить не может.
 * Ключи реестра подставляются на выгрузке (`src/lib/weighing.ts`),
 * а в базе лежит наш код — иначе зоотехник видел бы в карточке
 * `0e02446c-…` там, где ждёт «При рождении».
 *
 * ## Организация-оценщик
 *
 * Пять шаблонов реестра из двадцати требуют наименование, ИНН и КПП
 * организации-оценщика, а у нас его не было нигде. Оценка без оценщика —
 * оценка, за которую никто не отвечает, и вопрос «кто так намерил»
 * задают раньше, чем «сколько намерили».
 *
 * Связью с организацией, а не текстом: ИНН и КПП тогда берутся оттуда
 * и не устаревают. Поле `assessor` (бонитёр из справочника техников)
 * остаётся рядом и не заменяется — это человек, а не организация,
 * и реестру нужен второй, а хозяйству оба.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_weighings_sign" AS ENUM(
      'birth', 'age', 'firstInsemination', 'averageLactation',
      'highestLactation', 'sale', 'disposal'
    );
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "weighings" (
    "id" serial PRIMARY KEY NOT NULL,
    "owner_org_id" integer,
    "animal_id" integer NOT NULL,
    "date" timestamp(3) with time zone NOT NULL,
    "weight" numeric NOT NULL,
    "sign" "enum_weighings_sign",
    "lactation_number" numeric,
    "note" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  /*
   * `DO $$` вокруг внешних ключей: `ADD CONSTRAINT` не понимает
   * `IF NOT EXISTS`, а миграция обязана переживать повторный прогон.
   */
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "weighings" ADD CONSTRAINT "weighings_animal_id_fk"
      FOREIGN KEY ("animal_id") REFERENCES "animals"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "weighings" ADD CONSTRAINT "weighings_owner_org_id_fk"
      FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  /*
   * Пара «животное + дата» — тот же индекс, что у доек, и по той же
   * причине: взвешивания всегда читают выборкой по животному
   * и показывают по времени.
   */
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "weighings_animal_idx" ON "weighings" USING btree ("animal_id");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "weighings_animal_date_idx"
    ON "weighings" USING btree ("animal_id","date");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "weighings_owner_org_idx"
    ON "weighings" USING btree ("owner_org_id");`)

  /* ---------------- Организация-оценщик у линейной оценки ---------------- */

  await db.execute(sql`
  ALTER TABLE "animal_exteriors" ADD COLUMN IF NOT EXISTS "assessor_org_id" integer;`)
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animal_exteriors" ADD CONSTRAINT "animal_exteriors_assessor_org_id_fk"
      FOREIGN KEY ("assessor_org_id") REFERENCES "organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animal_exteriors_assessor_org_idx"
    ON "animal_exteriors" USING btree ("assessor_org_id");`)
}

/**
 * Откат уносит взвешивания целиком: восстановить их неоткуда, кроме
 * ведомостей хозяйства на бумаге. Организация-оценщик снимается с оценок,
 * сами оценки остаются.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "weighings" CASCADE;`)
  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_weighings_sign";`)
  await db.execute(sql`DROP INDEX IF EXISTS "animal_exteriors_assessor_org_idx";`)
  await db.execute(sql`ALTER TABLE "animal_exteriors" DROP COLUMN IF EXISTS "assessor_org_id";`)
}
