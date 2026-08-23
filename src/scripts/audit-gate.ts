import 'dotenv/config'
import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { approvalBlockers, blockersMessage } from '@/lib/verification-gate'

/**
 * Ревизия заслона подтверждения — на настоящей базе и без единого нажатия.
 *
 * ## Зачем
 *
 * Правило «нельзя подтвердить запись поверх неразобранной существенной
 * находки» — главное обещание книги: знак «Проверено ассоциацией» стоит
 * ровно столько, сколько стоит это правило. Проверить его до сих пор
 * можно было единственным способом — войти сотрудником Ассоциации, дойти
 * до заявки и нажать кнопку. То есть самое важное правило системы
 * проверялось только руками, только целиком и только тем, кто помнит,
 * что именно должно произойти.
 *
 * Скрипт спрашивает у заслона то же самое, что спросит кнопка, и печатает
 * ответ. Ничего не создаёт, не меняет и не удаляет — его не страшно
 * запускать на боевой базе.
 *
 * ## Два режима, и второй важнее
 *
 * Без ключей — проход по открытым заявкам: что заслон скажет, если эксперт
 * нажмёт «подтвердить» прямо сейчас. Это отчёт о состоянии очереди.
 *
 * `--probe=<номера через запятую>` — проба: заявка собирается **в памяти**
 * из названных записей и отдаётся заслону. Записи в базу при этом
 * не попадают. Так проверяется само правило, а не то, что случайно
 * оказалось в очереди: берём запись контрольного стада с заведомой
 * находкой и смотрим, назовёт ли её заслон.
 *
 * ## Чего скрипт не проверяет
 *
 * Права. Заслон отвечает на вопрос «можно ли подтверждать эти записи»,
 * а «этому ли человеку» решает `guard` в серверном действии. Смешивать
 * их в одном отчёте значило бы получить проверку, которая падает
 * по двум разным причинам и не говорит, по какой.
 */

const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))

const describeError = (e: unknown): string =>
  e instanceof Error ? `${e.message}${e.cause ? ` (${String(e.cause)})` : ''}` : String(e)

/** Проба: заявка, собранная в памяти из названных номеров животных. */
async function probe(payload: Payload, idents: string[]) {
  const { docs } = await payload.find({
    collection: 'animals',
    where: { identNumber: { in: idents } },
    limit: idents.length,
    depth: 0,
    overrideAccess: true,
  })

  const found = new Set(docs.map((d) => String(d.identNumber)))
  const missing = idents.filter((i) => !found.has(i))

  console.log('')
  console.log('ПРОБА ЗАСЛОНА')
  console.log('')
  console.log(`  Запрошено записей: ${idents.length}, найдено: ${docs.length}`)
  if (missing.length) console.log(`  Нет в книге: ${missing.join(', ')}`)
  if (!docs.length) {
    console.log('  Проверять нечего.')
    return
  }

  /*
   * Заявка без единого разобранного замечания — самый строгий случай:
   * так выглядит только что поданная. Если заслон промолчит здесь,
   * он промолчит всегда.
   */
  const result = await approvalBlockers(payload, {
    animals: docs.map((d) => d.id),
    review: { findings: [], dismissed: [] },
  })

  console.log(`  Разобрано проверками: ${result.checked}`)
  console.log('')

  if (!result.blockers.length) {
    console.log('  Заслон молчит: подтвердить можно все записи.')
    console.log('  Это верно только если ни у одной из них нет существенных находок.')
  } else {
    console.log(`  Заслон держит записей: ${result.blockers.length}`)
    for (const b of result.blockers) {
      console.log(`    ${pad(b.ident, 24)} ${b.labels.join('; ')}`)
    }
    console.log('')
    console.log('  Текст, который увидит эксперт:')
    console.log(`    ${blockersMessage(result.blockers)}`)
  }

  for (const l of result.limits) console.log(`  · ${l}`)
  console.log('')
}

async function queue(payload: Payload) {
  const { docs } = await payload.find({
    collection: 'verification-requests',
    where: { status: { in: ['new', 'checking'] } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })

  console.log('')
  console.log(`ОТКРЫТЫЕ ЗАЯВКИ: ${docs.length}`)
  console.log('')

  if (!docs.length) {
    console.log('  Очередь пуста. Правило проверяется пробой: --probe=<номера>')
    console.log('')
    return
  }

  for (const r of docs) {
    const number = String(r.number ?? `#${r.id}`)
    const result = await approvalBlockers(payload, r as never).catch((e: unknown) => {
      console.log(`  ${pad(number, 14)} разбор не выполнился: ${describeError(e)}`)
      return null
    })
    if (!result) continue

    const count = (r.animals ?? []).length

    if (!result.blockers.length) {
      console.log(`  ${pad(number, 14)} записей ${pad(String(count), 5)} заслон молчит — подтвердить можно`)
    } else {
      console.log(
        `  ${pad(number, 14)} записей ${pad(String(count), 5)} держит ${result.blockers.length}: ` +
          [...new Set(result.blockers.flatMap((b) => b.labels))].slice(0, 3).join(', '),
      )
      for (const b of result.blockers.slice(0, 5)) {
        console.log(`      ${pad(b.ident, 24)} ${b.labels.join('; ')}`)
      }
      if (result.blockers.length > 5) {
        console.log(`      и ещё ${result.blockers.length - 5}`)
      }
    }
  }

  console.log('')
  console.log('  «Заслон молчит» не значит «данные верны»: молчит он только')
  console.log('  о существенных находках, которые видит система. Соответствие')
  console.log('  документам проверяет человек.')
  console.log('')
}

async function main() {
  const payload = await getPayload({ config })

  const list = arg('probe')
  if (list) {
    await probe(
      payload,
      list
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  } else {
    await queue(payload)
  }

  process.exit(0)
}

main().catch((e) => {
  console.error(describeError(e))
  process.exit(1)
})
