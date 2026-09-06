import 'dotenv/config'
import { Pool } from 'pg'
import { maskUri, resolveDatabase } from '../lib/db-url'
import { applyThresholdRows, defaultThresholds, type Thresholds } from '../lib/check-thresholds'
import { monthsBetween } from '../lib/afc'

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
 *  - **возраст родителя**: слишком мало или слишком много лет на момент
 *    рождения потомка.
 *
 * ## Пороги и арифметика — общие с разбором
 *
 * Возраст родителя ревизия считала по-своему: восемнадцать месяцев,
 * зашитые числом, только для матери, и делением миллисекунд на 30,4 дня.
 * Разбор заявки в это время брал порог из настроек Ассоциации, смотрел
 * обоих родителей, знал ещё и верхнюю границу и считал месяцы
 * по календарю. Два ответа на один вопрос об одном животном — и оба
 * с нашей стороны.
 *
 * Теперь пороги читаются из той же таблицы, что видит эксперт
 * (`applyThresholdRows`), а месяцы считает тот же `monthsBetween`.
 * Обход остаётся своим: разбор поднимает родословную заявки уровнями
 * через Payload, а здесь нужен один проход по всей книге, и грузить
 * триста тысяч записей документами ради этого незачем.
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
  /** Время рождения — для сравнения «кто раньше». */
  birth: number | null
  /** Она же датой — `monthsBetween` считает по календарю, а не по миллисекундам. */
  birthDate: string | null
}

const ru = (n: number) => n.toLocaleString('ru-RU')

/**
 * Приставка контрольного стада (`seed:checks`).
 *
 * В нём противоречия посажены нарочно — по записи на каждое правило,
 * чтобы `audit:checks` было что находить. Ревизия родословной их видит
 * и обязана видеть: она смотрит на данные, а не на замысел.
 *
 * Но считать их находками нельзя. Проверка, красная всегда, перестаёт
 * быть проверкой: к семи знакомым крестикам привыкают за неделю, и восьмой,
 * настоящий, теряется среди них. Поэтому контрольное стадо считается
 * отдельно и на исход прогона не влияет.
 *
 * Отбор по приставке номера, а не по хозяйству: хозяйство можно
 * переименовать и переназначить, номер живёт с записью. Приставка
 * зарезервирована сидом и в настоящих данных не встречается —
 * национальный номер состоит из цифр.
 */
const FIXTURE = 'CHK-'
const isFixture = (line: string) => line.trimStart().startsWith(FIXTURE)

/**
 * Печать находок: заголовок, счётчик, несколько примеров.
 *
 * Возвращает только настоящие находки. Контрольные названы отдельной
 * строкой — прятать их нельзя: молчание о том, что часть противоречий
 * отброшена, превращает честный счёт в подогнанный.
 */
const report = (title: string, lines: string[]) => {
  const real = lines.filter((l) => !isFixture(l))
  const fixture = lines.length - real.length

  if (!real.length) {
    console.log(
      `  ✓  ${title} — нет` + (fixture ? ` (в контрольном стаде: ${ru(fixture)})` : ''),
    )
    return 0
  }

  console.log(`\n  ✗  ${title}: ${ru(real.length)}`)
  for (const line of showAll ? real : real.slice(0, SAMPLE)) console.log(`     ${line}`)
  if (!showAll && real.length > SAMPLE) {
    console.log(`     … и ещё ${ru(real.length - SAMPLE)} (запустите с --all)`)
  }
  if (fixture) console.log(`     плюс ${ru(fixture)} в контрольном стаде — это фикстура`)
  console.log('')
  return real.length
}

/**
 * Пороги — из базы, а не из умолчаний.
 *
 * Ассоциация двигает их на странице настроек, и ревизия обязана мерить
 * тем же. Таблицы может не быть на свежей базе — тогда умолчания
 * и строка об этом: молча смерить другим значит объяснять потом,
 * почему прогон и разбор не сошлись.
 */
/*
 * Дата печатается по UTC. Даты рождения лежат полуночью UTC, и без
 * оговорки на сервере западнее Гринвича каждая из них печаталась бы
 * предыдущим числом — в отчёте, по которому потом ищут запись руками.
 */
const day = (ms: number): string =>
  new Date(ms).toLocaleDateString('ru-RU', { timeZone: 'UTC' })

async function loadThresholds(): Promise<{ t: Thresholds; source: string }> {
  try {
    const { rows } = await pool.query<{ key: string; value: string }>(
      'select key, value from check_thresholds',
    )
    if (!rows.length) return { t: defaultThresholds(), source: 'умолчания: настроек в базе нет' }
    return { t: applyThresholdRows(rows), source: `настройки Ассоциации, строк: ${rows.length}` }
  } catch (e) {
    /*
     * Отличается «таблицы ещё нет» от «спросить не удалось». Первое —
     * свежая база, и умолчания там верны. Второе — обрыв, отказ по правам,
     * переименование: тогда ревизия молча меряет не тем, чем мерит эксперт,
     * и объяснять расхождение приходится потом. Строка об этом должна
     * называть причину, а не одно слово «недоступна».
     */
    const text = e instanceof Error ? e.message : String(e)
    const absent = /relation .* does not exist|42P01/i.test(text)
    if (absent) return { t: defaultThresholds(), source: 'умолчания: таблицы порогов нет' }
    return {
      t: defaultThresholds(),
      source: `умолчания: пороги прочитать не удалось — ${text}`,
    }
  }
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)
  console.log(`Источник строки подключения: ${source}\n`)

  const { t, source: thresholdSource } = await loadThresholds()
  console.log(
    `Пороги возраста родителя: от ${t.parentAgeMinMonths} мес. до ${t.parentAgeMaxYears} лет ` +
      `(${thresholdSource})\n`,
  )

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
      birthDate: r.birth_date ? new Date(r.birth_date).toISOString() : null,
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

  const realCycles = report('Циклы в родословной', cycles)
  problems += realCycles

  /* ---------------------------- Пол родителей ----------------------------- */

  const wrongFather: string[] = []
  const wrongMother: string[] = []
  const bornBeforeParent: string[] = []
  const tooYoung: string[] = []
  const tooOld: string[] = []

  for (const n of nodes.values()) {
    const father = n.father !== null ? nodes.get(n.father) : undefined
    const mother = n.mother !== null ? nodes.get(n.mother) : undefined

    if (father && father.sex !== null && father.sex !== 'male') {
      wrongFather.push(`${n.ident}: отцом записана ${father.ident} — это самка`)
    }
    if (mother && mother.sex !== null && mother.sex !== 'female') {
      wrongMother.push(`${n.ident}: матерью записан ${mother.ident} — это самец`)
    }

    for (const [parent, role] of [
      [father, 'отец'],
      [mother, 'мать'],
    ] as const) {
      if (!parent || n.birth === null || parent.birth === null) continue

      if (parent.birth >= n.birth) {
        bornBeforeParent.push(
          `${n.ident} (${day(n.birth)}) — ${role} ${parent.ident} (${day(parent.birth)})`,
        )
        continue
      }

      /*
       * Возраст родителя проверяется у обоих, а не только у матери.
       * Бык-производитель годовалым отцом быть не может ровно так же,
       * как корова не телится в год, и прежняя ревизия молчала об этом
       * просто потому, что правило писали от материнской стороны.
       */
      const months = monthsBetween(parent.birthDate, n.birthDate)
      /*
       * Ноль месяцев не пропускается. Прежде условие было `months <= 0`,
       * и самый невозможный случай — родитель на две недели старше
       * потомка — не попадал никуда: «родился раньше родителя» его
       * не ловит (родитель вправду старше), а проверка «моложе N мес.»
       * до него не доходила. Проверка, которая по устройству не может
       * назвать нулевой возраст, наведена мимо худшего из своих случаев.
       */
      if (months === null) continue

      if (months < t.parentAgeMinMonths) {
        tooYoung.push(
          `${n.ident}: ${role} ${parent.ident} — ${months} мес. на момент рождения потомка`,
        )
      } else if (months > t.parentAgeMaxYears * 12) {
        tooOld.push(
          `${n.ident}: ${role} ${parent.ident} — ${Math.round(months / 12)} лет ` +
            'на момент рождения потомка',
        )
      }
    }
  }

  problems += report('Отцом записана самка', wrongFather)
  problems += report('Матерью записан самец', wrongMother)
  problems += report('Потомок родился раньше родителя', bornBeforeParent)
  problems += report(`Родитель моложе ${t.parentAgeMinMonths} мес. на момент рождения потомка`, tooYoung)
  problems += report(`Родитель старше ${t.parentAgeMaxYears} лет на момент рождения потомка`, tooOld)

  /* ------------------------------- Глубина -------------------------------- */

  /*
   * Не проблема, а мера: сколько колен реально прослеживается. Число говорит,
   * можно ли выпускать документы с родословной в два ряда и имеет ли смысл
   * считать инбридинг — на глубине в одно колено он всегда нулевой.
   *
   * ## Почему мера считалась неверно
   *
   * Выборка бралась как «первые две тысячи ключей», то есть первые
   * две тысячи записей по порядку появления в базе. А первыми в книгу
   * попали записи предков и наполнение пачкой — у них родителей нет
   * вовсе. Отчёт честно печатал «в среднем 1,0 колена» для книги,
   * где у эталонной карточки девять, и число это означало не глубину
   * родословной, а порядок вставки.
   *
   * Теперь считается два числа вместо одного. Первое — доля записей
   * без единого родителя: это не глубина, а её отсутствие, и мешать
   * их в среднее нельзя. Второе — глубина среди тех, у кого родословная
   * есть, и по всей книге целиком, без выборки.
   *
   * ## Почему без выборки
   *
   * Выборка шагом честнее среза, но максимум по ней остаётся максимумом
   * по выборке. Глубокие родословные редки — их достраивают поштучно, —
   * и в две тысячи записей из полумиллиона девятиколенная не попадает.
   * Отчёт печатал «максимум 2», когда в книге есть 9: та же ложь, только
   * аккуратнее посчитанная.
   *
   * Считать всё стало можно потому, что обход запоминает пройденное.
   * Родословные пересекаются: у полумиллиона записей общих предков
   * несколько тысяч, и без памяти каждый из них обходился бы заново
   * по разу на потомка.
   */

  /*
   * Глубина с памятью. Циклов здесь уже нет — проверка выше отработала
   * и при находке до этого места не доходит, — поэтому рекурсия конечна,
   * а её глубина равна глубине родословной, то есть единицам колен.
   */
  const depthCache = new Map<number, number>()
  const depthOf = (id: number): number => {
    const known = depthCache.get(id)
    if (known !== undefined) return known
    const n = nodes.get(id)
    if (!n) return 0
    // Предварительная отметка: страхует от цикла, если он всё-таки просочился
    depthCache.set(id, 1)
    const f = n.father !== null ? depthOf(n.father) : 0
    const m = n.mother !== null ? depthOf(n.mother) : 0
    const d = 1 + Math.max(f, m)
    depthCache.set(id, d)
    return d
  }

  /*
   * Глубина не считается только при настоящих циклах. Цикл контрольного
   * стада стоит там всегда, и прежнее условие означало бы «глубина
   * не измеряется никогда» — то есть отчёт молча лишался бы половины
   * содержания из-за фикстуры, заведённой ради другого.
   *
   * Сам обход цикла не боится: `depthOf` помнит пройденное и на возврате
   * отвечает нулём. Осторожность в условии была лишней.
   */
  if (realCycles === 0) {
    const all = [...nodes.keys()]
    const withParents = all.filter((id) => {
      const n = nodes.get(id)!
      return n.father !== null || n.mother !== null
    })

    /*
     * Доля с десятыми, а не целым числом процентов.
     *
     * Тысяча двести записей из полумиллиона округляются до «0 %»,
     * и строка читается как «таких нет» — при том что они есть.
     * Ноль и «меньше половины процента» это разные ответы,
     * и мера, стирающая разницу, врёт ровно там, где её и читают.
     */
    const orphans = all.length - withParents.length
    const orphanShare = all.length ? (orphans / all.length) * 100 : 0
    console.log(
      `\nБез единого родителя: ${ru(orphans)} записей ` +
        `(${orphanShare < 0.05 && orphans > 0 ? 'менее 0,1' : orphanShare.toFixed(1).replace('.', ',')} % книги) — ` +
        'родословной у них нет, и в среднюю глубину они не идут',
    )

    if (!withParents.length) {
      console.log('Глубину считать не по чему: родители не проставлены ни у одной записи.')
    } else {
      const byDepth = new Map<number, number>()
      let sum = 0
      let deepest = 0
      let deepestIdent = ''

      for (const id of withParents) {
        const d = depthOf(id) - 1
        byDepth.set(d, (byDepth.get(d) ?? 0) + 1)
        sum += d
        if (d > deepest) {
          deepest = d
          deepestIdent = nodes.get(id)?.ident ?? ''
        }
      }

      const avg = sum / withParents.length
      const sorted = [...byDepth.entries()].sort((a, b) => a[0] - b[0])
      let seen = 0
      let median = 0
      for (const [d, c] of sorted) {
        seen += c
        if (seen >= withParents.length / 2) {
          median = d
          break
        }
      }

      console.log(
        `Глубина родословной у тех, у кого она есть (${ru(withParents.length)} записей): ` +
          `в среднем ${avg.toFixed(1).replace('.', ',')}, медиана ${median}, ` +
          `максимум ${deepest} ${deepest === 1 ? 'колено' : deepest < 5 ? 'колена' : 'колен'}` +
          (deepestIdent ? ` — № ${deepestIdent}` : ''),
      )

      /*
       * Распределение, а не только среднее. Среднее в 1,7 колена
       * одинаково выходит и у книги, где половина записей на одно колено,
       * а половина на девять, и у книги, где все на два. Это разные книги,
       * и для инбридинга разница решающая.
       *
       * Редкие колена не прячутся за округлением: доля меньше десятой
       * процента печатается числом записей. Одна девятиколенная
       * родословная на полмиллиона — это «0 %», и именно она интересна.
       */
      const spread = sorted
        .map(([d, c]) => {
          const share = (c / withParents.length) * 100
          return share < 0.1 ? `${d}: ${ru(c)} зап.` : `${d}: ${share.toFixed(share < 10 ? 1 : 0).replace('.', ',')} %`
        })
        .join(', ')
      console.log(`Распределение по коленам — ${spread}`)

      /*
       * Мелкая родословная — не мелочь отчёта, а приговор половине
       * расчётов. Инбридинг считается по общим предкам, а общий предок
       * появляется с третьего колена: до него у любой пары предки разные
       * по определению. Молчать об этом нельзя — иначе нулевой инбридинг
       * по всей книге читается как хорошая новость.
       *
       * Условие смотрит на долю, а не на максимум, и это не придирка:
       * сперва здесь стояло `deepest <= 2`, и первая же достроенная
       * вручную родословная в девять колен выключила предупреждение —
       * при том что для остальных пятисот сорока девяти тысяч записей
       * оно оставалось верным. Мера состояния книги не может отменяться
       * одной записью.
       */
      const deepEnough = [...byDepth.entries()]
        .filter(([d]) => d >= 3)
        .reduce((sum, [, c]) => sum + c, 0)
      const deepShare = (deepEnough / withParents.length) * 100

      if (deepShare < 1) {
        console.log(
          `\nГлубже двух колен — ${ru(deepEnough)} ${deepEnough === 1 ? 'запись' : 'записей'} ` +
            `из ${ru(withParents.length)} (${deepShare < 0.1 ? 'менее 0,1' : deepShare.toFixed(1).replace('.', ',')} %).\n` +
            'У остальных родители есть, а у родителей своих родителей нет.\n' +
            'Инбридинг при такой родословной нулевой не потому, что стадо\n' +
            'чистое, а потому, что общих предков искать негде: они\n' +
            'появляются с третьего колена. Подбор пар считать тоже не на чем.',
        )
      }
    }
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
      (realCycles
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
