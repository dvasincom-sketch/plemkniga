import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Обязательность выставки и осиротевшая колонка специалистов.
 *
 * ## Дата и название мероприятия
 *
 * В коллекции у обоих полей стоит `required: true`, а миграция выставок
 * завела их обычными колонками. Расхождение из тех, что не ломают ничего
 * и потому живут долго: форма требует, `next dev` строит схему из полей
 * и ставит `NOT NULL` сам, а прод берёт схему из миграций — и принимает
 * выставку без названия от скрипта переноса или от ручного `UPDATE`.
 * Карточка потом печатает пустую строку с наградой, и понять, что это
 * за мероприятие, нельзя уже никак.
 *
 * ## Почему миграция отказывается работать на непустых строках
 *
 * `ALTER TABLE ... SET NOT NULL` проверяет каждую строку и падает
 * на первой пустой, называя ограничение и не называя строку. Так уже
 * было со шкалой достоверности: в разработке все записи укладывались,
 * на проде нашлись отклонённые, и узнали мы об этом из упавшей миграции.
 *
 * Поэтому миграция сама считает такие строки и отказывается с человеческим
 * сообщением: сколько их и что с ними делать. Проставить им что-нибудь
 * задним числом она не вправе — название мероприятия неоткуда взять,
 * а «Мероприятие» вместо названия было бы выдумкой, неотличимой
 * от настоящих данных. Заранее их показывает `npm run db:precheck`
 * и `npm run check:schema`.
 *
 * ## Ключ ФГИАС у специалистов по осеменению
 *
 * Миграция `20260830_170000_fgias_uuid` добавила `fgias_uuid` пятнадцати
 * справочникам и объяснила это тем, что все они собираются одной фабрикой
 * `dictionary()`. Объяснение верно для четырнадцати: `Technicians` описан
 * руками и такого поля не имеет. Колонка осталась в базе, Payload о ней
 * не знает, `check:schema` показывает её в списке лишнего.
 *
 * Убирается, а не заводится поле. Карта соответствия
 * (`lib/fgias-map.ts`) говорит про этот справочник прямо: «люди,
 * а не номенклатура» — ключа в реестре у них нет и не будет. Колонка,
 * которую никто не заполняет и не читает, со временем обрастает догадками
 * о том, зачем она.
 *
 * Отказ при непустой колонке — та же осторожность: писать в неё нечему,
 * но если там что-то есть, значит кто-то писал руками, и стирать это
 * молча нельзя.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE
      loose integer;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'animals_shows'
      ) THEN
        RETURN;
      END IF;

      SELECT count(*) INTO loose
        FROM "animals_shows"
       WHERE "date" IS NULL OR "title" IS NULL;

      IF loose > 0 THEN
        RAISE EXCEPTION
          'Выставок без даты или названия: %. Обязательность не выставлена. Найдите их запросом: select id, _parent_id, "date", title from animals_shows where "date" is null or title is null;',
          loose;
      END IF;

      ALTER TABLE "animals_shows" ALTER COLUMN "date" SET NOT NULL;
      ALTER TABLE "animals_shows" ALTER COLUMN "title" SET NOT NULL;
    END $$;
  `)

  await db.execute(sql`
    DO $$
    DECLARE
      filled integer;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'technicians' AND column_name = 'fgias_uuid'
      ) THEN
        RETURN;
      END IF;

      SELECT count(*) INTO filled
        FROM "technicians"
       WHERE "fgias_uuid" IS NOT NULL;

      IF filled > 0 THEN
        RAISE EXCEPTION
          'У специалистов по осеменению заполнен ключ ФГИАС в % строках, а поля для него в книге нет. Колонка не удалена: решите, что с этими значениями.',
          filled;
      END IF;

      DROP INDEX IF EXISTS "technicians_fgias_uuid_idx";
      ALTER TABLE "technicians" DROP COLUMN "fgias_uuid";
    END $$;
  `)
}

/**
 * Откат возвращает базу к прежнему состоянию, а не к прежнему смыслу:
 * колонка вернётся пустой, значений в ней не было и восстанавливать
 * нечего.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "animals_shows" ALTER COLUMN "date" DROP NOT NULL;`)
  await db.execute(sql`ALTER TABLE "animals_shows" ALTER COLUMN "title" DROP NOT NULL;`)
  await db.execute(sql`
    ALTER TABLE "technicians" ADD COLUMN IF NOT EXISTS "fgias_uuid" varchar;`)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "technicians_fgias_uuid_idx" ON "technicians" USING btree ("fgias_uuid");`)
}
