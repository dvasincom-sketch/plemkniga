import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Обязательность двух ключей, на которых держатся обещания книги.
 *
 * ## `animals.uuid`
 *
 * Наш неизменный идентификатор: по нему загрузка файлом находит свою
 * запись, и он же уезжает во ФГИАС ПР как «идентификатор учётной системы».
 * В коллекции он объявлен уникальным, а обязательным не был — заполнял
 * его один хук при создании. Любой путь записи мимо этого хука оставил бы
 * пусто, и уникальный индекс этого не заметил бы: в PostgreSQL пустое
 * не равно пустому, и строк без ключа может быть сколько угодно. То есть
 * обещание «у каждого животного есть неизменный ключ» держалось
 * на единственной строке кода.
 *
 * ## `access_views.viewer_org_id`
 *
 * Журнал просмотров: кто смотрел чужую запись. В коллекции поле
 * обязательное, в базе — нет; соседняя колонка `owner_id` в той же
 * миграции объявлена `NOT NULL`, то есть расхождение случайное.
 *
 * Цена его не в пустом поле, а в уникальности. Строка журнала уникальна
 * по паре «животное + смотревший», и это и есть смысл: один просмотр —
 * одна строка. С пустым значением пара перестаёт совпадать сама с собой,
 * и счётчик «сколько хозяйств посмотрело» разъезжается молча.
 *
 * ## Почему миграция отказывается работать на непустых строках
 *
 * `SET NOT NULL` проверяет каждую строку и падает на первой пустой,
 * называя колонку и не называя строку. Так уже было со шкалой
 * достоверности: в разработке все записи укладывались, на проде нашлись
 * отклонённые, и узнали мы об этом из упавшей миграции.
 *
 * Заполнить пустые за человека миграция не вправе. Для `uuid` это ещё
 * можно было бы — сгенерировать новый, — но новый ключ означает, что
 * файл хозяйства при следующей загрузке не найдёт свою запись и заведёт
 * дубль. Такое решение принимают, посмотрев на строки, а не по дороге.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE
      empty integer;
    BEGIN
      SELECT count(*) INTO empty FROM "animals" WHERE "uuid" IS NULL;
      IF empty > 0 THEN
        RAISE EXCEPTION
          'Животных без uuid: %. Обязательность не выставлена. Найдите их: select id, ident_number from animals where uuid is null; Новый ключ означает дубль при следующей загрузке файлом — решайте по строкам.',
          empty;
      END IF;

      ALTER TABLE "animals" ALTER COLUMN "uuid" SET NOT NULL;
    END $$;
  `)

  await db.execute(sql`
    DO $$
    DECLARE
      empty integer;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'access_views'
      ) THEN
        RETURN;
      END IF;

      SELECT count(*) INTO empty FROM "access_views" WHERE "viewer_org_id" IS NULL;
      IF empty > 0 THEN
        RAISE EXCEPTION
          'Строк журнала просмотров без смотревшего: %. Обязательность не выставлена. Найдите их: select id, animal_id, owner_id, viewed_at from access_views where viewer_org_id is null;',
          empty;
      END IF;

      ALTER TABLE "access_views" ALTER COLUMN "viewer_org_id" SET NOT NULL;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "animals" ALTER COLUMN "uuid" DROP NOT NULL;`)
  await db.execute(sql`ALTER TABLE "access_views" ALTER COLUMN "viewer_org_id" DROP NOT NULL;`)
}
