import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Две чужие шкалы экстерьера и склад спермопродукции.
 *
 * ## Три шкалы вместо одной
 *
 * Книга мерила экстерьер линейно: восемнадцать статей по шкале 1–9.
 * Реестр спрашивает ещё две вещи, и обе — не пересчёт первой.
 *
 * **Сводная оценка 50–100.** Линейный признак говорит, *какое* животное
 * («таз приподнят» или «свислый»), и середина шкалы у половины
 * признаков и есть оптимум. Сводная оценка говорит, *насколько хорошо*,
 * и сотня всегда лучше пятидесяти. Из «таз в середине» нельзя вывести
 * «зад на 82 балла»: во второе входит и то, чего в линейных признаках
 * нет вовсе. Пересчёт дал бы правдоподобное число, которое ничего
 * не меряет.
 *
 * **Экстерьер молодняка, шкалы 1–3 и 1–4.** Тёлку до первого отёла
 * не меряют ни линейно, ни по сотне: вымени ещё нет, тело
 * не сформировано. Три сводные оценки по коротким шкалам — третья
 * система измерения, а не третье представление первой.
 *
 * ## Всё в одной таблице оценок
 *
 * Осмотр один: бонитёр приезжает, меряет статьи и ставит сводные оценки
 * в один день и одной подписью. Три коллекции означали бы три даты
 * и трёх оценщиков там, где в жизни один.
 *
 * ## Наборы у коровы и быка расходятся ровно на одном поле
 *
 * У коровы реестр спрашивает качество вымени, у быка — заднюю часть
 * туловища: вымени у него нет, и оценивают то, что он передаёт дочерям.
 * Поэтому колонок шесть, а в каждый шаблон уходит пять.
 *
 * ## Склад спермопродукции
 *
 * Отдельный шаблон реестра: есть ли сегодня семя быка, под каким кодом
 * и чьё оно. Вопрос торговый, а не племенной, и лежит он в группе
 * «Семя» рядом с оплодотворяющей способностью — про то же семя, только
 * не о качестве, а о наличии.
 *
 * Собственник семени — своё поле, а не владелец быка: бык стоит
 * на племпредприятии, а семя разошлось по дистрибьюторам, и это самый
 * частый случай, ради которого колонка и заведена.
 *
 * Опорный объект для `npm run migrate:baseline` — колонка
 * `animal_exteriors.general_view`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  /* ------------------ Сводная оценка, шкала 50–100 ------------------ */

  for (const col of [
    'general_view',
    'body_volume',
    'dairy_character',
    'leg_quality',
    'udder_quality',
    'rear_body',
  ]) {
    /*
     * Имена колонок перечислены строками, а не собраны в цикле
     * из имён полей: `sql` — это шаблон с параметрами, и подставленная
     * в него переменная становится значением, а не идентификатором.
     * Здесь список литералов, и каждый попадает в запрос текстом.
     */
    await db.execute(
      sql.raw(`ALTER TABLE "animal_exteriors" ADD COLUMN IF NOT EXISTS "${col}" numeric;`),
    )
  }

  /* ---------------- Экстерьер молодняка, 1–3 и 1–4 ------------------ */

  for (const col of ['young_general', 'young_body', 'young_legs']) {
    await db.execute(
      sql.raw(`ALTER TABLE "animal_exteriors" ADD COLUMN IF NOT EXISTS "${col}" numeric;`),
    )
  }

  /* -------------------- Склад спермопродукции ----------------------- */

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "semen_stock_code" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "semen_stock_available" boolean;`)
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "semen_stock_updated_at"
    timestamp(3) with time zone;`)
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "semen_stock_owner_id" integer;`)

  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "animals_semen_stock_owner_id_fk"
      FOREIGN KEY ("semen_stock_owner_id") REFERENCES "organizations"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  /*
   * Имя индекса выглядит нелепо и повторяет путь дважды. Так его
   * называет Payload: имя таблицы, путь группы, имя колонки — а колонка
   * уже несёт в себе путь. То же видно у соседней группы:
   * `animals_improvers_improvers_breed1_idx`. Придумать имя покрасивее
   * значило бы получить расхождение в `check:schema`.
   */
  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "animals_semen_stock_semen_stock_owner_idx"
    ON "animals" USING btree ("semen_stock_owner_id");`)
}

/**
 * Откат снимает колонки. Потеря невосстановимая: сводные оценки ставит
 * бонитёр на месте, и вывести их обратно из линейных признаков нельзя —
 * ровно по той причине, по которой они и заведены отдельно.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const col of [
    'general_view',
    'body_volume',
    'dairy_character',
    'leg_quality',
    'udder_quality',
    'rear_body',
    'young_general',
    'young_body',
    'young_legs',
  ]) {
    await db.execute(
      sql.raw(`ALTER TABLE "animal_exteriors" DROP COLUMN IF EXISTS "${col}";`),
    )
  }

  await db.execute(sql`DROP INDEX IF EXISTS "animals_semen_stock_semen_stock_owner_idx";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "semen_stock_code";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "semen_stock_available";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "semen_stock_updated_at";`)
  await db.execute(sql`ALTER TABLE "animals" DROP COLUMN IF EXISTS "semen_stock_owner_id";`)
}
