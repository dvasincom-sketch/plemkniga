import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Срок хранения архива и реестр удалённых записей.
 *
 * ## Что меняется по существу
 *
 * Архив перестаёт быть вечным. Карточка, отправленная в архив, через
 * тридцать дней уходит из книги совсем — вместе с отёлами, дойками,
 * осеменениями и оценками. Взамен появляется `animal_removals`: строка
 * о том, что под таким-то номером была такая-то запись такого-то
 * хозяйства и когда её убрали.
 *
 * Прежнее правило («данные животных никогда не удаляются, только архив»,
 * ТЗ стр. 43) отменено сознательно, решением заказчика, — разбор
 * в docs/reshenya.md, №90. Оно решало настоящую задачу: по номеру строят
 * родословные, и запись, пропавшая бесследно, оставляет ссылки в пустоту.
 * Реестр закрывает ровно эту дыру — исчезает карточка, а не факт её
 * существования.
 *
 * ## Почему у архивации появилась своя дата
 *
 * Считать тридцать дней было не от чего. `updated_at` сдвигается от любой
 * правки — достаточно поменять кличку, и срок начинается заново.
 * `disposal_date` относится к животному (когда выбыло из стада), а не
 * к записи о нём: корову списали в прошлом году, а карточку в архив
 * отправили вчера.
 *
 * ## Почему прежним архивным записям дата проставляется датой миграции
 *
 * В базе уже лежат записи с `archived = true`, отправленные туда, когда
 * архив был вечным. Оставить им `archived_at` пустым и считать пустоту
 * нулём значило бы удалить их первым же запуском очистки — данные,
 * убранные с обещанием «архив навсегда», исчезли бы в день, когда
 * обещание отменили. Дата миграции даёт каждой из них полные тридцать
 * дней и время передумать.
 *
 * Обратной стороной надо сказать прямо: если между этой миграцией
 * и первым запуском очистки пройдёт больше месяца, все прежние архивные
 * записи станут кандидатами разом. Поэтому сценарий очистки по умолчанию
 * ничего не удаляет, а только показывает список.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "archived_at" timestamp(3) with time zone;
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "archived_by_id" integer;`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "animals_archived_by_id_users_id_fk"
      FOREIGN KEY ("archived_by_id") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animals_archived_at_idx" ON "animals" USING btree ("archived_at");
  CREATE INDEX IF NOT EXISTS "animals_archived_by_idx" ON "animals" USING btree ("archived_by_id");`)

  /*
   * Отсчёт для тех, кто попал в архив до появления срока, начинается
   * сегодня, а не задним числом. Разбор — в шапке файла.
   */
  await db.execute(sql`
  UPDATE "animals" SET "archived_at" = now()
   WHERE "archived" IS TRUE AND "archived_at" IS NULL;`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "animal_removals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ident_number" varchar NOT NULL,
  	"name" varchar,
  	"owner_id" integer,
  	"birth_date" timestamp(3) with time zone,
  	"archived_at" timestamp(3) with time zone,
  	"removed_at" timestamp(3) with time zone NOT NULL,
  	"archived_by_id" integer,
  	"archive_reason" varchar,
  	"removed_records" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animal_removals" ADD CONSTRAINT "animal_removals_owner_id_organizations_id_fk"
      FOREIGN KEY ("owner_id") REFERENCES "public"."organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "animal_removals" ADD CONSTRAINT "animal_removals_archived_by_id_users_id_fk"
      FOREIGN KEY ("archived_by_id") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animal_removals_ident_number_idx" ON "animal_removals" USING btree ("ident_number");
  CREATE INDEX IF NOT EXISTS "animal_removals_owner_idx" ON "animal_removals" USING btree ("owner_id");
  CREATE INDEX IF NOT EXISTS "animal_removals_archived_by_idx" ON "animal_removals" USING btree ("archived_by_id");
  CREATE INDEX IF NOT EXISTS "animal_removals_updated_at_idx" ON "animal_removals" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "animal_removals_created_at_idx" ON "animal_removals" USING btree ("created_at");`)

  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "animal_removals_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_animal_removals_fk"
      FOREIGN KEY ("animal_removals_id") REFERENCES "public"."animal_removals"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_animal_removals_id_idx"
    ON "payload_locked_documents_rels" USING btree ("animal_removals_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  /*
   * Откат убирает таблицу вместе со следами удалений. Это не оплошность,
   * а неизбежность: строки реестра описывают записи, которых уже нет,
   * и восстановить по ним карточки всё равно невозможно. Откатывать эту
   * миграцию после первого запуска очистки — значит расстаться со следом
   * навсегда; лучше знать об этом заранее.
   */
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_animal_removals_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_animal_removals_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "animal_removals_id";

  DROP TABLE IF EXISTS "animal_removals" CASCADE;

  ALTER TABLE "animals" DROP CONSTRAINT IF EXISTS "animals_archived_by_id_users_id_fk";
  DROP INDEX IF EXISTS "animals_archived_at_idx";
  DROP INDEX IF EXISTS "animals_archived_by_idx";
  ALTER TABLE "animals" DROP COLUMN IF EXISTS "archived_at";
  ALTER TABLE "animals" DROP COLUMN IF EXISTS "archived_by_id";`)
}
