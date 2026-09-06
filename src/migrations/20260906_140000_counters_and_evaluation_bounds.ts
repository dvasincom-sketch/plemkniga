import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Счётчики целым числом и границы у истории оценки.
 *
 * ## Почему написана руками
 *
 * `payload migrate:create` в этом проекте пользоваться нельзя, и это
 * не предпочтение, а состояние дерева: последний снимок схемы drizzle
 * (`src/migrations/*.json`) сделан 16 августа, а все миграции после
 * написаны руками и снимок не обновляли. Инструмент поэтому сравнивает
 * настройки Payload с картиной месячной давности и предлагает завести
 * заново всё, что появилось с тех пор: перечисления, которые в базе уже
 * есть, — и вдобавок «переименовать» `enum_animals_kind`
 * в `enum_animals_dna_tests_verdict`, то есть связать два никак
 * не связанных типа, потому что колонку `kind` убрала миграция,
 * о которой снимок не знает.
 *
 * Ровно эта манера drizzle однажды уже испортила данные: перенос значений
 * при мнимом переименовании колонки положил в `animals.uuid` названия
 * пород (`src/scripts/repair-uuid.ts`). Разбор — в `src/migrations/index.ts`.
 *
 * ## Счётчики
 *
 * Payload переводит любое поле `type: 'number'` в `numeric`, и для мер это
 * верно, а для счёта штуками — нет: контролей в год не бывает двенадцать
 * с половиной, номер лактации не бывает дробным. Восемь таких колонок
 * переведены давно; эти две завели позже и в список не внесли.
 * `numeric` при этом не ошибается громко — он округляет молча.
 *
 * ## Границы истории оценки
 *
 * `animal_evaluations` заполняется пакетным переносом истории и записью
 * из расчётного центра, то есть мимо форм и мимо полей коллекции.
 * Границы у полей стоят, но поле — это форма; база до сих пор принимала
 * надёжность в двести процентов и ступень в тридцать. Имена ограничений
 * совпадают с теми, что перечислены в `src/lib/db-constraints.ts`:
 * список там — источник правды и для `db:precheck`.
 *
 * ## Почему каждый шаг проверяет, не сделан ли он уже
 *
 * В разработке схему двигает `drizzle push`, и берёт он её из настроек
 * Payload — вместе с ограничениями, которые дописывает `afterSchemaInit`.
 * То есть на машине разработчика ограничение появляется в ту же секунду,
 * когда его вписали в `DOMAIN_RULES`, задолго до всякой миграции. Дальше
 * `payload migrate` честно пробует создать его снова и падает
 * с «constraint … already exists» — простынёй, из которой не читается
 * ничего, кроме испуга.
 *
 * `ADD CONSTRAINT IF NOT EXISTS` в PostgreSQL нет, поэтому проверка
 * написана руками, через `pg_constraint`. Соседние миграции делают то же
 * для колонок и индексов — там для этого есть `IF NOT EXISTS`, и потому
 * это не бросается в глаза.
 *
 * То же и с типом колонки: перевод `numeric` в `integer` на уже
 * переведённой колонке безвреден, но заставляет PostgreSQL переписать
 * таблицу целиком. На пяти миллионах доек это минуты ни за что.
 */

/** Колонки надёжности и процентиля: все меряются процентами. */
const PERCENT_COLUMNS = [
  'milk_r',
  'fat_kg_r',
  'protein_kg_r',
  'fat_percent_r',
  'protein_percent_r',
  'productive_longevity_r',
  'udder_health_r',
  'calving_ease_r',
  'calf_mortality_r',
  'production_index_r',
  'fertility_r',
  'ipc_r',
  'ipc_percentile',
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  /* ---------------------------- Счётчики ---------------------------- */

  /*
   * Дробные значения округляются к ближайшему целому — так же, как это
   * сделал бы PostgreSQL при переводе типа, но заранее и вслух: если
   * их окажется много, это видно в журнале миграции.
   */
  await db.execute(sql`
    DO $$
    DECLARE
      fractional integer;
    BEGIN
      IF (SELECT data_type FROM information_schema.columns
           WHERE table_name = 'milk_tests' AND column_name = 'recording_per_year') = 'integer' THEN
        RETURN;
      END IF;

      SELECT count(*) INTO fractional
        FROM "milk_tests"
       WHERE "recording_per_year" IS NOT NULL
         AND "recording_per_year" <> round("recording_per_year");
      IF fractional > 0 THEN
        RAISE NOTICE 'Дробных значений recording_per_year: % — округляются', fractional;
      END IF;

      ALTER TABLE "milk_tests"
        ALTER COLUMN "recording_per_year" TYPE integer
        USING round("recording_per_year")::integer;
    END $$;
  `)

  await db.execute(sql`
    DO $$
    DECLARE
      fractional integer;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'weighings' AND column_name = 'lactation_number'
      ) THEN
        RETURN;
      END IF;

      IF (SELECT data_type FROM information_schema.columns
           WHERE table_name = 'weighings' AND column_name = 'lactation_number') = 'integer' THEN
        RETURN;
      END IF;

      SELECT count(*) INTO fractional
        FROM "weighings"
       WHERE "lactation_number" IS NOT NULL
         AND "lactation_number" <> round("lactation_number");
      IF fractional > 0 THEN
        RAISE NOTICE 'Дробных значений weighings.lactation_number: % — округляются', fractional;
      END IF;

      ALTER TABLE "weighings"
        ALTER COLUMN "lactation_number" TYPE integer
        USING round("lactation_number")::integer;
    END $$;
  `)

  /* -------------------------- Границы --------------------------- */

  /** Добавить ограничение, если его ещё нет: `IF NOT EXISTS` у CHECK не бывает. */
  const addCheck = async (table: string, name: string, predicate: string) => {
    await db.execute(
      sql.raw(
        `DO $$
         BEGIN
           IF NOT EXISTS (
             SELECT 1 FROM pg_constraint
              WHERE conname = '${name}' AND conrelid = '${table}'::regclass
           ) THEN
             ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK (${predicate});
           END IF;
         END $$;`,
      ),
    )
  }

  await addCheck(
    'milk_tests',
    'chk_milk_tests_recording_per_year',
    `"recording_per_year" IS NULL OR ("recording_per_year" >= 1 AND "recording_per_year" <= 24)`,
  )

  for (const column of PERCENT_COLUMNS) {
    await addCheck(
      'animal_evaluations',
      `chk_animal_evaluations_${column}`,
      `"${column}" IS NULL OR ("${column}" >= 0 AND "${column}" <= 100)`,
    )
  }

  await addCheck(
    'animal_evaluations',
    'chk_animal_evaluations_production_level',
    `"production_reliability_level" IS NULL
       OR ("production_reliability_level" >= 1 AND "production_reliability_level" <= 5)`,
  )

  await addCheck(
    'animal_evaluations',
    'chk_animal_evaluations_health_level',
    `"health_reliability_level" IS NULL
       OR ("health_reliability_level" >= 1 AND "health_reliability_level" <= 5)`,
  )
}

/**
 * Откат снимает ограничения и возвращает `numeric`.
 *
 * Дробные значения при этом не возвращаются: они округлены и утеряны.
 * Это и есть цена перевода типа, и знать о ней надо до, а не после —
 * поэтому миграция считает их и говорит вслух.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "milk_tests" DROP CONSTRAINT IF EXISTS "chk_milk_tests_recording_per_year";`)

  for (const column of PERCENT_COLUMNS) {
    await db.execute(
      sql.raw(
        `ALTER TABLE "animal_evaluations" DROP CONSTRAINT IF EXISTS "chk_animal_evaluations_${column}";`,
      ),
    )
  }

  await db.execute(sql`
    ALTER TABLE "animal_evaluations"
      DROP CONSTRAINT IF EXISTS "chk_animal_evaluations_production_level";`)
  await db.execute(sql`
    ALTER TABLE "animal_evaluations"
      DROP CONSTRAINT IF EXISTS "chk_animal_evaluations_health_level";`)

  await db.execute(sql`
    ALTER TABLE "milk_tests" ALTER COLUMN "recording_per_year" TYPE numeric;`)
  await db.execute(sql`
    ALTER TABLE "weighings" ALTER COLUMN "lactation_number" TYPE numeric;`)
}
