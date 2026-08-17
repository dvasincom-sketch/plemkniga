import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Области в самом запросе доступа.
 *
 * До этого заявитель называл только цель, а области предлагались владельцу
 * по ней. Теперь он может сказать прямо, какие разделы ему нужны.
 *
 * Написана руками по образцу `20260817_133000_access_grants`: `migrate:create`
 * в этом проекте подгребает в диф всё, что появилось после последнего снимка
 * схемы (`20260816_211410`), а снимков у поздних миграций нет. Разбор — шапка
 * той миграции.
 *
 * Поле `hasMany` Payload хранит отдельной таблицей `<коллекция>_<поле>`
 * с порядком и ссылкой на родителя — отсюда `access_requests_scopes`.
 *
 * Опорный объект для `npm run migrate:baseline` — таблица
 * `access_requests_scopes`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_access_requests_scopes" AS ENUM('origin', 'production', 'evaluation', 'documents');

  CREATE TABLE "access_requests_scopes" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_access_requests_scopes",
  	"id" serial PRIMARY KEY NOT NULL
  );

  ALTER TABLE "access_requests_scopes" ADD CONSTRAINT "access_requests_scopes_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."access_requests"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "access_requests_scopes_order_idx" ON "access_requests_scopes" USING btree ("order");
  CREATE INDEX "access_requests_scopes_parent_idx" ON "access_requests_scopes" USING btree ("parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "access_requests_scopes" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_access_requests_scopes";`)
}
