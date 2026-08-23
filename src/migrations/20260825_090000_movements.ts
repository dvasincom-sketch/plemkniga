import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Перемещения животных, карточки хозяйств вне книги и штамп владельца.
 *
 * Три части одного изменения, и разделить их нельзя: продажа не работает
 * без покупателя, покупатель не заводится без признака «книгу не ведёт»,
 * а доступ продавца к собственной истории не выражается ничем, кроме
 * штампа на строках. Разбор — `src/lib/movements.ts` и `stampOwnerOrg`
 * в `src/access/guards.ts`.
 *
 * ## Почему `owner_org_id` заполняется нынешним владельцем
 *
 * Строгий ответ на вопрос «чьей была эта дойка в 2023 году» дало бы
 * восстановление истории владения — которой до сегодняшнего дня
 * не существовало. Значит взять его неоткуда, и притворяться, что взяли,
 * хуже, чем сказать прямо: до первой записи о перемещении вся история
 * числится за нынешним владельцем. Это ровно то состояние, в котором
 * книга и была всё это время: одно животное — одно хозяйство.
 *
 * ## Почему `name_key` остаётся пустым
 *
 * Ключ названия считает функция `orgNameKey`, и правила у неё непростые:
 * кавычки, организационные формы, регистр. Повторить их на SQL можно,
 * но тогда одно и то же будет посчитано двумя способами, и рано или поздно
 * они разойдутся — а расхождение здесь означает необнаруженный дубль.
 * Поэтому колонка создаётся пустой, а заполняет её `npm run backfill:name-key`
 * той же функцией, что и хук коллекции.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_movements_kind" AS ENUM('sale', 'lease', 'transfer', 'import', 'cull', 'death');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_organizations_presence" AS ENUM('registered', 'referenced');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  // ------------------------- справочник хозяйств ------------------------- //
  await db.execute(sql`
  ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "name_key" varchar;
  ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "presence" "enum_organizations_presence" DEFAULT 'registered';
  ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "referenced_by_id" integer;
  ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "merged_into_id" integer;

  DO $$ BEGIN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_referenced_by_id_fk"
      FOREIGN KEY ("referenced_by_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "organizations" ADD CONSTRAINT "organizations_merged_into_id_fk"
      FOREIGN KEY ("merged_into_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "organizations_name_key_idx" ON "organizations" USING btree ("name_key");
  CREATE INDEX IF NOT EXISTS "organizations_presence_idx" ON "organizations" USING btree ("presence");
  CREATE INDEX IF NOT EXISTS "organizations_merged_into_idx" ON "organizations" USING btree ("merged_into_id");`)

  // ----------------------------- перемещения ----------------------------- //
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "movements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"kind" "enum_movements_kind" NOT NULL,
  	"from_id" integer,
  	"to_id" integer,
  	"from_herd_id" integer,
  	"to_herd_id" integer,
  	"basis" varchar,
  	"note" varchar,
  	"applied" boolean DEFAULT true,
  	"recorded_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "movements" ADD CONSTRAINT "movements_animal_id_fk"
      FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "movements" ADD CONSTRAINT "movements_from_id_fk"
      FOREIGN KEY ("from_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "movements" ADD CONSTRAINT "movements_to_id_fk"
      FOREIGN KEY ("to_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "movements" ADD CONSTRAINT "movements_from_herd_id_fk"
      FOREIGN KEY ("from_herd_id") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "movements" ADD CONSTRAINT "movements_to_herd_id_fk"
      FOREIGN KEY ("to_herd_id") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "movements" ADD CONSTRAINT "movements_recorded_by_id_fk"
      FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "movements_animal_idx" ON "movements" USING btree ("animal_id");
  CREATE INDEX IF NOT EXISTS "movements_date_idx" ON "movements" USING btree ("date");
  CREATE INDEX IF NOT EXISTS "movements_from_idx" ON "movements" USING btree ("from_id");
  CREATE INDEX IF NOT EXISTS "movements_to_idx" ON "movements" USING btree ("to_id");
  CREATE INDEX IF NOT EXISTS "movements_animal_date_idx" ON "movements" USING btree ("animal_id","date");
  CREATE INDEX IF NOT EXISTS "movements_updated_at_idx" ON "movements" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "movements_created_at_idx" ON "movements" USING btree ("created_at");`)

  // ------------------------ прежние владельцы ---------------------------- //
  /*
   * Первая связь «многие ко многим» у животных, поэтому таблицы `animals_rels`
   * до сих пор не было. Payload заводит её сам при синхронизации схемы,
   * но на проде схему строят миграции — значит она должна появиться здесь.
   */
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "animals_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"organizations_id" integer
  );

  DO $$ BEGIN
    ALTER TABLE "animals_rels" ADD CONSTRAINT "animals_rels_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "animals_rels" ADD CONSTRAINT "animals_rels_organizations_fk"
      FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "animals_rels_order_idx" ON "animals_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "animals_rels_parent_idx" ON "animals_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "animals_rels_path_idx" ON "animals_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "animals_rels_organizations_id_idx" ON "animals_rels" USING btree ("organizations_id");`)

  // --------------------- штамп владельца на истории ---------------------- //
  const stamped = [
    'events',
    'calvings',
    'inseminations',
    'milk_tests',
    'health_events',
    'animal_exteriors',
    'animal_evaluations',
    'animal_revisions',
  ]

  for (const table of stamped) {
    await db.execute(sql.raw(`
      ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "owner_org_id" integer;

      DO $$ BEGIN
        ALTER TABLE "${table}" ADD CONSTRAINT "${table}_owner_org_id_fk"
          FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE INDEX IF NOT EXISTS "${table}_owner_org_idx" ON "${table}" USING btree ("owner_org_id");

      UPDATE "${table}" t
         SET "owner_org_id" = a."owner_id"
        FROM "animals" a
       WHERE a."id" = t."animal_id" AND t."owner_org_id" IS NULL;
    `))
  }

  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "movements_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_movements_fk"
      FOREIGN KEY ("movements_id") REFERENCES "public"."movements"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_movements_id_idx"
    ON "payload_locked_documents_rels" USING btree ("movements_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const stamped = [
    'events',
    'calvings',
    'inseminations',
    'milk_tests',
    'health_events',
    'animal_exteriors',
    'animal_evaluations',
    'animal_revisions',
  ]

  for (const table of stamped) {
    await db.execute(sql.raw(`
      ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_owner_org_id_fk";
      DROP INDEX IF EXISTS "${table}_owner_org_idx";
      ALTER TABLE "${table}" DROP COLUMN IF EXISTS "owner_org_id";
    `))
  }

  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_movements_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_movements_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "movements_id";

  DROP TABLE IF EXISTS "animals_rels" CASCADE;
  DROP TABLE IF EXISTS "movements" CASCADE;

  ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_referenced_by_id_fk";
  ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "organizations_merged_into_id_fk";
  DROP INDEX IF EXISTS "organizations_name_key_idx";
  DROP INDEX IF EXISTS "organizations_presence_idx";
  DROP INDEX IF EXISTS "organizations_merged_into_idx";
  ALTER TABLE "organizations" DROP COLUMN IF EXISTS "name_key";
  ALTER TABLE "organizations" DROP COLUMN IF EXISTS "presence";
  ALTER TABLE "organizations" DROP COLUMN IF EXISTS "referenced_by_id";
  ALTER TABLE "organizations" DROP COLUMN IF EXISTS "merged_into_id";

  DROP TYPE IF EXISTS "public"."enum_movements_kind";
  DROP TYPE IF EXISTS "public"."enum_organizations_presence";`)
}
