import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_values" ADD COLUMN "percentile" numeric;
  ALTER TABLE "index_values" ADD COLUMN "cohort" numeric;
  ALTER TABLE "index_values" ADD COLUMN "cohort_same_year" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_values" DROP COLUMN "percentile";
  ALTER TABLE "index_values" DROP COLUMN "cohort";
  ALTER TABLE "index_values" DROP COLUMN "cohort_same_year";`)
}
