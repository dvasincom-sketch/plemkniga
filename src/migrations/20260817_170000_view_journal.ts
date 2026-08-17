import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Журнал просмотров переходит на строку «животное + хозяйство».
 *
 * Таблица `access_views` заводилась под запись на каждое обращение
 * по гранту. Теперь она обслуживает две задачи сразу: и просмотры по гранту,
 * и обычные, — а единицей записи стала пара «животное + смотревшее
 * хозяйство». Отсюда четыре изменения:
 *
 *  - `grant_id` перестаёт быть обязательной: пусто означает обычный
 *    просмотр открытой карточки, а не пробел в данных;
 *  - `viewer_org_id` наоборот становится обязательной: без неё строка
 *    ничего не значит, а анонимов мы не пишем вовсе;
 *  - появляются `first_at` и `sessions` — когда впервые и сколько раз
 *    возвращались;
 *  - уникальный индекс по паре. Это правило, а не оптимизация: две строки
 *    на одну пару означали бы, что хозяйство посчитано дважды, и число
 *    уникальных просмотров перестало бы быть числом уникальных.
 *
 * Данных в таблице нет — записей в неё до сих пор не писал никто, — поэтому
 * `first_at` заполняется без переноса.
 *
 * Написана руками по образцу `20260817_133000_access_grants`: `migrate:create`
 * в этом проекте подгребает в диф всё, что появилось после последнего снимка
 * схемы. Разбор — шапка той миграции.
 *
 * Опорный объект для `npm run migrate:baseline` — колонка
 * `access_views.first_at`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "access_views" ALTER COLUMN "grant_id" DROP NOT NULL;

  DELETE FROM "access_views" WHERE "viewer_org_id" IS NULL;
  ALTER TABLE "access_views" ALTER COLUMN "viewer_org_id" SET NOT NULL;

  ALTER TABLE "access_views" ADD COLUMN "first_at" timestamp(3) with time zone;
  UPDATE "access_views" SET "first_at" = COALESCE("at", now()) WHERE "first_at" IS NULL;
  ALTER TABLE "access_views" ALTER COLUMN "first_at" SET NOT NULL;

  ALTER TABLE "access_views" ADD COLUMN "sessions" numeric DEFAULT 1;

  DROP INDEX IF EXISTS "grant_animal_viewer_at_idx";
  CREATE UNIQUE INDEX "animal_viewerOrg_idx" ON "access_views" USING btree ("animal_id","viewer_org_id");
  CREATE INDEX "access_views_first_at_idx" ON "access_views" USING btree ("first_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "animal_viewerOrg_idx";
  DROP INDEX IF EXISTS "access_views_first_at_idx";
  CREATE INDEX "grant_animal_viewer_at_idx" ON "access_views" USING btree ("grant_id","animal_id","viewer_id","at");

  ALTER TABLE "access_views" DROP COLUMN IF EXISTS "sessions";
  ALTER TABLE "access_views" DROP COLUMN IF EXISTS "first_at";

  ALTER TABLE "access_views" ALTER COLUMN "viewer_org_id" DROP NOT NULL;

  DELETE FROM "access_views" WHERE "grant_id" IS NULL;
  ALTER TABLE "access_views" ALTER COLUMN "grant_id" SET NOT NULL;`)
}
