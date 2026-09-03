import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Метод контроля продуктивности у контрольного доения.
 *
 * ## Зачем
 *
 * «A4» и «B4» — не подробность: этим определяется сопоставимость
 * лактаций. Контроль ведёт работник службы учёта или сам хозяин —
 * числа получаются разной ценности, и складывать их в один рейтинг
 * нельзя. Пока метод не записан, книга складывает их молча: ряд полон,
 * лактация посчитана верно, и только сравнение между хозяйствами
 * оказывается ни о чём.
 *
 * Это был названный пробел второго раздела руководств ICAR — теперь
 * он закрывается.
 *
 * ## Почему четыре колонки, а не одна строка «A4»
 *
 * За буквой и цифрой стоят независимые обстоятельства, и ICAR разводит
 * их по разным перечислениям: кто снимал показания, какие доения вошли
 * в контроль, как и когда брали пробу. Склеенные в строку, они
 * не проверяются и не уезжают в обмен — «A4» это обозначение
 * из руководства, а не значение стандарта. Привычная запись собирается
 * из колонок обратно (`lib/milk-recording.ts`).
 *
 * ## Почему без значений по умолчанию
 *
 * Записи, внесённые до появления колонок, остаются без метода.
 * Проставить им «официальный контроль» задним числом значило бы
 * объявить подтверждённым то, чего никто не подтверждал, — и сделать
 * это разом для сотен тысяч строк.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'milk_tests' AND column_name = 'recording_protocol'
      ) THEN
        ALTER TABLE "milk_tests"
          ADD COLUMN "recording_protocol" varchar,
          ADD COLUMN "recording_per_year" numeric,
          ADD COLUMN "recording_scheme" varchar,
          ADD COLUMN "sampling_moment" varchar,
          ADD COLUMN "sampling_scheme" varchar;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "milk_tests"
      DROP COLUMN IF EXISTS "recording_protocol",
      DROP COLUMN IF EXISTS "recording_per_year",
      DROP COLUMN IF EXISTS "recording_scheme",
      DROP COLUMN IF EXISTS "sampling_moment",
      DROP COLUMN IF EXISTS "sampling_scheme";
  `)
}
