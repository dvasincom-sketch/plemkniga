import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_animal_revisions_source" AS ENUM('manual', 'admin', 'system');
  CREATE TABLE "animal_revisions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"user_id" integer,
  	"path" varchar NOT NULL,
  	"label" varchar,
  	"before" varchar,
  	"after" varchar,
  	"source" "enum_animal_revisions_source" DEFAULT 'manual',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "animal_revisions_id" integer;
  ALTER TABLE "animal_revisions" ADD CONSTRAINT "animal_revisions_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animal_revisions" ADD CONSTRAINT "animal_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "animal_revisions_animal_idx" ON "animal_revisions" USING btree ("animal_id");
  CREATE INDEX "animal_revisions_at_idx" ON "animal_revisions" USING btree ("at");
  CREATE INDEX "animal_revisions_user_idx" ON "animal_revisions" USING btree ("user_id");
  CREATE INDEX "animal_revisions_updated_at_idx" ON "animal_revisions" USING btree ("updated_at");
  CREATE INDEX "animal_revisions_created_at_idx" ON "animal_revisions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_animal_revisions_fk" FOREIGN KEY ("animal_revisions_id") REFERENCES "public"."animal_revisions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_animal_revisions_id_idx" ON "payload_locked_documents_rels" USING btree ("animal_revisions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "animal_revisions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "animal_revisions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_animal_revisions_fk";
  
  DROP INDEX "payload_locked_documents_rels_animal_revisions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "animal_revisions_id";
  DROP TYPE "public"."enum_animal_revisions_source";`)
}
