import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Карантин неопознанных колонок: книга перестаёт отказываться от данных.
 *
 * ## Что было
 *
 * Загрузка сверяла заголовки со своим списком и всё лишнее объявляла
 * нераспознанным: колонка называлась в отчёте и на этом исчезала.
 * Формально честно — человек предупреждён. По существу отказ: хозяйство
 * прислало то, что у него есть, а книга ответила «такого признака у меня
 * нет» и стёрла присланное.
 *
 * Между тем именно так и приходит всё новое. Признаки не появляются полем
 * в требованиях — они приезжают колонкой в чужой выгрузке: упитанность
 * из голландской программы, ширина задней доли вымени от Lactanet,
 * толщина сосков. Пока книга их выбрасывает, она узнаёт о них последней.
 *
 * ## Что заводится
 *
 * Одна строка на колонку, а не на загрузку: та же «Упитанность» приезжает
 * из десяти хозяйств, а решение по ней принимается одно. Строка копит,
 * сколько раз встречалась, от кого приходила, сколько строк с непустым
 * значением и десяток примеров — по примерам колонку и опознают, по имени
 * «БАЛ» не опознает никто.
 *
 * ## Чего это не даёт
 *
 * Числа из таких колонок не показываются в карточках. Признак без
 * объявленной шкалы, полюсов и наследуемости — не данные, а число:
 * его нельзя нарисовать на шкале и нельзя взять в индекс. Расширение
 * реестра остаётся решением Ассоциации и не должно происходить оттого,
 * что кто-то загрузил файл.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_pending_columns_status"
      AS ENUM('new', 'accepted', 'declined', 'duplicate');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "pending_columns" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_org_id" integer,
  	"title" varchar NOT NULL,
  	"normalized" varchar NOT NULL,
  	"dataset" varchar,
  	"status" "enum_pending_columns_status" DEFAULT 'new',
  	"maps_to" varchar,
  	"decision_comment" varchar,
  	"decision_decided_by_id" integer,
  	"decision_decided_at" timestamp(3) with time zone,
  	"seen_times" numeric DEFAULT 1,
  	"rows_with_value" numeric,
  	"first_seen_at" timestamp(3) with time zone,
  	"last_seen_at" timestamp(3) with time zone,
  	"samples" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  /*
   * Хозяйства связаны отдельной таблицей: у поля `hasMany`, и Payload
   * хранит такие связи строками, а не массивом в колонке.
   */
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "pending_columns_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"organizations_id" integer
  );`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "pending_columns"
      ADD CONSTRAINT "pending_columns_owner_org_id_organizations_id_fk"
      FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "pending_columns"
      ADD CONSTRAINT "pending_columns_decision_decided_by_id_users_id_fk"
      FOREIGN KEY ("decision_decided_by_id") REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "pending_columns_rels"
      ADD CONSTRAINT "pending_columns_rels_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."pending_columns"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "pending_columns_rels"
      ADD CONSTRAINT "pending_columns_rels_organizations_fk"
      FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  /*
   * Уникальность по приведённому имени — не украшение, а условие склейки.
   * Без неё две одновременные загрузки одного файла разными хозяйствами
   * заведут две строки на одну колонку, и Ассоциация будет разбирать
   * её дважды.
   */
  await db.execute(sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "pending_columns_normalized_idx"
    ON "pending_columns" ("normalized");
  CREATE INDEX IF NOT EXISTS "pending_columns_status_idx"
    ON "pending_columns" ("status");
  CREATE INDEX IF NOT EXISTS "pending_columns_last_seen_idx"
    ON "pending_columns" ("last_seen_at");
  CREATE INDEX IF NOT EXISTS "pending_columns_rels_parent_idx"
    ON "pending_columns_rels" ("parent_id");
  CREATE INDEX IF NOT EXISTS "pending_columns_rels_organizations_idx"
    ON "pending_columns_rels" ("organizations_id");`)

  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels"
    ADD COLUMN IF NOT EXISTS "pending_columns_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels"
      ADD CONSTRAINT "payload_locked_documents_rels_pending_columns_fk"
      FOREIGN KEY ("pending_columns_id") REFERENCES "public"."pending_columns"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_pending_columns_id_idx"
    ON "payload_locked_documents_rels" ("pending_columns_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels"
    DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_pending_columns_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_pending_columns_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "pending_columns_id";
  DROP TABLE IF EXISTS "pending_columns_rels";
  DROP TABLE IF EXISTS "pending_columns";
  DROP TYPE IF EXISTS "public"."enum_pending_columns_status";`)
}
