import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Настройки автоматических проверок.
 *
 * Таблица хранит **отклонения** от реестра, а не копию списка проверок:
 * строка появляется только там, где Ассоциация что-то изменила. Поэтому
 * ни начального наполнения, ни связи с реестром на уровне базы здесь нет —
 * иначе новая проверка не работала бы до тех пор, пока кто-нибудь
 * не добавит ей строку.
 *
 * `code` — обычный `varchar`, а не перечисление. Это решение, а не
 * упрощение: `select` в Payload разворачивается в тип-перечисление
 * PostgreSQL, и тогда каждая новая проверка требовала бы миграции.
 * Проверки заводятся кодом, и привязывать их появление к походу в базу
 * нельзя. От опечатки защищает хук коллекции, сверяющий код с реестром.
 *
 * Уникальный индекс по `code` — правило, а не ускорение: две настройки
 * одной проверки означали бы, что действующая выбирается случайно.
 *
 * Написана руками по образцу `20260817_133000_access_grants`:
 * `migrate:create` в этом проекте подгребает в диф всё, что появилось
 * после последнего снимка схемы. Разбор — шапка той миграции.
 *
 * Опорный объект для `npm run migrate:baseline` — таблица `check_settings`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_check_settings_severity" AS ENUM('fix', 'note');

  CREATE TABLE "check_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"severity" "public"."enum_check_settings_severity",
  	"note" varchar,
  	"updated_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "check_settings" ADD CONSTRAINT "check_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  CREATE UNIQUE INDEX "check_settings_code_idx" ON "check_settings" USING btree ("code");
  CREATE INDEX "check_settings_updated_by_idx" ON "check_settings" USING btree ("updated_by_id");
  CREATE INDEX "check_settings_updated_at_idx" ON "check_settings" USING btree ("updated_at");
  CREATE INDEX "check_settings_created_at_idx" ON "check_settings" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "check_settings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_check_settings_fk" FOREIGN KEY ("check_settings_id") REFERENCES "public"."check_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_check_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("check_settings_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload_locked_documents_rels_check_settings_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_check_settings_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "check_settings_id";

  DROP TABLE IF EXISTS "check_settings" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_check_settings_severity";`)
}
