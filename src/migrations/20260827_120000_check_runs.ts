import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Прогоны проверок: что проверялось, когда и с каким исходом.
 *
 * ## Почему `jsonb` под результаты
 *
 * Число проб меняется: сегодня четыре, завтра шесть. Колонки под каждую
 * означали бы миграцию на всякое добавление, а находки внутри пробы —
 * список строк переменной длины, которому в колонке места нет. Тот же
 * довод, что у замеров: снимок отчёта — не сущность предметной области,
 * по нему не отбирают и не соединяют.
 *
 * ## Почему у метки уникальный индекс
 *
 * Одна запись на среду: повторный прогон заменяет прежний. Смотрят сюда
 * за нынешним состоянием, а не за лентой одинаковых зелёных ночей.
 * Уникальность делает это свойством схемы, а не договорённостью в коде.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "check_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"ran_at" timestamp(3) with time zone NOT NULL,
  	"ok" boolean,
  	"failed" numeric,
  	"total" numeric,
  	"ms" numeric,
  	"version" varchar,
  	"results" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "check_runs_label_idx" ON "check_runs" ("label");
  CREATE INDEX IF NOT EXISTS "check_runs_updated_at_idx" ON "check_runs" ("updated_at");`)

  /*
   * Связь со служебной таблицей блокировок админки. Без неё Payload
   * при первом открытии коллекции в /admin попробует дописать колонку
   * сам — а на проде схему правит только миграция.
   */
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels"
    ADD COLUMN IF NOT EXISTS "check_runs_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels"
      ADD CONSTRAINT "payload_locked_documents_rels_check_runs_fk"
      FOREIGN KEY ("check_runs_id") REFERENCES "public"."check_runs"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_check_runs_id_idx"
    ON "payload_locked_documents_rels" ("check_runs_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels"
    DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_check_runs_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_check_runs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "check_runs_id";
  DROP TABLE IF EXISTS "check_runs";`)
}
