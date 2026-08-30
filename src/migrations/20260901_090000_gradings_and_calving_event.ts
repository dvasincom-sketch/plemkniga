import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Бонитировка отдельной записью, отёл — тремя вопросами вместо одного.
 *
 * ## Комплексный класс
 *
 * Класс лежал в карточке одним полем: без даты, без балла, без оценщика.
 * Переприсвоение затирало прошлое молча. Бонитируют ежегодно, и «элита»
 * без года не отвечает на вопрос, элита ли животное сейчас.
 *
 * Таблица повторяет взвешивания по устройству: животное, дата, значение,
 * хозяйство, те же индексы. В карточке остаётся снимок последней записи
 * (`animals.grade`) и новая колонка `grade_date` — как `age_group_date`
 * при возрастной группе.
 *
 * Старый класс сюда не переносится. Записи о бонитировке без даты
 * не бывает, а подставить дату переноса значило бы утверждать, что
 * полторы тысячи животных бонитировали в день загрузки файла.
 *
 * ## Отёл, аборт и запуск
 *
 * Поле «Результат» отвечало сразу на три вопроса: что за событие
 * (отёл или аборт), сколько родилось (один или двойня) и какого пола
 * (тёлка или бычок). Пять значений на три вопроса означают, что ни на один
 * ответить нельзя: у двойни пол не записан вовсе, а долю мертворождений
 * не вытащить из слова «Мертворождение» в общем поле.
 *
 * Здесь оно разбирается на составляющие ровно так, как их спрашивает
 * реестр: тип события, тип рождения, три числа.
 *
 * ## Перевод точен, а не приблизителен
 *
 * «Тёлка» — это один плод и одна живая тёлочка. «Бычок» — один плод
 * и один живой бычок. «Мертворождение» — один плод и один мертворождённый.
 * «Двойня» остаётся двойнёй, и пол у неё не выдумывается: его в старом
 * поле не было. «Аборт» переезжает в тип события, а тип рождения у него
 * обнуляется — у аборта его нет по существу.
 *
 * Ни одно значение не потеряно и ни одно не додумано.
 *
 * ## Почему перечисление пересоздаётся, а не дополняется
 *
 * `ALTER TYPE … ADD VALUE` оставил бы в типе прежние `heifer`, `bull`
 * и `abortion` — значения, которых больше нет в схеме Payload. Проверка
 * схемы увидела бы расхождение и была бы права: тип, в котором лежит
 * то, чего код не знает, однажды примет это обратно.
 *
 * Пересоздание идёт через `varchar`: колонка временно теряет тип,
 * значения переводятся обычным `UPDATE`, тип создаётся заново под тем же
 * именем — `enum_calvings_result`, как его называет Payload по имени
 * таблицы и поля, — и колонка возвращается к нему. Всё в одной
 * транзакции: оборваться посередине с колонкой-строкой она не может.
 *
 * Опорный объект для `npm run migrate:baseline` — таблица `gradings`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  /* ------------------------- Комплексный класс ------------------------- */

  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_gradings_grade" AS ENUM(
      'eliteRecord', 'elite', 'first', 'second', 'outOfClass'
    );
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "gradings" (
    "id" serial PRIMARY KEY NOT NULL,
    "owner_org_id" integer,
    "animal_id" integer NOT NULL,
    "date" timestamp(3) with time zone NOT NULL,
    "grade" "enum_gradings_grade" NOT NULL,
    "score" numeric,
    "assessor_org_id" integer,
    "note" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );`)

  /*
   * `DO $$` вокруг внешних ключей: `ADD CONSTRAINT` не понимает
   * `IF NOT EXISTS`, а миграция обязана переживать повторный прогон.
   */
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "gradings" ADD CONSTRAINT "gradings_animal_id_fk"
      FOREIGN KEY ("animal_id") REFERENCES "animals"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "gradings" ADD CONSTRAINT "gradings_owner_org_id_fk"
      FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "gradings" ADD CONSTRAINT "gradings_assessor_org_id_fk"
      FOREIGN KEY ("assessor_org_id") REFERENCES "organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "gradings_animal_idx" ON "gradings" USING btree ("animal_id");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "gradings_date_idx" ON "gradings" USING btree ("date");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "gradings_animal_date_idx"
    ON "gradings" USING btree ("animal_id","date");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "gradings_owner_org_idx"
    ON "gradings" USING btree ("owner_org_id");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "gradings_assessor_org_idx"
    ON "gradings" USING btree ("assessor_org_id");`)

  /*
   * Индексы по времени записи Payload заводит каждой коллекции сам,
   * и схема их ждёт. Пропустить их значило бы получить расхождение
   * в `check:schema` — не поломку, но шум, из-за которого перестают
   * читать отчёт целиком.
   */
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "gradings_updated_at_idx"
    ON "gradings" USING btree ("updated_at");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "gradings_created_at_idx"
    ON "gradings" USING btree ("created_at");`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "grade_date" timestamp(3) with time zone;`)

  /* -------------------- Отёл: тип события и числа --------------------- */

  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_calvings_event_type" AS ENUM('calving', 'abortion', 'dryOff');
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "calvings" ADD COLUMN IF NOT EXISTS "event_type"
    "public"."enum_calvings_event_type" DEFAULT 'calving';`)
  await db.execute(sql`
  ALTER TABLE "calvings" ADD COLUMN IF NOT EXISTS "live_heifers" numeric;`)
  await db.execute(sql`
  ALTER TABLE "calvings" ADD COLUMN IF NOT EXISTS "live_bulls" numeric;`)
  await db.execute(sql`
  ALTER TABLE "calvings" ADD COLUMN IF NOT EXISTS "stillborn" numeric;`)

  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "calvings_event_type_idx"
    ON "calvings" USING btree ("event_type");`)

  /*
   * Колонка снимает тип, чтобы старые и новые значения могли полежать
   * в ней рядом строками. Без этого шага `UPDATE` на 'one' отверг бы
   * сам Postgres: такого значения в прежнем перечислении нет.
   */
  await db.execute(sql`
  ALTER TABLE "calvings" ALTER COLUMN "result" TYPE varchar USING "result"::varchar;`)

  await db.execute(sql`
  UPDATE "calvings" SET
    "event_type" = CASE WHEN "result" = 'abortion' THEN 'abortion' ELSE 'calving' END
      ::"public"."enum_calvings_event_type",
    "live_heifers" = CASE WHEN "result" = 'heifer' THEN 1 END,
    "live_bulls" = CASE WHEN "result" = 'bull' THEN 1 END,
    "stillborn" = CASE WHEN "result" = 'stillborn' THEN 1 END;`)

  await db.execute(sql`
  UPDATE "calvings" SET "result" = CASE
    WHEN "result" IN ('heifer', 'bull', 'stillborn') THEN 'one'
    WHEN "result" = 'twins' THEN 'twins'
    ELSE NULL
  END;`)

  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_calvings_result";`)

  await db.execute(sql`
  CREATE TYPE "public"."enum_calvings_result" AS ENUM(
    'one', 'twins', 'triplets', 'multiple', 'multipleMixed', 'unknown'
  );`)

  await db.execute(sql`
  ALTER TABLE "calvings" ALTER COLUMN "result" TYPE "public"."enum_calvings_result"
    USING "result"::"public"."enum_calvings_result";`)
}

/**
 * Откат уносит бонитировки целиком — восстановить их неоткуда, кроме
 * племенных свидетельств на бумаге.
 *
 * Отёлам он возвращает прежнее перечисление и переводит значения назад:
 * «Один» с живой тёлочкой становится «Тёлкой», с бычком — «Бычком»,
 * с мертворождённым — «Мертворождением», аборт возвращается из типа
 * события в результат. Обратный перевод точен для всего, что было
 * до миграции, и теряет лишь то, чего прежняя книга выразить не умела:
 * тройню, множественные роды и точные числа приплода.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "gradings" CASCADE;`)
  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_gradings_grade";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "grade_date";`)

  await db.execute(sql`
  ALTER TABLE "calvings" ALTER COLUMN "result" TYPE varchar USING "result"::varchar;`)

  await db.execute(sql`
  UPDATE "calvings" SET "result" = CASE
    WHEN "event_type" = 'abortion' THEN 'abortion'
    WHEN "result" = 'twins' THEN 'twins'
    WHEN "stillborn" > 0 THEN 'stillborn'
    WHEN "live_bulls" > 0 THEN 'bull'
    WHEN "live_heifers" > 0 THEN 'heifer'
    ELSE NULL
  END;`)

  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_calvings_result";`)
  await db.execute(sql`
  CREATE TYPE "public"."enum_calvings_result" AS ENUM(
    'heifer', 'bull', 'twins', 'stillborn', 'abortion'
  );`)
  await db.execute(sql`
  ALTER TABLE "calvings" ALTER COLUMN "result" TYPE "public"."enum_calvings_result"
    USING "result"::"public"."enum_calvings_result";`)

  await db.execute(sql`DROP INDEX IF EXISTS "calvings_event_type_idx";`)
  await db.execute(sql`ALTER TABLE "calvings" DROP COLUMN IF EXISTS "event_type";`)
  await db.execute(sql`ALTER TABLE "calvings" DROP COLUMN IF EXISTS "live_heifers";`)
  await db.execute(sql`ALTER TABLE "calvings" DROP COLUMN IF EXISTS "live_bulls";`)
  await db.execute(sql`ALTER TABLE "calvings" DROP COLUMN IF EXISTS "stillborn";`)
  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_calvings_event_type";`)
}
