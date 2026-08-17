import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_verification_requests_review_findings_severity" AS ENUM('fix', 'note');
  CREATE TYPE "public"."enum_verification_requests_status" AS ENUM('new', 'checking', 'approved', 'rejected');
  CREATE TYPE "public"."enum_verification_requests_purpose" AS ENUM('trust', 'certificate', 'membership');
  CREATE TABLE "verification_requests_review_findings" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"animal_id" integer,
  	"field" varchar,
  	"severity" "enum_verification_requests_review_findings_severity" DEFAULT 'fix',
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "verification_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" varchar,
  	"status" "enum_verification_requests_status" DEFAULT 'new' NOT NULL,
  	"purpose" "enum_verification_requests_purpose" DEFAULT 'trust',
  	"organization_id" integer,
  	"requested_by_id" integer,
  	"requested_at" timestamp(3) with time zone,
  	"comment" varchar,
  	"review_assignee_id" integer,
  	"review_decided_by_id" integer,
  	"review_decided_at" timestamp(3) with time zone,
  	"review_comment" varchar,
  	"review_approved_count" numeric,
  	"review_held_count" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "verification_requests_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"animals_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "verification_requests_id" integer;
  ALTER TABLE "verification_requests_review_findings" ADD CONSTRAINT "verification_requests_review_findings_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests_review_findings" ADD CONSTRAINT "verification_requests_review_findings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."verification_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_review_assignee_id_users_id_fk" FOREIGN KEY ("review_assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_review_decided_by_id_users_id_fk" FOREIGN KEY ("review_decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "verification_requests_rels" ADD CONSTRAINT "verification_requests_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."verification_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "verification_requests_rels" ADD CONSTRAINT "verification_requests_rels_animals_fk" FOREIGN KEY ("animals_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "verification_requests_review_findings_order_idx" ON "verification_requests_review_findings" USING btree ("_order");
  CREATE INDEX "verification_requests_review_findings_parent_id_idx" ON "verification_requests_review_findings" USING btree ("_parent_id");
  CREATE INDEX "verification_requests_review_findings_animal_idx" ON "verification_requests_review_findings" USING btree ("animal_id");
  CREATE UNIQUE INDEX "verification_requests_number_idx" ON "verification_requests" USING btree ("number");
  CREATE INDEX "verification_requests_status_idx" ON "verification_requests" USING btree ("status");
  CREATE INDEX "verification_requests_organization_idx" ON "verification_requests" USING btree ("organization_id");
  CREATE INDEX "verification_requests_requested_by_idx" ON "verification_requests" USING btree ("requested_by_id");
  CREATE INDEX "verification_requests_requested_at_idx" ON "verification_requests" USING btree ("requested_at");
  CREATE INDEX "verification_requests_review_review_assignee_idx" ON "verification_requests" USING btree ("review_assignee_id");
  CREATE INDEX "verification_requests_review_review_decided_by_idx" ON "verification_requests" USING btree ("review_decided_by_id");
  CREATE INDEX "verification_requests_updated_at_idx" ON "verification_requests" USING btree ("updated_at");
  CREATE INDEX "verification_requests_created_at_idx" ON "verification_requests" USING btree ("created_at");
  CREATE INDEX "verification_requests_rels_order_idx" ON "verification_requests_rels" USING btree ("order");
  CREATE INDEX "verification_requests_rels_parent_idx" ON "verification_requests_rels" USING btree ("parent_id");
  CREATE INDEX "verification_requests_rels_path_idx" ON "verification_requests_rels" USING btree ("path");
  CREATE INDEX "verification_requests_rels_animals_id_idx" ON "verification_requests_rels" USING btree ("animals_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_verification_requests_fk" FOREIGN KEY ("verification_requests_id") REFERENCES "public"."verification_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_verification_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("verification_requests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "verification_requests_review_findings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "verification_requests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "verification_requests_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "verification_requests_review_findings" CASCADE;
  DROP TABLE "verification_requests" CASCADE;
  DROP TABLE "verification_requests_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_verification_requests_fk";
  
  DROP INDEX "payload_locked_documents_rels_verification_requests_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "verification_requests_id";
  DROP TYPE "public"."enum_verification_requests_review_findings_severity";
  DROP TYPE "public"."enum_verification_requests_status";
  DROP TYPE "public"."enum_verification_requests_purpose";`)
}
