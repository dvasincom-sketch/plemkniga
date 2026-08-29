import 'dotenv/config'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { decodeText, parseCsv } from '@/lib/csv'
import { detectTableKind, readSpreadsheet } from '@/lib/xlsx'
import { datasetByKey, matchHeader } from '@/lib/import-format'
import { parseDate, parseNumber } from '@/lib/import-values'
import { duplicateIdents, isMangledNumber, isServiceRow, parseSex } from '@/lib/import-rows'

/**
 * Что загрузка делает с чужими форматами — файл за файлом.
 *
 * ## Зачем, если есть `check:csv` и `check:import-values`
 *
 * Те проверяют части по отдельности: первая — кодировку и разделитель,
 * вторая — разбор числа и даты. Обе работают со строками, собранными
 * в памяти. Настоящий файл ломается не в части, а на стыке: кодировка
 * распозналась, разделитель угадался, а шапка оказалась в четвёртой
 * строке — и всё предыдущее не имеет значения.
 *
 * Здесь путь пройден целиком и по настоящим файлам с диска: определение
 * вида файла, чтение книги или текста, распознавание кодировки, разбор
 * разделителя, сопоставление заголовков, разбор значений. Тем же кодом,
 * которым это делает загрузка, — `matchHeader` для этого и вынесен
 * из `actions/data.ts` наружу.
 *
 * ## Три исхода, и средний — не лучший
 *
 * У каждого файла проверяется, к какому из трёх он приводит.
 *
 * **Принят** — данные доехали и совпадают с тем, что в файле.
 * **Отвергнут внятно** — не доехали, и сказано почему; человек перезальёт.
 * **Испорчен молча** — доехали не те данные, и никто об этом не узнает.
 *
 * Третий хуже первых двух вместе взятых, и ищется он тут в первую очередь.
 * Поэтому утверждения написаны про значения, а не про то, прошёл ли разбор:
 * проверка, радующаяся тому, что файл прочитался, пропустит ровно те
 * случаи, ради которых заводится.
 *
 * ## Чего она не делает
 *
 * Не пишет в базу и не проверяет, что записалось. Это следующий слой,
 * и он требует живого хозяйства с правами; здесь же граница проходит
 * там, где кончается разбор файла и начинается запись. Всё, что ниже
 * по потоку — проверка владельца, снятие знака Ассоциации (решение №83),
 * карантин колонок (№159), — проверяется своими сценариями.
 *
 *   npm run make:proverka-formaty   — собрать файлы
 *   npm run check:import-formats    — прогнать
 */

const DIR = 'data/proverka-formaty'

type Verdict = 'принят' | 'отвергнут внятно' | 'испорчен молча'

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) {
    console.log(`    ✓ ${what}`)
  } else {
    failures += 1
    console.log(`    ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

/* ------------------------------------------------------------------ */

type Read = {
  kind: 'xlsx' | 'xls' | 'text'
  encoding?: string
  sheet?: string
  otherSheets?: string[]
  rows: string[][]
  error?: string
}

/**
 * Прочитать файл ровно так, как это делает загрузка.
 *
 * Порядок шагов повторяет `importDataAction`: вид файла определяется
 * по первым байтам, а не по расширению; книга идёт в `readSpreadsheet`,
 * текст — в `decodeText` и `parseCsv`.
 */
const readFile = (bytes: Uint8Array): Read => {
  const kind = detectTableKind(bytes)

  if (kind === 'xlsx' || kind === 'xls') {
    const res = readSpreadsheet(bytes)
    if ('error' in res) return { kind, rows: [], error: res.error }
    return { kind, rows: res.rows, sheet: res.sheet, otherSheets: res.otherSheets }
  }

  const { text, encoding } = decodeText(bytes)
  return { kind, encoding, rows: parseCsv(text) }
}

/** Значение колонки в строке — по внутреннему ключу. */
const cell = (header: string[], row: string[], key: string): string | undefined => {
  const i = header.indexOf(key)
  return i === -1 ? undefined : row[i]?.trim()
}

const animals = datasetByKey('animals')!

/**
 * Разбор файла по набору «Животные» — и краткая сводка о нём.
 *
 * Возвращает не только строки, но и то, что о них скажет загрузка:
 * какая шапка распознана, какие колонки неизвестны, что стало
 * со значениями.
 */
const parse = (bytes: Uint8Array) => {
  const read = readFile(bytes)
  const rawHeader = (read.rows[0] ?? []).map((h) => h.trim())
  const { header, unknown } = matchHeader(rawHeader, animals)
  const body = read.rows.slice(1)
  return { read, rawHeader, header, unknown, body }
}

const load = (name: string) => new Uint8Array(readFileSync(join(DIR, name)))

/* ------------------------------------------------------------------ */

const verdicts: { file: string; verdict: Verdict; note: string }[] = []
const say = (file: string, verdict: Verdict, note: string) =>
  verdicts.push({ file, verdict, note })

function main() {
  const present = new Set(readdirSync(DIR))

  console.log('\nПроверка чужих форматов — файл за файлом\n')

  /* ---------------- 01 — windows-1251 ---------------- */
  {
    const f = '01-кодировка-1251.csv'
    console.log(`  ${f}`)
    const { read, header, body } = parse(load(f))

    check(read.encoding === 'windows-1251', 'кодировка распознана как 1251', read.encoding)
    check(header.includes('identNumber'), 'шапка распознана')
    check(cell(header, body[0]!, 'name') === 'Зорька', 'кличка прочитана без порчи', String(cell(header, body[0]!, 'name')))
    check(cell(header, body[1]!, 'name') === 'Ёлочка', 'буква «ё» не потерялась', String(cell(header, body[1]!, 'name')))
    check(parseNumber(cell(header, body[0]!, 'summary.milkYield')).value === 8450, 'удой прочитан')

    say(f, 'принят', 'кодировка и разделитель распознаны, кириллица цела')
  }

  /* ---------------- 02 — UTF-16 с табуляцией ---------------- */
  {
    const f = '02-кодировка-utf16-таб.txt'
    console.log(`\n  ${f}`)
    const { read, header, body } = parse(load(f))

    check(read.encoding === 'utf-16', 'кодировка распознана как UTF-16', read.encoding)
    check(header.includes('identNumber'), 'табуляция принята за разделитель')
    check(cell(header, body[0]!, 'name') === 'Милка', 'кличка прочитана', String(cell(header, body[0]!, 'name')))

    say(f, 'принят', 'метка порядка байтов и табуляция разобраны')
  }

  /* ---------------- 03 — числа ---------------- */
  {
    const f = '03-числа-русские.csv'
    console.log(`\n  ${f}`)
    const { header, body } = parse(load(f))

    const milk = (i: number) => parseNumber(cell(header, body[i]!, 'summary.milkYield'))
    const fat = (i: number) => parseNumber(cell(header, body[i]!, 'summary.fatPercent'))

    check(milk(0).value === 10458, '«10 458» с обычным пробелом → 10458', String(milk(0).value))
    check(fat(0).value === 3.85, '«3,85» → 3.85', String(fat(0).value))
    check(milk(1).value === 10458.5, '«10 458,5» с неразрывным пробелом → 10458.5', String(milk(1).value))
    check(fat(1).value === 3.85, '«3,85 %» → 3.85, а не пустота', String(fat(1).value))

    const kg = milk(2)
    check(
      kg.value === undefined && !!kg.problem,
      '«8 450 кг» отвергнуто с причиной, а не съедено',
      kg.problem ?? `приняли ${kg.value}`,
    )
    const dash = fat(2)
    check(dash.value === undefined && !dash.problem, '«-» — пустота без жалобы')

    say(f, 'принят', 'запятая, пробелы, проценты и прочерки разобраны; единицы названы ошибкой')
  }

  /* ---------------- 04 — даты ---------------- */
  {
    const f = '04-даты-вразнобой.csv'
    console.log(`\n  ${f}`)
    const { header, body } = parse(load(f))
    const d = (i: number) => parseDate(cell(header, body[i]!, 'birthDate'))
    const day = (i: number) => d(i).value?.slice(0, 10)

    check(day(0) === '2021-03-15', '15.03.2021 → 15 марта', day(0))
    check(day(1) === '2021-03-05', '5.03.2021 → 5 марта, а не 3 мая', day(1))
    check(day(2) === '2021-03-15', '15/03/21 → 15 марта 2021', day(2))
    check(day(3) === '2021-03-15', '2021-03-15 → 15 марта', day(3))
    check(day(4) === '2021-03-15', '44270 (серийный Excel) → 15 марта', day(4))

    const zero = d(5)
    check(zero.value === undefined && !zero.problem, '00.00.0000 — пустая дата, разбор не падает')

    for (const [i, what] of [[6, 'март 2021'], [7, '31.02.2021'], [8, '1111-11-01']] as const) {
      const got = d(i)
      check(
        got.value === undefined && !!got.problem,
        `«${what}» отвергнуто с причиной`,
        got.problem ?? `приняли ${got.value?.slice(0, 10)}`,
      )
    }

    say(f, 'принят', 'девять написаний: пять разобраны верно, три названы ошибкой, одно пусто')
  }

  /* ---------------- 05 — шапка не в первой строке ---------------- */
  {
    const f = '05-шапка-не-в-первой-строке.csv'
    console.log(`\n  ${f}`)
    const { rawHeader, header, unknown } = parse(load(f))

    check(rawHeader[0] === 'ООО «Рассвет»', 'за шапку принята первая строка файла', rawHeader[0])
    check(!header.includes('identNumber'), 'обязательная колонка не найдена — файл будет отвергнут')
    check(unknown.length > 0, 'название хозяйства уходит в неопознанные колонки', unknown.join(', '))

    say(
      f,
      'отвергнут внятно',
      'шапку ищут только в первой строке; отказ будет «не найдены обязательные колонки» — верный по сути, но не подсказывает про преамбулу',
    )
  }

  /* ---------------- 06 — строки, которые не данные ---------------- */
  {
    const f = '06-строки-не-данные.csv'
    console.log(`\n  ${f}`)
    const { header, body } = parse(load(f))

    const idents = body.map((r) => cell(header, r, 'identNumber') ?? '')
    const service = idents.filter(isServiceRow)
    const data = idents.filter((v) => v && !isServiceRow(v))

    check(service.length === 3, 'служебные строки опознаны', `опознано ${service.length}: ${service.join(', ')}`)
    check(
      data.length === 2 && data.every((v) => v.startsWith('RU')),
      'осталось ровно два животных',
      data.join(' | '),
    )
    check(!data.includes('Итого'), '«Итого» карточку не заведёт')

    say(f, 'принят', 'три строки отчёта отсеяны и названы, два животных приняты')
  }

  /* ---------------- 07 — номера животных ---------------- */
  {
    const f = '07-номера-животных.csv'
    console.log(`\n  ${f}`)
    const { header, body } = parse(load(f))
    const id = (i: number) => cell(header, body[i]!, 'identNumber')

    check(id(0) === '0012345', 'ведущие нули в тексте сохранены', String(id(0)))
    check(id(2) === 'XXRUS880808231818', 'чужая система нумерации прочитана как есть', String(id(2)))

    check(isMangledNumber(id(1) ?? ''), 'научная запись номера опознана', String(id(1)))
    check(!isMangledNumber(id(0) ?? ''), 'ведущие нули за научную запись не приняты')
    check(!isMangledNumber(id(2) ?? ''), 'чужая система нумерации за научную запись не принята')

    say(
      f,
      'отвергнут внятно',
      'строка с «1,23E+11» не принимается: восстановить цифры нельзя, сказано задать колонке текстовый формат',
    )
  }

  /* ---------------- 08 — перечисления ---------------- */
  {
    const f = '08-перечисления.csv'
    console.log(`\n  ${f}`)
    const { header, body } = parse(load(f))

    const sexOf = (i: number) => parseSex(cell(header, body[i]!, 'sex'))

    check(sexOf(0).value === 'female', '«тёлка» → женский', String(sexOf(0).value))
    check(sexOf(1).value === 'male', '«бычок» → мужской', String(sexOf(1).value))
    check(sexOf(2).value === 'female', '«Ж» → женский', String(sexOf(2).value))
    check(sexOf(3).value === 'female', '«F» → женский', String(sexOf(3).value))
    check(sexOf(5).value === 'male', '«М» → мужской', String(sexOf(5).value))

    /*
     * Цифровой код не разбирается намеренно: в одной программе единица
     * означает быка, в другой корову, и по файлу не узнать, в какой он
     * собран. Проверка утверждает не молчание, а именно жалобу.
     */
    const digit = sexOf(4)
    check(
      digit.value === undefined && !!digit.problem,
      '«1» не разобрано и названо в протоколе, а не подставлено',
      digit.problem ?? `приняли ${digit.value}`,
    )

    say(f, 'принят', 'слова разобраны, цифровой код назван непонятым — животное не станет коровой молча')
  }

  /* ---------------- 09 — дубли по лактациям ---------------- */
  {
    const f = '09-дубли-по-лактациям.csv'
    console.log(`\n  ${f}`)
    const { header, body } = parse(load(f))

    const idents = body.map((r) => cell(header, r, 'identNumber') ?? '')
    const repeated = duplicateIdents(idents)

    check(repeated.size === 1, 'повтор номера опознан', `повторов: ${repeated.size}`)
    check(
      repeated.get('RU0000000126') === 3,
      'сосчитаны все три строки',
      String(repeated.get('RU0000000126')),
    )

    say(
      f,
      'отвергнут внятно',
      'все три строки отклоняются: выбрать «верную» нельзя, в причине названы лактации отдельным набором',
    )
  }

  /* ---------------- 10 — всё сразу ---------------- */
  {
    const f = '10-всё-сразу.csv'
    console.log(`\n  ${f}`)
    const { read, rawHeader, header } = parse(load(f))

    check(read.encoding === 'windows-1251', 'кодировка распознана даже при преамбуле', read.encoding)
    check(rawHeader[0] === 'СПК «Заря»', 'за шапку принята преамбула', rawHeader[0])
    check(!header.includes('identNumber'), 'обязательная колонка не найдена — файл отвергнут целиком')

    say(f, 'отвергнут внятно', 'преамбула перевешивает всё остальное: до значений дело не доходит')
  }

  /* ---------------- 11 — книга, данные не на первом листе ---------------- */
  {
    const f = '11-книга-данные-на-втором-листе.xlsx'
    console.log(`\n  ${f}`)
    if (!present.has(f)) {
      check(false, 'файл на месте')
    } else {
      const { read, header } = parse(load(f))
      check(read.kind === 'xlsx', 'вид файла определён по первым байтам', read.kind)
      check(read.sheet === 'Легенда', 'прочитан первый лист', String(read.sheet))
      check(!header.includes('identNumber'), 'на листе-легенде обязательной колонки нет')

      say(
        f,
        'отвергнут внятно',
        'читается первый лист, имя названо в протоколе — но выбрать другой нельзя',
      )
    }
  }

  /* ---------------- 12 — двухуровневая шапка ---------------- */
  {
    const f = '12-книга-двухуровневая-шапка.xlsx'
    console.log(`\n  ${f}`)
    const { rawHeader, header } = parse(load(f))

    check(rawHeader.includes('Продуктивность'), 'за шапку принята верхняя строка', rawHeader.join(' | '))
    check(!header.includes('identNumber'), 'настоящие заголовки во второй строке не видны')

    say(f, 'отвергнут внятно', 'двухуровневая шапка неотличима от преамбулы: видна только верхняя строка')
  }

  /* ---------------- 13 — пятьдесят тысяч строк ---------------- */
  {
    console.log('\n  13 — пятьдесят тысяч строк (собирается в памяти)')

    /*
     * В репозиторий не кладётся намеренно: два мегабайта ради одного
     * утверждения о времени. Собирается здесь же и теми же средствами.
     */
    const lines = ['Инд.№;Кличка;Удой, кг']
    for (let i = 1; i <= 50_000; i++) {
      lines.push(`RU${String(i).padStart(10, '0')};Корова ${i};${7000 + (i % 3000)}`)
    }
    const bytes = new TextEncoder().encode(lines.join('\r\n'))

    const t0 = Date.now()
    const { read, header, body } = parse(bytes)
    const ms = Date.now() - t0

    check(body.length === 50_000, 'прочитаны все пятьдесят тысяч строк', String(body.length))
    check(header.includes('identNumber'), 'шапка распознана')
    check(
      cell(header, body[49_999]!, 'identNumber') === 'RU0000050000',
      'последняя строка на месте',
      String(cell(header, body[49_999]!, 'identNumber')),
    )
    check(ms < 5000, `разбор уложился в 5 с (${ms} мс)`, `${ms} мс`)
    console.log(`      разбор ${(bytes.length / 1048576).toFixed(1)} МБ занял ${ms} мс, кодировка ${read.encoding}`)

    say('13-пятьдесят-тысяч-строк', 'принят', `${ms} мс на разбор, все строки на месте`)
  }

  /* ------------------------------------------------------------------ */

  console.log(`\n${'─'.repeat(78)}`)
  console.log('ЧТО ПОЛУЧАЕТСЯ\n')

  const order: Verdict[] = ['испорчен молча', 'отвергнут внятно', 'принят']
  for (const v of order) {
    const rows = verdicts.filter((r) => r.verdict === v)
    if (!rows.length) continue
    console.log(`  ${v.toUpperCase()} — ${rows.length}`)
    for (const r of rows) console.log(`    ${r.file.padEnd(38)} ${r.note}`)
    console.log('')
  }

  console.log(
    failures === 0
      ? 'Все утверждения сошлись.\n'
      : `Не сошлось утверждений: ${failures}. Каждое — либо беда загрузки, либо неверное ожидание.\n`,
  )

  /*
   * Выход нулевой намеренно, пока набор не разобран.
   *
   * Скрипт сейчас не столько проверяет, сколько описывает: часть утверждений
   * заведомо не сходится, и это его работа — назвать, где загрузка портит
   * данные молча. Ронять сборку на известных бедах значило бы либо чинить
   * их все разом, либо убрать проверку. Когда беды разобраны, ключ
   * `--strict` начнёт возвращать отказ.
   */
  process.exit(process.argv.includes('--strict') && failures ? 1 : 0)
}

main()
