import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Выставки и соревнования — шаблон ФГИАС ПР, которого книга не вела вовсе.
 *
 * ## Зачем
 *
 * Дата мероприятия, название, место, награды, выигрыш. Хозяйство эти
 * данные уже собирает и вносит в реестр руками — то есть ведёт их
 * в двух местах, потому что у нас их положить некуда.
 *
 * Самое дешёвое из всего недостающего: пять колонок, ни одного
 * справочника, ни одного ключа реестра. Разбор в `docs/fgias-karta.md`.
 *
 * ## Почему таблица массива, а не коллекция
 *
 * Выставок у животного единицы за всю жизнь, и запроса «покажи все
 * выставки книги» не бывает: их читают только в карточке. Отдельная
 * коллекция дала бы связь, правила доступа и вторую таблицу ради данных,
 * которые всегда запрашиваются вместе с животным.
 *
 * Устройство повторяет соседний массив лактаций (`animals_lactations`):
 * порядковый номер, ссылка на родителя, строковый идентификатор строки.
 *
 * ## Название и место — текстом
 *
 * Реестр требует их строками, без справочника. Свой справочник
 * мероприятий означал бы приведение чужих названий к нашему списку —
 * и на первом же «Агроферма-2026 / АГРОФЕРМА 2026» две записи об одном
 * мероприятии либо потерянная запись.
 *
 * ## Выигрыш строкой, а не числом
 *
 * В шаблоне это строка, и не зря: там пишут и «120 000 руб.»,
 * и «племенной телёнок», и «кубок». Число потребовало бы валюты
 * и потеряло бы всё, что деньгами не измеряется.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TABLE IF NOT EXISTS "animals_shows" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "date" timestamp(3) with time zone,
    "title" varchar,
    "place" varchar,
    "awards" varchar,
    "prize" varchar
  );`)

  /*
   * `DO $$` вокруг внешнего ключа: `ADD CONSTRAINT` не понимает
   * `IF NOT EXISTS`, а миграция обязана переживать повторный прогон —
   * на машине разработчика её накатывают и откатывают не по одному разу.
   */
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals_shows"
      ADD CONSTRAINT "animals_shows_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "animals"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN null;
  END $$;`)

  /*
   * Индексы по родителю и порядку — так же, как у лактаций. Выставки
   * читаются всегда одной выборкой «все строки этого животного
   * по порядку», и без индекса это перебор всей таблицы на каждое
   * открытие карточки.
   */
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animals_shows_order_idx"
    ON "animals_shows" USING btree ("_order");`)
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animals_shows_parent_id_idx"
    ON "animals_shows" USING btree ("_parent_id");`)
}

/**
 * Откат уносит выставки вместе с таблицей, и восстановить их неоткуда:
 * в отличие от номеров реестра, эти данные есть только у нас и у самого
 * хозяйства на бумаге.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "animals_shows" CASCADE;`)
}
