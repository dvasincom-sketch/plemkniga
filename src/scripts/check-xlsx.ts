import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getPayload } from 'payload'
import config from '@payload-config'
import * as XLSX from '@e965/xlsx'
import { detectTableKind, readSpreadsheet, toXlsx, xlsxVersion } from '@/lib/xlsx'
import { XLSX_MAX_ROWS } from '@/lib/table-limits'
import { DATASETS, columnsOf, headerMapOf, templateRowsOf } from '@/lib/import-format'
import { EXPORT_FORMATS, exportFormat } from '@/lib/export-formats'

/**
 * Проверка обмена книгами Excel — на живой базе и круговым прогоном.
 *
 * ## Почему кругом, а не по отдельности
 *
 * Выгрузку глазами проверяют так: скачали, открыли, посмотрели — красиво.
 * Этот способ пропускает ровно то, ради чего выгрузку и делают: файл
 * должен вернуться. Индивидуальный номер, потерявший ведущий ноль,
 * выглядит в Excel безупречно и загружается обратно другим животным.
 * Поэтому проверка выгружает настоящее стадо из базы, читает файл своим
 * же разбором и сверяет каждое значение с тем, что взяли из базы.
 *
 * ## Почему скрипт обращается к библиотеке напрямую
 *
 * Во всём остальном коде вызов заперт в `src/lib/xlsx.ts`, и это правило.
 * Здесь оно нарушено сознательно: писать книгу формата 97–2003 наш код
 * не умеет и уметь не должен — мы такие только читаем, — а проверить
 * чтение без такого файла нечем. Держать образец двоичным файлом
 * в репозитории хуже: он молча устареет, и никто не заметит.
 *
 *   npm run check:xlsx
 *
 * Скрипт ничего не создаёт и не меняет: он только читает животных
 * и собирает файлы в памяти. Запускать безопасно в любой момент,
 * в том числе против прода.
 */

/**
 * Версия, которую мы проверяли и на которой стоят решения этого модуля.
 *
 * Проверяется потому, что библиотека приходит зеркалом: `@e965/xlsx`
 * перепубликует SheetJS, официально раздаваемый мимо npm. Хеш в lock-файле
 * защищает от подмены уже установленной версии, а от того, что следующая
 * окажется не тем, чем назвалась, защищает только этот вопрос.
 */
const EXPECTED_VERSION = '0.20.3'

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${what}`)
  } else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Матрица из книги, собранной в памяти. Ошибку разбора превращает в отказ. */
const rowsOf = (bytes: Uint8Array, maxRows?: number): string[][] => {
  const read = readSpreadsheet(bytes, maxRows)
  if ('error' in read) {
    failures += 1
    console.log(`  ✗ книга не прочиталась — ${read.error}`)
    return []
  }
  return read.rows
}

async function main() {
  console.log(`\nБиблиотека: ${xlsxVersion()}\n`)
  check(xlsxVersion() === EXPECTED_VERSION, `версия ${EXPECTED_VERSION}`, xlsxVersion())

  /* ---------------------------------------------------------------- */
  console.log('\nРеестр форматов выгрузки\n')

  const xlsxFormat = EXPORT_FORMATS.find((f) => f.value === 'xlsx')
  check(!!xlsxFormat, 'XLSX объявлен в реестре')
  check(
    xlsxFormat?.mime ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'тип содержимого — тот, по которому Excel узнаёт книгу',
    xlsxFormat?.mime,
  )
  /*
   * Разбор параметра обязан узнавать формат по его же имени из реестра.
   * Разойтись им негде, пока обработчик спрашивает `exportFormat`, —
   * но именно это и проверяется: `exportFormat` при непонятном значении
   * молча отдаёт первый формат, и опечатка в имени выглядела бы
   * работающей выгрузкой не в том формате.
   */
  check(exportFormat('xlsx').value === 'xlsx', 'параметр `format=xlsx` разбирается в XLSX')

  /* ---------------------------------------------------------------- */
  console.log('\nВид файла по первым байтам\n')

  const sample = toXlsx([{ title: 'A' }], [['1']])
  check(detectTableKind(sample) === 'xlsx', 'книга .xlsx узнаётся')

  const legacy = (() => {
    const sheet = XLSX.utils.aoa_to_sheet([['A'], ['1']])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'S')
    return XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) as Buffer
  })()
  check(detectTableKind(legacy) === 'xls', 'книга .xls 97–2003 узнаётся')

  check(
    detectTableKind(Buffer.from('Инд.№;Кличка\r\nRU1;Зорька\r\n', 'utf8')) === 'text',
    'таблица CSV узнаётся текстом',
  )
  /*
   * Имя файла на определение не влияет и влиять не должно: выгрузка
   * из программы учёта регулярно называется `.xls`, а внутри лежит
   * таблица с табуляцией. Проверяется тем, что байтам книги дано имя
   * текста и наоборот, — в этой функции имени нет вовсе.
   */
  check(detectTableKind(Buffer.from('')) === 'text', 'пустой файл не роняет определение')

  /* ---------------------------------------------------------------- */
  console.log('\nСтарый .xls читается тем же путём, что и новый\n')

  const legacyRows = rowsOf(legacy)
  check(legacyRows.length === 2, 'из книги 97–2003 прочитаны обе строки', String(legacyRows.length))
  check(legacyRows[1]?.[0] === '1', 'значение из .xls дошло целым', legacyRows[1]?.[0])

  /* ---------------------------------------------------------------- */
  console.log('\nЗначения переживают круг: запись → чтение\n')

  /*
   * Набор нарочно составлен из того, на чём таблицы ломаются: номер
   * с ведущим нулём, дробь, точка с запятой и кавычки внутри значения,
   * угловые скобки и амперсанд, пустая ячейка, перенос строки.
   * В CSV половина этого требует экранирования, и каждая из половин
   * когда-нибудь его не получала.
   */
  const tricky: (string | number | null)[][] = [
    ['0987654321', 'Зорька', 8450, 3.85],
    ['RU1234567890', 'Буян; «кавычки» и <xml> & амперсанд', null, 4.2],
    ['00000000000001', 'Перенос\nстроки', 0, 0],
  ]
  const trickyBook = toXlsx(
    [
      { title: 'Инд.№' },
      { title: 'Кличка' },
      { title: 'Удой, кг', numeric: true },
      { title: 'Жир, %', numeric: true },
    ],
    tricky,
    { sheetName: 'Стадо' },
  )
  const trickyRows = rowsOf(trickyBook)

  check(trickyRows.length === tricky.length + 1, 'строк столько же, сколько записали')
  check(trickyRows[1]?.[0] === '0987654321', 'ведущий ноль в номере уцелел', trickyRows[1]?.[0])
  check(
    trickyRows[3]?.[0] === '00000000000001',
    'номер из одних нулей и единицы уцелел',
    trickyRows[3]?.[0],
  )
  check(
    trickyRows[2]?.[1] === 'Буян; «кавычки» и <xml> & амперсанд',
    'кавычки, точка с запятой и разметка дошли целыми',
    trickyRows[2]?.[1],
  )
  check(trickyRows[3]?.[1] === 'Перенос\nстроки', 'перенос строки внутри ячейки не разорвал строку')
  check(trickyRows[1]?.[2] === '8450' && trickyRows[1]?.[3] === '3.85', 'числа дошли числами')
  /*
   * Пустое и нулевое обязаны различаться. Пустой удой — «не измеряли»,
   * нулевой — «измеряли, получили ноль»; в отчёте по стаду это разные
   * животные, и слипнись они здесь, разница пропала бы молча.
   */
  check(trickyRows[2]?.[2] === '', 'пустая ячейка осталась пустой', `«${trickyRows[2]?.[2]}»`)
  check(trickyRows[3]?.[2] === '0', 'ноль остался нулём, а не пустым', `«${trickyRows[3]?.[2]}»`)

  /* ---------------------------------------------------------------- */
  console.log('\nДата из ячейки — в поясе не плавает\n')

  /*
   * Дата пишется так, как её пишет настоящий Excel: числом дней
   * с признаком формата, а не строкой. Строка прошла бы проверку, ничего
   * не проверив, — вся ошибка была именно в превращении числа в дату.
   */
  const dateBook = (() => {
    const sheet = XLSX.utils.aoa_to_sheet([['Дата рождения'], [45033]])
    const cell = sheet['A2'] as { t: string; z?: string }
    cell.t = 'n'
    cell.z = 'dd.mm.yyyy'
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'S')
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  })()

  /*
   * Пояс задаётся дочернему процессу, а не переменной на ходу.
   *
   * Первая редакция этой проверки меняла `process.env.TZ` в цикле —
   * и ответила, что в Москве дата уезжает на день назад. Ответ был
   * неверный, но не безобидный: тот же опыт, повторённый заменой
   * переменной, давал то шестнадцатое, то семнадцатое, потому что
   * Node пересчитывает пояс лениво и не обещает, когда именно.
   * Проверка, дающая разные ответы на одних и тех же данных, хуже
   * отсутствующей: по ней приняли бы решение.
   *
   * Настоящий сдвиг нашёлся тогда, когда пояс стал задаваться при
   * запуске процесса, — и нашёлся в восточных поясах, то есть ровно
   * там, где прежнее объяснение обещало исправность. Разбор — в
   * `src/lib/xlsx.ts`, над `dateCell`.
   */
  if (process.argv.includes('--tz-probe')) {
    console.log(rowsOf(dateBook)[1]?.[0] ?? '')
    process.exit(0)
  }

  /*
   * Обратная ошибка не дешевле прямой: датой считается формат ячейки,
   * а не величина, и число 45033 в колонке удоя обязано остаться числом.
   * Без этой проверки «починка» дат вида «а давайте считать датой всякое
   * число подходящего порядка» выглядела бы прошедшей.
   */
  const plainNumber = (() => {
    const sheet = XLSX.utils.aoa_to_sheet([['Удой, кг'], [45033]])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'S')
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  })()
  const plain = rowsOf(plainNumber)[1]?.[0]
  check(plain === '45033', 'число без датного формата осталось числом', plain)

  /*
   * И дата, набранная в ячейке текстом, обязана дойти текстом: разбор дат
   * принимает и `17.04.2023`, и `2023-04-17`, а вот попытка «улучшить»
   * такую строку здесь означала бы разбор дат в двух местах сразу.
   */
  const textDate = toXlsx([{ title: 'Дата рождения' }], [['17.04.2023']])
  const asText = rowsOf(textDate)[1]?.[0]
  check(asText === '17.04.2023', 'дата, набранная текстом, дошла текстом', asText)

  for (const tz of ['UTC', 'Europe/Moscow', 'America/Los_Angeles', 'Pacific/Auckland']) {
    const run = spawnSync('npx', ['tsx', fileURLToPath(import.meta.url), '--tz-probe'], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    })
    const got = (run.stdout ?? '').trim().split('\n').pop() ?? ''
    check(got === '2023-04-17', `в поясе ${tz} дата читается как 2023-04-17`, got || run.stderr)
  }

  /* ---------------------------------------------------------------- */
  console.log('\nЛистов больше одного: читается первый, остальные названы\n')

  const manySheets = (() => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Инд.№'], ['RU1']]), 'Стадо')
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Пояснения']]), 'Легенда')
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Итого']]), 'Свод')
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  })()

  const many = readSpreadsheet(manySheets)
  if ('error' in many) {
    check(false, 'книга с тремя листами прочиталась', many.error)
  } else {
    check(many.sheet === 'Стадо', 'прочитан первый лист', many.sheet)
    check(
      many.otherSheets.join(', ') === 'Легенда, Свод',
      'остальные листы названы поимённо',
      many.otherSheets.join(', '),
    )
    check(many.rows.length === 2, 'из первого листа взяты только его строки')
  }

  /* ---------------------------------------------------------------- */
  console.log('\nПотолок строк: лишнее не читается, и об этом сказано\n')

  const longBook = toXlsx(
    [{ title: 'Инд.№' }],
    Array.from({ length: 40 }, (_, i) => [`RU${i}`]),
  )
  const capped = readSpreadsheet(longBook, 10)
  if ('error' in capped) {
    check(false, 'длинная книга прочиталась с потолком', capped.error)
  } else {
    check(capped.rows.length === 10, 'прочитано ровно столько, сколько разрешили')
    check(capped.truncated, 'книга помечена как прочитанная не до конца')
  }

  const shortBook = toXlsx(
    [{ title: 'Инд.№' }],
    Array.from({ length: 5 }, (_, i) => [`RU${i}`]),
  )
  const fits = readSpreadsheet(shortBook, 10)
  check(!('error' in fits) && !fits.truncated, 'книга внутри потолка не помечается обрезанной')
  check(XLSX_MAX_ROWS > 20_000, 'потолок загрузки выше потолка выгрузки')

  /* ---------------------------------------------------------------- */
  console.log('\nИспорченный файл отказывает словами, а не падением\n')

  /*
   * Байты начинаются как zip и продолжаются мусором. Это не выдумка:
   * так выглядит книга, докачанная наполовину, и раньше такой файл
   * ронял бы разбор исключением — то есть отвечал бы человеку пустым
   * экраном вместо причины.
   */
  const broken = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(600, 0x41)])
  const brokenRead = readSpreadsheet(broken)
  check('error' in brokenRead, 'битая книга отвергнута, а не разобрана')
  check(
    'error' in brokenRead && /Excel/.test(brokenRead.error),
    'в отказе сказано, что делать',
    'error' in brokenRead ? brokenRead.error : '',
  )

  /* ---------------------------------------------------------------- */
  console.log('\nШаблоны: заголовки из книги распознаются разбором\n')

  for (const ds of DATASETS) {
    const { headers, example } = templateRowsOf(ds)
    const book = toXlsx(
      headers.map((title) => ({ title })),
      [example],
      { sheetName: ds.label },
    )
    const rows = rowsOf(book)

    check(
      rows[0]?.join('|') === headers.join('|'),
      `«${ds.label}»: заголовки шаблона вернулись без потерь`,
      rows[0]?.join('|'),
    )

    /*
     * Главная проверка шаблона — не то, что он собрался, а то, что наша
     * же загрузка его узнаёт. Шаблон, чьи заголовки не попадают в словарь
     * разбора, — это файл, который система предложила заполнить и сама же
     * не примет.
     */
    const map = headerMapOf(ds)
    const unknown = (rows[0] ?? []).filter((h) => !map[h.trim().toLowerCase()])
    check(unknown.length === 0, `«${ds.label}»: все колонки шаблона знакомы разбору`, unknown.join(', '))

    const required = columnsOf(ds).filter((c) => c.required)
    const header = (rows[0] ?? []).map((h) => map[h.trim().toLowerCase()] ?? '')
    const missing = required.filter((c) => !header.includes(c.key))
    check(missing.length === 0, `«${ds.label}»: обязательные колонки на месте`, missing.map((c) => c.title).join(', '))
  }

  /* ---------------------------------------------------------------- */
  console.log('\nНастоящее стадо из базы: выгрузка и возврат\n')

  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'animals',
    where: { archived: { not_equals: true } },
    limit: 200,
    depth: 0,
    sort: 'identNumber',
    overrideAccess: true,
  })

  if (!found.docs.length) {
    check(false, 'в базе есть животные для выгрузки', 'коллекция пуста — проверять нечего')
  } else {
    const columns = [
      { title: 'Инд.№' },
      { title: 'Кличка' },
      { title: 'Дата рождения' },
      { title: 'Удой, кг', numeric: true },
      { title: 'ИПЦ', numeric: true },
    ]
    const source = found.docs.map((a) => [
      a.identNumber,
      a.name ?? '',
      a.birthDate ? String(a.birthDate).slice(0, 10) : '',
      a.summary?.milkYield ?? '',
      a.ipc ?? '',
    ])

    const book = toXlsx(columns, source)
    const rows = rowsOf(book)
    console.log(`  (${found.docs.length} записей, книга ${(book.length / 1024).toFixed(0)} КБ)`)

    check(rows.length === source.length + 1, 'из книги вернулись все строки', String(rows.length))

    /*
     * Сверяется каждое значение, а не выборка. Выборочная сверка отвечает
     * на вопрос «работает ли вообще», а ломается такое обычно на одной
     * записи из тысячи — на той, у которой в кличке кавычка или номер
     * длиннее прочих.
     */
    const bad: string[] = []
    source.forEach((row, i) => {
      row.forEach((value, j) => {
        const want = value === null || value === undefined ? '' : String(value)
        const got = rows[i + 1]?.[j] ?? ''
        if (want !== got) bad.push(`строка ${i + 2}, «${columns[j]!.title}»: ждали «${want}», в файле «${got}»`)
      })
    })
    check(bad.length === 0, 'все значения вернулись такими же', bad.slice(0, 3).join('; '))

    /*
     * Отдельно — номера. Они и есть причина, по которой книга появилась:
     * в CSV Excel читает их числом и теряет ведущий ноль. Проверка
     * смотрит именно на те номера, у которых есть что терять.
     */
    const withZero = source.filter((r) => /^0/.test(String(r[0])))
    const keptZero = withZero.filter((r, i) => {
      const at = source.indexOf(r)
      return rows[at + 1]?.[0] === String(r[0]) && i >= 0
    })
    check(
      withZero.length === keptZero.length,
      withZero.length
        ? `номера с ведущим нулём уцелели (${withZero.length} шт.)`
        : 'номеров с ведущим нулём в базе нет — проверено на составленных',
      `${keptZero.length} из ${withZero.length}`,
    )
  }

  console.log(
    failures === 0
      ? '\nВсё сходится.\n'
      : `\nНе сходится: ${failures}.\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
