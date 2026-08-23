import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Отзыв заявки на верификацию.
 *
 * ## Зачем
 *
 * Одни и те же записи можно было подать сколько угодно раз. Для хозяйства
 * это ничего не стоило, для Ассоциации означало двойную работу: эксперт
 * разбирает то же стадо второй раз и не знает, какая из двух заявок
 * отражает нынешние данные. Теперь при повторной подаче хозяйство обязано
 * выбрать — отозвать прежнюю заявку или не подавать новую.
 *
 * ## Почему отзыв, а не удаление
 *
 * Эксперт мог успеть взять заявку в работу и записать замечания. Заявка,
 * исчезнувшая у него из-под рук без следа, читается как поломка системы.
 * Отозванная остаётся на месте со своим состоянием, датой отзыва и номером
 * той заявки, ради которой её отозвали.
 *
 * ## Почему номер текстом, а не связь
 *
 * Связь на саму заявку потребовала бы внешнего ключа с индексом, а имя
 * ограничения у самоссылки (`verification_requests_..._verification_requests_id_fk`)
 * длиннее 63 символов — предела идентификатора в PostgreSQL. База обрежет
 * его, миграция будет помнить полное, и следующий `migrate:create` увидит
 * разницу там, где её нет. Номер заявки человеку и так понятнее
 * идентификатора.
 *
 * ## Про `ALTER TYPE ... ADD VALUE` в транзакции
 *
 * С PostgreSQL 12 команда в транзакции выполняется, но новое значение
 * нельзя использовать в той же транзакции, где оно добавлено. Миграция
 * им и не пользуется — только расширяет перечисление.
 *
 * Обратной миграции у значения перечисления нет: `ALTER TYPE ... DROP
 * VALUE` в PostgreSQL не существует. Колонки откат убирает, значение
 * остаётся — это безвредно, но сказать об этом надо вслух.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TYPE "public"."enum_verification_requests_status" ADD VALUE IF NOT EXISTS 'cancelled';`)

  await db.execute(sql`
  ALTER TABLE "verification_requests"
    ADD COLUMN IF NOT EXISTS "withdrawn_at" timestamp(3) with time zone;`)

  await db.execute(sql`
  ALTER TABLE "verification_requests"
    ADD COLUMN IF NOT EXISTS "withdrawn_for" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "verification_requests" DROP COLUMN IF EXISTS "withdrawn_at";`)
  await db.execute(sql`
  ALTER TABLE "verification_requests" DROP COLUMN IF EXISTS "withdrawn_for";`)

  /*
   * Значение перечисления остаётся: `ALTER TYPE ... DROP VALUE`
   * в PostgreSQL нет, а пересоздание типа потребовало бы переписать
   * колонку и все зависимости — цена, несоразмерная откату.
   * Заявок в этом состоянии после отката не останется.
   */
}
