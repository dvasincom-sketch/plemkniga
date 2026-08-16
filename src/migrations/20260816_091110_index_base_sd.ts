import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_bases_traits" ADD COLUMN "sd_observed" numeric;
  ALTER TABLE "index_bases_traits" ADD COLUMN "mean_r" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_bases_traits" DROP COLUMN "sd_observed";
  ALTER TABLE "index_bases_traits" DROP COLUMN "mean_r";`)
}
