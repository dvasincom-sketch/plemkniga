import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_access_requests_purpose" AS ENUM('purchase', 'semen', 'mating', 'verification', 'research', 'other');
  CREATE TYPE "public"."enum_access_requests_status" AS ENUM('new', 'approved', 'declined');
  CREATE TABLE "access_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"owner_id" integer,
  	"requester_id" integer,
  	"requester_org_id" integer,
  	"purpose" "enum_access_requests_purpose" DEFAULT 'purchase' NOT NULL,
  	"status" "enum_access_requests_status" DEFAULT 'new' NOT NULL,
  	"comment" varchar,
  	"response" varchar,
  	"decided_at" timestamp(3) with time zone,
  	"decided_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "notify_seen_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "access_requests_id" integer;
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_owner_id_organizations_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requester_org_id_organizations_id_fk" FOREIGN KEY ("requester_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "access_requests_animal_idx" ON "access_requests" USING btree ("animal_id");
  CREATE INDEX "access_requests_owner_idx" ON "access_requests" USING btree ("owner_id");
  CREATE INDEX "access_requests_requester_idx" ON "access_requests" USING btree ("requester_id");
  CREATE INDEX "access_requests_requester_org_idx" ON "access_requests" USING btree ("requester_org_id");
  CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");
  CREATE INDEX "access_requests_decided_by_idx" ON "access_requests" USING btree ("decided_by_id");
  CREATE INDEX "access_requests_updated_at_idx" ON "access_requests" USING btree ("updated_at");
  CREATE INDEX "access_requests_created_at_idx" ON "access_requests" USING btree ("created_at");
  CREATE INDEX "owner_status_idx" ON "access_requests" USING btree ("owner_id","status");
  CREATE INDEX "requester_animal_idx" ON "access_requests" USING btree ("requester_id","animal_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_access_requests_fk" FOREIGN KEY ("access_requests_id") REFERENCES "public"."access_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_access_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("access_requests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "access_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "access_requests" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_access_requests_fk";
  
  DROP INDEX "payload_locked_documents_rels_access_requests_id_idx";
  ALTER TABLE "users" DROP COLUMN "notify_seen_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "access_requests_id";
  DROP TYPE "public"."enum_access_requests_purpose";
  DROP TYPE "public"."enum_access_requests_status";`)
}
