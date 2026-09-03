import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Направление продуктивности у породы.
 *
 * ## Зачем
 *
 * Оно и раньше приходило из реестра ФГИАС ПР полем `direction_name` —
 * «Молочное», «Мясное», «Универсальное», — но нигде не сохранялось:
 * скрипт синхронизации отбирал по нему молочные породы и выбрасывал.
 * Пока никто не спрашивал «какие породы книга ведёт», это сходило
 * с рук; каталог пород на витрине задаёт ровно этот вопрос, а ответить
 * на него по названию нельзя — симментальская универсальная,
 * герефордская мясная, и знать это должен справочник.
 *
 * ## Почему миграция, а не push
 *
 * На боевой книге схему меняют только миграции (`dbPush` выключен),
 * и это правило стоило нам падения главной: колонка появилась
 * в настройках Payload, запрос стал её спрашивать, а в базе её не было.
 * Ошибка вида `column "direction" does not exist` приходит не там, где
 * поле завели, а там, где справочник читают, — то есть на первой же
 * открытой странице.
 *
 * ## Почему без значения по умолчанию
 *
 * Пустое направление — честное состояние: у пород, заведённых до сверки
 * с реестром, оно неизвестно. Проставить всем «молочное» значило бы
 * объявить мясные породы молочными и увидеть их в каталоге как готовые
 * к ведению книги. Заполняется сверкой (`npm run sync:fgias-breeds`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'breeds' AND column_name = 'direction'
      ) THEN
        ALTER TABLE "breeds" ADD COLUMN "direction" varchar;
      END IF;
    END $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "breeds" DROP COLUMN IF EXISTS "direction";`)
}
