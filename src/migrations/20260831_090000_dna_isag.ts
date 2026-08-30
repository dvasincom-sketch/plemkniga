import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Достоверность происхождения: сертификат, число маркеров и панель ISAG.
 *
 * ## Зачем
 *
 * Шаблон ФГИАС «Достоверность происхождения» — двадцать семь колонок,
 * из которых книга вела четыре: дату, лабораторию, метод и вывод. Остальное
 * лежало в приложенном файле протокола, то есть нигде: файл нельзя ни найти
 * поиском, ни назвать в племенном свидетельстве, ни выгрузить в реестр.
 *
 * ## Двенадцать локусов заводятся все сразу
 *
 * Это стандартная панель ISAG для КРС. Половина генотипа не доказывает
 * ничего: происхождение подтверждается совпадением аллелей по всей панели,
 * и «храним шесть из двенадцати» означает «не храним генотип».
 *
 * Текстом, а не числом: в локусе записана пара аллелей — `121/133`, —
 * и раскладывать её на два числа значило бы придумать формат, которого нет
 * ни в шаблоне реестра, ни в лабораторных протоколах.
 *
 * ## Чего в этой миграции нет
 *
 * Колонки «Проба». В шаблоне она связана со справочником «Объект
 * исследования», а тот оказался списком из семидесяти трёх болезней
 * и генов — HH1, CVM, BLAD, миостатин. На вопрос «какую пробу брали»
 * он не отвечает, и что реестр ждёт в этой колонке, из справочника
 * не следует. Заводить поле под догадку хуже, чем не заводить: пустая
 * колонка в выгрузке честна, а заполненная неверно — нет.
 *
 * ## Группа крови не дублируется
 *
 * Реестр спрашивает её в этом же шаблоне, но это свойство животного,
 * а не теста: она уже есть в карточке связью со справочником. Копия
 * в каждом тесте разошлась бы с оригиналом на первой же правке.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  DO $$ BEGIN
    CREATE TYPE "public"."enum_animals_dna_tests_auth_method" AS ENUM('byOM', 'byO', 'byM', 'none');
  EXCEPTION WHEN duplicate_object THEN null;
  END $$;`)

  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "certificate_number" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "certificate_date" timestamp(3) with time zone;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "snp_count" numeric;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "auth_method" "enum_animals_dna_tests_auth_method";`)

  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_bm1818" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_bm1824" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_bm2113" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_eth3" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_eth10" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_eth225" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_inra023" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_sps115" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_tgla53" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_tgla122" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_tgla126" varchar;`)
  await db.execute(sql`
  ALTER TABLE "animals_dna_tests" ADD COLUMN IF NOT EXISTS "isag_tgla227" varchar;`)
}

/**
 * Откат снимает колонки вместе с генотипом. Восстановить его можно только
 * из лабораторного протокола — тот приложен файлом и остаётся на месте.
 *
 * Двенадцать строк подряд, а не цикл: `sql` — теговый шаблон, и подстановка
 * переменной в него даёт **параметр запроса**, а не имя колонки.
 * `DROP COLUMN IF EXISTS $1` не выполнится ни на одной базе, и узнали бы
 * мы об этом на откате — то есть в тот момент, когда всё и так плохо.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "certificate_number";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "certificate_date";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "snp_count";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "auth_method";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_bm1818";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_bm1824";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_bm2113";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_eth3";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_eth10";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_eth225";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_inra023";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_sps115";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_tgla53";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_tgla122";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_tgla126";`)
  await db.execute(sql`ALTER TABLE "animals_dna_tests" DROP COLUMN IF EXISTS "isag_tgla227";`)
  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_animals_dna_tests_auth_method";`)
}
