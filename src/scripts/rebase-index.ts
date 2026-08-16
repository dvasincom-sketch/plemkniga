import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { TRAIT_BASE, type TraitKey } from '../lib/breeding-index'
import { loadActiveBase } from '../lib/index-base'
import { recomputeAll } from '../lib/index-values'
import type { Animal } from '../payload-types'

/**
 * Пересчёт базы сравнения по собственной популяции.
 *
 * Индекс измеряет отклонение от базы, а база у нас заимствованная: средние
 * и стандартные отклонения взяты из Net Merit 2025 (CDCB) и переведены
 * в метрические единицы. Это главная оговорка всего расчёта. Скрипт считает
 * те же величины по животным Ассоциации и записывает их новой версией базы.
 *
 * Что именно считается — и чем это не является.
 *
 * Считается разброс *оценок* племенной ценности в популяции. Генетическое
 * стандартное отклонение — не то же самое: оценка сжата к среднему тем
 * сильнее, чем ниже её достоверность, поэтому разброс оценок систематически
 * меньше истинного генетического. Строго σ_g получают из компонент дисперсии
 * (REML по модели животного), а это отдельная работа расчётного центра.
 *
 * Почему тогда так можно. Индекс нужен, чтобы сравнивать животных между собой
 * внутри книги, а для сравнения важна общая шкала, а не её абсолютная
 * калибровка. Стандартизация по собственному разбросу даёт ровно это,
 * и делает признаки сопоставимыми именно в нашей популяции — чего
 * заимствованная база не гарантирует.
 *
 * Чего делать нельзя: сравнивать полученные числа с официальными NM$ и TPI.
 * Впрочем, этого нельзя было и раньше — приближения на то и приближения.
 *
 *   npm run rebase:index                      # посчитать и показать
 *   npm run rebase:index -- --apply           # записать новую базу и пересчитать
 *   npm run rebase:index -- --apply --version АПГ-2026-08
 */

/** Меньше этого числа оценок — признак остаётся на заимствованной базе. */
const MIN_N = 30

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const versionArg = (() => {
  const at = args.indexOf('--version')
  return at >= 0 ? args[at + 1] : undefined
})()

const { uri, source } = resolveDatabase()

/** Значение и достоверность признака — по тому же пути, что и в расчёте. */
const readValue = (animal: Animal, path: string): { v: number; r: number | null } | null => {
  const parts = path.split('.')
  let node: unknown = animal
  for (const p of parts) {
    if (node && typeof node === 'object') node = (node as Record<string, unknown>)[p]
    else return null
  }
  if (typeof node === 'number') return { v: node, r: null }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (typeof o.forecast !== 'number') return null
    return { v: o.forecast, r: typeof o.r === 'number' ? o.r : null }
  }
  return null
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')} (из ${source})`)

  const payload = await getPayload({ config })
  const current = await loadActiveBase(payload)
  console.log(`Действующая база сравнения: ${current.version}\n`)

  /*
   * Служебные записи предков в выборку не берутся: у них оценок нет,
   * а те, что есть, сгенерированы для построения родословных. База должна
   * описывать поголовье, а не вспомогательные строки.
   */
  const samples = new Map<TraitKey, { v: number; r: number | null }[]>(
    TRAIT_BASE.map((t) => [t.key, []]),
  )
  let animals = 0
  let page = 1

  for (;;) {
    const batch = await payload.find({
      collection: 'animals',
      where: { or: [{ archived: { equals: false } }, { archived: { exists: false } }] },
      limit: 500,
      page,
      depth: 0,
      sort: 'id',
      overrideAccess: true,
    })
    for (const a of batch.docs as Animal[]) {
      animals += 1
      for (const t of TRAIT_BASE) {
        const s = readValue(a, t.path)
        if (s !== null) samples.get(t.key)!.push(s)
      }
    }
    if (!batch.hasNextPage) break
    page += 1
  }

  const rows = TRAIT_BASE.map((t) => {
    const xs = samples.get(t.key)!
    const n = xs.length
    if (n < MIN_N) return { trait: t, n, mean: null, observed: null, meanR: null, sd: null }

    const mean = xs.reduce((a, x) => a + x.v, 0) / n
    // Несмещённая оценка дисперсии: делим на n − 1
    const variance = xs.reduce((a, x) => a + (x.v - mean) ** 2, 0) / (n - 1)
    const observed = Math.sqrt(variance)

    /*
     * Поправка на достоверность.
     *
     * Разброс оценок меньше генетического: оценка сжата к среднему тем
     * сильнее, чем меньше о животном известно. В первом приближении
     * дисперсия оценок равна доле объяснённой дисперсии от генетической,
     * то есть Var(EBV) ≈ R̄ · σ_g², откуда σ_g ≈ SD(EBV) / √R̄.
     *
     * Это не REML: строгая оценка требует модели животного и матрицы
     * родства. Но поправка снимает главную часть смещения и делает σ
     * сопоставимым с литературным — а без неё признаки с низкой
     * достоверностью (долголетие, фертильность) выглядели бы куда менее
     * изменчивыми, чем они есть, и получали бы в индексе завышенный вес.
     */
    const rs = xs.map((x) => x.r).filter((r): r is number => typeof r === 'number' && r > 0)
    const meanR = rs.length >= MIN_N ? rs.reduce((a, r) => a + r, 0) / rs.length : null
    const sd = meanR && meanR >= 20 ? observed / Math.sqrt(meanR / 100) : observed

    return { trait: t, n, mean, observed, meanR, sd }
  })

  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length))
  const num = (v: number | null, d = 2) => (v === null ? '—' : v.toFixed(d))

  console.log(`Животных в выборке: ${animals}\n`)
  console.log(
    pad('Признак', 32) +
      pad('Оценок', 8) +
      pad('Среднее', 10) +
      pad('Разброс', 10) +
      pad('R̄, %', 8) +
      pad('σ своя', 10) +
      'σ заимств.',
  )
  console.log('─'.repeat(94))
  for (const r of rows) {
    console.log(
      pad(`${r.trait.label}, ${r.trait.unit}`, 32) +
        pad(String(r.n), 8) +
        pad(num(r.mean), 10) +
        pad(num(r.observed), 10) +
        pad(r.meanR === null ? '—' : num(r.meanR, 0), 8) +
        pad(r.sd === null ? 'мало данных' : num(r.sd), 10) +
        num(r.trait.sd),
    )
  }

  console.log(
    '\nσ своя — разброс оценок, делённый на корень из средней достоверности:\n' +
      'оценка сжата к среднему тем сильнее, чем меньше о животном известно.\n' +
      'Без поправки признаки с низкой достоверностью выглядели бы менее\n' +
      'изменчивыми, чем они есть, и получали бы в индексе завышенный вес.',
  )

  const ready = rows.filter((r) => r.sd !== null)
  console.log(`\nПересчитано признаков: ${ready.length} из ${rows.length}.`)
  if (ready.length < rows.length) {
    console.log(
      `Остальные останутся на заимствованной базе: оценок меньше ${MIN_N}, и разброс по ним\n` +
        'считать бессмысленно — случайность выборки перевесит сигнал.',
    )
  }

  if (!ready.length) {
    console.log('\nСчитать нечего. База не менялась.')
    return
  }

  if (!apply) {
    console.log(
      '\nЭто предварительный расчёт, база не менялась.\n' +
        'Записать и пересчитать все значения индекса:\n' +
        '  npm run rebase:index -- --apply',
    )
    return
  }

  const now = new Date()
  const version = versionArg ?? `АПГ-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const doc = await payload.create({
    collection: 'index-bases',
    overrideAccess: true,
    data: {
      version,
      source: 'own',
      note: `Пересчёт по ${animals} животным Ассоциации; признаков с собственным σ — ${ready.length}`,
      isActive: true,
      animalsUsed: animals,
      computedAt: now.toISOString(),
      traits: ready.map((r) => ({
        trait: r.trait.key,
        mean: Math.round(r.mean! * 10000) / 10000,
        sd: Math.round(r.sd! * 10000) / 10000,
        sdObserved: Math.round(r.observed! * 10000) / 10000,
        meanR: r.meanR === null ? null : Math.round(r.meanR * 10) / 10,
        n: r.n,
      })),
    },
  })

  console.log(`\nЗаписана база ${doc.version}. Пересчитываю значения индекса…`)
  const { profiles, rows: written } = await recomputeAll(payload, (m) => console.log(`  ${m}`))
  console.log(`\nГотово: профилей ${profiles}, значений ${written}.`)
  console.log(
    'Прежние базы остались в коллекции: рядом с каждым выпущенным значением\n' +
      'записана версия, и старое число по-прежнему объяснимо.',
  )
  process.exit(0)
}

main().catch((e) => {
  console.error('\nОшибка пересчёта базы:', e instanceof Error ? e.message : e)
  process.exit(1)
})
