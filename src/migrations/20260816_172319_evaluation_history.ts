import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_animal_evaluations_source" AS ENUM('center', 'association', 'import', 'foreign');
  CREATE TABLE "animal_evaluations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"evaluated_at" timestamp(3) with time zone NOT NULL,
  	"source" "enum_animal_evaluations_source" DEFAULT 'center' NOT NULL,
  	"base_version" varchar,
  	"is_current" boolean DEFAULT true,
  	"ipc" numeric,
  	"ipc_r" numeric,
  	"ipc_percentile" numeric,
  	"production_reliability_level" numeric,
  	"milk_forecast" numeric,
  	"milk_r" numeric,
  	"fat_percent_forecast" numeric,
  	"fat_percent_r" numeric,
  	"protein_percent_forecast" numeric,
  	"protein_percent_r" numeric,
  	"fat_kg_forecast" numeric,
  	"fat_kg_r" numeric,
  	"protein_kg_forecast" numeric,
  	"protein_kg_r" numeric,
  	"production_index_forecast" numeric,
  	"production_index_r" numeric,
  	"fertility_forecast" numeric,
  	"fertility_r" numeric,
  	"health_reliability_level" numeric,
  	"productive_longevity_forecast" numeric,
  	"productive_longevity_r" numeric,
  	"udder_health_forecast" numeric,
  	"udder_health_r" numeric,
  	"calf_mortality_forecast" numeric,
  	"calf_mortality_r" numeric,
  	"calving_ease_forecast" numeric,
  	"calving_ease_r" numeric,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "animal_exteriors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"assessed_at" timestamp(3) with time zone NOT NULL,
  	"lactation" numeric,
  	"assessor_id" integer,
  	"is_current" boolean DEFAULT true,
  	"height" numeric,
  	"chest_width" numeric,
  	"body_depth" numeric,
  	"body_type" numeric,
  	"rump_angle" numeric,
  	"rump_width" numeric,
  	"rear_legs_rear" numeric,
  	"rear_legs_side" numeric,
  	"hoof_angle" numeric,
  	"front_legs" numeric,
  	"movement" numeric,
  	"fore_udder" numeric,
  	"front_teat_placement" numeric,
  	"teat_length" numeric,
  	"udder_depth" numeric,
  	"rear_udder" numeric,
  	"central_ligament" numeric,
  	"rear_teat_placement" numeric,
  	"body_composite" numeric,
  	"udder_composite" numeric,
  	"legs_composite" numeric,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "events" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_events_type";
  CREATE TYPE "public"."enum_events_type" AS ENUM('dryOff', 'exteriorScore', 'move', 'disposal', 'calving', 'insemination', 'milkTest', 'vetTreatment');
  ALTER TABLE "events" ALTER COLUMN "type" SET DATA TYPE "public"."enum_events_type" USING "type"::"public"."enum_events_type";
  ALTER TABLE "index_values" ADD COLUMN "evaluation_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "animal_evaluations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "animal_exteriors_id" integer;
  ALTER TABLE "animal_evaluations" ADD CONSTRAINT "animal_evaluations_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animal_exteriors" ADD CONSTRAINT "animal_exteriors_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animal_exteriors" ADD CONSTRAINT "animal_exteriors_assessor_id_technicians_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."technicians"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "animal_evaluations_animal_idx" ON "animal_evaluations" USING btree ("animal_id");
  CREATE INDEX "animal_evaluations_evaluated_at_idx" ON "animal_evaluations" USING btree ("evaluated_at");
  CREATE INDEX "animal_evaluations_is_current_idx" ON "animal_evaluations" USING btree ("is_current");
  CREATE INDEX "animal_evaluations_updated_at_idx" ON "animal_evaluations" USING btree ("updated_at");
  CREATE INDEX "animal_evaluations_created_at_idx" ON "animal_evaluations" USING btree ("created_at");
  CREATE INDEX "animal_exteriors_animal_idx" ON "animal_exteriors" USING btree ("animal_id");
  CREATE INDEX "animal_exteriors_assessed_at_idx" ON "animal_exteriors" USING btree ("assessed_at");
  CREATE INDEX "animal_exteriors_assessor_idx" ON "animal_exteriors" USING btree ("assessor_id");
  CREATE INDEX "animal_exteriors_is_current_idx" ON "animal_exteriors" USING btree ("is_current");
  CREATE INDEX "animal_exteriors_updated_at_idx" ON "animal_exteriors" USING btree ("updated_at");
  CREATE INDEX "animal_exteriors_created_at_idx" ON "animal_exteriors" USING btree ("created_at");
  ALTER TABLE "index_values" ADD CONSTRAINT "index_values_evaluation_id_animal_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."animal_evaluations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_animal_evaluations_fk" FOREIGN KEY ("animal_evaluations_id") REFERENCES "public"."animal_evaluations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_animal_exteriors_fk" FOREIGN KEY ("animal_exteriors_id") REFERENCES "public"."animal_exteriors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "index_values_evaluation_idx" ON "index_values" USING btree ("evaluation_id");
  CREATE INDEX "payload_locked_documents_rels_animal_evaluations_id_idx" ON "payload_locked_documents_rels" USING btree ("animal_evaluations_id");
  CREATE INDEX "payload_locked_documents_rels_animal_exteriors_id_idx" ON "payload_locked_documents_rels" USING btree ("animal_exteriors_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "animal_evaluations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "animal_exteriors" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "animal_evaluations" CASCADE;
  DROP TABLE "animal_exteriors" CASCADE;
  ALTER TABLE "index_values" DROP CONSTRAINT "index_values_evaluation_id_animal_evaluations_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_animal_evaluations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_animal_exteriors_fk";
  
  ALTER TABLE "events" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_events_type";
  CREATE TYPE "public"."enum_events_type" AS ENUM('calving', 'insemination', 'dryOff', 'milkTest', 'exteriorScore', 'vetTreatment', 'move', 'disposal');
  ALTER TABLE "events" ALTER COLUMN "type" SET DATA TYPE "public"."enum_events_type" USING "type"::"public"."enum_events_type";
  DROP INDEX "index_values_evaluation_idx";
  DROP INDEX "payload_locked_documents_rels_animal_evaluations_id_idx";
  DROP INDEX "payload_locked_documents_rels_animal_exteriors_id_idx";
  ALTER TABLE "index_values" DROP COLUMN "evaluation_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "animal_evaluations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "animal_exteriors_id";
  DROP TYPE "public"."enum_animal_evaluations_source";`)
}
