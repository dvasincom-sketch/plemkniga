import 'dotenv/config'

// Пересчёт индекса здесь ни к чему: продуктивность скрипт не трогает
process.env.INDEX_VALUES_SKIP = '1'

import { getPayload } from 'payload'
import config from '../payload.config'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { DRY_OFF_BEFORE, GESTATION_DAYS, PREG_CHECK_FROM } from '../lib/herd-calendar'

/**
 * Состояние воспроизводства стада: стельные, осеменённые, яловые.
 *
 * ## Зачем
 *
 * Календарь стада и половина списка выбраковки строятся от осеменения
 * с результатом. В синтетическом стаде осеменения есть, а результата
 * у них нет ни у одного: `seed-bulk` пишет попытки без `result_id`.
 * Из-за этого календарь всегда пуст, «осеменений на стельность» всегда
 * прочерк, а претензия «не стельная» не выставляется никому.
 *
 * Показать эти разделы нельзя, проверить на живых данных — тоже. Причём
 * пустота честная: страницы не врут, им действительно не из чего считать.
 * Чинить надо данные, а не страницы.
 *
 * ## Что именно строится
 *
 * Не «случайные осеменения», а **состав стада по стадиям воспроизводства**
 * — так, как он выглядит у работающего хозяйства в любой день года:
 *
 * - около 45 % стельные, с разным сроком: часть отелится через неделю,
 *   часть через полгода. Только такое распределение оживляет и «пора
 *   запускать», и «отёлы месяца» — одинаковый срок у всех дал бы либо
 *   пустые списки, либо стадо целиком в одном из них;
 * - 20 % осеменены и ждут проверки — это список «проверить стельность»;
 * - 10 % осеменены только что: в списки они не попадают, и это важно
 *   проверить не меньше, чем попадание;
 * - 15 % яловые после нескольких попыток — они дают претензии
 *   «не стельная» и «много осеменений»;
 * - 10 % отелились недавно и ещё не осеменялись — период ожидания.
 *
 * Части стельных с близким отёлом проставляется дата запуска: список
 * «пора запускать» обязан их отфильтровывать, и проверить это можно
 * только имея и тех и других.
 *
 * ## Что он не трогает
 *
 * Отёлы, дойки, продуктивность, родословную. Только добавляет осеменения
 * и, у части коров, проставляет дату запуска последнему отёлу. Корову
 * без единого отёла пропускает: срок ей считать не от чего.
 *
 * ## Как это убрать
 *
 * Осеменения помечены в комментарии — по метке их и удаляет `--undo`.
 * Дата запуска снимается у тех отёлов, в комментарии которых стоит та же
 * метка. Список сделанного рядом со скриптом не ведём: он разъедется
 * с базой при первом же ручном удалении, а запись, которая помнит,
 * откуда взялась, не разъедется ни с чем.
 *
 *   npm run seed:repro                 # демонстрационное хозяйство
 *   npm run seed:repro -- --org 3
 *   npm run seed:repro -- --dry        # только показать, что сделает
 *   npm run seed:repro -- --undo       # убрать записанное
 *
 *   # прод: строку подключения берём из окружения развёртывания
 *   DATABASE_URI='postgres://…' npm run seed:repro -- --dry
 *   DATABASE_URI='postgres://…' npm run seed:repro -- --remote
 */

const args = process.argv.slice(2)
const argOf = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const DRY = args.includes('--dry')
const UNDO = args.includes('--undo')
const REMOTE = args.includes('--remote')
const ORG_ARG = argOf('org') ? Number(argOf('org')) : undefined
const LIMIT = Number(argOf('limit') ?? 400)

/**
 * Метка в комментарии записи. Менять нельзя, не убрав прежде записанное
 * старой версией: изменённая метка означает, что прошлые записи больше
 * не найти, и они останутся в базе навсегда, выглядя настоящими.
 */
const MARK = 'seed:repro'

const DEMO_ORG_EMAIL = 'farmer@nazarovskoe.ru'

const { uri, source } = resolveDatabase()

/* --------------------------- Немного случайности ------------------------- */

let seed = 20260826
/** Свой генератор: прогон должен повторяться, а Math.random — нет. */
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1))
const chance = (p: number) => rnd() < p

const addDays = (d: Date, days: number): Date => {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}
const iso = (d: Date): string => d.toISOString()
const ru = (d: Date): string => d.toLocaleDateString('ru-RU')

const isLocal = (connection: string): boolean =>
  /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:/]/.test(connection) ||
  connection.includes('/var/run/postgresql')

/**
 * Стадии воспроизводства и их доли.
 *
 * Доли не выдуманы под красивую картинку: у благополучного стада
 * с межотельным периодом около 400 дней в любой день года примерно
 * половина коров стельные, четверть в работе (осеменены или яловые),
 * остальные в периоде ожидания после отёла. Сумма долей — единица;
 * стадия выбирается по накопленному весу.
 */
const STAGES = [
  { key: 'pregnant', share: 0.45 },
  { key: 'awaiting', share: 0.2 },
  { key: 'justBred', share: 0.1 },
  { key: 'open', share: 0.15 },
  { key: 'waiting', share: 0.1 },
] as const

type Stage = (typeof STAGES)[number]['key']

const drawStage = (): Stage => {
  const x = rnd()
  let acc = 0
  for (const s of STAGES) {
    acc += s.share
    if (x < acc) return s.key
  }
  return 'waiting'
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})`)
  if (DRY) console.log('Пробный прогон: ничего не записывается\n')

  if (!DRY && !isLocal(uri ?? '') && !REMOTE) {
    console.error(
      '\nЭта база не на вашей машине, а скрипт сочиняет записи.\n' +
        'Если вы правда хотите наполнить её — повторите с --remote:\n' +
        '  npm run seed:repro -- --remote\n' +
        'Посмотреть, что будет сделано, можно без ключа: npm run seed:repro -- --dry\n',
    )
    process.exit(1)
  }

  const payload = await getPayload({ config })

  /* --------------------------- Чьё стадо --------------------------- */

  let orgId = ORG_ARG
  if (!orgId) {
    const owner = await payload.find({
      collection: 'users',
      where: { email: { equals: DEMO_ORG_EMAIL } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    const rel = owner.docs[0]?.organization
    orgId = typeof rel === 'number' ? rel : ((rel as { id?: number } | null)?.id ?? undefined)
  }

  if (!orgId) {
    console.error(
      `Не нашёл хозяйство: ни --org, ни учётной записи ${DEMO_ORG_EMAIL}. ` +
        'Укажите хозяйство явно: npm run seed:repro -- --org <id>',
    )
    process.exit(1)
  }

  /* ------------------------------- Откат ------------------------------- */

  if (UNDO) {
    const mine = await payload.find({
      collection: 'inseminations',
      where: { and: [{ comment: { like: MARK } }] },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    })

    let removed = 0
    for (const d of mine.docs) {
      if (!DRY) await payload.delete({ collection: 'inseminations', id: d.id, overrideAccess: true })
      removed += 1
    }

    const dried = await payload.find({
      collection: 'calvings',
      where: { and: [{ comment: { like: MARK } }] },
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    })

    let cleared = 0
    for (const d of dried.docs) {
      if (!DRY) {
        await payload.update({
          collection: 'calvings',
          id: d.id,
          data: { dryOffDate: null, comment: null },
          overrideAccess: true,
        })
      }
      cleared += 1
    }

    console.log(`\nУдалено осеменений: ${removed}, снято дат запуска: ${cleared}\n`)
    process.exit(0)
  }

  /* --------------------------- Что уже есть ---------------------------- */

  const results = await payload.find({
    collection: 'insemination-results',
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  const byCode = new Map(results.docs.map((r) => [String(r.code), r.id as number]))
  const PREGNANT = byCode.get('1')
  const OPEN = byCode.get('2')

  if (!PREGNANT || !OPEN) {
    console.error(
      'В справочнике результатов осеменения нет кодов 1 и 2. Сначала: npm run seed\n',
    )
    process.exit(1)
  }

  const bulls = await payload.find({
    collection: 'animals',
    where: { and: [{ sex: { equals: 'male' } }, { ageGroup: { equals: 'bull' } }] },
    limit: 20,
    depth: 0,
    sort: '-ipc',
    overrideAccess: true,
  })
  const bullIds = bulls.docs.map((b) => b.id as number)

  const cows = await payload.find({
    collection: 'animals',
    where: {
      and: [
        { owner: { equals: orgId } },
        { archived: { not_equals: true } },
        { sex: { equals: 'female' } },
        { state: { equals: 'alive' } },
      ],
    },
    limit: LIMIT,
    depth: 0,
    sort: 'identNumber',
    overrideAccess: true,
  })

  console.log(`Хозяйство #${orgId}: коров ${cows.docs.length}, быков в книге ${bullIds.length}\n`)

  const now = new Date()
  const counts: Record<string, number> = {
    pregnant: 0,
    awaiting: 0,
    justBred: 0,
    open: 0,
    waiting: 0,
    skipped: 0,
    dryOff: 0,
    inseminations: 0,
  }

  for (const cow of cows.docs) {
    /*
     * Последний отёл — точка отсчёта всему. Корова без отёлов
     * пропускается: срок ей считать не от чего, а сочинять ей отёл —
     * дело другого скрипта (`seed:afc`).
     */
    const calvings = await payload.find({
      collection: 'calvings',
      where: { animal: { equals: cow.id } },
      limit: 1,
      depth: 0,
      sort: '-date',
      overrideAccess: true,
    })

    const last = calvings.docs[0]
    if (!last?.date) {
      counts.skipped += 1
      continue
    }

    /*
     * Осеменения после последнего отёла уже есть? Тогда корова
     * пропускается целиком. Дописать к чужой истории свою — значит
     * получить корову с шестью попытками, из которых три сочинены,
     * и никакой откат этого уже не распутает.
     */
    const existing = await payload.count({
      collection: 'inseminations',
      where: {
        and: [{ animal: { equals: cow.id } }, { date: { greater_than: last.date } }],
      },
      overrideAccess: true,
    })
    if (existing.totalDocs > 0) {
      counts.skipped += 1
      continue
    }

    const lastCalving = new Date(last.date)
    const stage = drawStage()
    const bull = bullIds.length ? bullIds[int(0, bullIds.length - 1)] : undefined

    /** Одна попытка осеменения. */
    const add = async (at: Date, attempt: number, result?: number, checked?: Date) => {
      counts.inseminations += 1
      if (DRY) return
      await payload.create({
        collection: 'inseminations',
        data: {
          animal: cow.id,
          date: iso(at),
          attemptNumber: attempt,
          doses: 1,
          lactationNumber: last.number ?? undefined,
          bull,
          result,
          pregnancyCheckDate: checked ? iso(checked) : undefined,
          comment: `Демонстрационные данные (${MARK})`,
        },
        overrideAccess: true,
      })
    }

    if (stage === 'pregnant') {
      /*
       * Срок стельности выбирается так, чтобы отёл пришёлся на любой
       * день ближайших девяти месяцев. Именно разброс делает списки
       * осмысленными: одинаковый срок у всех дал бы либо пустое
       * «пора запускать», либо всё стадо в нём разом.
       */
      const daysPregnant = int(20, GESTATION_DAYS - 3)
      const bredAt = addDays(now, -daysPregnant)
      // Осеменение не может быть раньше отёла: тогда это прошлая лактация
      if (bredAt <= lastCalving) {
        counts.skipped += 1
        continue
      }
      const due = addDays(bredAt, GESTATION_DAYS)
      const toCalving = Math.round((due.getTime() - now.getTime()) / 86_400_000)

      await add(bredAt, 1, PREGNANT, addDays(bredAt, int(PREG_CHECK_FROM, 45)))
      counts.pregnant += 1

      /*
       * Части близких к отёлу проставляем запуск. Без них список «пора
       * запускать» нечем проверить на отсечение: он обязан показывать
       * только тех, у кого запуск ещё не отмечен.
       */
      if (toCalving <= DRY_OFF_BEFORE && chance(0.4)) {
        counts.dryOff += 1
        if (!DRY) {
          await payload.update({
            collection: 'calvings',
            id: last.id,
            data: {
              dryOffDate: iso(addDays(due, -DRY_OFF_BEFORE)),
              comment: `Демонстрационные данные (${MARK})`,
            },
            overrideAccess: true,
          })
        }
      }
    } else if (stage === 'awaiting') {
      // Осеменена, результат ещё не известен — список «проверить стельность»
      const at = addDays(now, -int(PREG_CHECK_FROM + 2, 90))
      if (at <= lastCalving) {
        counts.skipped += 1
        continue
      }
      await add(at, 1)
      counts.awaiting += 1
    } else if (stage === 'justBred') {
      // Осеменена только что: проверять рано, ни в один список не попадает
      const at = addDays(now, -int(3, PREG_CHECK_FROM - 5))
      if (at <= lastCalving) {
        counts.skipped += 1
        continue
      }
      await add(at, 1)
      counts.justBred += 1
    } else if (stage === 'open') {
      /*
       * Яловая после нескольких попыток. Промежуток 21 день — длина
       * полового цикла коровы: осеменять чаще незачем, реже значит
       * пропустить охоту.
       */
      const attempts = int(3, 5)
      const first = addDays(now, -int(120, 200))
      if (first <= lastCalving) {
        counts.skipped += 1
        continue
      }
      for (let a = 1; a <= attempts; a += 1) {
        const at = addDays(first, (a - 1) * 21)
        if (at > now) break
        // Все попытки помечены «яловая»: неудачной была каждая, включая
        // промежуточные, — иначе последняя выглядела бы единственной
        await add(at, a, OPEN)
      }
      counts.open += 1
    } else {
      // Период ожидания после отёла: не осеменялась и правильно сделала
      counts.waiting += 1
    }
  }

  console.log(
    `Стельных ${counts.pregnant} · ожидают проверки ${counts.awaiting} · ` +
      `осеменены недавно ${counts.justBred} · яловых ${counts.open} · ` +
      `в периоде ожидания ${counts.waiting}`,
  )
  console.log(
    `Записано осеменений ${counts.inseminations}, проставлено дат запуска ${counts.dryOff}, ` +
      `пропущено коров ${counts.skipped}`,
  )
  console.log(
    DRY
      ? '\nЭто был пробный прогон. Повторите без --dry, чтобы записать.\n'
      : `\nГотово. Календарь: /account/reports/calendar (сегодня ${ru(now)})\n`,
  )

  process.exit(0)
}

main().catch((e) => {
  console.error('\nНаполнение не отработало:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
