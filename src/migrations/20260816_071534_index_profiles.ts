import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_index_profiles_weights_trait" AS ENUM('milk', 'fatKg', 'proteinKg', 'productiveLongevity', 'udderHealth', 'fertility', 'calvingEase', 'calfMortality', 'bodyComposite', 'udderComposite', 'legsComposite');
  CREATE TYPE "public"."enum_index_profiles_kind" AS ENUM('selection', 'economic');
  CREATE TABLE "index_profiles_weights" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"trait" "enum_index_profiles_weights_trait" NOT NULL,
  	"weight" numeric NOT NULL
  );
  
  CREATE TABLE "index_profiles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_index_profiles_kind" DEFAULT 'selection' NOT NULL,
  	"hint" varchar,
  	"organization_id" integer,
  	"is_default" boolean DEFAULT false,
  	"author_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "index_profiles_id" integer;
  ALTER TABLE "index_profiles_weights" ADD CONSTRAINT "index_profiles_weights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."index_profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "index_profiles" ADD CONSTRAINT "index_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "index_profiles" ADD CONSTRAINT "index_profiles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "index_profiles_weights_order_idx" ON "index_profiles_weights" USING btree ("_order");
  CREATE INDEX "index_profiles_weights_parent_id_idx" ON "index_profiles_weights" USING btree ("_parent_id");
  CREATE INDEX "index_profiles_organization_idx" ON "index_profiles" USING btree ("organization_id");
  CREATE INDEX "index_profiles_author_idx" ON "index_profiles" USING btree ("author_id");
  CREATE INDEX "index_profiles_updated_at_idx" ON "index_profiles" USING btree ("updated_at");
  CREATE INDEX "index_profiles_created_at_idx" ON "index_profiles" USING btree ("created_at");
  CREATE INDEX "organization_isDefault_idx" ON "index_profiles" USING btree ("organization_id","is_default");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_index_profiles_fk" FOREIGN KEY ("index_profiles_id") REFERENCES "public"."index_profiles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_index_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("index_profiles_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_profiles_weights" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "index_profiles" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "index_profiles_weights" CASCADE;
  DROP TABLE "index_profiles" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_index_profiles_fk";
  
  DROP INDEX "payload_locked_documents_rels_index_profiles_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "index_profiles_id";
  DROP TYPE "public"."enum_index_profiles_weights_trait";
  DROP TYPE "public"."enum_index_profiles_kind";`)
}
