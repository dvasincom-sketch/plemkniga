import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Ссылки на просмотр: показать записи тому, у кого нет учётной записи.
 *
 * Точечный доступ выдаётся хозяйству — тому, кто уже в книге. Покупателю,
 * ветеринару, оценщику, страховому агенту заводить организацию ради одного
 * просмотра абсурдно, а выгрузка в файле отдаёт данные навсегда и без следа.
 * Ссылка показывает названные записи названным объёмом до названной даты.
 *
 * ## Почему `expires_at` объявлен NOT NULL
 *
 * У точечного доступа срок можно не ставить: на другом конце известное
 * хозяйство, которое отвечает за своих людей. Здесь на другом конце
 * неизвестно кто, и бессрочная ссылка — это выгрузка, притворяющаяся
 * доступом: отправленная однажды, она живёт в чужой переписке годами.
 * Ограничение стоит в базе, а не только в форме: форму обойти можно,
 * колонку — нет.
 *
 * ## Почему `token` уникален на уровне базы
 *
 * Совпадение двух случайных 256-битных значений невозможно на практике,
 * и именно поэтому ограничение дешёвое. Дорогой была бы ошибка: две
 * ссылки с одним токеном означают, что по одному адресу открываются
 * записи двух разных хозяйств.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_share_links_scopes" AS ENUM('origin', 'production', 'evaluation', 'documents');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "share_links" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"token" varchar NOT NULL,
  	"owner_id" integer NOT NULL,
  	"created_by_id" integer,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"revoked_at" timestamp(3) with time zone,
  	"note" varchar,
  	"opens" numeric DEFAULT 0,
  	"last_opened_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "share_links_scopes" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_share_links_scopes",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "share_links_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"animals_id" integer
  );`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "share_links" ADD CONSTRAINT "share_links_owner_id_organizations_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_id_users_id_fk"
      FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "share_links_scopes" ADD CONSTRAINT "share_links_scopes_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "share_links_rels" ADD CONSTRAINT "share_links_rels_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "share_links_rels" ADD CONSTRAINT "share_links_rels_animals_fk"
      FOREIGN KEY ("animals_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "share_links_token_idx" ON "share_links" USING btree ("token");
  CREATE INDEX IF NOT EXISTS "share_links_owner_idx" ON "share_links" USING btree ("owner_id");
  CREATE INDEX IF NOT EXISTS "share_links_created_by_idx" ON "share_links" USING btree ("created_by_id");
  CREATE INDEX IF NOT EXISTS "share_links_expires_at_idx" ON "share_links" USING btree ("expires_at");
  CREATE INDEX IF NOT EXISTS "share_links_updated_at_idx" ON "share_links" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "share_links_created_at_idx" ON "share_links" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "share_links_scopes_order_idx" ON "share_links_scopes" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "share_links_scopes_parent_idx" ON "share_links_scopes" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "share_links_rels_order_idx" ON "share_links_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "share_links_rels_parent_idx" ON "share_links_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "share_links_rels_path_idx" ON "share_links_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "share_links_rels_animals_id_idx" ON "share_links_rels" USING btree ("animals_id");`)

  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "share_links_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_share_links_fk"
      FOREIGN KEY ("share_links_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_share_links_id_idx"
    ON "payload_locked_documents_rels" USING btree ("share_links_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_share_links_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_share_links_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "share_links_id";

  DROP TABLE IF EXISTS "share_links_rels" CASCADE;
  DROP TABLE IF EXISTS "share_links_scopes" CASCADE;
  DROP TABLE IF EXISTS "share_links" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_share_links_scopes";`)
}
