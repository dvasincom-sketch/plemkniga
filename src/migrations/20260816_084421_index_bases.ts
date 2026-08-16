import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_index_bases_traits_trait" AS ENUM('milk', 'fatKg', 'proteinKg', 'productiveLongevity', 'udderHealth', 'fertility', 'calvingEase', 'calfMortality', 'bodyComposite', 'udderComposite', 'legsComposite');
  CREATE TYPE "public"."enum_index_bases_source" AS ENUM('own', 'borrowed');
  CREATE TABLE "index_bases_traits" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"trait" "enum_index_bases_traits_trait" NOT NULL,
  	"mean" numeric NOT NULL,
  	"sd" numeric NOT NULL,
  	"n" numeric
  );
  
  CREATE TABLE "index_bases" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version" varchar NOT NULL,
  	"source" "enum_index_bases_source" DEFAULT 'own',
  	"note" varchar,
  	"is_active" boolean DEFAULT false,
  	"animals_used" numeric,
  	"computed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "index_bases_id" integer;
  ALTER TABLE "index_bases_traits" ADD CONSTRAINT "index_bases_traits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."index_bases"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "index_bases_traits_order_idx" ON "index_bases_traits" USING btree ("_order");
  CREATE INDEX "index_bases_traits_parent_id_idx" ON "index_bases_traits" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "index_bases_version_idx" ON "index_bases" USING btree ("version");
  CREATE INDEX "index_bases_is_active_idx" ON "index_bases" USING btree ("is_active");
  CREATE INDEX "index_bases_updated_at_idx" ON "index_bases" USING btree ("updated_at");
  CREATE INDEX "index_bases_created_at_idx" ON "index_bases" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_index_bases_fk" FOREIGN KEY ("index_bases_id") REFERENCES "public"."index_bases"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_index_bases_id_idx" ON "payload_locked_documents_rels" USING btree ("index_bases_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_bases_traits" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "index_bases" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "index_bases_traits" CASCADE;
  DROP TABLE "index_bases" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_index_bases_fk";
  
  DROP INDEX "payload_locked_documents_rels_index_bases_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "index_bases_id";
  DROP TYPE "public"."enum_index_bases_traits_trait";
  DROP TYPE "public"."enum_index_bases_source";`)
}
