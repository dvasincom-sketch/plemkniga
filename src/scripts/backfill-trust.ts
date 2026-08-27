import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { LAB_PROTOCOL_TYPE } from '@/lib/trust'

/**
 * Разовая уборка: вторая ступень без протокола.
 *
 * ## Что чинится
 *
 * До решения №198 «Подтверждено лабораторией» проставлялось напрямую —
 * сидом и вручную, — и в книге таких записей десятки тысяч. Теперь
 * ступень означает другое: есть зарегистрированный протокол лаборатории.
 * Старые записи от этого не поломались, но их плашка означает не то,
 * что означает такая же плашка у новых, и различить их глазами нельзя.
 *
 * Одна подпись с двумя значениями хуже, чем отсутствие подписи: читатель
 * не знает, какое из двух перед ним, и вынужден не верить обоим.
 *
 * ## Куда опускаются
 *
 * До первой ступени — «Заявлено хозяйством». Не в черновик: записи
 * заведены и заявлены, и отменять это уборкой нечего. Дата подтверждения
 * стирается: она относилась к подтверждению, которого не было.
 *
 * Записи с подписью Ассоциации (третья ступень) и отклонённые скрипт
 * не трогает — их ступень к протоколу отношения не имеет.
 *
 *   npm run backfill:trust -- --dry     посчитать, ничего не меняя
 *   npm run backfill:trust              выполнить
 *
 * ## Почему прямым запросом, а не через Payload
 *
 * Записей десятки тысяч, и обновление по одной заняло бы часы, попутно
 * записав столько же строк в журнал правок — журнал о нашей уборке,
 * а не о работе с животными. От уровня достоверности не зависит ни один
 * пересчёт (индексы считаются по продуктивности), поэтому обход хуков
 * здесь ничего не оставляет несогласованным.
 */

const dry = process.argv.includes('--dry')

async function main() {
  const payload = await getPayload({ config })

  /*
   * Условие «нет действующего протокола» списано с `hasLabProtocol`
   * дословно. Разойдись они — скрипт опустил бы записи, которые правило
   * тут же подняло бы обратно, и наоборот.
   */
  const hasProtocol = `
    exists (
      select 1 from documents d
       where d.animal_id = a.id
         and d.type = '${LAB_PROTOCOL_TYPE}'
         and d.file_id is not null
         and d.issued_by_id is not null
         and coalesce(d.lab_name, '') <> ''
         and d.revoked_at is null
    )`

  const where = `a.trust_level = 2 and not ${hasProtocol}`

  const { rows: counts } = await payload.db.pool.query(
    `select
       count(*) filter (where not ${hasProtocol})::int as without,
       count(*) filter (where ${hasProtocol})::int     as with_protocol
       from animals a
      where a.trust_level = 2`,
  )
  const n = Number(counts[0]?.without ?? 0)
  const kept = Number(counts[0]?.with_protocol ?? 0)

  console.log('')
  console.log(`Вторая ступень без протокола: ${n}`)
  console.log(`Вторая ступень с протоколом:  ${kept}`)
  console.log('')

  if (!n) {
    console.log('Убирать нечего.')
    process.exit(0)
  }

  if (dry) {
    console.log('Пробный прогон: ничего не изменено. Без --dry ступень опустится до первой.')
    process.exit(0)
  }

  const res = await payload.db.pool.query(
    `update animals a
        set trust_level = 1, trust_checked_at = null
      where ${where}`,
  )

  console.log(`Опущено до «Заявлено хозяйством»: ${res.rowCount ?? 0}`)
  console.log('')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
