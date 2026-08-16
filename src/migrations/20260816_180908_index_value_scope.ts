import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_values" ADD COLUMN "owner_id" integer;
  ALTER TABLE "index_values" ADD COLUMN "public_visible" boolean;
  ALTER TABLE "index_values" ADD COLUMN "archived" boolean;
  ALTER TABLE "index_values" ADD CONSTRAINT "index_values_owner_id_organizations_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "index_values_owner_idx" ON "index_values" USING btree ("owner_id");
  CREATE INDEX "index_values_public_visible_idx" ON "index_values" USING btree ("public_visible");
  CREATE INDEX "index_values_archived_idx" ON "index_values" USING btree ("archived");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_values" DROP CONSTRAINT "index_values_owner_id_organizations_id_fk";
  
  DROP INDEX "index_values_owner_idx";
  DROP INDEX "index_values_public_visible_idx";
  DROP INDEX "index_values_archived_idx";
  ALTER TABLE "index_values" DROP COLUMN "owner_id";
  ALTER TABLE "index_values" DROP COLUMN "public_visible";
  ALTER TABLE "index_values" DROP COLUMN "archived";`)
}
