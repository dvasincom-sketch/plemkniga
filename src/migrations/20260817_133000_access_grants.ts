import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Точечный доступ: гранты и журнал просмотров.
 *
 * SQL взят из того, что сгенерировал `payload migrate:create`, но оставлены
 * только выражения про `access_grants` и `access_views`. Полный вывод команды
 * оказался непригоден: он подгрёб ещё пять миграций, которые давно применены
 * на проде, и там упал бы на первом `CREATE TYPE`.
 *
 * Причина — не в базе. У пяти последних миграций рядом нет снимка схемы
 * (`.json`): их писали руками. `migrate:create` считает разницу от последнего
 * снимка, а последний снимок — `20260816_211410`, поэтому в диф попадает всё,
 * что появилось после него. Пока снимки не восстановлены, каждую новую
 * миграцию приходится вычитывать глазами.
 *
 * Опорный объект для `npm run migrate:baseline` — таблица `access_grants`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_access_grants_scopes" AS ENUM('origin', 'production', 'evaluation', 'documents');
  CREATE TYPE "public"."enum_access_views_scopes" AS ENUM('origin', 'production', 'evaluation', 'documents');

  CREATE TABLE "access_grants" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"grantee_id" integer NOT NULL,
  	"animal_id" integer,
  	"expires_at" timestamp(3) with time zone,
  	"issued_by_id" integer,
  	"revoked_at" timestamp(3) with time zone,
  	"revoked_by_id" integer,
  	"request_id" integer,
  	"note" varchar,
  	"last_seen_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "access_grants_scopes" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_access_grants_scopes",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "access_views" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"grant_id" integer NOT NULL,
  	"animal_id" integer NOT NULL,
  	"viewer_id" integer,
  	"viewer_org_id" integer,
  	"owner_id" integer NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "access_views_scopes" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_access_views_scopes",
  	"id" serial PRIMARY KEY NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "access_grants_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "access_views_id" integer;

  ALTER TABLE "access_grants_scopes" ADD CONSTRAINT "access_grants_scopes_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."access_grants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_owner_id_organizations_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_grantee_id_organizations_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_revoked_by_id_users_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_request_id_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."access_requests"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "access_views_scopes" ADD CONSTRAINT "access_views_scopes_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."access_views"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "access_views" ADD CONSTRAINT "access_views_grant_id_access_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."access_grants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_views" ADD CONSTRAINT "access_views_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_views" ADD CONSTRAINT "access_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_views" ADD CONSTRAINT "access_views_viewer_org_id_organizations_id_fk" FOREIGN KEY ("viewer_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_views" ADD CONSTRAINT "access_views_owner_id_organizations_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;

  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_access_grants_fk" FOREIGN KEY ("access_grants_id") REFERENCES "public"."access_grants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_access_views_fk" FOREIGN KEY ("access_views_id") REFERENCES "public"."access_views"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "access_grants_scopes_order_idx" ON "access_grants_scopes" USING btree ("order");
  CREATE INDEX "access_grants_scopes_parent_idx" ON "access_grants_scopes" USING btree ("parent_id");
  CREATE INDEX "access_grants_owner_idx" ON "access_grants" USING btree ("owner_id");
  CREATE INDEX "access_grants_grantee_idx" ON "access_grants" USING btree ("grantee_id");
  CREATE INDEX "access_grants_animal_idx" ON "access_grants" USING btree ("animal_id");
  CREATE INDEX "access_grants_issued_by_idx" ON "access_grants" USING btree ("issued_by_id");
  CREATE INDEX "access_grants_revoked_at_idx" ON "access_grants" USING btree ("revoked_at");
  CREATE INDEX "access_grants_revoked_by_idx" ON "access_grants" USING btree ("revoked_by_id");
  CREATE INDEX "access_grants_request_idx" ON "access_grants" USING btree ("request_id");
  CREATE INDEX "access_grants_updated_at_idx" ON "access_grants" USING btree ("updated_at");
  CREATE INDEX "access_grants_created_at_idx" ON "access_grants" USING btree ("created_at");

  CREATE INDEX "grantee_revokedAt_idx" ON "access_grants" USING btree ("grantee_id","revoked_at");
  CREATE INDEX "owner_revokedAt_idx" ON "access_grants" USING btree ("owner_id","revoked_at");
  CREATE INDEX "grantee_animal_idx" ON "access_grants" USING btree ("grantee_id","animal_id");

  CREATE INDEX "access_views_scopes_order_idx" ON "access_views_scopes" USING btree ("order");
  CREATE INDEX "access_views_scopes_parent_idx" ON "access_views_scopes" USING btree ("parent_id");
  CREATE INDEX "access_views_grant_idx" ON "access_views" USING btree ("grant_id");
  CREATE INDEX "access_views_animal_idx" ON "access_views" USING btree ("animal_id");
  CREATE INDEX "access_views_viewer_idx" ON "access_views" USING btree ("viewer_id");
  CREATE INDEX "access_views_viewer_org_idx" ON "access_views" USING btree ("viewer_org_id");
  CREATE INDEX "access_views_owner_idx" ON "access_views" USING btree ("owner_id");
  CREATE INDEX "access_views_at_idx" ON "access_views" USING btree ("at");
  CREATE INDEX "access_views_updated_at_idx" ON "access_views" USING btree ("updated_at");
  CREATE INDEX "access_views_created_at_idx" ON "access_views" USING btree ("created_at");

  CREATE INDEX "owner_at_idx" ON "access_views" USING btree ("owner_id","at");
  CREATE INDEX "grant_at_idx" ON "access_views" USING btree ("grant_id","at");
  CREATE INDEX "grant_animal_viewer_at_idx" ON "access_views" USING btree ("grant_id","animal_id","viewer_id","at");

  CREATE INDEX "payload_locked_documents_rels_access_grants_id_idx" ON "payload_locked_documents_rels" USING btree ("access_grants_id");
  CREATE INDEX "payload_locked_documents_rels_access_views_id_idx" ON "payload_locked_documents_rels" USING btree ("access_views_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_access_grants_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_access_views_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_access_grants_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_access_views_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "access_grants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "access_views_id";

  DROP TABLE IF EXISTS "access_views_scopes" CASCADE;
  DROP TABLE IF EXISTS "access_views" CASCADE;
  DROP TABLE IF EXISTS "access_grants_scopes" CASCADE;
  DROP TABLE IF EXISTS "access_grants" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_access_views_scopes";
  DROP TYPE IF EXISTS "public"."enum_access_grants_scopes";`)
}
