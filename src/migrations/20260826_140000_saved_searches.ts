import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Именованные отборы животных (ТЗ, требование №6).
 *
 * ## Почему у автора внешний ключ с `cascade`, а у хозяйства — с `set null`
 *
 * Отбор без автора бессмыслен: он личный по умолчанию, и правило видимости
 * читает именно автора. Учётную запись у нас, правда, не удаляют —
 * человека блокируют (решение №109), — но если её всё же удалят, отбору
 * незачем оставаться сиротой в списке, который никому не показывается.
 *
 * Хозяйство — другое дело. Оно у отбора не хозяин, а признак видимости:
 * по нему решают, кому показать общий набор. Хозяйство сливают в
 * «Справочнике», и потеря этого признака делает набор снова личным —
 * то есть сужает видимость, а не расширяет. Безопасная сторона отказа.
 *
 * ## Почему условия лежат текстом, а не разложены по колонкам
 *
 * Разбор — в самой коллекции; здесь важно следствие для схемы: колонок
 * под условия нет и не появится, а значит новое поле отбора не потребует
 * ни миграции, ни правки старых наборов.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_saved_searches_place" AS ENUM('book', 'herd');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "public"."enum_saved_searches_scope" AS ENUM('private', 'organization');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "saved_searches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"place" "enum_saved_searches_place" DEFAULT 'book' NOT NULL,
  	"query" varchar NOT NULL,
  	"scope" "enum_saved_searches_scope" DEFAULT 'private' NOT NULL,
  	"author_id" integer NOT NULL,
  	"organization_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "saved_searches"
      ADD CONSTRAINT "saved_searches_author_id_users_id_fk"
      FOREIGN KEY ("author_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "saved_searches"
      ADD CONSTRAINT "saved_searches_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  /*
   * Индексы под два способа читать список, и оба — составные.
   * Свои отборы открывают на конкретной странице («мои отборы книги»),
   * общие ищут не по автору вовсе. Одиночный индекс по автору обслуживал
   * бы только первый запрос и наполовину.
   */
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "saved_searches_author_place_idx"
    ON "saved_searches" ("author_id", "place");
  CREATE INDEX IF NOT EXISTS "saved_searches_org_scope_place_idx"
    ON "saved_searches" ("organization_id", "scope", "place");
  CREATE INDEX IF NOT EXISTS "saved_searches_updated_at_idx"
    ON "saved_searches" ("updated_at");`)

  /*
   * Связь со служебной таблицей блокировок админки. Без неё Payload
   * при первом же открытии коллекции в /admin попробует дописать колонку
   * сам — а на проде схему правит только миграция.
   */
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels"
    ADD COLUMN IF NOT EXISTS "saved_searches_id" integer;

  DO $$ BEGIN
    ALTER TABLE "payload_locked_documents_rels"
      ADD CONSTRAINT "payload_locked_documents_rels_saved_searches_fk"
      FOREIGN KEY ("saved_searches_id") REFERENCES "public"."saved_searches"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_saved_searches_id_idx"
    ON "payload_locked_documents_rels" ("saved_searches_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels"
    DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_saved_searches_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_saved_searches_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "saved_searches_id";
  DROP TABLE IF EXISTS "saved_searches";
  DROP TYPE IF EXISTS "public"."enum_saved_searches_scope";
  DROP TYPE IF EXISTS "public"."enum_saved_searches_place";`)
}
