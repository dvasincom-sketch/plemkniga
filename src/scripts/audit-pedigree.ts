import 'dotenv/config'
import { Pool } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'

/**
 * Ревизия родословной: то, что не умеет проверить база.
 *
 * Часть правил переехала в CHECK-ограничения — животное не может быть своим
 * отцом, отец не может быть матерью. Но CHECK видит одну строку, а родословная
 * это граф, и самые неприятные противоречия живут между строками:
 *
 *  - **цикл**: A → отец B → отец C → отец A. Каждая строка по отдельности
 *    безупречна, вместе они означают, что животное само себе предок.
 *    Обход предков на такой записи уходит в бесконечность — карточка перестаёт
 *    открываться, и причину по одной строке не найти;
 *  - **пол родителя**: отцом записан не бык, матерью не корова;
 *  - **порядок дат**: потомок родился раньше родителя;
 *  - **возраст матери**: отёл раньше, чем ей исполнилось полтора года
 *    (`MIN_DAM_AGE_MONTHS` в коде объявлена, но нигде не проверяется).
 *
 * Приложение первые три случая не создаёт: `beforeValidate` их отклоняет.
 * Но записи приходят и мимо приложения — перенос из «Селэкса», ручная правка,
 * будущая интеграция с ФГИАС. Ревизия существует ровно для этого: показать,
 * что накопилось, а не запретить.
 *
 * Скрипт ничего не чинит и не меняет: только читает и печатает. Решение,
 * что делать с найденным, — за человеком, потому что вариантов всегда два
 * (запись неверна / связь неверна), и выбор смысловой.
 *
 *   npm run audit:pedigree
 *   npm run audit:pedigree -- --all    # показать все находки, а не первые пять
 */

const { driverUri, uri, source, sslConfig } = resolveDatabase()

if (!driverUri) {
  console.error('Строка подключения не найдена. Проверьте DATABASE_URI в .env')
  process.exit(1)
}

const showAll = process.argv.includes('--all')
const SAMPLE = 5

const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

type Node = {
  id: number
  ident: string
  father: number | null
  mother: number | null
  sex: string | null
  birth: number | null
}

const ru = (n: number) => n.toLocaleString('ru-RU')

/** Печать находок: заголовок, счётчик, несколько примеров. */
const report = (title: string, lines: string[]) => {
  if (!lines.length) {
    console.log(`  ✓  ${title} — нет`)
    return 0
  }
  console.log(`\n  ✗  ${title}: ${ru(lines.length)}`)
  for (const line of showAll ? lines : lines.slice(0, SAMPLE)) console.log(`     ${line}`)
  if (!showAll && lines.length > SAMPLE) {
    console.log(`     … и ещё ${ru(lines.length - SAMPLE)} (запустите с --all)`)
  }
  console.log('')
  return lines.length
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  const { rows } = await pool.query<{
    id: number
    ident_number: string
    father_id: number | null
    mother_id: number | null
    sex: string | null
    birth_date: Date | null
  }>(`select id, ident_number, father_id, mother_id, sex, birth_date from animals`)

  /*
   * Весь граф в память. На трёхстах тысячах животных это около двадцати
   * мегабайт — меньше, чем стоит один рекурсивный обход в базе, а обходов
   * тут будет столько же, сколько записей. Родословная целиком помещается
   * в память любой машины, на которой запускают ревизию.
   */
  const nodes = new Map<number, Node>()
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      ident: r.ident_number,
      father: r.father_id,
      mother: r.mother_id,
      sex: r.sex,
      birth: r.birth_date ? new Date(r.birth_date).getTime() : null,
    })
  }

  console.log(`Записей в книге: ${ru(nodes.size)}\n`)
  const name = (id: number) => nodes.get(id)?.ident ?? `id=${id}`
  let problems = 0

  /* ------------------------------- Циклы ---------------------------------- */

  /*
   * Обход в глубину с тремя состояниями: белый — не смотрели, серый — идём
   * через него прямо сейчас, чёрный — прошли и ничего не нашли. Встретили
   * серый — значит вернулись туда, откуда пришли: это и есть цикл.
   *
   * Обход итеративный, со своим стеком. Рекурсия здесь падает: у «достроенных»
   * родословных глубина доходит до девяти колен и дальше, а на испорченных
   * данных — до бесконечности, что как раз и ищем.
   */
  const WHITE = 0
  const GREY = 1
  const BLACK = 2
  const color = new Map<number, number>()
  const cycles: string[] = []
  const seenCycles = new Set<string>()

  for (const start of nodes.keys()) {
    if ((color.get(start) ?? WHITE) !== WHITE) continue

    // Стек хранит узел и то, какого родителя мы у него разбираем: 0 — отца, 1 — мать
    const stack: { id: number; step: number }[] = [{ id: start, step: 0 }]
    const path: number[] = []
    color.set(start, GREY)
    path.push(start)

    while (stack.length) {
      const top = stack[stack.length - 1]!
      const node = nodes.get(top.id)!
      const next = top.step === 0 ? node.father : top.step === 1 ? node.mother : null
      top.step += 1

      if (top.step > 2) {
        color.set(top.id, BLACK)
        stack.pop()
        path.pop()
        continue
      }
      if (next === null || !nodes.has(next)) continue

      const state = color.get(next) ?? WHITE
      if (state === GREY) {
        // Нашли цикл: вырезаем из пути кусок от повторившегося узла
        const from = path.indexOf(next)
        const loop = path.slice(from).concat(next)
        const key = [...loop].sort((a, b) => a - b).join('-')
        if (!seenCycles.has(key)) {
          seenCycles.add(key)
          cycles.push(loop.map(name).join(' → '))
        }
        continue
      }
      if (state === BLACK) continue

      color.set(next, GREY)
      path.push(next)
      stack.push({ id: next, step: 0 })
    }
  }

  problems += report('Циклы в родословной', cycles)

  /* ---------------------------- Пол родителей ----------------------------- */

  const wrongFather: string[] = []
  const wrongMother: string[] = []
  const bornBeforeParent: string[] = []
  const youngDam: string[] = []

  /** Восемнадцать месяцев — минимальный возраст первого отёла. */
  const MIN_DAM_AGE_MS = 18 * 30.4 * 24 * 3600 * 1000

  for (const n of nodes.values()) {
    const father = n.father !== null ? nodes.get(n.father) : undefined
    const mother = n.mother !== null ? nodes.get(n.mother) : undefined

    if (father && father.sex !== null && father.sex !== 'male') {
      wrongFather.push(`${n.ident}: отцом записана ${father.ident} (пол — женский)`)
    }
    if (mother && mother.sex !== null && mother.sex !== 'female') {
      wrongMother.push(`${n.ident}: матерью записан ${mother.ident} (пол — мужской)`)
    }

    for (const [parent, role] of [
      [father, 'отец'],
      [mother, 'мать'],
    ] as const) {
      if (!parent || n.birth === null || parent.birth === null) continue
      if (parent.birth >= n.birth) {
        bornBeforeParent.push(
          `${n.ident} (${new Date(n.birth).toLocaleDateString('ru-RU')}) — ` +
            `${role} ${parent.ident} (${new Date(parent.birth).toLocaleDateString('ru-RU')})`,
        )
      } else if (role === 'мать' && n.birth - parent.birth < MIN_DAM_AGE_MS) {
        const months = Math.round((n.birth - parent.birth) / (30.4 * 24 * 3600 * 1000))
        youngDam.push(`${n.ident}: матери ${parent.ident} на момент отёла ${months} мес.`)
      }
    }
  }

  problems += report('Отцом записано животное женского пола', wrongFather)
  problems += report('Матерью записано животное мужского пола', wrongMother)
  problems += report('Потомок родился раньше родителя', bornBeforeParent)
  problems += report('Мать моложе 18 месяцев на момент отёла', youngDam)

  /* ------------------------------- Глубина -------------------------------- */

  /*
   * Не проблема, а мера: сколько колен реально прослеживается. Число говорит,
   * можно ли выпускать документы с родословной в два ряда и имеет ли смысл
   * считать инбридинг — на глубине в одно колено он всегда нулевой.
   */
  const depthOf = (id: number, seen = new Set<number>()): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    const n = nodes.get(id)
    if (!n) return 0
    const f = n.father !== null ? depthOf(n.father, new Set(seen)) : 0
    const m = n.mother !== null ? depthOf(n.mother, new Set(seen)) : 0
    return 1 + Math.max(f, m)
  }

  if (cycles.length === 0) {
    const depths: number[] = []
    const sample = [...nodes.keys()].slice(0, 2000)
    for (const id of sample) depths.push(depthOf(id) - 1)
    const avg = depths.reduce((a, b) => a + b, 0) / (depths.length || 1)
    console.log(
      `\nГлубина родословной по ${ru(sample.length)} записям: ` +
        `в среднем ${avg.toFixed(1)} колена, максимум ${Math.max(0, ...depths)}`,
    )
  } else {
    console.log('\nГлубина не измерялась: при циклах обход предков не завершается.')
  }

  /* -------------------------------- Итог ---------------------------------- */

  console.log('')
  if (problems === 0) {
    console.log('Противоречий в родословной не найдено.\n')
    return
  }

  console.log(
    `Всего находок: ${ru(problems)}.\n\n` +
      'Скрипт ничего не исправил — и не должен. У каждой находки два\n' +
      'объяснения: неверна запись или неверна связь, и выбор смысловой.\n' +
      (cycles.length
        ? '\nЦиклы разрывайте в первую очередь: пока они есть, обход предков\n' +
          'на этих животных не завершается, и карточка не открывается.\n'
        : ''),
  )
  process.exitCode = 1
}

main()
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
