import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * След обмена: кто прислал запись и под каким номером у себя.
 *
 * ## Зачем
 *
 * Открывается приём данных по ICAR ADE, и вместе с ним появляется вопрос,
 * которого при одной только отдаче не было: что делать со второй копией
 * того же события.
 *
 * Она будет. Клиент, не дождавшийся ответа из-за оборванного соединения,
 * повторит запрос — так поступает любой добросовестный клиент, и так же
 * предписывает поступать сам стандарт. Без чужого идентификатора второй
 * запрос создаёт вторую запись: контрольное доение удваивается, а за ним
 * удваивается лактация, которая из доений считается.
 *
 * ## Почему ключ составной
 *
 * `sourceId` уникален только **внутри источника** — так сказано
 * в стандарте, и иначе быть не может: это внутренний номер чужой
 * программы. Две разные программы, приславшие «12345», не имеют между
 * собой ничего общего, и склеить их записи по совпадению номера значило
 * бы потерять одну из двух.
 *
 * ## Почему указатель частичный
 *
 * Записей, принятых обменом, будет заметно меньше, чем внесённых руками
 * и загрузкой: у последних обе колонки пусты. Полный уникальный указатель
 * запретил бы вторую такую запись — все пустые пары равны между собой.
 * Условие `WHERE ... IS NOT NULL` оставляет ручной ввод в покое
 * и сторожит ровно то, ради чего указатель заводится.
 *
 * ## Почему сразу уникальный, а не «проверим в коде»
 *
 * Проверка в коде — это «прочитать и записать», два действия с зазором
 * между ними. Ровно в этот зазор и приходит повторный запрос при сбое
 * сети: оба чтения не находят записи, оба пишут. Гонка здесь не редкий
 * случай, а самый частый, потому что повтор случается именно тогда,
 * когда сеть плоха и запросы идут внахлёст.
 *
 * ## Где смотреть
 *
 * `src/lib/ade/accept.ts` — запись и разрешение конфликта,
 * `src/lib/ade/parse.ts` — разбор, `adeOriginField`
 * в `src/collections/shared.ts` — описание поля.
 */

const TABLES = ['milk_tests', 'calvings', 'inseminations', 'weighings'] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const t of TABLES) {
    await db.execute(sql.raw(`
      ALTER TABLE "${t}"
        ADD COLUMN IF NOT EXISTS "ade_source" varchar,
        ADD COLUMN IF NOT EXISTS "ade_source_id" varchar;`))

    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "${t}_ade_origin_key"
        ON "${t}" USING btree ("ade_source", "ade_source_id")
        WHERE "ade_source" IS NOT NULL AND "ade_source_id" IS NOT NULL;`))
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const t of TABLES) {
    await db.execute(sql.raw(`DROP INDEX IF EXISTS "${t}_ade_origin_key";`))
    await db.execute(sql.raw(`
      ALTER TABLE "${t}"
        DROP COLUMN IF EXISTS "ade_source",
        DROP COLUMN IF EXISTS "ade_source_id";`))
  }
}
