import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Номер документа становится уникальным.
 *
 * Он считается как «сколько уже выдано за год плюс один», и без уникальности
 * два одновременных выпуска или одна удалённая строка давали два документа
 * с одним номером — молча. На номер свидетельства ссылаются снаружи,
 * и совпадение здесь не опечатка, а два разных животных под одной бумагой.
 *
 * NULL уникальности не мешает: в PostgreSQL их может быть сколько угодно.
 * Это и нужно — у бумаг, которые хозяйство загрузило само (ветеринарная
 * справка, договор), номера нет.
 *
 * Индекс строится `CONCURRENTLY`? Нет: на текущем объёме документов это доли
 * секунды, а `CONCURRENTLY` нельзя выполнять внутри транзакции, в которой
 * Payload прогоняет миграции.
 *
 * Если индекс не создастся — значит в базе уже есть повторы. Разбирать их
 * должен человек: какой из двух документов настоящий, миграция не знает.
 *
 * Опорный объект для `npm run migrate:baseline` — индекс `documents_number_idx`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE UNIQUE INDEX "documents_number_idx" ON "documents" USING btree ("number");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP INDEX IF EXISTS "documents_number_idx";`)
}
