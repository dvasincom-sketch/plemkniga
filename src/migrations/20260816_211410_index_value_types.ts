import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_values" ALTER COLUMN "birth_year" SET DATA TYPE integer;
  ALTER TABLE "index_values" ALTER COLUMN "percentile" SET DATA TYPE integer;
  ALTER TABLE "index_values" ALTER COLUMN "cohort" SET DATA TYPE integer;
  ALTER TABLE "index_values" ADD CONSTRAINT "chk_index_values_percentile" CHECK (("percentile" is null or ("percentile" >= 0 and "percentile" <= 100)));
  ALTER TABLE "index_values" ADD CONSTRAINT "chk_index_values_cohort" CHECK (("cohort" is null or "cohort" > 0));`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_values" DROP CONSTRAINT "chk_index_values_percentile";
  ALTER TABLE "index_values" DROP CONSTRAINT "chk_index_values_cohort";
  ALTER TABLE "index_values" ALTER COLUMN "birth_year" SET DATA TYPE numeric;
  ALTER TABLE "index_values" ALTER COLUMN "percentile" SET DATA TYPE numeric;
  ALTER TABLE "index_values" ALTER COLUMN "cohort" SET DATA TYPE numeric;`)
}
