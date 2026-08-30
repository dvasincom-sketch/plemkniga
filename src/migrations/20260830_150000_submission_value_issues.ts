import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Ячейки, которые не разобрались, — в пакете загрузки.
 *
 * ## Почему миграция отдельной строкой в журнале
 *
 * Массив `intake.valueIssues` заведён в коллекции решением №226, а таблицы
 * под него не появилось: `payload generate:types` переписывает типы,
 * но схему не трогает — на проде она берётся из миграций, а не из push
 * (решение №2). Пока файл был только в коллекции, `next dev` жил
 * на схеме, построенной при старте, и всё выглядело работающим; прод же
 * при первом запросе к пакетам ответил `relation
 * "data_submissions_intake_value_issues" does not exist` и уронил
 * карточку животного целиком — она спрашивает пакеты, чтобы показать
 * происхождение.
 *
 * Урок дешевле записать, чем повторить: правка коллекции без миграции
 * ломает не то место, где правили. Ошибка вылезла на вкладке
 * «Происхождение», к загрузке отношения не имеющей.
 *
 * Устройство таблицы повторяет соседнюю `data_submissions_intake_issues`
 * (миграция `20260816_110132_submission_issues`) — тот же массив внутри
 * той же группы, отличается одной колонкой.
 *
 * Колонка названа `column_title`, а не `column`. Второе было первым
 * побуждением и читалось лучше, но `COLUMN` — зарезервированное слово
 * SQL. Payload и drizzle идентификаторы кавычат, и через них всё
 * работает; ломается это в ручных запросах, которых в проекте
 * с десяток, — и ломается не там, где называли поле.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "data_submissions_intake_value_issues" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "row" numeric,
    "ident" varchar,
    "column_title" varchar,
    "reason" varchar
  );`)

  /*
   * `DO $$` вокруг внешнего ключа: `ADD CONSTRAINT` не понимает
   * `IF NOT EXISTS`, а миграция обязана переживать повторный прогон —
   * на машине разработчика её накатывают и откатывают не по одному разу.
   */
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "data_submissions_intake_value_issues"
      ADD CONSTRAINT "data_submissions_intake_value_issues_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."data_submissions"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "data_submissions_intake_value_issues_order_idx"
    ON "data_submissions_intake_value_issues" USING btree ("_order");`)

  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "data_submissions_intake_value_issues_parent_id_idx"
    ON "data_submissions_intake_value_issues" USING btree ("_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "data_submissions_intake_value_issues" CASCADE;`)
}
