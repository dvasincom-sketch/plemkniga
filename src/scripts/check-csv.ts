import 'dotenv/config'
import { decodeText, parseCsv, toCsv } from '@/lib/csv'
import { toTsv } from '@/lib/export-formats'
import { DATASETS, headerMapOf, templateRowsOf } from '@/lib/import-format'

/**
 * Проверка текстовых таблиц: кодировка и разделитель.
 *
 * ## Зачем отдельно от книг Excel
 *
 * Ломаются они по-разному. У книги ошибка обычно громкая — файл не
 * открылся, лист не тот; у текстовой таблицы ошибка всегда тихая:
 * файл принят, строки записаны, и только клички состоят из вопросительных
 * знаков. Проверять такое надо утверждениями о содержимом, а не о том,
 * прошёл ли разбор.
 *
 * ## Главное здесь — круг
 *
 * Выгрузка отдаёт CSV и TXT. Значит наша собственная выгрузка обязана
 * загружаться обратно, и это не самоочевидно: до этой проверки TXT
 * с табуляцией не загружался вовсе — разбор знал только `;` и `,`,
 * и вся строка становилась одной колонкой. Ошибка прожила ровно столько,
 * сколько никто не пробовал вернуть выгруженное.
 *
 *   npm run check:csv
 *
 * Скрипт ничего не читает из базы и ничего не пишет: он работает
 * со строками, собранными в памяти.
 */

let failures = 0

const check = (ok: boolean, what: string, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${what}`)
  } else {
    failures += 1
    console.log(`  ✗ ${what}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Строка в байтах windows-1251.
 *
 * Собирается таблицей, а не через `Buffer.from(s, 'latin1')`: latin1
 * пересаживает кириллицу не туда, и файл получился бы не в 1251,
 * а в бессмыслице, на которой проверка прошла бы по случайности.
 */
const toWin1251 = (s: string): Uint8Array => {
  const out: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c < 0x80) out.push(c)
    else if (c >= 0x410 && c <= 0x44f) out.push(c - 0x410 + 0xc0)
    else if (c === 0x401) out.push(0xa8) // Ё
    else if (c === 0x451) out.push(0xb8) // ё
    else if (c === 0x2116) out.push(0xb9) // №
    else if (c === 0x00ab) out.push(0xab) // «
    else if (c === 0x00bb) out.push(0xbb) // »
    else out.push(0x3f)
  }
  return Uint8Array.from(out)
}

const TABLE = 'Инд.№;Кличка;Удой, кг\r\nRU0987654321;Зорька «Ёлочка»;8450\r\n'

async function main() {
  console.log('\nКодировка распознаётся по содержимому\n')

  const utf8 = new TextEncoder().encode(TABLE)
  const win = toWin1251(TABLE)

  const readUtf8 = decodeText(utf8)
  check(readUtf8.encoding === 'utf-8', 'UTF-8 распознан', readUtf8.encoding)
  check(readUtf8.text === TABLE, 'текст UTF-8 дошёл целым')

  const readWin = decodeText(win)
  check(readWin.encoding === 'windows-1251', 'windows-1251 распознан', readWin.encoding)
  /*
   * Сверяется весь текст, а не факт распознавания. Кодировку можно
   * назвать верно и всё равно потерять «Ё», «№» и кавычки-ёлочки —
   * а это ровно те знаки, которыми полны наши заголовки и клички.
   */
  check(readWin.text === TABLE, 'текст windows-1251 дошёл целым', readWin.text.slice(0, 40))

  /*
   * Метка порядка байтов — единственный случай, когда кодировка прочитана,
   * а не угадана. UTF-16 сюда попадает не теоретически: «Текст Юникод»
   * в списке форматов сохранения Excel — это он.
   */
  const utf16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from(new Uint16Array([...TABLE].map((c) => c.codePointAt(0)!)).buffer),
  ])
  const readUtf16 = decodeText(utf16)
  check(readUtf16.encoding === 'utf-16', 'UTF-16 с меткой распознан', readUtf16.encoding)
  check(readUtf16.text.replace(/^﻿/, '') === TABLE, 'текст UTF-16 дошёл целым')

  /*
   * Латиница читается обеими кодировками одинаково, и спор о ней
   * бессмыслен: обе дают побайтно один результат. Проверяется не то,
   * какую кодировку назвали, а то, что текст не пострадал.
   */
  const ascii = new TextEncoder().encode('ID;Name\r\nRU1;Zorka\r\n')
  check(decodeText(ascii).text === 'ID;Name\r\nRU1;Zorka\r\n', 'чистая латиница не пострадала')

  /* ---------------------------------------------------------------- */
  console.log('\nРазделитель определяется по строке заголовков\n')

  const head = ['Инд.№', 'Кличка', 'Удой, кг', 'Жир, %']
  const body = [['RU1', 'Зорька', '8450', '3,85']]

  /*
   * Значение, внутри которого стоит сам разделитель, заключается
   * в кавычки — иначе это не таблица, а строка, в которой разделителей
   * больше, чем колонок.
   *
   * Первая редакция этой проверки склеивала заголовки запятой без
   * кавычек и падала на «Удой, кг»: `Удой` и ` кг` становились разными
   * колонками. Падала она честно — такой файл действительно разобрать
   * нельзя, — но проверяла при этом не разбор, а собственную небрежность
   * в сборке образца. Проверка, собирающая заведомо испорченный файл
   * и требующая его понять, ничего не доказывает ни своим падением,
   * ни своим прохождением.
   */
  const join = (row: string[], sep: string) =>
    row.map((v) => (v.includes(sep) || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(sep)

  for (const [name, sep] of [
    ['точка с запятой', ';'],
    ['запятая', ','],
    ['табуляция', '\t'],
  ] as const) {
    const text = [join(head, sep), ...body.map((r) => join(r, sep))].join('\r\n')
    const rows = parseCsv(text)
    check(rows[0]?.join('|') === head.join('|'), `${name}: заголовки разобраны`, rows[0]?.join('|'))
    check(rows[1]?.join('|') === body[0]!.join('|'), `${name}: строка разобрана`, rows[1]?.join('|'))
  }

  /*
   * Дробь через запятую — то самое, из-за чего разделитель считается
   * по первой строке, а не по всему файлу. В таблице с табуляцией
   * запятых больше, чем разделителей, начиная со второй строки.
   */
  const commaDecimals = ['А\tБ', '1\t3,85', '2\t4,20', '3\t3,95', '4\t4,05'].join('\r\n')
  const cd = parseCsv(commaDecimals)
  check(cd[1]?.length === 2, 'дроби через запятую не сбили разделитель', JSON.stringify(cd[1]))
  check(cd[1]?.[1] === '3,85', 'дробь дошла целой', cd[1]?.[1])

  /* ---------------------------------------------------------------- */
  console.log('\nВыгрузка возвращается загрузкой\n')

  /*
   * Утверждение здесь простое и оттого ценное: файл, который система
   * выдала, система обязана принять. Проверяется на настоящих заголовках
   * шаблонов — тех самых, по которым работает сопоставление колонок.
   */
  for (const ds of DATASETS) {
    const { headers, example } = templateRowsOf(ds)
    const map = headerMapOf(ds)

    for (const [name, text] of [
      ['CSV', toCsv(headers, [example])],
      ['TXT', toTsv(headers, [example])],
    ] as const) {
      const rows = parseCsv(text)
      const got = rows[0] ?? []
      check(
        got.join('|') === headers.join('|'),
        `«${ds.label}» ${name}: заголовки вернулись без потерь`,
        got.length === 1 ? 'вся строка стала одной колонкой' : got.join('|'),
      )
      const unknown = got.filter((h) => !map[h.trim().toLowerCase()])
      check(unknown.length === 0, `«${ds.label}» ${name}: колонки знакомы разбору`, unknown.join(', '))
    }
  }

  /* ---------------------------------------------------------------- */
  console.log('\nКодировка и разделитель вместе\n')

  /*
   * Так выглядит настоящий файл из русского Excel: 1251 и точка
   * с запятой. Раздельно оба случая уже проверены, но встречаются они
   * всегда вместе, и проверка обязана пройти тем же путём, что и файл.
   */
  const real = toWin1251('Инд.№;Кличка\r\nRU0987654321;Зорька\r\n')
  const rows = parseCsv(decodeText(real).text)
  check(rows[0]?.[0] === 'Инд.№', 'заголовок из файла русского Excel прочитан', rows[0]?.[0])
  check(rows[1]?.[0] === 'RU0987654321', 'номер с ведущим нулём в тексте не пострадал', rows[1]?.[0])
  check(rows[1]?.[1] === 'Зорька', 'кличка прочитана', rows[1]?.[1])

  console.log(failures === 0 ? '\nВсё сходится.\n' : `\nНе сходится: ${failures}.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
