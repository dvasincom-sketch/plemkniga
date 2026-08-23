import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Роли внутри хозяйства, приглашения и блокировка человека.
 *
 * ## Почему всем существующим ставится «руководитель»
 *
 * До сих пор у хозяйства была одна роль на всех: каждый сотрудник мог всё.
 * Раздать существующим пользователям роли по догадке нельзя — система
 * никогда не спрашивала, кто из них руководитель, а зоотехник. Любая
 * догадка означала бы, что наутро половина хозяйств обнаружит своих
 * людей разжалованными без объяснения.
 *
 * Поэтому миграция ничего не отнимает: все остаются с прежними
 * возможностями, а разделение вводит само хозяйство — когда ему это
 * понадобится и по своим основаниям. Ровно то же соображение стоит
 * за `DEFAULT 'head'` у колонки: пользователь, заведённый до того,
 * как хозяйство назначит роли, не должен оказаться бесправным.
 *
 * ## Почему блокировка тремя колонками, а не одним флагом
 *
 * Флаг отвечает «да», и на этом разговор кончается. Заблокированному
 * нужно сказать, почему он не может войти, — иначе он идёт звонить
 * и тратит чужое время вместо того, чтобы исправить причину.
 * Ассоциации при разборе спора нужно знать, кто именно заблокировал
 * и когда. Три колонки отвечают на все три вопроса.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_users_org_role" AS ENUM('head', 'operator', 'viewer');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_invitations_org_role" AS ENUM('head', 'operator', 'viewer');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "org_role" "enum_users_org_role" DEFAULT 'head';
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_by_id" integer;
  ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "block_reason" varchar;

  UPDATE "users" SET "org_role" = 'head' WHERE "org_role" IS NULL;

  DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_blocked_by_id_fk"
      FOREIGN KEY ("blocked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "users_org_role_idx" ON "users" USING btree ("org_role");
  CREATE INDEX IF NOT EXISTS "users_blocked_at_idx" ON "users" USING btree ("blocked_at");`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "invitations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"org_role" "enum_invitations_org_role" DEFAULT 'operator' NOT NULL,
  	"organization_id" integer NOT NULL,
  	"token" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"accepted_at" timestamp(3) with time zone,
  	"revoked_at" timestamp(3) with time zone,
  	"invited_by_id" integer,
  	"accepted_by_id" integer,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DO $$ BEGIN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fk"
      FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_id_fk"
      FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_idx" ON "invitations" USING btree ("token");
  CREATE INDEX IF NOT EXISTS "invitations_email_idx" ON "invitations" USING btree ("email");
  CREATE INDEX IF NOT EXISTS "invitations_organization_idx" ON "invitations" USING btree ("organization_id");
  CREATE INDEX IF NOT EXISTS "invitations_expires_at_idx" ON "invitations" USING btree ("expires_at");
  CREATE INDEX IF NOT EXISTS "invitations_updated_at_idx" ON "invitations" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "invitations_created_at_idx" ON "invitations" USING btree ("created_at");`)

  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "invitations_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_invitations_fk"
      FOREIGN KEY ("invitations_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_invitations_id_idx"
    ON "payload_locked_documents_rels" USING btree ("invitations_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_invitations_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_invitations_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "invitations_id";

  DROP TABLE IF EXISTS "invitations" CASCADE;

  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_blocked_by_id_fk";
  DROP INDEX IF EXISTS "users_org_role_idx";
  DROP INDEX IF EXISTS "users_blocked_at_idx";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "org_role";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "blocked_at";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "blocked_by_id";
  ALTER TABLE "users" DROP COLUMN IF EXISTS "block_reason";

  DROP TYPE IF EXISTS "public"."enum_users_org_role";
  DROP TYPE IF EXISTS "public"."enum_invitations_org_role";`)
}
