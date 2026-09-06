import 'dotenv/config'
import { readdirSync } from 'node:fs'
import { Pool } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Сверка журнала миграций с тем, что на самом деле есть в базе.
 *
 * Зачем нужно. В режиме разработки Payload держит схему в актуальном виде
 * сам — командой `drizzle push`, минуя миграции. Таблицы при этом появляются,
 * а записей в `payload_migrations` не остаётся. Потом на такой базе запускают
 * `payload migrate`, она честно берёт первую миграцию, и PostgreSQL отвечает
 * «type enum_users_role already exists»: схема уже есть, а журнал пуст.
 *
 * Ошибка выглядит страшно — простыня SQL на несколько экранов, — но означает
 * ровно одно: база и журнал разошлись. Данные при этом целы, ничего чинить
 * в схеме не нужно. Нужно отметить в журнале то, что фактически применено.
 *
 * Что делает скрипт. Для каждой миграции проверяет по опорному объекту
 * (таблице или колонке), есть ли она в базе, и сверяет с журналом. Без флага
 * `--apply` только показывает таблицу сверки и ничего не пишет.
 *
 * Что скрипт не делает никогда: не создаёт, не меняет и не удаляет ни одного
 * объекта схемы и ни одной строки данных. Единственная запись — строки
 * в `payload_migrations`.
 *
 *   npm run migrate:baseline            # посмотреть расхождения
 *   npm run migrate:baseline -- --apply # отметить применённые как применённые
 *
 * Ограничение: опорные объекты перечислены ниже вручную. Добавили миграцию —
 * добавьте строку сюда, иначе скрипт о ней не узнает.
 */

type Probe =
  | { kind: 'table'; name: string }
  /**
   * Признак наоборот: объекта быть не должно. Нужен для миграций, которые
   * только удаляют, — у них «применена» значит «этого больше нет».
   */
  | { kind: 'absent-index'; name: string }
  /**
   * Колонки быть не должно: миграция её убрала. То же по смыслу, что
   * `absent-index`, но каталог другой — колонки лежат
   * в `information_schema.columns`.
   */
  | { kind: 'absent-column'; table: string; column: string }
  /**
   * Колонка объявлена обязательной. Понадобилось миграции, которая
   * ничего не добавляет и не удаляет, а только выставляет `NOT NULL`:
   * ни таблицы, ни колонки, ни ограничения после неё не появляется,
   * а по наличию колонки её не отличить от состояния до.
   */
  | { kind: 'not-null'; table: string; column: string }
  | { kind: 'column'; table: string; column: string }
  /** Ограничение целостности: миграция может не добавлять ни таблиц, ни колонок. */
  | { kind: 'constraint'; name: string }
  /**
   * Индекс. Отдельный вид, а не разновидность ограничения: индексы лежат
   * в `pg_indexes`, ограничения — в `pg_constraint`, и это разные каталоги.
   * Проверка индекса по `pg_constraint` не находит ничего никогда — скрипт
   * при этом уверенно сообщает «записана в журнале, а в базе нет» и советует
   * разбираться вручную. Ложная тревога такого рода хуже отсутствия проверки:
   * человек идёт чинить целую базу.
   */
  | { kind: 'index'; name: string }
  /**
   * Значение перечисления. Понадобилось миграции, которая ничего
   * не создаёт, а только расширяет уже существующий тип: ни таблицы,
   * ни колонки, ни ограничения после неё не появляется, и опознать её
   * прежними признаками нечем.
   */
  | { kind: 'enum-value'; type: string; value: string }
  /**
   * Опорного объекта больше нет: его убрала более поздняя миграция.
   *
   * Случай неочевидный, но неизбежный. Миграция завела индекс, по нему её
   * и опознавали; следующая миграция индекс удалила — и сверка честно
   * доложила «записана в журнале, а в базе нет», посоветовав разбираться
   * вручную. Разбираться там нечего: обе применены, просто вторая отменила
   * первую. Признаком становится опорный объект той миграции, что отменила.
   */
  | { kind: 'superseded'; by: string }

/** Порядок тот же, что в `src/migrations/index.ts`. */
/** Каталог с файлами миграций — сверяется со списком опор ниже. */
const MIGRATIONS_DIR = 'src/migrations'

const MIGRATIONS: { name: string; probe: Probe; note: string }[] = [
  {
    name: '20260814_195548',
    probe: { kind: 'table', name: 'animals' },
    note: 'начальная схема',
  },
  {
    name: '20260815_061539',
    probe: { kind: 'column', table: 'animals', column: 'for_sale' },
    note: 'признак продажи',
  },
  {
    name: '20260815_075706',
    probe: { kind: 'column', table: 'users', column: 'notify_submissions' },
    note: 'настройки уведомлений',
  },
  {
    name: '20260815_112204_access_requests',
    probe: { kind: 'table', name: 'access_requests' },
    note: 'запросы доступа',
  },
  {
    name: '20260816_071534_index_profiles',
    probe: { kind: 'table', name: 'index_profiles' },
    note: 'профили индекса',
  },
  {
    name: '20260816_081002_index_values',
    probe: { kind: 'table', name: 'index_values' },
    note: 'хранимые значения индекса',
  },
  {
    name: '20260816_084421_index_bases',
    probe: { kind: 'table', name: 'index_bases' },
    note: 'базы сравнения',
  },
  {
    name: '20260816_091110_index_base_sd',
    probe: { kind: 'column', table: 'index_bases_traits', column: 'sd_observed' },
    note: 'разброс оценок и достоверность в базе',
  },
  {
    name: '20260816_105109_submission_animals',
    probe: { kind: 'column', table: 'data_submissions', column: 'intake_rows' },
    note: 'записи пакета и итоги приёмки',
  },
  {
    name: '20260816_110132_submission_issues',
    probe: { kind: 'table', name: 'data_submissions_intake_issues' },
    note: 'причины непринятых строк',
  },
  {
    name: '20260816_165734_domain_rules',
    probe: { kind: 'constraint', name: 'chk_animals_not_own_father' },
    note: 'правила предметной области и типы счётчиков',
  },
  {
    name: '20260816_172319_evaluation_history',
    probe: { kind: 'table', name: 'animal_evaluations' },
    note: 'история оценок и экстерьера',
  },
  {
    name: '20260816_180908_index_value_scope',
    probe: { kind: 'column', table: 'index_values', column: 'public_visible' },
    note: 'поля отбора в строке значения индекса',
  },
  {
    name: '20260816_182450_index_value_state',
    probe: { kind: 'column', table: 'index_values', column: 'state' },
    note: 'состояние животного в строке значения индекса',
  },
  {
    name: '20260816_183242_index_value_page',
    // Индекс убран следующей миграцией — опознаём по ней
    probe: { kind: 'superseded', by: '20260816_202140_index_cleanup' },
    note: 'составной индекс под страницу книги (позже убран)',
  },
  {
    name: '20260816_202140_index_cleanup',
    // Миграция только удаляет: признак применённости — отсутствие индекса
    probe: { kind: 'absent-index', name: 'identNumber_idx' },
    note: 'убраны индексы, не пригодившиеся ни разу',
  },
  {
    name: '20260816_202627_index_value_cohort',
    probe: { kind: 'column', table: 'index_values', column: 'birth_year' },
    note: 'год рождения для группы сравнения',
  },
  {
    name: '20260816_204622_index_value_percentile',
    probe: { kind: 'column', table: 'index_values', column: 'percentile' },
    note: 'хранимый процентиль и размер группы',
  },
  {
    name: '20260816_211410_index_value_types',
    probe: { kind: 'constraint', name: 'chk_index_values_percentile' },
    note: 'целые типы и границы для процентиля',
  },
  {
    name: '20260817_051437_animal_revisions',
    probe: { kind: 'table', name: 'animal_revisions' },
    note: 'журнал правок карточки',
  },
  {
    name: '20260817_060327_expert_role_and_findings',
    probe: { kind: 'table', name: 'data_submissions_review_findings' },
    note: 'роль эксперта и находки проверки',
  },
  {
    name: '20260817_074414_verification_requests',
    probe: { kind: 'table', name: 'verification_requests' },
    note: 'заявки хозяйств на верификацию',
  },
  {
    name: '20260817_090409_membership_review',
    probe: { kind: 'column', table: 'organizations', column: 'membership_review_decided_at' },
    note: 'решение по членству хозяйства',
  },
  {
    name: '20260817_091349_document_issuance',
    probe: { kind: 'column', table: 'documents', column: 'issued_by_id' },
    note: 'журнал выдачи документов и отзыв',
  },
  {
    name: '20260817_133000_access_grants',
    probe: { kind: 'table', name: 'access_grants' },
    note: 'точечный доступ и журнал просмотров',
  },
  {
    name: '20260817_150000_request_scopes',
    probe: { kind: 'table', name: 'access_requests_scopes' },
    note: 'области в самом запросе доступа',
  },
  {
    name: '20260817_170000_view_journal',
    probe: { kind: 'column', table: 'access_views', column: 'first_at' },
    note: 'журнал просмотров: строка на пару животное + хозяйство',
  },
  {
    name: '20260817_180000_document_number',
    probe: { kind: 'index', name: 'documents_number_idx' },
    note: 'уникальный номер выданного документа',
  },
  {
    name: '20260817_190000_document_snapshot',
    probe: { kind: 'column', table: 'documents', column: 'snapshot' },
    note: 'снимок данных на момент выпуска документа',
  },
  {
    name: '20260822_090000_check_settings',
    probe: { kind: 'table', name: 'check_settings' },
    note: 'настройки автоматических проверок: отклонения от реестра',
  },
  {
    name: '20260823_080000_dna_verdict',
    probe: { kind: 'column', table: 'animals_dna_tests', column: 'verdict' },
    note: 'вывод ДНК-теста: подтверждено / исключено / не определено',
  },
  {
    name: '20260823_120000_dismissed_issues',
    probe: { kind: 'table', name: 'verification_requests_review_dismissed' },
    note: 'снятые экспертом автоматические находки с объяснением',
  },
  {
    name: '20260823_170000_check_thresholds',
    probe: { kind: 'table', name: 'check_thresholds' },
    note: 'пороги проверок: отклонения от заложенных в реестр',
  },
  {
    name: '20260823_200000_id_format_rus',
    probe: { kind: 'enum-value', type: 'enum_animals_id_format', value: 'rus' },
    note: 'российский международный номер XXRUS… отдельным форматом',
  },
  {
    name: '20260823_230000_verification_withdrawn',
    probe: { kind: 'column', table: 'verification_requests', column: 'withdrawn_for' },
    note: 'отзыв заявки в пользу новой: повторная подача тех же записей',
  },
  {
    name: '20260824_090000_archive_retention',
    probe: { kind: 'table', name: 'animal_removals' },
    note: 'срок хранения архива и реестр удалённых записей',
  },
  {
    name: '20260824_140000_share_links',
    probe: { kind: 'table', name: 'share_links' },
    note: 'ссылки на просмотр со сроком — для тех, у кого нет учётной записи',
  },
  {
    name: '20260824_180000_certificate_check',
    probe: { kind: 'column', table: 'documents', column: 'public_code' },
    note: 'код проверки подлинности на бланке (UC-03)',
  },
  {
    name: '20260825_090000_movements',
    probe: { kind: 'table', name: 'movements' },
    note: 'перемещения животных, карточки хозяйств вне книги, штамп владельца',
  },
  {
    name: '20260825_140000_team_roles',
    probe: { kind: 'table', name: 'invitations' },
    note: 'роли внутри хозяйства, приглашения, блокировка человека',
  },
  {
    name: '20260825_200000_media_access',
    probe: { kind: 'column', table: 'media', column: 'visibility' },
    note: 'владелец и видимость у файлов: закрыты исходники загрузок',
  },
  {
    name: '20260826_090000_operations',
    probe: { kind: 'table', name: 'operations' },
    note: 'сводный журнал операций',
  },
  {
    name: '20260826_140000_saved_searches',
    probe: { kind: 'table', name: 'saved_searches' },
    note: 'именованные отборы животных',
  },
  {
    name: '20260826_180000_bench_runs',
    probe: { kind: 'table', name: 'bench_runs' },
    note: 'замеры производительности',
  },
  {
    name: '20260827_090000_semen_and_grade',
    probe: { kind: 'column', table: 'animals', column: 'semen_conception_forecast' },
    note: 'семя быка и комплексный класс',
  },
  {
    name: '20260828_090000_evaluation_source',
    probe: { kind: 'column', table: 'animals', column: 'ipc_details_center' },
    note: 'кто считал привезённую оценку и по какой базе',
  },
  {
    name: '20260828_140000_linear_score',
    probe: { kind: 'column', table: 'animals', column: 'linear_score_height' },
    note: 'собственный промер коровы по шкале 1–9 отдельно от передачи потомству',
  },
  {
    name: '20260828_180000_calving_roles',
    probe: { kind: 'column', table: 'animals', column: 'calving_roles_ease_sire_forecast' },
    note: 'отёлы по роли быка: как отец телёнка и как дед по матери',
  },
  {
    name: '20260827_120000_check_runs',
    probe: { kind: 'table', name: 'check_runs' },
    note: 'результаты ночных прогонов',
  },
  {
    name: '20260829_090000_pending_columns',
    probe: { kind: 'table', name: 'pending_columns' },
    note: 'карантин неопознанных колонок загрузки',
  },
  /*
   * Отсюда список отставал на восемнадцать миграций — почти на неделю
   * работы. Отставание нашлось не чтением, а падением: `payload migrate`
   * упёрся в уже существующее ограничение, и сверка о нём не знала,
   * потому что записи не было. Собственная шапка этого файла ровно
   * об этом и предупреждает — «добавили миграцию, добавьте строку», —
   * и ровно так это и забывается: список нужен не автору миграции,
   * а тому, кто через месяц синхронизирует базу.
   */
  {
    name: '20260830_090000_lab_name',
    probe: { kind: 'column', table: 'documents', column: 'lab_name' },
    note: 'название лаборатории в протоколе',
  },
  {
    name: '20260830_120000_age_group_source',
    probe: { kind: 'column', table: 'animals', column: 'age_group_date' },
    note: 'дата определения возрастной группы',
  },
  {
    name: '20260830_150000_submission_value_issues',
    probe: { kind: 'table', name: 'data_submissions_intake_value_issues' },
    note: 'замечания по значениям в пакете загрузки',
  },
  {
    name: '20260830_170000_fgias_uuid',
    probe: { kind: 'column', table: 'breeds', column: 'fgias_uuid' },
    note: 'ключ ФГИАС ПР в справочниках',
  },
  {
    name: '20260830_190000_fgias_animal_keys',
    probe: { kind: 'column', table: 'animals', column: 'fgias_base_uuid' },
    note: 'номера реестра у животного',
  },
  {
    name: '20260830_210000_animal_shows',
    probe: { kind: 'table', name: 'animals_shows' },
    note: 'выставки животного',
  },
  {
    name: '20260830_230000_weighings',
    probe: { kind: 'table', name: 'weighings' },
    note: 'взвешивания',
  },
  {
    name: '20260831_090000_dna_isag',
    probe: { kind: 'column', table: 'animals_dna_tests', column: 'certificate_number' },
    note: 'номер сертификата ДНК-теста',
  },
  {
    name: '20260831_120000_birth_place',
    probe: { kind: 'table', name: 'countries' },
    note: 'страны и место рождения',
  },
  {
    name: '20260901_090000_gradings_and_calving_event',
    probe: { kind: 'table', name: 'gradings' },
    note: 'бонитировки и тип события отёла',
  },
  {
    name: '20260901_150000_exterior_scales_and_semen_stock',
    probe: { kind: 'column', table: 'animals', column: 'semen_stock_code' },
    note: 'склад семени и шкалы экстерьера',
  },
  {
    name: '20260902_120000_origin_identity',
    probe: { kind: 'column', table: 'animals', column: 'alt_ids_origin_country' },
    note: 'страна и номер происхождения',
  },
  {
    name: '20260902_200000_ade_origin',
    probe: { kind: 'column', table: 'milk_tests', column: 'ade_source' },
    note: 'откуда запись приехала по обмену ICAR ADE',
  },
  {
    name: '20260903_100000_breed_direction',
    probe: { kind: 'column', table: 'breeds', column: 'direction' },
    note: 'направление породы',
  },
  {
    name: '20260903_130000_milk_recording_method',
    probe: { kind: 'column', table: 'milk_tests', column: 'recording_protocol' },
    note: 'метод контроля продуктивности',
  },
  {
    name: '20260906_090000_shows_required_and_orphan_uuid',
    /*
     * Опора — отсутствие колонки: миграция только убирает осиротевший
     * ключ ФГИАС у специалистов по осеменению и выставляет обязательность
     * у выставки. Обязательность каталогом опознать труднее, чем
     * пропавшую колонку.
     */
    probe: { kind: 'absent-column', table: 'technicians', column: 'fgias_uuid' },
    note: 'обязательность выставки и осиротевшая колонка специалистов',
  },
  {
    name: '20260906_120000_not_null_keys',
    probe: { kind: 'not-null', table: 'animals', column: 'uuid' },
    note: 'обязательность ключа животного и смотревшего',
  },
  {
    name: '20260906_140000_counters_and_evaluation_bounds',
    probe: { kind: 'constraint', name: 'chk_animal_evaluations_ipc_r' },
    note: 'счётчики целым числом и границы истории оценки',
  },
]

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

const apply = process.argv.includes('--apply')

const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

const exists = async (probe: Probe): Promise<boolean> => {
  if (probe.kind === 'superseded') {
    const later = MIGRATIONS.find((m) => m.name === probe.by)
    if (!later) throw new Error(`Не найдена миграция ${probe.by}, отменившая опорный объект`)
    return exists(later.probe)
  }
  if (probe.kind === 'table') {
    const r = await pool.query(`select to_regclass($1) as t`, [`public.${probe.name}`])
    return r.rows[0]?.t !== null
  }
  if (probe.kind === 'absent-index') {
    const r = await pool.query(
      `select 1 from pg_indexes where schemaname = 'public' and indexname = $1`,
      [probe.name],
    )
    return r.rowCount === 0
  }
  if (probe.kind === 'absent-column') {
    const r = await pool.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2`,
      [probe.table, probe.column],
    )
    return r.rowCount === 0
  }
  if (probe.kind === 'not-null') {
    const r = await pool.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = $1 and column_name = $2
          and is_nullable = 'NO'`,
      [probe.table, probe.column],
    )
    return r.rowCount === 1
  }
  if (probe.kind === 'index') {
    const r = await pool.query(
      `select 1 from pg_indexes where schemaname = 'public' and indexname = $1`,
      [probe.name],
    )
    return r.rowCount === 1
  }
  if (probe.kind === 'enum-value') {
    const r = await pool.query(
      `select 1 from pg_enum e
         join pg_type t on t.oid = e.enumtypid
        where t.typname = $1 and e.enumlabel = $2`,
      [probe.type, probe.value],
    )
    return r.rowCount === 1
  }
  if (probe.kind === 'constraint') {
    const r = await pool.query(
      `select 1 from pg_constraint where conname = $1
        and connamespace = 'public'::regnamespace`,
      [probe.name],
    )
    return r.rowCount === 1
  }
  const r = await pool.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [probe.table, probe.column],
  )
  return r.rowCount === 1
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  /*
   * Список опор обязан покрывать все файлы миграций.
   *
   * Он ведётся руками, и шапка об этом честно предупреждает — а забывается
   * ровно так, как забываются все рукописные списки: нужен он не автору
   * миграции, а тому, кто через месяц синхронизирует базу. Отставание
   * нашлось не чтением, а падением: `payload migrate` упёрся в уже
   * существующее ограничение, сверка о нём не знала, и список оказался
   * позади на восемнадцать миграций.
   *
   * Теперь несоответствие видно сразу и до всякой работы с базой:
   * миграция без опоры означает, что сверка её не увидит и молча решит,
   * будто применять нечего.
   */
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''))
    .sort()

  const known = new Set(MIGRATIONS.map((m) => m.name))
  const unlisted = files.filter((f) => !known.has(f))
  const phantom = MIGRATIONS.map((m) => m.name).filter((n) => !files.includes(n))

  if (unlisted.length || phantom.length) {
    console.error('Список опорных объектов разошёлся с каталогом миграций.\n')
    for (const f of unlisted) {
      console.error(`  без опоры: ${f} — сверка её не увидит и решит, что применять нечего`)
    }
    for (const n of phantom) {
      console.error(`  опора без файла: ${n} — миграция переименована или удалена`)
    }
    console.error(
      '\nДобавьте строку в MIGRATIONS этого файла: имя миграции, опорный объект\n' +
        'и краткое пояснение. Опора — то, по чему видно, что миграция применена:\n' +
        'таблица, колонка, индекс, ограничение, значение перечисления.\n',
    )
    process.exit(1)
  }

  const journalTable = await pool.query(`select to_regclass('public.payload_migrations') as t`)
  if (journalTable.rows[0]?.t === null) {
    console.log(
      'Таблицы payload_migrations нет — база пустая или создавалась не Payload.\n' +
        'Это не случай для этого скрипта: запустите `npm run payload migrate`,\n' +
        'она создаст схему с нуля.',
    )
    return
  }

  const journal = await pool.query<{ name: string; batch: string }>(
    `select name, batch from payload_migrations order by id`,
  )
  const recorded = new Map(journal.rows.map((r) => [r.name, Number(r.batch)]))

  /*
   * Строка `dev` — не миграция. Её пишет Payload, когда держит схему через
   * push в режиме разработки. Опознаётся она по batch = -1: имя `dev` — то,
   * что кладёт push сегодня, а разбирается код именно по номеру пакета.
   */
  const devRow = journal.rows.some((r) => Number(r.batch) === -1 || r.name === 'dev')

  const rows: { name: string; inDb: boolean; inJournal: boolean; note: string }[] = []
  for (const m of MIGRATIONS) {
    rows.push({
      name: m.name,
      inDb: await exists(m.probe),
      inJournal: recorded.has(m.name),
      note: m.note,
    })
  }

  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))
  console.log(pad('Миграция', 34) + pad('В базе', 9) + pad('В журнале', 11) + 'Что добавляет')
  console.log('─'.repeat(90))
  for (const r of rows) {
    console.log(
      pad(r.name, 34) +
        pad(r.inDb ? 'да' : 'нет', 9) +
        pad(r.inJournal ? 'да' : 'нет', 11) +
        r.note,
    )
  }
  console.log('')

  if (devRow) {
    /*
     * Здесь раньше было написано, что строку можно оставить: на работу
     * миграций она не влияет. Это неверно, и цена ошибки — лежащий прод.
     *
     * Payload перед прогоном миграций ищет запись с batch = -1 и, найдя,
     * спрашивает: «похоже, вы работали в dev-режиме; при миграции возможна
     * потеря данных, продолжать?» В терминале на это отвечают. В контейнере
     * отвечать некому, и prompts на отказ вызывает process.exit(0) —
     * приложение молча заканчивается с нулевым кодом, не начав работу.
     * Снаружи это выглядит как «сборка прошла, а сайт не открывается».
     */
    console.log(
      'В журнале есть строка с batch = -1 (обычно под именем `dev`).\n' +
        'Её оставляет `drizzle push` — это и есть причина расхождения.\n\n' +
        'На боевой базе её нужно убрать: перед прогоном миграций Payload\n' +
        'спрашивает разрешение, а в контейнере отвечать некому — процесс\n' +
        'выходит с кодом 0, не начав работу. Убирается так:\n' +
        '  npm run db:psql -- -c "delete from payload_migrations where batch = -1"\n',
    )
  }

  // Записана, а в базе нет — журнал и база разошлись в обратную сторону
  const ghost = rows.filter((r) => r.inJournal && !r.inDb)
  if (ghost.length) {
    console.log(
      'Внимание: ' +
        ghost.map((r) => r.name).join(', ') +
        ' — записаны в журнале, но их объектов в базе нет.\n' +
        'Автоматически это не чинится: скрипт только отмечает применённое,\n' +
        'а здесь наоборот. Разбирайтесь вручную, ничего не запуская.\n',
    )
    return
  }

  const missing = rows.filter((r) => r.inDb && !r.inJournal)
  const pending = rows.filter((r) => !r.inDb && !r.inJournal)

  if (!missing.length) {
    console.log('Расхождений нет.')
    if (pending.length)
      console.log(
        `Не применены: ${pending.map((r) => r.name).join(', ')} — их применит\n` +
          '`npm run payload migrate` обычным порядком.',
      )
    return
  }

  /*
   * История миграций линейна: применённое не может идти после неприменённого.
   * Если порядок нарушен, значит картина сложнее, чем «схему создал push»,
   * и додумывать за человека нельзя.
   */
  const firstPending = rows.findIndex((r) => !r.inDb)
  const lastPresent = rows.map((r) => r.inDb).lastIndexOf(true)
  if (firstPending !== -1 && lastPresent > firstPending) {
    console.log(
      'Порядок нарушен: применённая миграция стоит после неприменённой.\n' +
        'Скрипт на такое не рассчитан — разберитесь вручную.',
    )
    return
  }

  if (!apply) {
    console.log(
      `Применено, но не записано: ${missing.map((r) => r.name).join(', ')}.\n\n` +
        'Отметить как применённые:\n' +
        '  npm run migrate:baseline -- --apply\n\n' +
        'Скрипт добавит строки в payload_migrations и не тронет ни схему,\n' +
        'ни данные. После этого `npm run payload migrate` пройдёт нормально\n' +
        'и применит только то, чего в базе действительно нет.',
    )
    return
  }

  /*
   * Отметка dev-режима убирается здесь же.
   *
   * Раньше про неё только сообщали и предлагали команду. Совет верный
   * и невыполнимый там, где он нужен: отметка мешает именно автоматическому
   * деплою, а выполнить совет может только человек у терминала. Скрипт
   * и так пишет ровно в эту таблицу — убрать строку, из-за которой прод
   * не поднимается, его прямая работа.
   *
   * Данные это не трогает: batch = -1 не соответствует ни одной настоящей
   * миграции, это метка «схему двигали push-ом».
   */
  const devMarker = await pool.query(`delete from payload_migrations where batch = -1`)
  if (devMarker.rowCount) {
    console.log(
      `убрана отметка dev-режима (строк: ${devMarker.rowCount}) — ` +
        'теперь Payload не будет спрашивать разрешения на миграции',
    )
  }

  const nextBatch =
    Math.max(0, ...journal.rows.map((r) => Number(r.batch)).filter((n) => Number.isFinite(n))) + 1

  for (const r of missing) {
    await pool.query(
      `insert into payload_migrations (name, batch, updated_at, created_at)
       values ($1, $2, now(), now())`,
      [r.name, nextBatch],
    )
    console.log(`отмечена применённой: ${r.name}`)
  }

  console.log(
    `\nГотово, записей добавлено: ${missing.length}, партия ${nextBatch}.\n` +
      'Дальше `npm run payload migrate` применит только недостающее.',
  )
  if (pending.length)
    console.log(`Ждут применения: ${pending.map((r) => r.name).join(', ')}`)
}

main()
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
