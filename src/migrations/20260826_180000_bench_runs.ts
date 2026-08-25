import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Замеры производительности, снятые на этой машине.
 *
 * ## Почему `jsonb`, а не колонки под каждый показатель
 *
 * Строки замера — снимок отчёта, а не сущность предметной области:
 * по ним не отбирают, не сортируют и не соединяют их с другими
 * таблицами. Разложив снимок по колонкам, мы завели бы вторую схему
 * отчёта рядом с той, что уже описана в коде, и они разошлись бы
 * при первом же новом сценарии — а старые записи молча лишились бы
 * половины смысла.
 *
 * ## Почему у метки уникальный индекс
 *
 * Два замера одной и той же среды — это не сравнение, а история,
 * а история здесь ни к чему: вкладка отвечает на вопрос «где быстрее».
 * Уникальность делает правило «повторный замер заменяет прежний»
 * свойством схемы, а не договорённостью в коде, которую однажды
 * обойдут другим путём.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "bench_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"measured_at" timestamp(3) with time zone NOT NULL,
  	"animals" numeric NOT NULL,
  	"runs" numeric NOT NULL,
  	"server" jsonb,
  	"rows" jsonb NOT NULL,
  	"notes" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "bench_runs_label_idx" ON "bench_runs" ("label");
  CREATE INDEX IF NOT EXISTS "bench_runs_updated_at_idx" ON "bench_runs" ("updated_at");`)

  /*
   * Связь со служебной таблицей блокировок админки. Без неё Payload
   * при первом открытии коллекции в /admin попробует дописать колонку
   * сам — а на проде схему правит только миграция.
   */
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels"
    ADD COLUMN IF NOT EXISTS "bench_runs_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels"
      ADD CONSTRAINT "payload_locked_documents_rels_bench_runs_fk"
      FOREIGN KEY ("bench_runs_id") REFERENCES "public"."bench_runs"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_bench_runs_id_idx"
    ON "payload_locked_documents_rels" ("bench_runs_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels"
    DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_bench_runs_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_bench_runs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "bench_runs_id";
  DROP TABLE IF EXISTS "bench_runs";`)
}
