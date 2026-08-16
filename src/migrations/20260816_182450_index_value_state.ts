import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_index_values_state" AS ENUM('alive', 'sold', 'culled', 'dead');
  ALTER TABLE "index_values" ADD COLUMN "state" "enum_index_values_state";
  CREATE INDEX "index_values_state_idx" ON "index_values" USING btree ("state");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "index_values_state_idx";
  ALTER TABLE "index_values" DROP COLUMN "state";
  DROP TYPE "public"."enum_index_values_state";`)
}
