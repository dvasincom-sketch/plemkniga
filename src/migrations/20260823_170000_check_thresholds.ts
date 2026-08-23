import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Пороги проверок, изменённые Ассоциацией.
 *
 * ## Что это чинит
 *
 * Ассоциация могла выключить проверку и поменять её существенность,
 * но не могла тронуть число: «удой вне 500…25 000 кг» было зашито в код.
 * Хозяйству с рекордистками на двадцать восемь тысяч оставалось выключить
 * проверку целиком — и перестать ловить заодно ошибку в единицах измерения.
 * Выключатель вместо ручки настройки превращает «мера не та» в «меры нет».
 *
 * ## Почему таблица порогов, а не колонки в `check_settings`
 *
 * Одно число обслуживает несколько правил: длительность стельности входит
 * и в межотельный интервал, и в «двоих потомков подряд», и в дату выбытия
 * отца. Колонка на строке проверки означала бы три копии одного числа,
 * которые разойдутся на первой же правке.
 *
 * ## Почему `key` — varchar
 *
 * То же решение, что в `20260822_090000_check_settings`: пороги заводятся
 * кодом вместе с проверками, и новый не должен требовать миграции.
 * Перечисление в PostgreSQL привязало бы появление порога к походу в базу.
 *
 * ## Почему `value` — numeric, а не integer
 *
 * Половина порогов дробная: 12,5 процентных пункта по кровности, 6,5
 * процента жира, кратность 3,5 медианы. Целочисленная колонка округлила бы
 * их молча — и проверка начала бы срабатывать не там, где написано
 * в каталоге.
 *
 * Хранятся отклонения, а не список: строка появляется только там, где
 * значение поменяли. Уникальный индекс по `key` — правило, а не ускорение:
 * два значения одного порога означали бы, что действующее выбирается
 * случайно.
 *
 * Опорный объект для `npm run migrate:baseline` — таблица `check_thresholds`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "check_thresholds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"value" numeric NOT NULL,
  	"note" varchar,
  	"updated_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "check_thresholds" ADD CONSTRAINT "check_thresholds_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

  CREATE UNIQUE INDEX "check_thresholds_key_idx" ON "check_thresholds" USING btree ("key");
  CREATE INDEX "check_thresholds_updated_by_idx" ON "check_thresholds" USING btree ("updated_by_id");
  CREATE INDEX "check_thresholds_updated_at_idx" ON "check_thresholds" USING btree ("updated_at");
  CREATE INDEX "check_thresholds_created_at_idx" ON "check_thresholds" USING btree ("created_at");

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "check_thresholds_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_check_thresholds_fk" FOREIGN KEY ("check_thresholds_id") REFERENCES "public"."check_thresholds"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_check_thresholds_id_idx" ON "payload_locked_documents_rels" USING btree ("check_thresholds_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "payload_locked_documents_rels_check_thresholds_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_check_thresholds_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "check_thresholds_id";

  DROP TABLE IF EXISTS "check_thresholds" CASCADE;`)
}
