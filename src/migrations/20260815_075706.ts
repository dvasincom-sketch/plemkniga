import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "notify_submissions" boolean DEFAULT true;
  ALTER TABLE "users" ADD COLUMN "notify_trust" boolean DEFAULT true;
  ALTER TABLE "users" ADD COLUMN "notify_news" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "notify_submissions";
  ALTER TABLE "users" DROP COLUMN "notify_trust";
  ALTER TABLE "users" DROP COLUMN "notify_news";`)
}
