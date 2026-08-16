import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "profileKey_publicVisible_state_archived_value_idx" ON "index_values" USING btree ("profile_key","public_visible","state","archived","value");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "profileKey_publicVisible_state_archived_value_idx";`)
}
