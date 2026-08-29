import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Один ответ на вопрос «корова ли это» вместо трёх.
 *
 * ## Что убирается
 *
 * Колонка `kind` — «Тип животного»: корова, бык, тёлка, телёнок. Второй
 * ответ на тот же вопрос, на который отвечает `age_group`, и третьим был
 * сам факт отёла. Прогон `check:cow` по живой базе показал, что все три
 * расходятся у четверти стада, а `kind` не отвечает вовсе: девяносто три
 * процента записей несли умолчание формы, значение «телёнок» не выбрали
 * ни разу за всю жизнь книги, и полу колонка не противоречила ни в одном
 * случае из тысячи пятисот семидесяти шести.
 *
 * Места, где по ней решался вопрос «бык ли это», переведены на `sex`.
 *
 * ## Что заводится
 *
 * `age_group_date` — день, когда группу определили. Спрашивается ФГИАС ПР
 * отдельной колонкой рядом с самой группой; так же устроены там порода
 * и назначение. Проставляется отёлом — датой отёла, а не датой загрузки.
 *
 * ## Почему `down` не возвращает значения
 *
 * Вернуть колонку легко, вернуть её содержимое нечем: оно было умолчанием
 * и восстановлению не подлежит. Обратная миграция поэтому честно заводит
 * пустую колонку, а не делает вид, что откат бесплатный. Тип enum
 * пересоздаётся, потому что `DROP COLUMN` его не удаляет.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "age_group_date" timestamp(3) with time zone;`)

  await db.execute(sql`
  ALTER TABLE "animals" DROP COLUMN IF EXISTS "kind";`)

  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_animals_kind";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_animals_kind" AS ENUM('cow', 'bull', 'heifer', 'calf');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals" ADD COLUMN IF NOT EXISTS "kind" "public"."enum_animals_kind";`)

  await db.execute(sql`
  ALTER TABLE "animals" DROP COLUMN IF EXISTS "age_group_date";`)
}
