import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_documents_type" ADD VALUE 'zootechnicalCertificate' BEFORE 'genotypeReport';
  ALTER TABLE "documents" ADD COLUMN "issued_by_id" integer;
  ALTER TABLE "documents" ADD COLUMN "revoked_at" timestamp(3) with time zone;
  ALTER TABLE "documents" ADD COLUMN "revoked_by_id" integer;
  ALTER TABLE "documents" ADD COLUMN "revoked_reason" varchar;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_revoked_by_id_users_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "documents_issued_by_idx" ON "documents" USING btree ("issued_by_id");
  CREATE INDEX "documents_revoked_revoked_at_idx" ON "documents" USING btree ("revoked_at");
  CREATE INDEX "documents_revoked_revoked_by_idx" ON "documents" USING btree ("revoked_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "documents" DROP CONSTRAINT "documents_issued_by_id_users_id_fk";
  
  ALTER TABLE "documents" DROP CONSTRAINT "documents_revoked_by_id_users_id_fk";
  
  ALTER TABLE "documents" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "documents" ALTER COLUMN "type" SET DEFAULT 'pedigreeCertificate'::text;
  DROP TYPE "public"."enum_documents_type";
  CREATE TYPE "public"."enum_documents_type" AS ENUM('pedigreeCertificate', 'genotypeReport', 'vetCertificate', 'saleContract', 'other');
  ALTER TABLE "documents" ALTER COLUMN "type" SET DEFAULT 'pedigreeCertificate'::"public"."enum_documents_type";
  ALTER TABLE "documents" ALTER COLUMN "type" SET DATA TYPE "public"."enum_documents_type" USING "type"::"public"."enum_documents_type";
  DROP INDEX "documents_issued_by_idx";
  DROP INDEX "documents_revoked_revoked_at_idx";
  DROP INDEX "documents_revoked_revoked_by_idx";
  ALTER TABLE "documents" DROP COLUMN "issued_by_id";
  ALTER TABLE "documents" DROP COLUMN "revoked_at";
  ALTER TABLE "documents" DROP COLUMN "revoked_by_id";
  ALTER TABLE "documents" DROP COLUMN "revoked_reason";`)
}
