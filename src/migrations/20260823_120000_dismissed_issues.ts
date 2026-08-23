import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Снятые автоматические находки в разборе заявки на верификацию.
 *
 * ## Что это чинит
 *
 * Статус «Проверено ассоциацией» означает наивысшую достоверность записи.
 * До сих пор его можно было получить с непогашенной существенной находкой:
 * автоматические проверки эксперту показывались, но подтверждению
 * не мешали ничем. Система утверждала то, что сама же опровергала
 * двумя экранами выше.
 *
 * Запретить подтверждение при существенной находке было нельзя: правило
 * написано программистом, а не зоотехником, и право эксперта счесть
 * находку несущественной записано в каталоге проверок как обещание
 * хозяйству. Запрещено поэтому не подтверждение, а молчание: находка
 * либо переносится в замечания, либо снимается — с объяснением, которое
 * и хранится в этой таблице.
 *
 * ## Почему `code` — varchar
 *
 * То же решение, что и в `20260822_090000_check_settings`: проверки
 * заводятся кодом, и новая не должна требовать похода в базу. Реестр
 * защищает от опечатки на уровне типов, перечисление в PostgreSQL
 * добавило бы к каждой новой проверке миграцию.
 *
 * ## Почему `reason` обязателен на уровне базы
 *
 * Снятие находки — утверждение «я посмотрел, здесь не ошибка». Без
 * объяснения оно неотличимо от «мне мешал красный значок», а разбирать,
 * почему запись подтвердили вопреки проверке, будет другой человек
 * и через год. Необязательное поле здесь означало бы, что объяснение
 * появится у первых десяти находок и исчезнет у следующей тысячи.
 *
 * Написана руками по образцу `20260817_074414_verification_requests`:
 * структура повторяет соседнюю таблицу `..._review_findings`, включая
 * `_order`, `_parent_id` и строковый первичный ключ массива Payload.
 *
 * Опорный объект для `npm run migrate:baseline` — таблица
 * `verification_requests_review_dismissed`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE "verification_requests_review_dismissed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"animal_id" integer,
  	"code" varchar NOT NULL,
  	"reason" varchar NOT NULL,
  	"by_id" integer,
  	"at" timestamp(3) with time zone
  );

  ALTER TABLE "verification_requests_review_dismissed" ADD CONSTRAINT "verification_requests_review_dismissed_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests_review_dismissed" ADD CONSTRAINT "verification_requests_review_dismissed_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests_review_dismissed" ADD CONSTRAINT "verification_requests_review_dismissed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."verification_requests"("id") ON DELETE cascade ON UPDATE no action;

  CREATE INDEX "verification_requests_review_dismissed_order_idx" ON "verification_requests_review_dismissed" USING btree ("_order");
  CREATE INDEX "verification_requests_review_dismissed_parent_id_idx" ON "verification_requests_review_dismissed" USING btree ("_parent_id");
  CREATE INDEX "verification_requests_review_dismissed_animal_idx" ON "verification_requests_review_dismissed" USING btree ("animal_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TABLE IF EXISTS "verification_requests_review_dismissed" CASCADE;`)
}
