import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "animals" ALTER COLUMN "trust_level" SET DATA TYPE integer;
  ALTER TABLE "calvings" ALTER COLUMN "number" SET DATA TYPE integer;
  ALTER TABLE "inseminations" ALTER COLUMN "lactation_number" SET DATA TYPE integer;
  ALTER TABLE "inseminations" ALTER COLUMN "doses" SET DATA TYPE integer;
  ALTER TABLE "inseminations" ALTER COLUMN "doses" SET DEFAULT 1;
  ALTER TABLE "inseminations" ALTER COLUMN "attempt_number" SET DATA TYPE integer;
  ALTER TABLE "milk_tests" ALTER COLUMN "lactation_number" SET DATA TYPE integer;
  ALTER TABLE "index_values" ALTER COLUMN "used" SET DATA TYPE integer;
  ALTER TABLE "index_bases_traits" ALTER COLUMN "n" SET DATA TYPE integer;
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_not_own_father" CHECK (("father_id" is null or "father_id" <> "id"));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_not_own_mother" CHECK (("mother_id" is null or "mother_id" <> "id"));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_parents_differ" CHECK (("father_id" is null or "mother_id" is null or "father_id" <> "mother_id"));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_trust_level" CHECK (("trust_level" is null or ("trust_level" >= -1 and "trust_level" <= 3)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_blood_percent" CHECK (("blood_percent" is null or ("blood_percent" >= 0 and "blood_percent" <= 100)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_inbreeding" CHECK (("inbreeding" is null or ("inbreeding" >= 0 and "inbreeding" <= 100)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_improvers_share1" CHECK (("improvers_share1" is null or ("improvers_share1" >= 0 and "improvers_share1" <= 100)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_improvers_share2" CHECK (("improvers_share2" is null or ("improvers_share2" >= 0 and "improvers_share2" <= 100)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_production_reliability" CHECK (("production_reliability_level" is null or ("production_reliability_level" >= 1 and "production_reliability_level" <= 5)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_health_reliability" CHECK (("health_reliability_level" is null or ("health_reliability_level" >= 1 and "health_reliability_level" <= 5)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_ipc_r" CHECK (("ipc_details_r" is null or ("ipc_details_r" >= 0 and "ipc_details_r" <= 100)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_ipc_percentile" CHECK (("ipc_details_percentile" is null or ("ipc_details_percentile" >= 0 and "ipc_details_percentile" <= 100)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_summary_fat" CHECK (("summary_fat_percent" is null or ("summary_fat_percent" >= 0 and "summary_fat_percent" <= 15)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_summary_protein" CHECK (("summary_protein_percent" is null or ("summary_protein_percent" >= 0 and "summary_protein_percent" <= 15)));
  ALTER TABLE "animals" ADD CONSTRAINT "chk_animals_summary_milk" CHECK (("summary_milk_yield" is null or "summary_milk_yield" >= 0));
  ALTER TABLE "calvings" ADD CONSTRAINT "chk_calvings_number" CHECK (("number" is null or "number" > 0));
  ALTER TABLE "calvings" ADD CONSTRAINT "chk_calvings_milking_days" CHECK (("milking_days" is null or "milking_days" >= 0));
  ALTER TABLE "calvings" ADD CONSTRAINT "chk_calvings_calf_weight" CHECK (("calf_weight" is null or "calf_weight" > 0));
  ALTER TABLE "inseminations" ADD CONSTRAINT "chk_inseminations_attempt" CHECK (("attempt_number" is null or "attempt_number" > 0));
  ALTER TABLE "inseminations" ADD CONSTRAINT "chk_inseminations_doses" CHECK (("doses" is null or "doses" > 0));
  ALTER TABLE "milk_tests" ADD CONSTRAINT "chk_milk_tests_lactation" CHECK (("lactation_number" is null or "lactation_number" > 0));
  ALTER TABLE "milk_tests" ADD CONSTRAINT "chk_milk_tests_yield" CHECK (("daily_yield" is null or "daily_yield" >= 0));
  ALTER TABLE "milk_tests" ADD CONSTRAINT "chk_milk_tests_fat" CHECK (("fat_percent" is null or ("fat_percent" >= 0 and "fat_percent" <= 15)));
  ALTER TABLE "milk_tests" ADD CONSTRAINT "chk_milk_tests_protein" CHECK (("protein_percent" is null or ("protein_percent" >= 0 and "protein_percent" <= 15)));
  ALTER TABLE "index_values" ADD CONSTRAINT "chk_index_values_reliability" CHECK (("reliability" is null or ("reliability" >= 0 and "reliability" <= 100)));
  ALTER TABLE "index_values" ADD CONSTRAINT "chk_index_values_used" CHECK (("used" is null or "used" >= 0));
  ALTER TABLE "index_bases_traits" ADD CONSTRAINT "chk_index_bases_sd" CHECK (("sd" is null or "sd" > 0));
  ALTER TABLE "index_bases_traits" ADD CONSTRAINT "chk_index_bases_n" CHECK (("n" is null or "n" >= 0));`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_not_own_father";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_not_own_mother";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_parents_differ";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_trust_level";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_blood_percent";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_inbreeding";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_improvers_share1";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_improvers_share2";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_production_reliability";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_health_reliability";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_ipc_r";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_ipc_percentile";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_summary_fat";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_summary_protein";
  ALTER TABLE "animals" DROP CONSTRAINT "chk_animals_summary_milk";
  ALTER TABLE "calvings" DROP CONSTRAINT "chk_calvings_number";
  ALTER TABLE "calvings" DROP CONSTRAINT "chk_calvings_milking_days";
  ALTER TABLE "calvings" DROP CONSTRAINT "chk_calvings_calf_weight";
  ALTER TABLE "inseminations" DROP CONSTRAINT "chk_inseminations_attempt";
  ALTER TABLE "inseminations" DROP CONSTRAINT "chk_inseminations_doses";
  ALTER TABLE "milk_tests" DROP CONSTRAINT "chk_milk_tests_lactation";
  ALTER TABLE "milk_tests" DROP CONSTRAINT "chk_milk_tests_yield";
  ALTER TABLE "milk_tests" DROP CONSTRAINT "chk_milk_tests_fat";
  ALTER TABLE "milk_tests" DROP CONSTRAINT "chk_milk_tests_protein";
  ALTER TABLE "index_values" DROP CONSTRAINT "chk_index_values_reliability";
  ALTER TABLE "index_values" DROP CONSTRAINT "chk_index_values_used";
  ALTER TABLE "index_bases_traits" DROP CONSTRAINT "chk_index_bases_sd";
  ALTER TABLE "index_bases_traits" DROP CONSTRAINT "chk_index_bases_n";
  ALTER TABLE "animals" ALTER COLUMN "trust_level" SET DATA TYPE numeric;
  ALTER TABLE "calvings" ALTER COLUMN "number" SET DATA TYPE numeric;
  ALTER TABLE "inseminations" ALTER COLUMN "lactation_number" SET DATA TYPE numeric;
  ALTER TABLE "inseminations" ALTER COLUMN "doses" SET DATA TYPE numeric;
  ALTER TABLE "inseminations" ALTER COLUMN "doses" SET DEFAULT 1;
  ALTER TABLE "inseminations" ALTER COLUMN "attempt_number" SET DATA TYPE numeric;
  ALTER TABLE "milk_tests" ALTER COLUMN "lactation_number" SET DATA TYPE numeric;
  ALTER TABLE "index_values" ALTER COLUMN "used" SET DATA TYPE numeric;
  ALTER TABLE "index_bases_traits" ALTER COLUMN "n" SET DATA TYPE numeric;`)
}
