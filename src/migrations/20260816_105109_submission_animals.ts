import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "data_submissions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"animals_id" integer
  );
  
  ALTER TABLE "data_submissions" ADD COLUMN "intake_rows" numeric;
  ALTER TABLE "data_submissions" ADD COLUMN "intake_created" numeric;
  ALTER TABLE "data_submissions" ADD COLUMN "intake_updated" numeric;
  ALTER TABLE "data_submissions" ADD COLUMN "intake_skipped" numeric;
  ALTER TABLE "data_submissions_rels" ADD CONSTRAINT "data_submissions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."data_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "data_submissions_rels" ADD CONSTRAINT "data_submissions_rels_animals_fk" FOREIGN KEY ("animals_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "data_submissions_rels_order_idx" ON "data_submissions_rels" USING btree ("order");
  CREATE INDEX "data_submissions_rels_parent_idx" ON "data_submissions_rels" USING btree ("parent_id");
  CREATE INDEX "data_submissions_rels_path_idx" ON "data_submissions_rels" USING btree ("path");
  CREATE INDEX "data_submissions_rels_animals_id_idx" ON "data_submissions_rels" USING btree ("animals_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "data_submissions_rels" CASCADE;
  ALTER TABLE "data_submissions" DROP COLUMN "intake_rows";
  ALTER TABLE "data_submissions" DROP COLUMN "intake_created";
  ALTER TABLE "data_submissions" DROP COLUMN "intake_updated";
  ALTER TABLE "data_submissions" DROP COLUMN "intake_skipped";`)
}
