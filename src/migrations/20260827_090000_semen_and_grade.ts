import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Два поля, которых не хватало карточке быка.
 *
 * ## Оплодотворяющая способность семени
 *
 * Единственный признак, который у быка **свой собственный**. Всё
 * остальное в его карточке — прогноз по дочерям: ни удоя, ни вымени,
 * ни лактаций у быка не бывает. Здесь наоборот — измеряется он сам.
 *
 * Лежит отдельной группой, а не строкой в «Воспроизводительных
 * качествах» рядом с фертильностью дочерей. Это две разные величины,
 * которые и так путают: первая отвечает на вопрос «оплодотворит ли
 * его семя», вторая — «будут ли его дочери приходить в охоту».
 * Соседство под общим заголовком закрепило бы путаницу схемой.
 *
 * Число осеменений хранится рядом не для полноты: достоверность этого
 * признака зависит от него так же, как достоверность оценки по дочерям
 * зависит от их числа.
 *
 * ## Комплексный класс
 *
 * Российская практика, которой нет ни в одном мировом каталоге, —
 * и ровно поэтому она нужна: все отечественные племенные документы
 * написаны на этом языке. Карточка без класса не стыкуется с бумагами,
 * которые лежат в хозяйстве.
 *
 * Перечисление, а не текст: класс присваивается по инструкции
 * бонитировки из закрытого списка, и свободное поле здесь означало бы
 * «элита», «Элита», «элита-рекорд?» в одной колонке.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_animals_grade" AS ENUM(
      'eliteRecord', 'elite', 'first', 'second', 'outOfClass'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals"
    ADD COLUMN IF NOT EXISTS "grade" "enum_animals_grade",
    ADD COLUMN IF NOT EXISTS "semen_conception_forecast" numeric,
    ADD COLUMN IF NOT EXISTS "semen_conception_r" numeric,
    ADD COLUMN IF NOT EXISTS "semen_inseminations" numeric;`)

  /*
   * Ограничения ставятся здесь же, а не оставляются на совесть формы.
   *
   * Достоверность вне ноль-ста и отрицательное число осеменений —
   * это не «плохой ввод», а величина, которой не бывает; попав в базу
   * через загрузку файлом или через API, она разойдётся по отчётам
   * и обнаружится далеко от места, где появилась.
   *
   * Отклонение стельности ограничено ±20 процентными пунктами: в США
   * публикуемые значения укладываются в ±4, и двадцать здесь — не оценка
   * биологии, а заслон от опечатки на порядок.
   */
  await db.execute(sql`
  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_semen_r"
      CHECK ("semen_conception_r" IS NULL
             OR ("semen_conception_r" >= 0 AND "semen_conception_r" <= 100));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_semen_inseminations"
      CHECK ("semen_inseminations" IS NULL OR "semen_inseminations" >= 0);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_semen_conception"
      CHECK ("semen_conception_forecast" IS NULL
             OR ("semen_conception_forecast" >= -20 AND "semen_conception_forecast" <= 20));
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "animals"
    DROP CONSTRAINT IF EXISTS "chk_animals_semen_r",
    DROP CONSTRAINT IF EXISTS "chk_animals_semen_inseminations",
    DROP CONSTRAINT IF EXISTS "chk_animals_semen_conception";

  ALTER TABLE "animals"
    DROP COLUMN IF EXISTS "grade",
    DROP COLUMN IF EXISTS "semen_conception_forecast",
    DROP COLUMN IF EXISTS "semen_conception_r",
    DROP COLUMN IF EXISTS "semen_inseminations";

  DROP TYPE IF EXISTS "public"."enum_animals_grade";`)
}
