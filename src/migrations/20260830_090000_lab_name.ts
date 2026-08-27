import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Лаборатория у документа.
 *
 * Второй уровень достоверности — «Подтверждено лабораторией» — до сих пор
 * не имел пути: дойти до него было нельзя ничем, кроме синтетики. Теперь
 * он выводится из зарегистрированного протокола, а протокол обязан назвать
 * лабораторию: файл без имени того, кто его выдал, ничего не удостоверяет.
 *
 * Индекс — потому что по этому полю правило второй ступени спрашивает
 * «есть ли протокол» у каждого животного, и спрашивает часто.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "lab_name" varchar;`)

  await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "documents_lab_name_idx" ON "documents" ("lab_name");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "documents_lab_name_idx";`)
  await db.execute(sql`ALTER TABLE "documents" DROP COLUMN IF EXISTS "lab_name";`)
}
