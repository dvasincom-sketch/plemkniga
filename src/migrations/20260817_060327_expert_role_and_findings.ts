import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_data_submissions_review_findings_severity" AS ENUM('fix', 'note');
  ALTER TYPE "public"."enum_users_role" ADD VALUE 'expert' BEFORE 'admin';
  CREATE TABLE "data_submissions_review_findings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"animal_id" integer,
  	"field" varchar,
  	"severity" "enum_data_submissions_review_findings_severity" DEFAULT 'fix',
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "events" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_events_type";
  CREATE TYPE "public"."enum_events_type" AS ENUM('dryOff', 'move', 'disposal', 'exteriorScore', 'calving', 'insemination', 'milkTest', 'vetTreatment');
  ALTER TABLE "events" ALTER COLUMN "type" SET DATA TYPE "public"."enum_events_type" USING "type"::"public"."enum_events_type";
  ALTER TABLE "data_submissions" ADD COLUMN "review_assignee_id" integer;
  ALTER TABLE "data_submissions_review_findings" ADD CONSTRAINT "data_submissions_review_findings_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_submissions_review_findings" ADD CONSTRAINT "data_submissions_review_findings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."data_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "data_submissions_review_findings_order_idx" ON "data_submissions_review_findings" USING btree ("_order");
  CREATE INDEX "data_submissions_review_findings_parent_id_idx" ON "data_submissions_review_findings" USING btree ("_parent_id");
  CREATE INDEX "data_submissions_review_findings_animal_idx" ON "data_submissions_review_findings" USING btree ("animal_id");
  ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_review_assignee_id_users_id_fk" FOREIGN KEY ("review_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "data_submissions_review_review_assignee_idx" ON "data_submissions" USING btree ("review_assignee_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "data_submissions_review_findings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "data_submissions_review_findings" CASCADE;
  ALTER TABLE "data_submissions" DROP CONSTRAINT "data_submissions_review_assignee_id_users_id_fk";
  
  ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'farmer'::text;
  DROP TYPE "public"."enum_users_role";
  CREATE TYPE "public"."enum_users_role" AS ENUM('farmer', 'service', 'individual', 'admin');
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'farmer'::"public"."enum_users_role";
  ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."enum_users_role" USING "role"::"public"."enum_users_role";
  ALTER TABLE "events" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_events_type";
  CREATE TYPE "public"."enum_events_type" AS ENUM('dryOff', 'exteriorScore', 'move', 'disposal', 'calving', 'insemination', 'milkTest', 'vetTreatment');
  ALTER TABLE "events" ALTER COLUMN "type" SET DATA TYPE "public"."enum_events_type" USING "type"::"public"."enum_events_type";
  DROP INDEX "data_submissions_review_review_assignee_idx";
  ALTER TABLE "data_submissions" DROP COLUMN "review_assignee_id";
  DROP TYPE "public"."enum_data_submissions_review_findings_severity";`)
}
