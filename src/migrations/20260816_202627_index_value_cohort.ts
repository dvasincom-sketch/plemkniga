import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_values" ADD COLUMN "birth_year" numeric;
  CREATE INDEX "profileKey_birthYear_value_idx" ON "index_values" USING btree ("profile_key","birth_year","value");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "profileKey_birthYear_value_idx";
  ALTER TABLE "index_values" DROP COLUMN "birth_year";`)
}
