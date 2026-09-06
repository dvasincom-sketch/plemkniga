import 'dotenv/config'
import { Pool } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'
import {
  BASE_FAT_PERCENT,
  BASE_PROTEIN_PERCENT,
  KG_PER_PERCENT_POINT,
  KG_TOLERANCE,
} from '../lib/pta-consistency'

/**
 * Привести килограммы жира и белка в оценке к удою и процентам.
 *
 * ## Когда это уместно, а когда нет
 *
 * Уместно ровно один раз: чтобы починить синтетику, которую мы сами
 * и налили. Сид разыгрывал все пять продуктивных оценок независимо, и в базе
 * появились сотни тысяч записей, где килограммы не следуют из удоя.
 * Проверка `eval-fat-kg-mismatch` теперь это видит и права; чинить каждую
 * запись руками бессмысленно, потому что виноват не оператор, а генератор.
 *
 * **Неуместно как постоянный инструмент, и это важнее всего остального
 * в этом файле.** Килограммы, присланные хозяйством, — его данные.
 * Переписать их нашей формулой значит подменить чужое число своим, тихо
 * и массово: расхождение исчезнет из отчётов, но не потому, что данные
 * стали верны, а потому, что мы стёрли свидетельство. Книга обязана
 * находить противоречие и называть его, а решать, какое из двух чисел
 * правда, — тому, у кого есть первичный документ.
 *
 * Поэтому по умолчанию скрипт ничего не пишет и правит только синтетику,
 * а выход за её пределы требует отдельного ключа.
 *
 * Умолчание было обратным, и это противоречило абзацу выше: граница
 * «только синтетика» включалась ключом `--seeded`, то есть опасный режим
 * стоял по умолчанию, а безопасный — по ключу. Команда, отличающаяся
 * от безопасной одним словом, переписывала жир и белок у всех животных
 * с заполненными исходными числами, включая присланные хозяйствами.
 * Заодно ключ `--dry`, обещанный здесь же, нигде не разбирался: у соседей
 * (`repair-blood`, `backfill-trust`) он настоящий и перебивает `--yes`,
 * а тут `--dry --yes` записал бы.
 *
 *   npm run repair:pta-kg              — только показать, только синтетику
 *   npm run repair:pta-kg -- --yes     — переписать синтетику
 *   npm run repair:pta-kg -- --all     — считать по всей книге
 *   npm run repair:pta-kg -- --all --yes — переписать всё; так делать не надо
 *
 * ## Почему прямым запросом, а не через Payload
 *
 * Правятся два числа в сотнях тысяч строк, без хуков и без пересчёта
 * индекса. Через Payload это полмиллиона операций и часы; здесь один
 * `UPDATE`.
 *
 * Индекс после этого становится устаревшим, и книга обязана это заметить.
 * Замечает она сравнением `animals.updated_at` с временем расчёта
 * (`indexValuesLag` в `lib/index-values.ts`), а прямой `UPDATE` эту
 * отметку не двигает: триггеров на таблице нет. То есть обещание
 * «книга сама скажет» держалось на том, чего скрипт не делал, — после
 * прогона книга показывала бы ноль устаревших значений при сотнях тысяч
 * устаревших. Поэтому `updated_at` проставляется здесь же, руками.
 */

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

/* `--dry` перебивает `--yes`: из двух ключей сильнее тот, что запрещает. */
const WRITE = process.argv.includes('--yes') && !process.argv.includes('--dry')
const SEEDED_ONLY = !process.argv.includes('--all')

const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

/*
 * Условие «расходится больше допуска» повторяется в счёте и в правке,
 * поэтому собрано один раз. Разъехавшись, эти два места дали бы отчёт
 * об одном числе записей и правку другого — расхождение, которое
 * обнаружилось бы не сразу и выглядело бы как ошибка в данных.
 */
const expectedFat = `(production_milk_forecast * ${BASE_FAT_PERCENT} / 100
  + production_fat_percent_forecast * ${KG_PER_PERCENT_POINT})`

const expectedProtein = `(production_milk_forecast * ${BASE_PROTEIN_PERCENT} / 100
  + production_protein_percent_forecast * ${KG_PER_PERCENT_POINT})`

/*
 * Правятся только те строки, где есть все три исходных числа. Запись
 * с пустым удоем чинить нечем: вывести килограммы не из чего, а поставить
 * ноль значило бы придумать оценку.
 */
const HAVE_INPUTS = `
  production_milk_forecast IS NOT NULL
  AND production_fat_percent_forecast IS NOT NULL
  AND production_protein_percent_forecast IS NOT NULL`

const SEEDED = SEEDED_ONLY ? `AND uuid LIKE '99999999-%'` : ''

const fatOff = `(production_fat_kg_forecast IS NOT NULL
  AND abs(production_fat_kg_forecast - ${expectedFat}) > ${KG_TOLERANCE.fat})`

const proteinOff = `(production_protein_kg_forecast IS NOT NULL
  AND abs(production_protein_kg_forecast - ${expectedProtein}) > ${KG_TOLERANCE.protein})`

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})`)
  console.log(
    SEEDED_ONLY
      ? 'Только синтетика (uuid 99999999-…)\n'
      : 'ВСЯ КНИГА, включая присланное хозяйствами (--all)\n',
  )

  const { rows } = await pool.query(`
    SELECT
      count(*) FILTER (WHERE ${fatOff})                                    AS fat_off,
      count(*) FILTER (WHERE ${proteinOff})                                AS protein_off,
      count(*) FILTER (WHERE ${fatOff} OR ${proteinOff})                   AS any_off,
      round(max(abs(production_fat_kg_forecast - ${expectedFat})), 1)      AS fat_max,
      round(max(abs(production_protein_kg_forecast - ${expectedProtein})), 1) AS protein_max
    FROM animals
    WHERE ${HAVE_INPUTS} ${SEEDED}`)

  const r = rows[0] as Record<string, string | null>
  const any = Number(r.any_off ?? 0)

  console.log(`  расходится по жиру:   ${r.fat_off} (наибольшее ${r.fat_max ?? '—'} кг, допуск ${KG_TOLERANCE.fat})`)
  console.log(`  расходится по белку:  ${r.protein_off} (наибольшее ${r.protein_max ?? '—'} кг, допуск ${KG_TOLERANCE.protein})`)
  console.log(`  всего записей к правке: ${any}\n`)

  if (any === 0) {
    console.log('Чинить нечего.\n')
    await pool.end()
    return
  }

  if (!WRITE) {
    console.log('Ничего не записано. Чтобы переписать килограммы, добавьте --yes.\n')
    console.log('Помните: у настоящих данных килограммы принадлежат хозяйству,')
    console.log('и подменять их нашей формулой нельзя — расхождение надо разбирать,')
    console.log('а не стирать.\n')
    await pool.end()
    return
  }

  const started = Date.now()
  const res = await pool.query(`
    UPDATE animals SET
      production_fat_kg_forecast     = round(${expectedFat}::numeric, 1),
      production_protein_kg_forecast = round(${expectedProtein}::numeric, 1),
      updated_at                     = now()
    WHERE ${HAVE_INPUTS} ${SEEDED}
      AND (${fatOff} OR ${proteinOff})`)

  console.log(
    `Переписано записей: ${res.rowCount} за ${((Date.now() - started) / 1000).toFixed(1)} с\n`,
  )

  /*
   * Про устаревший индекс сказано вслух. Правка шла мимо хуков, значит
   * хранимые значения посчитаны по прежним килограммам. Книга это заметит
   * и покажет сама, но узнать об этом лучше здесь, а не из сообщения
   * на главной.
   */
  console.log('Индекс этих животных теперь посчитан по прежним числам,')
  console.log('и книга покажет их в списке устаревших: отметка правки сдвинута.')
  console.log('Пересчёт: npm run backfill:index (или по одному: -- --ident НОМЕР)\n')

  await pool.end()
}

main().catch(async (e) => {
  console.error('\nОшибка:', e instanceof Error ? e.message : e)
  await pool.end().catch(() => {})
  process.exit(1)
})
