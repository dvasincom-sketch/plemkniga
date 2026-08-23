import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Сводный журнал операций (ТЗ, требование №19).
 *
 * ## Почему у `subject_id` нет внешнего ключа
 *
 * Предмет операции — животное, пользователь, хозяйство, документ,
 * ссылка, пакет, заявка, перемещение: девять разных таблиц. Связь
 * Payload завёл бы под это отдельную таблицу с девятью колонками —
 * на журнале, который будет расти быстрее всех остальных вместе взятых.
 *
 * Дороже другое. Внешний ключ означает поведение при удалении, и любое
 * из них здесь неверно: `cascade` уносил бы записи журнала вместе
 * с предметом, `set null` стирал бы, о чём была запись. Журнал обязан
 * пережить свой предмет — иначе он не ответит на единственный вопрос,
 * ради которого его и заводят: что было с этой записью до того,
 * как её не стало.
 *
 * ## Почему два составных индекса, а не один по дате
 *
 * Журнал читают двумя способами и никогда — целиком: хозяйство смотрит
 * свою ленту, Ассоциация — ленту по виду действия. Индекс только
 * по дате заставлял бы оба запроса перебирать всю таблицу и отбрасывать
 * чужое, и чем дольше живёт система, тем дороже это обходится.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_operations_action" AS ENUM(
      'login', 'login-refused', 'member-invited', 'invite-revoked', 'member-joined',
      'role-changed', 'user-blocked', 'user-unblocked',
      'animal-created', 'animal-archived', 'animal-restored', 'animal-purged',
      'movement-recorded', 'submission-published',
      'share-created', 'share-revoked', 'grant-issued', 'grant-revoked',
      'verification-requested', 'verification-decided', 'document-issued',
      'membership-decided', 'directory-merged', 'directory-confirmed'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_operations_subject_type" AS ENUM(
      'animal', 'user', 'organization', 'document', 'share',
      'submission', 'verification', 'movement', 'none'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "operations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"action" "enum_operations_action" NOT NULL,
  	"actor_id" integer,
  	"actor_name" varchar,
  	"organization_id" integer,
  	"subject_type" "enum_operations_subject_type" DEFAULT 'none',
  	"subject_id" numeric,
  	"subject" varchar,
  	"summary" varchar,
  	"ip" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DO $$ BEGIN
    ALTER TABLE "operations" ADD CONSTRAINT "operations_actor_id_fk"
      FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "operations" ADD CONSTRAINT "operations_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "operations_at_idx" ON "operations" USING btree ("at");
  CREATE INDEX IF NOT EXISTS "operations_action_idx" ON "operations" USING btree ("action");
  CREATE INDEX IF NOT EXISTS "operations_actor_idx" ON "operations" USING btree ("actor_id");
  CREATE INDEX IF NOT EXISTS "operations_organization_idx" ON "operations" USING btree ("organization_id");
  CREATE INDEX IF NOT EXISTS "operations_org_at_idx" ON "operations" USING btree ("organization_id","at");
  CREATE INDEX IF NOT EXISTS "operations_action_at_idx" ON "operations" USING btree ("action","at");
  CREATE INDEX IF NOT EXISTS "operations_updated_at_idx" ON "operations" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "operations_created_at_idx" ON "operations" USING btree ("created_at");`)

  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "operations_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_operations_fk"
      FOREIGN KEY ("operations_id") REFERENCES "public"."operations"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_operations_id_idx"
    ON "payload_locked_documents_rels" USING btree ("operations_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_operations_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_operations_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "operations_id";

  DROP TABLE IF EXISTS "operations" CASCADE;

  DROP TYPE IF EXISTS "public"."enum_operations_action";
  DROP TYPE IF EXISTS "public"."enum_operations_subject_type";`)
}
