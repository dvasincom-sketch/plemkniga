import { sql } from 'drizzle-orm'
import {
  RECORDING_PROTOCOL,
  RECORDING_SCHEME,
  SAMPLING_MOMENT,
  SAMPLING_SCHEME,
} from '@/lib/milk-recording'
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
 * Правила описаны списком, а не россыпью вызовов `check()`, ради одной вещи:
 * тот же список читает `npm run db:precheck` и заранее показывает, какие
 * строки в конкретной базе ограничение не пройдут. Так проверка перестала
 * зависеть от того, совпали ли тестовые данные с боевыми, — а один раз
 * не совпали: шкала достоверности идёт с −1 («отклонено»), в разработке
 * таких записей не было, и миграция упала уже на проде.
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
 * Границы диапазонов берутся из полей коллекций (`min` / `max`), а не из
 * головы: расхождение между тем, что разрешает форма, и тем, что разрешает
 * база, — это отложенная авария.
 *
 * Как это попадает в схему: хук `afterSchemaInit` адаптера
 * (`src/payload.config.ts`) — Payload строит таблицы из полей коллекций,
 * а мы дописываем к ним ограничения. Миграции их подхватывают:
 * `payload migrate:create` видит разницу и генерирует ALTER TABLE.
 */

/*
 * Списки значений берутся из тех же перечислений, которыми пользуется
 * приложение: второй экземпляр разошёлся бы с первым, и база начала бы
 * отвергать значение, которое форма предлагает.
 */
const RECORDING_PROTOCOL_VALUES = Object.keys(RECORDING_PROTOCOL)
const RECORDING_SCHEME_VALUES = Object.keys(RECORDING_SCHEME)
const SAMPLING_SCHEME_VALUES = Object.keys(SAMPLING_SCHEME)
const SAMPLING_MOMENT_VALUES = Object.keys(SAMPLING_MOMENT)

export type DomainRule = {
  table: string
  /** Имя ограничения — то, что человек увидит в ошибке PostgreSQL. */
  name: string
  /** Предикат: истина для допустимой строки. NULL обрабатывается явно. */
  expr: string
  note: string
  /**
   * Границы диапазона отдельно от выражения — чтобы их можно было сверить.
   *
   * Выше обещано, что границы берутся из полей коллекций, а не из головы.
   * Обещание держалось на честном слове: у половины полей `min` и `max`
   * не были проставлены вовсе, база отвечала сырым `chk_…`, а форма
   * пропускала жирность в двести процентов. Проверить это было нечем —
   * границы жили внутри готовой строки SQL, откуда их не достать.
   *
   * Теперь они лежат числами рядом, и `npm run check:bounds` сверяет
   * каждую пару с `min` и `max` того поля, из которого выросла колонка.
   * Расхождение — красная строка прогона, а не сюрприз на проде.
   */
  bounds?: { column: string; min: number; max: number }
}

/** Диапазон включительно; NULL проходит — обязательность решают сами поля. */
const range = (col: string, min: number, max: number) =>
  `("${col}" is null or ("${col}" >= ${min} and "${col}" <= ${max}))`

/** Строго больше нуля: номера лактаций, попыток, доз. */
const positive = (col: string) => `("${col}" is null or "${col}" > 0)`

/** Не отрицательное: количества, дни, надои. */
const nonNegative = (col: string) => `("${col}" is null or "${col}" >= 0)`

/**
 * Значение из перечисления — для полей `select`, ставших в базе `varchar`.
 *
 * Payload заводит перечисления настоящим типом PostgreSQL, но не всегда:
 * поля, добавленные миграциями `breed_direction` и `milk_recording_method`,
 * легли обычными строками. База после этого не проверяет ничего: скрипт
 * переноса и ручной `UPDATE` кладут туда что угодно, а страница молча
 * показывает пустую подпись — значение, которого нет в перечислении,
 * не находит себе имени.
 *
 * Переписывать тип на проде — отдельная работа с `ALTER TYPE … USING`
 * и с риском упасть на первой же непредвиденной строке. Ограничение
 * даёт ту же гарантию дешевле и ложится в существующий механизм:
 * `db:precheck` заранее покажет строки, которые его не пройдут.
 */
const oneOf = (col: string, values: readonly string[]) =>
  `("${col}" is null or "${col}" in (${values.map((v) => `'${v}'`).join(', ')}))`

export const DOMAIN_RULES: DomainRule[] = [
  /* ----------------------------- Родословная ------------------------------ */
  {
    table: 'animals',
    name: 'chk_animals_not_own_father',
    expr: `("father_id" is null or "father_id" <> "id")`,
    note: 'животное не может быть своим отцом',
  },
  {
    table: 'animals',
    name: 'chk_animals_not_own_mother',
    expr: `("mother_id" is null or "mother_id" <> "id")`,
    note: 'животное не может быть своей матерью',
  },
  {
    table: 'animals',
    name: 'chk_animals_parents_differ',
    expr: `("father_id" is null or "mother_id" is null or "father_id" <> "mother_id")`,
    note: 'отец и мать — разные животные',
  },

  /* ------------------------------ Животное -------------------------------- */
  {
    table: 'animals',
    name: 'chk_animals_trust_level',
    /*
     * Шкала начинается с −1 «отклонено» (ТЗ, Таблица №4; `TRUST_LEVELS`
     * в `src/lib/dictionaries.ts`, поле `trustLevel` объявлено `min: -1`).
     * Ноль — это «черновик», а не низ шкалы.
     */
    expr: range('trust_level', -1, 3),
    bounds: { column: 'trust_level', min: -1, max: 3 },
    note: 'уровень достоверности данных −1…3',
  },
  {
    table: 'animals',
    name: 'chk_animals_blood_percent',
    expr: range('blood_percent', 0, 100),
    bounds: { column: 'blood_percent', min: 0, max: 100 },
    note: 'кровность 0…100 %',
  },
  {
    table: 'animals',
    name: 'chk_animals_inbreeding',
    expr: range('inbreeding', 0, 100),
    bounds: { column: 'inbreeding', min: 0, max: 100 },
    note: 'коэффициент инбридинга 0…100 %',
  },
  {
    table: 'animals',
    name: 'chk_animals_improvers_share1',
    expr: range('improvers_share1', 0, 100),
    bounds: { column: 'improvers_share1', min: 0, max: 100 },
    note: 'доля крови улучшателя 0…100 %',
  },
  {
    table: 'animals',
    name: 'chk_animals_improvers_share2',
    expr: range('improvers_share2', 0, 100),
    bounds: { column: 'improvers_share2', min: 0, max: 100 },
    note: 'доля крови улучшателя 0…100 %',
  },
  {
    table: 'animals',
    name: 'chk_animals_production_reliability',
    // Уровень оценки по документу — шкала 1…5 (ТЗ, Таблица №3). Ни то
    // ни другое из соседних: не уровень достоверности данных (тот про
    // подтверждение записи) и не надёжность R (та посчитана нами).
    expr: range('production_reliability_level', 1, 5),
    bounds: { column: 'production_reliability_level', min: 1, max: 5 },
    note: 'уровень оценки продуктивности по документу 1…5',
  },
  {
    table: 'animals',
    name: 'chk_animals_health_reliability',
    expr: range('health_reliability_level', 1, 5),
    bounds: { column: 'health_reliability_level', min: 1, max: 5 },
    note: 'уровень оценки здоровья по документу 1…5',
  },
  {
    table: 'animals',
    name: 'chk_animals_ipc_r',
    expr: range('ipc_details_r', 0, 100),
    bounds: { column: 'ipc_details_r', min: 0, max: 100 },
    note: 'надёжность ИПЦ 0…100 %',
  },
  {
    table: 'animals',
    name: 'chk_animals_ipc_percentile',
    expr: range('ipc_details_percentile', 0, 100),
    bounds: { column: 'ipc_details_percentile', min: 0, max: 100 },
    note: 'процентиль ИПЦ 0…100',
  },
  {
    table: 'animals',
    name: 'chk_animals_summary_fat',
    expr: range('summary_fat_percent', 0, 15),
    bounds: { column: 'summary_fat_percent', min: 0, max: 15 },
    note: 'жирность молока 0…15 %',
  },
  {
    table: 'animals',
    name: 'chk_animals_summary_protein',
    expr: range('summary_protein_percent', 0, 15),
    bounds: { column: 'summary_protein_percent', min: 0, max: 15 },
    note: 'белок молока 0…15 %',
  },
  {
    table: 'animals',
    name: 'chk_animals_summary_milk',
    expr: nonNegative('summary_milk_yield'),
    note: 'удой не отрицательный',
  },

  /* -------------------------------- Отёлы --------------------------------- */
  {
    table: 'calvings',
    name: 'chk_calvings_number',
    expr: positive('number'),
    note: 'номер отёла больше нуля',
  },
  {
    table: 'calvings',
    name: 'chk_calvings_milking_days',
    expr: nonNegative('milking_days'),
    note: 'дней доения не отрицательно',
  },
  {
    table: 'calvings',
    name: 'chk_calvings_calf_weight',
    expr: positive('calf_weight'),
    note: 'живая масса телёнка больше нуля',
  },

  /* ------------------------------ Осеменения ------------------------------ */
  {
    table: 'inseminations',
    name: 'chk_inseminations_attempt',
    expr: positive('attempt_number'),
    note: 'номер попытки больше нуля',
  },
  {
    table: 'inseminations',
    name: 'chk_inseminations_doses',
    expr: positive('doses'),
    note: 'число доз больше нуля',
  },

  /* --------------------------- Контрольные дойки -------------------------- */
  {
    table: 'milk_tests',
    name: 'chk_milk_tests_lactation',
    expr: positive('lactation_number'),
    note: 'номер лактации больше нуля',
  },
  {
    table: 'milk_tests',
    name: 'chk_milk_tests_yield',
    expr: nonNegative('daily_yield'),
    note: 'суточный удой не отрицательный',
  },
  {
    table: 'milk_tests',
    name: 'chk_milk_tests_fat',
    expr: range('fat_percent', 0, 15),
    bounds: { column: 'fat_percent', min: 0, max: 15 },
    note: 'жирность 0…15 %',
  },
  {
    table: 'milk_tests',
    name: 'chk_milk_tests_protein',
    expr: range('protein_percent', 0, 15),
    bounds: { column: 'protein_percent', min: 0, max: 15 },
    note: 'белок 0…15 %',
  },

  /* --------------------------- Индекс и его база -------------------------- */
  {
    table: 'index_values',
    name: 'chk_index_values_reliability',
    expr: range('reliability', 0, 100),
    bounds: { column: 'reliability', min: 0, max: 100 },
    note: 'надёжность индекса 0…100 %',
  },
  {
    table: 'index_values',
    name: 'chk_index_values_used',
    expr: nonNegative('used'),
    note: 'учтено признаков не отрицательно',
  },
  {
    table: 'index_values',
    name: 'chk_index_values_percentile',
    expr: range('percentile', 0, 100),
    bounds: { column: 'percentile', min: 0, max: 100 },
    note: 'процентиль 0…100',
  },
  {
    table: 'index_values',
    name: 'chk_index_values_cohort',
    expr: positive('cohort'),
    note: 'размер группы сравнения больше нуля',
  },
  {
    table: 'index_bases_traits',
    name: 'chk_index_bases_sd',
    // На σ делят при стандартизации — ноль превратил бы индекс в бесконечность
    expr: `("sd" is null or "sd" > 0)`,
    note: 'стандартное отклонение больше нуля',
  },
  {
    table: 'index_bases_traits',
    name: 'chk_index_bases_n',
    expr: nonNegative('n'),
    note: 'объём выборки не отрицателен',
  },

  /* ------------------- Перечисления, ставшие строками --------------------- */
  {
    table: 'breeds',
    name: 'chk_breeds_direction',
    expr: oneOf('direction', ['dairy', 'dual', 'beef', 'other']),
    note: 'направление продуктивности — из четырёх значений справочника',
  },
  /* ------------------- История оценки и экстерьера ------------------------ */

  /*
   * Обе таблицы заведены позже основного набора ограничений, и правила
   * до них не дошли. А заполняются они как раз тем способом, ради которого
   * ограничения и переносились в базу: пакетным переносом истории и записью
   * из расчётного центра, то есть мимо форм и мимо полей коллекции.
   * Границы у полей стоят, но поле — это форма; база до сих пор принимала
   * надёжность в двести процентов и балл экстерьера в тридцать.
   */
  ...([
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
  ].map((col) => ({
    table: 'animal_evaluations',
    name: `chk_animal_evaluations_${col}`,
    expr: range(col, 0, 100),
    bounds: { column: col, min: 0, max: 100 },
    note: 'надёжность и процентиль — от нуля до ста',
  }))),
  {
    table: 'animal_evaluations',
    name: 'chk_animal_evaluations_production_level',
    expr: range('production_reliability_level', 1, 5),
    bounds: { column: 'production_reliability_level', min: 1, max: 5 },
    note: 'ступень надёжности продуктивности — от одного до пяти',
  },
  {
    table: 'animal_evaluations',
    name: 'chk_animal_evaluations_health_level',
    expr: range('health_reliability_level', 1, 5),
    bounds: { column: 'health_reliability_level', min: 1, max: 5 },
    note: 'ступень надёжности здоровья — от одного до пяти',
  },

  {
    table: 'milk_tests',
    name: 'chk_milk_tests_recording_per_year',
    expr: range('recording_per_year', 1, 24),
    bounds: { column: 'recording_per_year', min: 1, max: 24 },
    note: 'контролей в год 1…24',
  },
  {
    table: 'milk_tests',
    name: 'chk_milk_tests_recording_protocol',
    expr: oneOf('recording_protocol', RECORDING_PROTOCOL_VALUES),
    note: 'метод контроля — из перечисления ICAR',
  },
  {
    table: 'milk_tests',
    name: 'chk_milk_tests_recording_scheme',
    expr: oneOf('recording_scheme', RECORDING_SCHEME_VALUES),
    note: 'схема учёта доений — из перечисления ICAR',
  },
  {
    table: 'milk_tests',
    name: 'chk_milk_tests_sampling_scheme',
    expr: oneOf('sampling_scheme', SAMPLING_SCHEME_VALUES),
    note: 'схема отбора пробы — из перечисления ICAR',
  },
  {
    table: 'milk_tests',
    name: 'chk_milk_tests_sampling_moment',
    expr: oneOf('sampling_moment', SAMPLING_MOMENT_VALUES),
    note: 'момент отбора пробы — из перечисления ICAR',
  },
]

/**
 * Счётчики целым числом вместо `numeric`.
 *
 * Payload переводит любое поле `type: 'number'` в `numeric` — правило зашито
 * в адаптере и настройкой поля не меняется. Для процентов и надоев это верно,
 * для номера лактации и числа доз — нет: `numeric` разрешает 2.5 попытки
 * осеменения, а модель данных должна говорить о предметной области правду.
 *
 * `key` — имя колонки в схеме Drizzle (camelCase поля), `column` — в базе.
 * Оба нужны: по первому колонка находится, вторым называется.
 *
 * Почему `integer`, а не `smallint`: в строке рядом лежат четырёх- и
 * восьмибайтовые колонки, выравнивание всё равно съест экономию, а арифметика
 * с `integer` проще на стыке с драйвером.
 */
export const INTEGER_COLUMNS: { table: string; key: string; column: string; note: string }[] = [
  { table: 'animals', key: 'trustLevel', column: 'trust_level', note: 'уровень достоверности' },
  { table: 'calvings', key: 'number', column: 'number', note: 'номер отёла' },
  { table: 'inseminations', key: 'attemptNumber', column: 'attempt_number', note: 'номер попытки' },
  { table: 'inseminations', key: 'doses', column: 'doses', note: 'число доз' },
  { table: 'inseminations', key: 'lactationNumber', column: 'lactation_number', note: 'номер отёла' },
  { table: 'milk_tests', key: 'lactationNumber', column: 'lactation_number', note: 'номер лактации' },
  /*
   * Две колонки того же рода, заведённые уже после первой восьмёрки
   * и потому в неё не попавшие. Счёт штуками: контролей в год не бывает
   * двенадцать с половиной, номер лактации не бывает дробным. Список
   * пополняется руками, и это его слабое место — но других способов
   * отличить «число как мера» от «числа как счёта» у Payload нет.
   */
  {
    table: 'milk_tests',
    key: 'recordingPerYear',
    column: 'recording_per_year',
    note: 'контролей в год',
  },
  {
    table: 'weighings',
    key: 'lactationNumber',
    column: 'lactation_number',
    note: 'номер лактации',
  },
  { table: 'index_values', key: 'used', column: 'used', note: 'учтено признаков' },
  { table: 'index_values', key: 'birthYear', column: 'birth_year', note: 'год рождения' },
  { table: 'index_values', key: 'percentile', column: 'percentile', note: 'процентиль' },
  { table: 'index_values', key: 'cohort', column: 'cohort', note: 'размер группы' },
  { table: 'index_bases_traits', key: 'n', column: 'n', note: 'объём выборки' },
]

/**
 * Переопределение колонки заменяет её целиком — вместе с `NOT NULL`
 * и значением по умолчанию, которые Payload вывел из `required`
 * и `defaultValue`. Прописать их второй раз руками значит завести второе
 * место с тем же знанием, и рано или поздно они разойдутся молча: кто-то
 * добавит `required: true` в поле, а колонка останется nullable. Поэтому
 * флаги считываются с уже построенной колонки.
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

export const addDomainConstraints: PostgresSchemaHook = ({ schema, extendTable }) => {
  const names = new Set([
    ...DOMAIN_RULES.map((r) => r.table),
    ...INTEGER_COLUMNS.map((c) => c.table),
  ])

  for (const name of names) {
    const table = schema.tables[name]
    if (!table) continue

    const rules = DOMAIN_RULES.filter((r) => r.table === name)
    const columns = Object.fromEntries(
      INTEGER_COLUMNS.filter((c) => c.table === name).map((c) => [
        c.key,
        asInteger(table as unknown as Record<string, unknown>, c.key, c.column),
      ]),
    )

    extendTable({
      table,
      columns: Object.keys(columns).length ? columns : undefined,
      extraConfig: rules.length
        ? () =>
            Object.fromEntries(rules.map((r) => [r.name, check(r.name, sql.raw(r.expr))]))
        : undefined,
    })
  }

  return schema
}
