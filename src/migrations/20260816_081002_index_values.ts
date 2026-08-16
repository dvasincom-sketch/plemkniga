import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_index_values_kind" AS ENUM('selection', 'economic');
  CREATE TABLE "index_values" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"profile_key" varchar NOT NULL,
  	"profile_name" varchar,
  	"kind" "enum_index_values_kind" DEFAULT 'selection',
  	"weights" jsonb,
  	"base_version" varchar,
  	"value" numeric NOT NULL,
  	"reliability" numeric,
  	"used" numeric,
  	"computed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "index_values_id" integer;
  ALTER TABLE "index_values" ADD CONSTRAINT "index_values_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "index_values_animal_idx" ON "index_values" USING btree ("animal_id");
  CREATE INDEX "index_values_profile_key_idx" ON "index_values" USING btree ("profile_key");
  CREATE INDEX "index_values_value_idx" ON "index_values" USING btree ("value");
  CREATE INDEX "index_values_updated_at_idx" ON "index_values" USING btree ("updated_at");
  CREATE INDEX "index_values_created_at_idx" ON "index_values" USING btree ("created_at");
  CREATE INDEX "profileKey_value_idx" ON "index_values" USING btree ("profile_key","value");
  CREATE UNIQUE INDEX "animal_profileKey_idx" ON "index_values" USING btree ("animal_id","profile_key");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_index_values_fk" FOREIGN KEY ("index_values_id") REFERENCES "public"."index_values"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_index_values_id_idx" ON "payload_locked_documents_rels" USING btree ("index_values_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "index_values" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "index_values" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_index_values_fk";
  
  DROP INDEX "payload_locked_documents_rels_index_values_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "index_values_id";
  DROP TYPE "public"."enum_index_values_kind";`)
}
