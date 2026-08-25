import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Отёлы в разрезе роли быка: как отец телёнка и как дед по матери.
 *
 * ## Зачем два числа вместо одного
 *
 * Бык участвует в отёле дважды и по-разному. Когда им осеменяют корову,
 * от него зависит сам телёнок — размер и положение, то есть насколько
 * тяжело этой корове отелиться. Когда телится его дочь, от него зависит
 * она сама: таз, сложение. Первое продают вместе с семенем для тёлок,
 * второе покупают, выбирая мать будущего стада. Совпадать они
 * не обязаны — бык может давать крупных телят и при этом дочерей
 * с широким тазом.
 *
 * В мировых каталогах это два столбца, SCE и DCE. Сложить их в один
 * значит потерять ровно то различие, ради которого признак и смотрят.
 *
 * ## Почему заводится до появления данных
 *
 * Потому что приходят такие данные не полем, а выгрузкой, где столбцы
 * уже есть. Без готового места первая же выгрузка либо потеряет половину,
 * либо сложит оба числа в общее поле — и различить их потом будет нечем.
 *
 * Общие `health.calving_ease` и `health.calf_mortality` остаются:
 * у отечественных оценок разделения нет, и заставлять хозяйство выбирать
 * роль там, где источник её не называл, значило бы выдумывать за него.
 *
 * Ограничений по значению нет намеренно. Шкалы у этих признаков разные
 * в разных странах — где-то проценты трудных отёлов, где-то баллы,
 * где-то отклонение, — и рамка, поставленная под одну из них, отвергала бы
 * данные, которые мы и хотим принять.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "animals"
    ADD COLUMN IF NOT EXISTS "calving_roles_ease_sire_forecast" numeric,
    ADD COLUMN IF NOT EXISTS "calving_roles_ease_sire_r" numeric,
    ADD COLUMN IF NOT EXISTS "calving_roles_ease_mgs_forecast" numeric,
    ADD COLUMN IF NOT EXISTS "calving_roles_ease_mgs_r" numeric,
    ADD COLUMN IF NOT EXISTS "calving_roles_stillbirth_sire_forecast" numeric,
    ADD COLUMN IF NOT EXISTS "calving_roles_stillbirth_sire_r" numeric,
    ADD COLUMN IF NOT EXISTS "calving_roles_stillbirth_mgs_forecast" numeric,
    ADD COLUMN IF NOT EXISTS "calving_roles_stillbirth_mgs_r" numeric;`)

  /*
   * Достоверность ограничена: ноль-сто — это не соглашение, а определение
   * доли. Значение вне рамки означает перепутанную колонку, и поймать
   * её лучше на входе, чем в отчёте через месяц.
   */
  await db.execute(sql`
  DO $$
  DECLARE c text;
  BEGIN
    FOR c IN
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'animals' AND column_name LIKE 'calving\_roles\_%\_r'
    LOOP
      EXECUTE format(
        'ALTER TABLE animals ADD CONSTRAINT %I CHECK (%I IS NULL OR (%I >= 0 AND %I <= 100))',
        'chk_' || c, c, c, c);
    END LOOP;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DO $$
  DECLARE c text;
  BEGIN
    FOR c IN
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'animals' AND column_name LIKE 'calving\_roles\_%'
    LOOP
      EXECUTE format('ALTER TABLE animals DROP CONSTRAINT IF EXISTS %I', 'chk_' || c);
      EXECUTE format('ALTER TABLE animals DROP COLUMN IF EXISTS %I', c);
    END LOOP;
  END $$;`)
}
