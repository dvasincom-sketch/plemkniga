import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { biggestHerd } from '@/lib/biggest-herd'
import { afcStats } from '@/lib/afc-stats'
import { afcSireBook } from '@/lib/afc-sires'
import { bullProof } from '@/lib/bull-proof'
import { sireSummary } from '@/lib/sire-summary'
import { resolveThresholds } from '@/lib/check-thresholds'
import { isCalvingEvent } from '@/lib/calving'
import { monthsBetween } from '@/lib/afc'

/**
 * Возраст первого отёла: четыре экрана против одного перебора.
 *
 * ## Зачем это нужно
 *
 * Величина считалась в пяти местах — отчёт хозяйства, сводка Ассоциации,
 * карточка быка, сравнение быков, отчёт по производителям, — и копии
 * разошлись по всему, чем могли: где-то стоял `distinct on`, где-то нет
 * (корова с двумя записями «первого отёла» считалась дважды); где-то
 * рамка правдоподобия, где-то ничего; где-то пол дочерей, где-то любой.
 * Один бык показывал на четырёх страницах четыре разных возраста дочерей,
 * и объяснить это было некому: каждая страница по отдельности выглядела
 * правильной.
 *
 * Общий кусок SQL (`nthCalvingCte` и `afcMonths` в `sql-lactation.ts`)
 * убирает причину, но не заменяет проверку: пути расчёта остаются разными
 * — разные отборы, разные соединения, разная группировка, — и сойтись они
 * обязаны на живых данных, а не в намерении.
 *
 * ## Что с чем сверяется
 *
 * Сторона отчётов — четыре готовых расчёта. Сторона истины — перебор
 * документов через Payload: для каждой коровы берётся самая ранняя запись
 * с номером 1, у которой тип события «отёл», и считаются полные месяцы
 * от рождения. Это не копия запроса, а другой способ прийти к тому же
 * числу; копия сверяла бы копию с оригиналом.
 *
 * Пустая сверка считается красной: ноль сравнённых коров означает,
 * что проверка ничего не проверила.
 *
 *   npm run check:afc
 *   npm run check:afc -- --org=12    хозяйство поимённо
 */

type Row = Record<string, unknown>

const rel = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object') return ((v as Row).id as number) ?? null
  return null
}

const failures: string[] = []
const fail = (m: string) => failures.push(m)

/** Расхождение в десятую месяца — округление, дальше — разные правила. */
const near = (a: number | null, b: number | null, tol = 0.1) =>
  a !== null && b !== null && Math.abs(a - b) <= tol

async function main() {
  const payload = await getPayload({ config })

  const explicit = process.argv.find((a) => a.startsWith('--org='))?.slice(6)
  const orgId = explicit ? Number(explicit) : await biggestHerd(payload)

  if (!orgId || !Number.isFinite(orgId)) {
    console.log('  ✗ в книге нет животных с хозяйством — сверять нечего')
    process.exit(1)
  }

  const t = await resolveThresholds(payload)
  console.log(
    `\nВозраст первого отёла, хозяйство #${orgId}, границы ${t.afcMin}…${t.afcMax} мес.\n`,
  )

  /* ---------------------- Сторона истины: перебор ---------------------- */

  const herd = await payload.find({
    collection: 'animals',
    where: {
      and: [
        { owner: { equals: orgId } },
        { archived: { not_equals: true } },
        { sex: { equals: 'female' } },
        { birthDate: { exists: true } },
      ],
    },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const ids = herd.docs.map((d) => d.id as number)
  if (!ids.length) {
    console.log('  ✗ в хозяйстве нет самок с датой рождения — сверять нечего')
    process.exit(1)
  }

  const calvings = await payload.find({
    collection: 'calvings',
    where: { and: [{ animal: { in: ids } }, { number: { equals: 1 } }] },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  /* Самая ранняя запись с номером 1, и только настоящий отёл. */
  const firstByAnimal = new Map<number, string>()
  for (const c of calvings.docs as unknown as Row[]) {
    if (!isCalvingEvent(c.eventType as string | null)) continue
    const aid = rel(c.animal)
    const date = c.date ? String(c.date) : null
    if (!aid || !date) continue
    const prev = firstByAnimal.get(aid)
    if (!prev || date < prev) firstByAnimal.set(aid, date)
  }

  const byAnimal = new Map(herd.docs.map((d) => [d.id as number, d]))
  const walked: number[] = []
  for (const [aid, date] of firstByAnimal) {
    const animal = byAnimal.get(aid)
    if (!animal?.birthDate) continue
    const months = monthsBetween(String(animal.birthDate), date)
    if (months === null) continue
    if (months < t.afcMin || months > t.afcMax) continue
    walked.push(months)
  }

  if (walked.length === 0) {
    console.log('  ✗ ни одной коровы с правдоподобным первым отёлом — сверять нечего')
    process.exit(1)
  }

  const walkedMean = walked.reduce((a, b) => a + b, 0) / walked.length
  console.log(
    `  Перебором: ${walked.length} коров, средний возраст ${walkedMean.toFixed(2)} мес.`,
  )

  /* -------------------------- Отчёт хозяйства -------------------------- */

  const stats = await afcStats(payload, orgId)
  console.log(`  Отчёт хозяйства: ${stats.cows} коров, среднее ${stats.meanAfc ?? '—'}`)

  if (stats.cows !== walked.length) {
    fail(
      `отчёт насчитал ${stats.cows} коров, перебор — ${walked.length}: ` +
        'расходится отбор, а не расчёт',
    )
  }
  if (!near(stats.meanAfc, walkedMean)) {
    fail(`среднее отчёта ${stats.meanAfc ?? '—'} против ${walkedMean.toFixed(2)} перебором`)
  }

  /* ------------------- Бык: карточка против трёх мест ------------------- */

  const book = await afcSireBook(payload)
  const sire = book.rows.find((r) => r.daughters >= 3)

  if (!sire) {
    console.log('\n  · быков с тремя дочерьми в книге нет — сверка по быку пропущена')
  } else {
    console.log(`\n  Бык ${sire.identNumber}: сводка Ассоциации ${sire.meanAfc ?? '—'} мес.`)

    const proof = await bullProof(payload, sire.sireId)
    console.log(`  Карточка быка: ${proof?.afcMean ?? '—'} мес. по ${proof?.afcCows ?? 0} дочерям`)

    /*
     * Сводка Ассоциации считает по всей книге, карточка — тоже.
     * Отчёт по производителям считает по одному стаду, поэтому с ним
     * сверяется только тот бык, у которого дочери есть в этом стаде.
     */
    if (!near(sire.meanAfc, proof?.afcMean ?? null)) {
      fail(
        `бык ${sire.identNumber}: сводка ${sire.meanAfc ?? '—'}, ` +
          `карточка ${proof?.afcMean ?? '—'} — одно число на двух страницах`,
      )
    }

    const sires = await sireSummary(payload, orgId)
    const inHerd = sires?.rows.find((r) => r.id === sire.sireId)
    if (inHerd && inHerd.afc !== null && proof?.afcMean != null) {
      console.log(`  Отчёт по производителям (это стадо): ${inHerd.afc} мес.`)
      /*
       * Здесь равенства не требуется: множества дочерей разные — стадо
       * против книги. Требуется правдоподобие: разница больше трёх
       * месяцев означает, что расходятся правила, а не выборки.
       */
      if (Math.abs(inHerd.afc - proof.afcMean) > 3) {
        fail(
          `бык ${sire.identNumber}: отчёт по стаду ${inHerd.afc}, ` +
            `карточка по книге ${proof.afcMean} — разница больше трёх месяцев`,
        )
      }
    }
  }

  console.log(
    failures.length === 0
      ? '\nВозраст первого отёла сходится на всех экранах.\n'
      : `\nРасхождений: ${failures.length}\n${failures.map((f) => `  ✗ ${f}`).join('\n')}\n`,
  )
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nПроверка не отработала:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
