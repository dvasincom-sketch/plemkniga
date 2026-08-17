import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Снимок данных на момент выпуска документа.
 *
 * Печатная форма собиралась из живой записи, и выданное свидетельство ничем
 * не подкреплялось: пересчитали ИПЦ — и объяснить число в бумаге, на которую
 * сослались в сделке, нечем. Рядом со значением индекса снимок весов хранится
 * с решения №21; здесь то же самое для документа.
 *
 * Колонка `jsonb`, а не `json`: внутри плоские строки и числа, читать их
 * будем целиком, а `jsonb` хранит компактнее и не тратит время на разбор
 * при каждом чтении.
 *
 * У выданных до этой миграции документов снимка нет и не появится: сочинить
 * его задним числом значило бы выдать сегодняшние данные за вчерашние.
 * Печатная форма такие документы показывает с прямой отметкой об этом.
 *
 * Опорный объект для `npm run migrate:baseline` — колонка `documents.snapshot`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "documents" ADD COLUMN "snapshot" jsonb;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "documents" DROP COLUMN IF EXISTS "snapshot";`)
}
