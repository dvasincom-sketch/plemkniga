import { sql } from 'drizzle-orm'
import { check, integer } from 'drizzle-orm/pg-core'
import type { PostgresSchemaHook } from '@payloadcms/drizzle/postgres'

/**
 * Правила предметной области, перенесённые в саму базу.
 *
 * Проверки в хуках Payload (`beforeValidate` в `src/collections/Animals.ts`)
 * работают ровно до тех пор, пока запись идёт через Payload. Скрипт переноса
 * данных, ручной `UPDATE` в психологически тяжёлый вечер, будущий конвейер
 * BLUP, пишущий оценки пакетом, — всё это ходит мимо. База же не знает
 * о предметной области ничего: до этого файла в схеме не было ни одного
 * CHECK, и PostgreSQL спокойно принял бы животное, которое приходится
 * само себе отцом.
 *
 * Что сюда попадает и что нет
 *
 * CHECK умеет смотреть только на одну строку и только на неизменяемые
 * выражения. Поэтому здесь живут диапазоны, знаки и сравнения колонок между
 * собой. Всё, что требует заглянуть в другую строку, остаётся в приложении:
 *
 *  - отец должен быть быком, мать — коровой (нужна строка родителя);
 *  - потомок не может родиться раньше родителя (то же);
 *  - в родословной не должно быть циклов A → B → C → A (обход графа);
 *  - дата рождения не в будущем (`now()` не immutable, в CHECK нельзя).
 *
 * Эти четыре правила проверяет `beforeValidate` коллекции животных, и там же
 * написано, почему. Разделение не идеально, но честно: база защищает то,
 * что умеет защищать всегда, приложение — остальное.
 *
 * Именование: префикс `chk_` и говорящее окончание. Имя ограничения — это
 * то, что человек увидит в ошибке PostgreSQL, и `chk_animals_not_own_father`
 * объясняет себя без документации.
 *
 * Как это попадает в схему: хук `afterSchemaInit` адаптера
 * (`src/payload.config.ts`) — Payload строит таблицы из полей коллекций,
 * а мы дописываем к ним ограничения. Миграции их подхватывают:
 * `payload migrate:create` видит разницу и генерирует ALTER TABLE.
 */

/**
 * Счётчик целым числом вместо `numeric`.
 *
 * Payload переводит любое поле `type: 'number'` в `numeric` — правило зашито
 * в адаптере и настройкой поля не меняется. Для процентов и надоев это верно,
 * для номера лактации и числа доз — нет: `numeric` разрешает 2.5 попытки
 * осеменения, а модель данных должна говорить о предметной области правду.
 *
 * Тонкость, из-за которой это делается функцией, а не строкой в конфиге:
 * переопределение колонки заменяет её целиком, вместе с `NOT NULL`
 * и значением по умолчанию, которые Payload вывел из `required`
 * и `defaultValue`. Проставить их руками — значит завести второе место,
 * где написано то же самое, и рано или поздно они разойдутся: кто-то
 * добавит `required: true` в поле, а колонка молча останется nullable.
 * Поэтому флаги считываются с уже построенной колонки.
 *
 * Почему `integer`, а не `smallint`: в строке рядом лежат четырёх- и
 * восьмибайтовые колонки, выравнивание всё равно съест экономию, а арифметика
 * с `integer` проще на стыке с драйвером.
 */
const asInteger = (table: Record<string, unknown>, key: string, column: string) => {
  const current = table[key] as
    | { notNull?: boolean; hasDefault?: boolean; default?: unknown }
    | undefined

  let col = integer(column)
  if (current?.notNull) col = col.notNull()
  if (current?.hasDefault && typeof current.default === 'number') col = col.default(current.default)
  return col
}

/** Диапазон включительно; NULL проходит — необязательность решают поля. */
const range = (col: string, min: number, max: number) =>
  sql.raw(`("${col}" is null or ("${col}" >= ${min} and "${col}" <= ${max}))`)

/** Строго больше нуля: номера лактаций, попыток, доз. */
const positive = (col: string) => sql.raw(`("${col}" is null or "${col}" > 0)`)

/** Не отрицательное: количества и надои. */
const nonNegative = (col: string) => sql.raw(`("${col}" is null or "${col}" >= 0)`)

/** Проценты 0…100 — доли крови, инбридинг, жир, белок, достоверность. */
const percent = (col: string) => range(col, 0, 100)

export const addDomainConstraints: PostgresSchemaHook = ({ schema, extendTable }) => {
  const table = (name: string) => schema.tables[name]

  const animals = table('animals')
  if (animals) {
    extendTable({
      table: animals,
      columns: { trustLevel: asInteger(animals, 'trustLevel', 'trust_level') },
      extraConfig: () => ({
        /*
         * Самозачатие. В коде это уже запрещено, но запрет там держится
         * на одной строке хука; в базе он держится на самой базе.
         */
        chk_animals_not_own_father: check(
          'chk_animals_not_own_father',
          sql.raw(`("father_id" is null or "father_id" <> "id")`),
        ),
        chk_animals_not_own_mother: check(
          'chk_animals_not_own_mother',
          sql.raw(`("mother_id" is null or "mother_id" <> "id")`),
        ),
        // Одно и то же животное не может быть и отцом, и матерью
        chk_animals_parents_differ: check(
          'chk_animals_parents_differ',
          sql.raw(`("father_id" is null or "mother_id" is null or "father_id" <> "mother_id")`),
        ),

        // Уровень достоверности данных — шкала 0…3 (Таблица №4 ТЗ)
        chk_animals_trust_level: check('chk_animals_trust_level', range('trust_level', 0, 3)),

        // Доли и проценты
        chk_animals_blood_percent: check('chk_animals_blood_percent', percent('blood_percent')),
        chk_animals_inbreeding: check('chk_animals_inbreeding', percent('inbreeding')),
        chk_animals_improvers_share1: check(
          'chk_animals_improvers_share1',
          percent('improvers_share1'),
        ),
        chk_animals_improvers_share2: check(
          'chk_animals_improvers_share2',
          percent('improvers_share2'),
        ),

        /*
         * Достоверность оценки — шкала 1…5 (ТЗ, Таблица №3). Не путать
         * с уровнем достоверности данных выше: та про происхождение записи,
         * эта про надёжность прогноза.
         */
        chk_animals_production_reliability: check(
          'chk_animals_production_reliability',
          range('production_reliability_level', 1, 5),
        ),
        chk_animals_health_reliability: check(
          'chk_animals_health_reliability',
          range('health_reliability_level', 1, 5),
        ),

        // Достоверности отдельных признаков — доли объяснённой дисперсии, %
        chk_animals_ipc_r: check('chk_animals_ipc_r', percent('ipc_details_r')),
        chk_animals_ipc_percentile: check(
          'chk_animals_ipc_percentile',
          percent('ipc_details_percentile'),
        ),

        // Содержание жира и белка в молоке — процент, причём не любой
        chk_animals_summary_fat: check('chk_animals_summary_fat', range('summary_fat_percent', 0, 15)),
        chk_animals_summary_protein: check(
          'chk_animals_summary_protein',
          range('summary_protein_percent', 0, 15),
        ),
        chk_animals_summary_milk: check('chk_animals_summary_milk', nonNegative('summary_milk_yield')),
      }),
    })
  }

  const calvings = table('calvings')
  if (calvings) {
    extendTable({
      table: calvings,
      columns: { number: asInteger(calvings, 'number', 'number') },
      extraConfig: () => ({
        // Отёл по счёту: первый, второй… Нулевого отёла не бывает
        chk_calvings_number: check('chk_calvings_number', positive('number')),
        chk_calvings_milking_days: check('chk_calvings_milking_days', nonNegative('milking_days')),
        chk_calvings_calf_weight: check('chk_calvings_calf_weight', positive('calf_weight')),
      }),
    })
  }

  const inseminations = table('inseminations')
  if (inseminations) {
    extendTable({
      table: inseminations,
      columns: {
        attemptNumber: asInteger(inseminations, 'attemptNumber', 'attempt_number'),
        doses: asInteger(inseminations, 'doses', 'doses'),
        lactationNumber: asInteger(inseminations, 'lactationNumber', 'lactation_number'),
      },
      extraConfig: () => ({
        chk_inseminations_attempt: check('chk_inseminations_attempt', positive('attempt_number')),
        chk_inseminations_doses: check('chk_inseminations_doses', positive('doses')),
      }),
    })
  }

  const milkTests = table('milk_tests')
  if (milkTests) {
    extendTable({
      table: milkTests,
      columns: { lactationNumber: asInteger(milkTests, 'lactationNumber', 'lactation_number') },
      extraConfig: () => ({
        chk_milk_tests_lactation: check('chk_milk_tests_lactation', positive('lactation_number')),
        chk_milk_tests_yield: check('chk_milk_tests_yield', nonNegative('daily_yield')),
        chk_milk_tests_fat: check('chk_milk_tests_fat', range('fat_percent', 0, 15)),
        chk_milk_tests_protein: check('chk_milk_tests_protein', range('protein_percent', 0, 15)),
      }),
    })
  }

  const indexValues = table('index_values')
  if (indexValues) {
    extendTable({
      table: indexValues,
      columns: { used: asInteger(indexValues, 'used', 'used') },
      extraConfig: () => ({
        chk_index_values_reliability: check('chk_index_values_reliability', percent('reliability')),
        chk_index_values_used: check('chk_index_values_used', nonNegative('used')),
      }),
    })
  }

  const indexBases = table('index_bases_traits')
  if (indexBases) {
    extendTable({
      table: indexBases,
      columns: { n: asInteger(indexBases, 'n', 'n') },
      extraConfig: () => ({
        // Стандартное отклонение нулевым быть не может: на него делят
        chk_index_bases_sd: check('chk_index_bases_sd', sql.raw(`("sd" is null or "sd" > 0)`)),
        chk_index_bases_n: check('chk_index_bases_n', nonNegative('n')),
      }),
    })
  }

  return schema
}
