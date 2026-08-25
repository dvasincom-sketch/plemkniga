import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Собственный промер коровы отделён от передачи потомству.
 *
 * ## Что было не так
 *
 * Линейные признаки хранились одной группой на всех. У быка там лежало
 * отклонение — прогноз того, какими будут дочери; у коровы туда же
 * попадал снимок осмотра бонитёром. Числа выглядели одинаково и значили
 * разное: балл — факт о теле конкретного животного, отклонение — вывод
 * о генах, посчитанный по всей популяции с поправкой на стадо, год
 * и возраст.
 *
 * Пока это лежало в одном столбце, всякое среднее по нему было бессмыслицей:
 * половина значений про тело, половина про потомство.
 *
 * ## Что делает миграция
 *
 * Заводит группу `linear_score_*` под собственный промер по девятибалльной
 * шкале — так линейную оценку ведут во всём мире, пятёрка означает среднее
 * по породе. Группа `exterior_*` остаётся тем, чем должна была быть
 * с самого начала: передачей потомству.
 *
 * ## Что переводится, а что нет
 *
 * История осмотров (`animal_exteriors`) переводится: эта таблица
 * по определению содержит осмотр — у каждой строки есть бонитёр и дата,
 * — и происхождение чисел там известно. Перевод простой: пятёрка есть
 * ноль, каждая единица шкалы — балл, границы обрезаются. Точным его
 * назвать нельзя, но он не выдумывает происхождение, а меняет запись
 * известной величины.
 *
 * Снимок последнего осмотра переносится в новую группу вместе
 * с переводом — иначе карточки остались бы пустыми до следующего
 * приезда бонитёра.
 *
 * Группа `exterior_*` в самих животных **не трогается**. Там смешаны
 * снимки осмотров и привезённые оценки расчётных центров, и какое число
 * откуда — мы не знаем. Пересчитать всё скопом значило бы сделать
 * неизвестное достоверным на вид, что хуже пустоты. У быков эти числа
 * и должны остаться отклонениями; у коров, чей осмотр был, значения
 * приедут из перевода истории.
 *
 * Даты оценки хранятся отдельным столбцом: балл без даты не читается —
 * корову осматривают раз за лактацию, и трёхлетней давности оценка вымени
 * говорит о другом животном.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "animals"
    ADD COLUMN IF NOT EXISTS "linear_score_assessed_at" timestamp(3) with time zone,
    ADD COLUMN IF NOT EXISTS "linear_score_height" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_chest_width" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_body_depth" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_body_type" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_rump_angle" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_rump_width" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_rear_legs_rear" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_rear_legs_side" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_hoof_angle" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_front_legs" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_movement" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_fore_udder" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_front_teat_placement" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_teat_length" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_udder_depth" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_rear_udder" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_central_ligament" numeric,
    ADD COLUMN IF NOT EXISTS "linear_score_rear_teat_placement" numeric;`)

  /*
   * Перевод истории осмотров и перенос действующего снимка.
   *
   * Оба делаются одним проходом по списку колонок: писать восемнадцать
   * почти одинаковых команд руками — верный способ пропустить одну
   * и потом искать, почему у длины сосков баллов нет.
   */
  await db.execute(sql`
  DO $$
  DECLARE c text; base text;
  BEGIN
    FOR c IN
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'animals' AND column_name LIKE 'linear\_score\_%'
         AND data_type = 'numeric'
    LOOP
      base := substr(c, length('linear_score_') + 1);

      -- Перевод самой истории: −2…+2 становятся 3…7, пятёрка есть ноль
      EXECUTE format(
        'UPDATE animal_exteriors SET %I = least(9, greatest(1, round(5 + %I)))
          WHERE %I IS NOT NULL AND %I BETWEEN -3 AND 3',
        base, base, base, base);

      -- Перенос действующего осмотра в карточку
      EXECUTE format(
        'UPDATE animals a SET %I = e.%I
           FROM animal_exteriors e
          WHERE e.animal_id = a.id AND e.is_current = true AND e.%I IS NOT NULL',
        c, base, base);
    END LOOP;
  END $$;`)

  await db.execute(sql`
  UPDATE animals a
     SET linear_score_assessed_at = e.assessed_at
    FROM animal_exteriors e
   WHERE e.animal_id = a.id AND e.is_current = true;`)

  /*
   * Границы шкалы — в базе, а не только в форме. Балл вне единицы-девятки
   * не «плохой ввод», а величина, которой не бывает; попав через загрузку
   * файлом или через API, она разойдётся по отчётам и обнаружится далеко
   * от места, где появилась.
   *
   * Ставятся после перевода, а не до: иначе первая же строка со старым
   * −1,4 не прошла бы проверку, и миграция упала бы на данных, которые
   * сама же и собиралась починить.
   */
  await db.execute(sql`
  DO $$
  DECLARE c text;
  BEGIN
    FOR c IN
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'animals' AND column_name LIKE 'linear\_score\_%'
         AND data_type = 'numeric'
    LOOP
      EXECUTE format(
        'ALTER TABLE animals ADD CONSTRAINT %I CHECK (%I IS NULL OR (%I >= 1 AND %I <= 9))',
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
       WHERE table_name = 'animals' AND column_name LIKE 'linear\_score\_%'
    LOOP
      EXECUTE format('ALTER TABLE animals DROP CONSTRAINT IF EXISTS %I', 'chk_' || c);
      EXECUTE format('ALTER TABLE animals DROP COLUMN IF EXISTS %I', c);
    END LOOP;
  END $$;`)
}
