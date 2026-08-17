import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_organizations_membership" ADD VALUE 'suspended';
  ALTER TABLE "organizations" ADD COLUMN "membership_review_decided_by_id" integer;
  ALTER TABLE "organizations" ADD COLUMN "membership_review_decided_at" timestamp(3) with time zone;
  ALTER TABLE "organizations" ADD COLUMN "membership_review_since" timestamp(3) with time zone;
  ALTER TABLE "organizations" ADD COLUMN "membership_review_comment" varchar;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_membership_review_decided_by_id_users_id_fk" FOREIGN KEY ("membership_review_decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "organizations_membership_idx" ON "organizations" USING btree ("membership");
  CREATE INDEX "organizations_membership_review_membership_review_decide_idx" ON "organizations" USING btree ("membership_review_decided_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "organizations" DROP CONSTRAINT "organizations_membership_review_decided_by_id_users_id_fk";
  
  ALTER TABLE "organizations" ALTER COLUMN "membership" SET DATA TYPE text;
  ALTER TABLE "organizations" ALTER COLUMN "membership" SET DEFAULT 'none'::text;
  DROP TYPE "public"."enum_organizations_membership";
  CREATE TYPE "public"."enum_organizations_membership" AS ENUM('none', 'pending', 'member');
  ALTER TABLE "organizations" ALTER COLUMN "membership" SET DEFAULT 'none'::"public"."enum_organizations_membership";
  ALTER TABLE "organizations" ALTER COLUMN "membership" SET DATA TYPE "public"."enum_organizations_membership" USING "membership"::"public"."enum_organizations_membership";
  DROP INDEX "organizations_membership_idx";
  DROP INDEX "organizations_membership_review_membership_review_decide_idx";
  ALTER TABLE "organizations" DROP COLUMN "membership_review_decided_by_id";
  ALTER TABLE "organizations" DROP COLUMN "membership_review_decided_at";
  ALTER TABLE "organizations" DROP COLUMN "membership_review_since";
  ALTER TABLE "organizations" DROP COLUMN "membership_review_comment";`)
}
