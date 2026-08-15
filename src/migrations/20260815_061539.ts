import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "animals" ADD COLUMN "for_sale" boolean DEFAULT false;
  CREATE INDEX "animals_for_sale_idx" ON "animals" USING btree ("for_sale");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "animals_for_sale_idx";
  ALTER TABLE "animals" DROP COLUMN "for_sale";`)
}
