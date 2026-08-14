import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('farmer', 'service', 'individual', 'admin');
  CREATE TYPE "public"."enum_organizations_type" AS ENUM('farm', 'service', 'individual');
  CREATE TYPE "public"."enum_organizations_region" AS ENUM('Самарская область', 'Московская область', 'Ленинградская область', 'Краснодарский край', 'Красноярский край', 'Республика Татарстан', 'Свердловская область', 'Воронежская область', 'Кировская область', 'Удмуртская Республика');
  CREATE TYPE "public"."enum_organizations_membership" AS ENUM('none', 'pending', 'member');
  CREATE TYPE "public"."enum_animals_haplotypes_status" AS ENUM('unknown', 'free', 'carrier');
  CREATE TYPE "public"."enum_animals_id_format" AS ENUM('rf', 'icar', 'usa', 'can', 'deu', 'internal');
  CREATE TYPE "public"."enum_animals_kind" AS ENUM('cow', 'bull', 'heifer', 'calf');
  CREATE TYPE "public"."enum_animals_sex" AS ENUM('female', 'male');
  CREATE TYPE "public"."enum_animals_state" AS ENUM('alive', 'sold', 'culled', 'dead');
  CREATE TYPE "public"."enum_animals_age_group" AS ENUM('calf', 'heifer', 'firstCalf', 'cow2', 'cow3', 'bull');
  CREATE TYPE "public"."enum_animals_registration_basis" AS ENUM('origin', 'productivity');
  CREATE TYPE "public"."enum_animals_genetics_cvm" AS ENUM('unknown', 'free', 'carrier');
  CREATE TYPE "public"."enum_animals_genetics_blad" AS ENUM('unknown', 'free', 'carrier');
  CREATE TYPE "public"."enum_animals_genetics_dumps" AS ENUM('unknown', 'free', 'carrier');
  CREATE TYPE "public"."enum_calvings_result" AS ENUM('heifer', 'bull', 'twins', 'stillborn', 'abortion');
  CREATE TYPE "public"."enum_calvings_ease" AS ENUM('easy', 'assisted', 'hard');
  CREATE TYPE "public"."enum_inseminations_source" AS ENUM('manual', 'import', 'api');
  CREATE TYPE "public"."enum_milk_tests_source" AS ENUM('lab', 'owner', 'import', 'api');
  CREATE TYPE "public"."enum_health_events_severity" AS ENUM('mild', 'moderate', 'severe');
  CREATE TYPE "public"."enum_data_submissions_history_status" AS ENUM('uploaded', 'checking', 'checked', 'accepted', 'rejected');
  CREATE TYPE "public"."enum_data_submissions_kind" AS ENUM('events', 'animals', 'productivity', 'genomics');
  CREATE TYPE "public"."enum_data_submissions_status" AS ENUM('uploaded', 'checking', 'checked', 'accepted', 'rejected');
  CREATE TYPE "public"."enum_events_type" AS ENUM('calving', 'insemination', 'dryOff', 'milkTest', 'exteriorScore', 'vetTreatment', 'move', 'disposal');
  CREATE TYPE "public"."enum_events_status" AS ENUM('draft', 'sent', 'accepted', 'rejected');
  CREATE TYPE "public"."enum_documents_type" AS ENUM('pedigreeCertificate', 'genotypeReport', 'vetCertificate', 'saleContract', 'other');
  CREATE TYPE "public"."enum_lines_kind" AS ENUM('line', 'branch', 'family');
  CREATE TYPE "public"."enum_dna_test_types_marker_kind" AS ENUM('genetic-defect', 'protein', 'parentage', 'genomic-evaluation');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"last_name" varchar NOT NULL,
  	"first_name" varchar NOT NULL,
  	"middle_name" varchar,
  	"role" "enum_users_role" DEFAULT 'farmer' NOT NULL,
  	"phone" varchar,
  	"organization_id" integer,
  	"position" varchar,
  	"confirmed" boolean DEFAULT false,
  	"accepted_policy" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "organizations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"short_name" varchar,
  	"type" "enum_organizations_type" DEFAULT 'farm',
  	"inn" varchar,
  	"kpp" varchar,
  	"ogrn" varchar,
  	"region" "enum_organizations_region",
  	"phone" varchar,
  	"email" varchar,
  	"address" varchar,
  	"membership" "enum_organizations_membership" DEFAULT 'none',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "herds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"code" varchar,
  	"organization_id" integer NOT NULL,
  	"address" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "animals_lactations" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"number" numeric,
  	"calving_date" timestamp(3) with time zone,
  	"insemination_date" timestamp(3) with time zone,
  	"service_bull" varchar,
  	"dd" numeric,
  	"milk_yield" numeric,
  	"milk305" numeric,
  	"fat305" numeric,
  	"protein305" numeric,
  	"scc" numeric,
  	"dry_off_date" timestamp(3) with time zone,
  	"fat_kg" numeric,
  	"protein_kg" numeric,
  	"end_date" timestamp(3) with time zone
  );
  
  CREATE TABLE "animals_haplotypes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type_id" integer,
  	"status" "enum_animals_haplotypes_status" DEFAULT 'unknown',
  	"date" timestamp(3) with time zone
  );
  
  CREATE TABLE "animals_dna_tests" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type_id" integer,
  	"date" timestamp(3) with time zone,
  	"laboratory_id" integer,
  	"result" varchar,
  	"file_id" integer
  );
  
  CREATE TABLE "animals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"uuid" varchar,
  	"ident_number" varchar NOT NULL,
  	"id_format" "enum_animals_id_format" DEFAULT 'rf',
  	"name" varchar,
  	"name_latin" varchar,
  	"alt_ids_iso_id" varchar,
  	"alt_ids_international_id" varchar,
  	"alt_ids_ear_tag" varchar,
  	"alt_ids_inventory_number" varchar,
  	"alt_ids_chip_number" varchar,
  	"alt_ids_chip_date" timestamp(3) with time zone,
  	"alt_ids_gpk_mark" varchar,
  	"alt_ids_gpk_number" varchar,
  	"kind" "enum_animals_kind" DEFAULT 'cow',
  	"sex" "enum_animals_sex" DEFAULT 'female' NOT NULL,
  	"state" "enum_animals_state" DEFAULT 'alive',
  	"age_group" "enum_animals_age_group" DEFAULT 'firstCalf',
  	"birth_date" timestamp(3) with time zone,
  	"breed_id" integer,
  	"blood_percent" numeric,
  	"improvers_breed1_id" integer,
  	"improvers_share1" numeric,
  	"improvers_breed2_id" integer,
  	"improvers_share2" numeric,
  	"coat_color_id" integer,
  	"blood_group_id" integer,
  	"purpose_id" integer,
  	"owner_id" integer NOT NULL,
  	"herd_id" integer,
  	"author_id" integer,
  	"trust_level" numeric DEFAULT 0,
  	"trust_checked_at" timestamp(3) with time zone,
  	"public_visible" boolean DEFAULT false,
  	"public_details" boolean DEFAULT false,
  	"photo_id" integer,
  	"notes" varchar,
  	"ipc" numeric,
  	"ipc_rank" numeric DEFAULT -1000000,
  	"ipc_details_forecast" numeric,
  	"ipc_details_r" numeric,
  	"ipc_details_percentile" numeric,
  	"evaluation_date" timestamp(3) with time zone,
  	"production_reliability_level" numeric DEFAULT 3,
  	"production_milk_forecast" numeric,
  	"production_milk_r" numeric,
  	"production_fat_percent_forecast" numeric,
  	"production_fat_percent_r" numeric,
  	"production_protein_percent_forecast" numeric,
  	"production_protein_percent_r" numeric,
  	"production_fat_kg_forecast" numeric,
  	"production_fat_kg_r" numeric,
  	"production_protein_kg_forecast" numeric,
  	"production_protein_kg_r" numeric,
  	"production_production_index_forecast" numeric,
  	"production_production_index_r" numeric,
  	"reproduction_fertility_forecast" numeric,
  	"reproduction_fertility_r" numeric,
  	"health_reliability_level" numeric DEFAULT 3,
  	"health_productive_longevity_forecast" numeric,
  	"health_productive_longevity_r" numeric,
  	"health_udder_health_forecast" numeric,
  	"health_udder_health_r" numeric,
  	"health_calf_mortality_forecast" numeric,
  	"health_calf_mortality_r" numeric,
  	"health_calving_ease_forecast" numeric,
  	"health_calving_ease_r" numeric,
  	"exterior_height" numeric,
  	"exterior_chest_width" numeric,
  	"exterior_body_depth" numeric,
  	"exterior_body_type" numeric,
  	"exterior_rump_angle" numeric,
  	"exterior_rump_width" numeric,
  	"exterior_rear_legs_rear" numeric,
  	"exterior_rear_legs_side" numeric,
  	"exterior_hoof_angle" numeric,
  	"exterior_front_legs" numeric,
  	"exterior_movement" numeric,
  	"exterior_fore_udder" numeric,
  	"exterior_front_teat_placement" numeric,
  	"exterior_teat_length" numeric,
  	"exterior_udder_depth" numeric,
  	"exterior_rear_udder" numeric,
  	"exterior_central_ligament" numeric,
  	"exterior_rear_teat_placement" numeric,
  	"exterior_body_composite" numeric,
  	"exterior_udder_composite" numeric,
  	"exterior_legs_composite" numeric,
  	"summary_milk_yield" numeric,
  	"summary_fat_percent" numeric,
  	"summary_protein_percent" numeric,
  	"summary_fat_kg" numeric,
  	"summary_protein_kg" numeric,
  	"summary_fat_protein_sum" numeric,
  	"summary_milk_rank" numeric DEFAULT -1000000,
  	"category_id" integer,
  	"registration_basis" "enum_animals_registration_basis" DEFAULT 'origin',
  	"breeding_class_id" integer,
  	"father_id" integer,
  	"mother_id" integer,
  	"line_id" integer,
  	"family_id" integer,
  	"pedigree_text_father_id" varchar,
  	"pedigree_text_father_name" varchar,
  	"pedigree_text_mother_id" varchar,
  	"pedigree_text_mother_name" varchar,
  	"pedigree_text_father_father_id" varchar,
  	"pedigree_text_mother_father_id" varchar,
  	"inbreeding" numeric,
  	"inbreeding_needs_approval" boolean DEFAULT false,
  	"genetics_cvm" "enum_animals_genetics_cvm" DEFAULT 'unknown',
  	"genetics_blad" "enum_animals_genetics_blad" DEFAULT 'unknown',
  	"genetics_dumps" "enum_animals_genetics_dumps" DEFAULT 'unknown',
  	"genetics_kappa_casein" varchar,
  	"genetics_beta_casein" varchar,
  	"genetics_beta_lactoglobulin" varchar,
  	"arrival_date" timestamp(3) with time zone,
  	"previous_organization_id" integer,
  	"disposal_date" timestamp(3) with time zone,
  	"disposal_reason_id" integer,
  	"disposal_organization_id" integer,
  	"archived" boolean DEFAULT false,
  	"archive_reason" varchar,
  	"last_edit_user_id" integer,
  	"last_edit_time" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "calvings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"number" numeric NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"result" "enum_calvings_result",
  	"milking_days" numeric,
  	"dry_off_date" timestamp(3) with time zone,
  	"ease" "enum_calvings_ease",
  	"calf_weight" numeric,
  	"comment" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "calvings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"animals_id" integer
  );
  
  CREATE TABLE "inseminations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"lactation_number" numeric,
  	"date" timestamp(3) with time zone NOT NULL,
  	"bull_id" integer,
  	"semen_type_id" integer,
  	"method_id" integer,
  	"doses" numeric DEFAULT 1,
  	"attempt_number" numeric,
  	"technician_id" integer,
  	"result_id" integer,
  	"pregnancy_check_date" timestamp(3) with time zone,
  	"comment" varchar,
  	"source" "enum_inseminations_source" DEFAULT 'manual',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "milk_tests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"lactation_number" numeric,
  	"daily_yield" numeric NOT NULL,
  	"fat_percent" numeric,
  	"protein_percent" numeric,
  	"somatic_cells" numeric,
  	"laboratory_id" integer,
  	"source" "enum_milk_tests_source" DEFAULT 'lab',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "health_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"animal_id" integer NOT NULL,
  	"type_id" integer NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"title" varchar,
  	"severity" "enum_health_events_severity" DEFAULT 'moderate',
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"exclude_from_analytics" boolean DEFAULT false,
  	"description" varchar,
  	"reported_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "data_submissions_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" timestamp(3) with time zone,
  	"status" "enum_data_submissions_history_status",
  	"actor_id" integer,
  	"note" varchar
  );
  
  CREATE TABLE "data_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" varchar,
  	"kind" "enum_data_submissions_kind" DEFAULT 'events' NOT NULL,
  	"status" "enum_data_submissions_status" DEFAULT 'uploaded' NOT NULL,
  	"organization_id" integer,
  	"submitted_by_id" integer,
  	"submitted_at" timestamp(3) with time zone,
  	"source_file_id" integer,
  	"review_checked_by_id" integer,
  	"review_checked_at" timestamp(3) with time zone,
  	"review_comment" varchar,
  	"review_total_rows" numeric,
  	"review_accepted_rows" numeric,
  	"review_rejected_rows" numeric,
  	"review_error_protocol_id" integer,
  	"consent_agreed" boolean DEFAULT false,
  	"consent_agreed_at" timestamp(3) with time zone,
  	"consent_published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_events_type" NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"animal_id" integer NOT NULL,
  	"title" varchar,
  	"value" numeric,
  	"comment" varchar,
  	"status" "enum_events_status" DEFAULT 'accepted',
  	"author_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"type" "enum_documents_type" DEFAULT 'pedigreeCertificate',
  	"number" varchar,
  	"issued_at" timestamp(3) with time zone,
  	"animal_id" integer,
  	"organization_id" integer,
  	"file_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar
  );
  
  CREATE TABLE "breeds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"whff_code" varchar,
  	"is_improver" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lines" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"kind" "enum_lines_kind" DEFAULT 'line',
  	"parent_line_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "breeding_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"allows_incomplete_pedigree" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "breeding_classes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "animal_purposes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "disposal_reasons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "coat_colors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "blood_groups" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reproduction_methods" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "semen_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "insemination_results" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "dna_test_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"marker_kind" "enum_dna_test_types_marker_kind" DEFAULT 'genetic-defect',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "haplotype_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "health_event_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"sort_order" numeric DEFAULT 100,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"affects_productivity" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "technicians" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"full_name" varchar NOT NULL,
  	"certificate_number" varchar,
  	"organization_id" integer,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"organizations_id" integer,
  	"herds_id" integer,
  	"animals_id" integer,
  	"calvings_id" integer,
  	"inseminations_id" integer,
  	"milk_tests_id" integer,
  	"health_events_id" integer,
  	"data_submissions_id" integer,
  	"events_id" integer,
  	"documents_id" integer,
  	"media_id" integer,
  	"breeds_id" integer,
  	"lines_id" integer,
  	"breeding_categories_id" integer,
  	"breeding_classes_id" integer,
  	"animal_purposes_id" integer,
  	"disposal_reasons_id" integer,
  	"coat_colors_id" integer,
  	"blood_groups_id" integer,
  	"reproduction_methods_id" integer,
  	"semen_types_id" integer,
  	"insemination_results_id" integer,
  	"dna_test_types_id" integer,
  	"haplotype_types_id" integer,
  	"health_event_types_id" integer,
  	"technicians_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "herds" ADD CONSTRAINT "herds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals_lactations" ADD CONSTRAINT "animals_lactations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "animals_haplotypes" ADD CONSTRAINT "animals_haplotypes_type_id_haplotype_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."haplotype_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals_haplotypes" ADD CONSTRAINT "animals_haplotypes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "animals_dna_tests" ADD CONSTRAINT "animals_dna_tests_type_id_dna_test_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."dna_test_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals_dna_tests" ADD CONSTRAINT "animals_dna_tests_laboratory_id_organizations_id_fk" FOREIGN KEY ("laboratory_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals_dna_tests" ADD CONSTRAINT "animals_dna_tests_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals_dna_tests" ADD CONSTRAINT "animals_dna_tests_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_breed_id_breeds_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."breeds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_improvers_breed1_id_breeds_id_fk" FOREIGN KEY ("improvers_breed1_id") REFERENCES "public"."breeds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_improvers_breed2_id_breeds_id_fk" FOREIGN KEY ("improvers_breed2_id") REFERENCES "public"."breeds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_coat_color_id_coat_colors_id_fk" FOREIGN KEY ("coat_color_id") REFERENCES "public"."coat_colors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_blood_group_id_blood_groups_id_fk" FOREIGN KEY ("blood_group_id") REFERENCES "public"."blood_groups"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_purpose_id_animal_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."animal_purposes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_owner_id_organizations_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_herd_id_herds_id_fk" FOREIGN KEY ("herd_id") REFERENCES "public"."herds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_category_id_breeding_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."breeding_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_breeding_class_id_breeding_classes_id_fk" FOREIGN KEY ("breeding_class_id") REFERENCES "public"."breeding_classes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_father_id_animals_id_fk" FOREIGN KEY ("father_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_mother_id_animals_id_fk" FOREIGN KEY ("mother_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_line_id_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."lines"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_family_id_lines_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."lines"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_previous_organization_id_organizations_id_fk" FOREIGN KEY ("previous_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_disposal_reason_id_disposal_reasons_id_fk" FOREIGN KEY ("disposal_reason_id") REFERENCES "public"."disposal_reasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_disposal_organization_id_organizations_id_fk" FOREIGN KEY ("disposal_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "animals" ADD CONSTRAINT "animals_last_edit_user_id_users_id_fk" FOREIGN KEY ("last_edit_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calvings" ADD CONSTRAINT "calvings_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calvings_rels" ADD CONSTRAINT "calvings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."calvings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "calvings_rels" ADD CONSTRAINT "calvings_rels_animals_fk" FOREIGN KEY ("animals_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inseminations" ADD CONSTRAINT "inseminations_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inseminations" ADD CONSTRAINT "inseminations_bull_id_animals_id_fk" FOREIGN KEY ("bull_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inseminations" ADD CONSTRAINT "inseminations_semen_type_id_semen_types_id_fk" FOREIGN KEY ("semen_type_id") REFERENCES "public"."semen_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inseminations" ADD CONSTRAINT "inseminations_method_id_reproduction_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."reproduction_methods"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inseminations" ADD CONSTRAINT "inseminations_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inseminations" ADD CONSTRAINT "inseminations_result_id_insemination_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."insemination_results"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "milk_tests" ADD CONSTRAINT "milk_tests_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "milk_tests" ADD CONSTRAINT "milk_tests_laboratory_id_organizations_id_fk" FOREIGN KEY ("laboratory_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "health_events" ADD CONSTRAINT "health_events_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "health_events" ADD CONSTRAINT "health_events_type_id_health_event_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."health_event_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "health_events" ADD CONSTRAINT "health_events_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_submissions_history" ADD CONSTRAINT "data_submissions_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_submissions_history" ADD CONSTRAINT "data_submissions_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."data_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_source_file_id_media_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_review_checked_by_id_users_id_fk" FOREIGN KEY ("review_checked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_submissions" ADD CONSTRAINT "data_submissions_review_error_protocol_id_media_id_fk" FOREIGN KEY ("review_error_protocol_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lines" ADD CONSTRAINT "lines_parent_line_id_lines_id_fk" FOREIGN KEY ("parent_line_id") REFERENCES "public"."lines"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "technicians" ADD CONSTRAINT "technicians_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organizations_fk" FOREIGN KEY ("organizations_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_herds_fk" FOREIGN KEY ("herds_id") REFERENCES "public"."herds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_animals_fk" FOREIGN KEY ("animals_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_calvings_fk" FOREIGN KEY ("calvings_id") REFERENCES "public"."calvings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inseminations_fk" FOREIGN KEY ("inseminations_id") REFERENCES "public"."inseminations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_milk_tests_fk" FOREIGN KEY ("milk_tests_id") REFERENCES "public"."milk_tests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_health_events_fk" FOREIGN KEY ("health_events_id") REFERENCES "public"."health_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_submissions_fk" FOREIGN KEY ("data_submissions_id") REFERENCES "public"."data_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_breeds_fk" FOREIGN KEY ("breeds_id") REFERENCES "public"."breeds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lines_fk" FOREIGN KEY ("lines_id") REFERENCES "public"."lines"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_breeding_categories_fk" FOREIGN KEY ("breeding_categories_id") REFERENCES "public"."breeding_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_breeding_classes_fk" FOREIGN KEY ("breeding_classes_id") REFERENCES "public"."breeding_classes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_animal_purposes_fk" FOREIGN KEY ("animal_purposes_id") REFERENCES "public"."animal_purposes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_disposal_reasons_fk" FOREIGN KEY ("disposal_reasons_id") REFERENCES "public"."disposal_reasons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_coat_colors_fk" FOREIGN KEY ("coat_colors_id") REFERENCES "public"."coat_colors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_blood_groups_fk" FOREIGN KEY ("blood_groups_id") REFERENCES "public"."blood_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reproduction_methods_fk" FOREIGN KEY ("reproduction_methods_id") REFERENCES "public"."reproduction_methods"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_semen_types_fk" FOREIGN KEY ("semen_types_id") REFERENCES "public"."semen_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_insemination_results_fk" FOREIGN KEY ("insemination_results_id") REFERENCES "public"."insemination_results"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_dna_test_types_fk" FOREIGN KEY ("dna_test_types_id") REFERENCES "public"."dna_test_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_haplotype_types_fk" FOREIGN KEY ("haplotype_types_id") REFERENCES "public"."haplotype_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_health_event_types_fk" FOREIGN KEY ("health_event_types_id") REFERENCES "public"."health_event_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_technicians_fk" FOREIGN KEY ("technicians_id") REFERENCES "public"."technicians"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_organization_idx" ON "users" USING btree ("organization_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "organizations_updated_at_idx" ON "organizations" USING btree ("updated_at");
  CREATE INDEX "organizations_created_at_idx" ON "organizations" USING btree ("created_at");
  CREATE INDEX "herds_organization_idx" ON "herds" USING btree ("organization_id");
  CREATE INDEX "herds_updated_at_idx" ON "herds" USING btree ("updated_at");
  CREATE INDEX "herds_created_at_idx" ON "herds" USING btree ("created_at");
  CREATE INDEX "animals_lactations_order_idx" ON "animals_lactations" USING btree ("_order");
  CREATE INDEX "animals_lactations_parent_id_idx" ON "animals_lactations" USING btree ("_parent_id");
  CREATE INDEX "animals_haplotypes_order_idx" ON "animals_haplotypes" USING btree ("_order");
  CREATE INDEX "animals_haplotypes_parent_id_idx" ON "animals_haplotypes" USING btree ("_parent_id");
  CREATE INDEX "animals_haplotypes_type_idx" ON "animals_haplotypes" USING btree ("type_id");
  CREATE INDEX "animals_dna_tests_order_idx" ON "animals_dna_tests" USING btree ("_order");
  CREATE INDEX "animals_dna_tests_parent_id_idx" ON "animals_dna_tests" USING btree ("_parent_id");
  CREATE INDEX "animals_dna_tests_type_idx" ON "animals_dna_tests" USING btree ("type_id");
  CREATE INDEX "animals_dna_tests_laboratory_idx" ON "animals_dna_tests" USING btree ("laboratory_id");
  CREATE INDEX "animals_dna_tests_file_idx" ON "animals_dna_tests" USING btree ("file_id");
  CREATE UNIQUE INDEX "animals_uuid_idx" ON "animals" USING btree ("uuid");
  CREATE UNIQUE INDEX "animals_ident_number_idx" ON "animals" USING btree ("ident_number");
  CREATE INDEX "animals_breed_idx" ON "animals" USING btree ("breed_id");
  CREATE INDEX "animals_improvers_improvers_breed1_idx" ON "animals" USING btree ("improvers_breed1_id");
  CREATE INDEX "animals_improvers_improvers_breed2_idx" ON "animals" USING btree ("improvers_breed2_id");
  CREATE INDEX "animals_coat_color_idx" ON "animals" USING btree ("coat_color_id");
  CREATE INDEX "animals_blood_group_idx" ON "animals" USING btree ("blood_group_id");
  CREATE INDEX "animals_purpose_idx" ON "animals" USING btree ("purpose_id");
  CREATE INDEX "animals_owner_idx" ON "animals" USING btree ("owner_id");
  CREATE INDEX "animals_herd_idx" ON "animals" USING btree ("herd_id");
  CREATE INDEX "animals_author_idx" ON "animals" USING btree ("author_id");
  CREATE INDEX "animals_trust_level_idx" ON "animals" USING btree ("trust_level");
  CREATE INDEX "animals_public_visible_idx" ON "animals" USING btree ("public_visible");
  CREATE INDEX "animals_photo_idx" ON "animals" USING btree ("photo_id");
  CREATE INDEX "animals_ipc_idx" ON "animals" USING btree ("ipc");
  CREATE INDEX "animals_ipc_rank_idx" ON "animals" USING btree ("ipc_rank");
  CREATE INDEX "animals_summary_summary_milk_rank_idx" ON "animals" USING btree ("summary_milk_rank");
  CREATE INDEX "animals_category_idx" ON "animals" USING btree ("category_id");
  CREATE INDEX "animals_breeding_class_idx" ON "animals" USING btree ("breeding_class_id");
  CREATE INDEX "animals_father_idx" ON "animals" USING btree ("father_id");
  CREATE INDEX "animals_mother_idx" ON "animals" USING btree ("mother_id");
  CREATE INDEX "animals_line_idx" ON "animals" USING btree ("line_id");
  CREATE INDEX "animals_family_idx" ON "animals" USING btree ("family_id");
  CREATE INDEX "animals_previous_organization_idx" ON "animals" USING btree ("previous_organization_id");
  CREATE INDEX "animals_disposal_reason_idx" ON "animals" USING btree ("disposal_reason_id");
  CREATE INDEX "animals_disposal_organization_idx" ON "animals" USING btree ("disposal_organization_id");
  CREATE INDEX "animals_archived_idx" ON "animals" USING btree ("archived");
  CREATE INDEX "animals_last_edit_user_idx" ON "animals" USING btree ("last_edit_user_id");
  CREATE INDEX "animals_updated_at_idx" ON "animals" USING btree ("updated_at");
  CREATE INDEX "animals_created_at_idx" ON "animals" USING btree ("created_at");
  CREATE INDEX "identNumber_idx" ON "animals" USING btree ("ident_number");
  CREATE INDEX "owner_state_idx" ON "animals" USING btree ("owner_id","state");
  CREATE INDEX "calvings_animal_idx" ON "calvings" USING btree ("animal_id");
  CREATE INDEX "calvings_updated_at_idx" ON "calvings" USING btree ("updated_at");
  CREATE INDEX "calvings_created_at_idx" ON "calvings" USING btree ("created_at");
  CREATE INDEX "animal_number_idx" ON "calvings" USING btree ("animal_id","number");
  CREATE INDEX "calvings_rels_order_idx" ON "calvings_rels" USING btree ("order");
  CREATE INDEX "calvings_rels_parent_idx" ON "calvings_rels" USING btree ("parent_id");
  CREATE INDEX "calvings_rels_path_idx" ON "calvings_rels" USING btree ("path");
  CREATE INDEX "calvings_rels_animals_id_idx" ON "calvings_rels" USING btree ("animals_id");
  CREATE INDEX "inseminations_animal_idx" ON "inseminations" USING btree ("animal_id");
  CREATE INDEX "inseminations_bull_idx" ON "inseminations" USING btree ("bull_id");
  CREATE INDEX "inseminations_semen_type_idx" ON "inseminations" USING btree ("semen_type_id");
  CREATE INDEX "inseminations_method_idx" ON "inseminations" USING btree ("method_id");
  CREATE INDEX "inseminations_technician_idx" ON "inseminations" USING btree ("technician_id");
  CREATE INDEX "inseminations_result_idx" ON "inseminations" USING btree ("result_id");
  CREATE INDEX "inseminations_updated_at_idx" ON "inseminations" USING btree ("updated_at");
  CREATE INDEX "inseminations_created_at_idx" ON "inseminations" USING btree ("created_at");
  CREATE INDEX "animal_lactationNumber_idx" ON "inseminations" USING btree ("animal_id","lactation_number");
  CREATE INDEX "milk_tests_animal_idx" ON "milk_tests" USING btree ("animal_id");
  CREATE INDEX "milk_tests_laboratory_idx" ON "milk_tests" USING btree ("laboratory_id");
  CREATE INDEX "milk_tests_updated_at_idx" ON "milk_tests" USING btree ("updated_at");
  CREATE INDEX "milk_tests_created_at_idx" ON "milk_tests" USING btree ("created_at");
  CREATE INDEX "animal_date_idx" ON "milk_tests" USING btree ("animal_id","date");
  CREATE INDEX "health_events_animal_idx" ON "health_events" USING btree ("animal_id");
  CREATE INDEX "health_events_type_idx" ON "health_events" USING btree ("type_id");
  CREATE INDEX "health_events_reported_by_idx" ON "health_events" USING btree ("reported_by_id");
  CREATE INDEX "health_events_updated_at_idx" ON "health_events" USING btree ("updated_at");
  CREATE INDEX "health_events_created_at_idx" ON "health_events" USING btree ("created_at");
  CREATE INDEX "animal_date_1_idx" ON "health_events" USING btree ("animal_id","date");
  CREATE INDEX "data_submissions_history_order_idx" ON "data_submissions_history" USING btree ("_order");
  CREATE INDEX "data_submissions_history_parent_id_idx" ON "data_submissions_history" USING btree ("_parent_id");
  CREATE INDEX "data_submissions_history_actor_idx" ON "data_submissions_history" USING btree ("actor_id");
  CREATE UNIQUE INDEX "data_submissions_number_idx" ON "data_submissions" USING btree ("number");
  CREATE INDEX "data_submissions_status_idx" ON "data_submissions" USING btree ("status");
  CREATE INDEX "data_submissions_organization_idx" ON "data_submissions" USING btree ("organization_id");
  CREATE INDEX "data_submissions_submitted_by_idx" ON "data_submissions" USING btree ("submitted_by_id");
  CREATE INDEX "data_submissions_source_file_idx" ON "data_submissions" USING btree ("source_file_id");
  CREATE INDEX "data_submissions_review_review_checked_by_idx" ON "data_submissions" USING btree ("review_checked_by_id");
  CREATE INDEX "data_submissions_review_review_error_protocol_idx" ON "data_submissions" USING btree ("review_error_protocol_id");
  CREATE INDEX "data_submissions_updated_at_idx" ON "data_submissions" USING btree ("updated_at");
  CREATE INDEX "data_submissions_created_at_idx" ON "data_submissions" USING btree ("created_at");
  CREATE INDEX "events_animal_idx" ON "events" USING btree ("animal_id");
  CREATE INDEX "events_author_idx" ON "events" USING btree ("author_id");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "documents_animal_idx" ON "documents" USING btree ("animal_id");
  CREATE INDEX "documents_organization_idx" ON "documents" USING btree ("organization_id");
  CREATE INDEX "documents_file_idx" ON "documents" USING btree ("file_id");
  CREATE INDEX "documents_updated_at_idx" ON "documents" USING btree ("updated_at");
  CREATE INDEX "documents_created_at_idx" ON "documents" USING btree ("created_at");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE UNIQUE INDEX "breeds_code_idx" ON "breeds" USING btree ("code");
  CREATE INDEX "breeds_updated_at_idx" ON "breeds" USING btree ("updated_at");
  CREATE INDEX "breeds_created_at_idx" ON "breeds" USING btree ("created_at");
  CREATE UNIQUE INDEX "lines_code_idx" ON "lines" USING btree ("code");
  CREATE INDEX "lines_parent_line_idx" ON "lines" USING btree ("parent_line_id");
  CREATE INDEX "lines_updated_at_idx" ON "lines" USING btree ("updated_at");
  CREATE INDEX "lines_created_at_idx" ON "lines" USING btree ("created_at");
  CREATE UNIQUE INDEX "breeding_categories_code_idx" ON "breeding_categories" USING btree ("code");
  CREATE INDEX "breeding_categories_updated_at_idx" ON "breeding_categories" USING btree ("updated_at");
  CREATE INDEX "breeding_categories_created_at_idx" ON "breeding_categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "breeding_classes_code_idx" ON "breeding_classes" USING btree ("code");
  CREATE INDEX "breeding_classes_updated_at_idx" ON "breeding_classes" USING btree ("updated_at");
  CREATE INDEX "breeding_classes_created_at_idx" ON "breeding_classes" USING btree ("created_at");
  CREATE UNIQUE INDEX "animal_purposes_code_idx" ON "animal_purposes" USING btree ("code");
  CREATE INDEX "animal_purposes_updated_at_idx" ON "animal_purposes" USING btree ("updated_at");
  CREATE INDEX "animal_purposes_created_at_idx" ON "animal_purposes" USING btree ("created_at");
  CREATE UNIQUE INDEX "disposal_reasons_code_idx" ON "disposal_reasons" USING btree ("code");
  CREATE INDEX "disposal_reasons_updated_at_idx" ON "disposal_reasons" USING btree ("updated_at");
  CREATE INDEX "disposal_reasons_created_at_idx" ON "disposal_reasons" USING btree ("created_at");
  CREATE UNIQUE INDEX "coat_colors_code_idx" ON "coat_colors" USING btree ("code");
  CREATE INDEX "coat_colors_updated_at_idx" ON "coat_colors" USING btree ("updated_at");
  CREATE INDEX "coat_colors_created_at_idx" ON "coat_colors" USING btree ("created_at");
  CREATE UNIQUE INDEX "blood_groups_code_idx" ON "blood_groups" USING btree ("code");
  CREATE INDEX "blood_groups_updated_at_idx" ON "blood_groups" USING btree ("updated_at");
  CREATE INDEX "blood_groups_created_at_idx" ON "blood_groups" USING btree ("created_at");
  CREATE UNIQUE INDEX "reproduction_methods_code_idx" ON "reproduction_methods" USING btree ("code");
  CREATE INDEX "reproduction_methods_updated_at_idx" ON "reproduction_methods" USING btree ("updated_at");
  CREATE INDEX "reproduction_methods_created_at_idx" ON "reproduction_methods" USING btree ("created_at");
  CREATE UNIQUE INDEX "semen_types_code_idx" ON "semen_types" USING btree ("code");
  CREATE INDEX "semen_types_updated_at_idx" ON "semen_types" USING btree ("updated_at");
  CREATE INDEX "semen_types_created_at_idx" ON "semen_types" USING btree ("created_at");
  CREATE UNIQUE INDEX "insemination_results_code_idx" ON "insemination_results" USING btree ("code");
  CREATE INDEX "insemination_results_updated_at_idx" ON "insemination_results" USING btree ("updated_at");
  CREATE INDEX "insemination_results_created_at_idx" ON "insemination_results" USING btree ("created_at");
  CREATE UNIQUE INDEX "dna_test_types_code_idx" ON "dna_test_types" USING btree ("code");
  CREATE INDEX "dna_test_types_updated_at_idx" ON "dna_test_types" USING btree ("updated_at");
  CREATE INDEX "dna_test_types_created_at_idx" ON "dna_test_types" USING btree ("created_at");
  CREATE UNIQUE INDEX "haplotype_types_code_idx" ON "haplotype_types" USING btree ("code");
  CREATE INDEX "haplotype_types_updated_at_idx" ON "haplotype_types" USING btree ("updated_at");
  CREATE INDEX "haplotype_types_created_at_idx" ON "haplotype_types" USING btree ("created_at");
  CREATE UNIQUE INDEX "health_event_types_code_idx" ON "health_event_types" USING btree ("code");
  CREATE INDEX "health_event_types_updated_at_idx" ON "health_event_types" USING btree ("updated_at");
  CREATE INDEX "health_event_types_created_at_idx" ON "health_event_types" USING btree ("created_at");
  CREATE INDEX "technicians_organization_idx" ON "technicians" USING btree ("organization_id");
  CREATE INDEX "technicians_updated_at_idx" ON "technicians" USING btree ("updated_at");
  CREATE INDEX "technicians_created_at_idx" ON "technicians" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_organizations_id_idx" ON "payload_locked_documents_rels" USING btree ("organizations_id");
  CREATE INDEX "payload_locked_documents_rels_herds_id_idx" ON "payload_locked_documents_rels" USING btree ("herds_id");
  CREATE INDEX "payload_locked_documents_rels_animals_id_idx" ON "payload_locked_documents_rels" USING btree ("animals_id");
  CREATE INDEX "payload_locked_documents_rels_calvings_id_idx" ON "payload_locked_documents_rels" USING btree ("calvings_id");
  CREATE INDEX "payload_locked_documents_rels_inseminations_id_idx" ON "payload_locked_documents_rels" USING btree ("inseminations_id");
  CREATE INDEX "payload_locked_documents_rels_milk_tests_id_idx" ON "payload_locked_documents_rels" USING btree ("milk_tests_id");
  CREATE INDEX "payload_locked_documents_rels_health_events_id_idx" ON "payload_locked_documents_rels" USING btree ("health_events_id");
  CREATE INDEX "payload_locked_documents_rels_data_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("data_submissions_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("documents_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_breeds_id_idx" ON "payload_locked_documents_rels" USING btree ("breeds_id");
  CREATE INDEX "payload_locked_documents_rels_lines_id_idx" ON "payload_locked_documents_rels" USING btree ("lines_id");
  CREATE INDEX "payload_locked_documents_rels_breeding_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("breeding_categories_id");
  CREATE INDEX "payload_locked_documents_rels_breeding_classes_id_idx" ON "payload_locked_documents_rels" USING btree ("breeding_classes_id");
  CREATE INDEX "payload_locked_documents_rels_animal_purposes_id_idx" ON "payload_locked_documents_rels" USING btree ("animal_purposes_id");
  CREATE INDEX "payload_locked_documents_rels_disposal_reasons_id_idx" ON "payload_locked_documents_rels" USING btree ("disposal_reasons_id");
  CREATE INDEX "payload_locked_documents_rels_coat_colors_id_idx" ON "payload_locked_documents_rels" USING btree ("coat_colors_id");
  CREATE INDEX "payload_locked_documents_rels_blood_groups_id_idx" ON "payload_locked_documents_rels" USING btree ("blood_groups_id");
  CREATE INDEX "payload_locked_documents_rels_reproduction_methods_id_idx" ON "payload_locked_documents_rels" USING btree ("reproduction_methods_id");
  CREATE INDEX "payload_locked_documents_rels_semen_types_id_idx" ON "payload_locked_documents_rels" USING btree ("semen_types_id");
  CREATE INDEX "payload_locked_documents_rels_insemination_results_id_idx" ON "payload_locked_documents_rels" USING btree ("insemination_results_id");
  CREATE INDEX "payload_locked_documents_rels_dna_test_types_id_idx" ON "payload_locked_documents_rels" USING btree ("dna_test_types_id");
  CREATE INDEX "payload_locked_documents_rels_haplotype_types_id_idx" ON "payload_locked_documents_rels" USING btree ("haplotype_types_id");
  CREATE INDEX "payload_locked_documents_rels_health_event_types_id_idx" ON "payload_locked_documents_rels" USING btree ("health_event_types_id");
  CREATE INDEX "payload_locked_documents_rels_technicians_id_idx" ON "payload_locked_documents_rels" USING btree ("technicians_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "organizations" CASCADE;
  DROP TABLE "herds" CASCADE;
  DROP TABLE "animals_lactations" CASCADE;
  DROP TABLE "animals_haplotypes" CASCADE;
  DROP TABLE "animals_dna_tests" CASCADE;
  DROP TABLE "animals" CASCADE;
  DROP TABLE "calvings" CASCADE;
  DROP TABLE "calvings_rels" CASCADE;
  DROP TABLE "inseminations" CASCADE;
  DROP TABLE "milk_tests" CASCADE;
  DROP TABLE "health_events" CASCADE;
  DROP TABLE "data_submissions_history" CASCADE;
  DROP TABLE "data_submissions" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "documents" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "breeds" CASCADE;
  DROP TABLE "lines" CASCADE;
  DROP TABLE "breeding_categories" CASCADE;
  DROP TABLE "breeding_classes" CASCADE;
  DROP TABLE "animal_purposes" CASCADE;
  DROP TABLE "disposal_reasons" CASCADE;
  DROP TABLE "coat_colors" CASCADE;
  DROP TABLE "blood_groups" CASCADE;
  DROP TABLE "reproduction_methods" CASCADE;
  DROP TABLE "semen_types" CASCADE;
  DROP TABLE "insemination_results" CASCADE;
  DROP TABLE "dna_test_types" CASCADE;
  DROP TABLE "haplotype_types" CASCADE;
  DROP TABLE "health_event_types" CASCADE;
  DROP TABLE "technicians" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_organizations_type";
  DROP TYPE "public"."enum_organizations_region";
  DROP TYPE "public"."enum_organizations_membership";
  DROP TYPE "public"."enum_animals_haplotypes_status";
  DROP TYPE "public"."enum_animals_id_format";
  DROP TYPE "public"."enum_animals_kind";
  DROP TYPE "public"."enum_animals_sex";
  DROP TYPE "public"."enum_animals_state";
  DROP TYPE "public"."enum_animals_age_group";
  DROP TYPE "public"."enum_animals_registration_basis";
  DROP TYPE "public"."enum_animals_genetics_cvm";
  DROP TYPE "public"."enum_animals_genetics_blad";
  DROP TYPE "public"."enum_animals_genetics_dumps";
  DROP TYPE "public"."enum_calvings_result";
  DROP TYPE "public"."enum_calvings_ease";
  DROP TYPE "public"."enum_inseminations_source";
  DROP TYPE "public"."enum_milk_tests_source";
  DROP TYPE "public"."enum_health_events_severity";
  DROP TYPE "public"."enum_data_submissions_history_status";
  DROP TYPE "public"."enum_data_submissions_kind";
  DROP TYPE "public"."enum_data_submissions_status";
  DROP TYPE "public"."enum_events_type";
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum_documents_type";
  DROP TYPE "public"."enum_lines_kind";
  DROP TYPE "public"."enum_dna_test_types_marker_kind";`)
}
