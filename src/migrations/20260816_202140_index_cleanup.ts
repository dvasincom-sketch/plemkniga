import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "animals_ipc_idx";
  DROP INDEX "identNumber_idx";
  DROP INDEX "index_values_public_visible_idx";
  DROP INDEX "index_values_archived_idx";
  DROP INDEX "index_values_state_idx";
  DROP INDEX "profileKey_publicVisible_state_archived_value_idx";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "animals_ipc_idx" ON "animals" USING btree ("ipc");
  CREATE INDEX "identNumber_idx" ON "animals" USING btree ("ident_number");
  CREATE INDEX "index_values_public_visible_idx" ON "index_values" USING btree ("public_visible");
  CREATE INDEX "index_values_archived_idx" ON "index_values" USING btree ("archived");
  CREATE INDEX "index_values_state_idx" ON "index_values" USING btree ("state");
  CREATE INDEX "profileKey_publicVisible_state_archived_value_idx" ON "index_values" USING btree ("profile_key","public_visible","state","archived","value");`)
}
