import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "data_submissions_intake_issues" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"row" numeric,
  	"ident" varchar,
  	"reason" varchar
  );
  
  ALTER TABLE "data_submissions_intake_issues" ADD CONSTRAINT "data_submissions_intake_issues_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."data_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "data_submissions_intake_issues_order_idx" ON "data_submissions_intake_issues" USING btree ("_order");
  CREATE INDEX "data_submissions_intake_issues_parent_id_idx" ON "data_submissions_intake_issues" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "data_submissions_intake_issues" CASCADE;`)
}
