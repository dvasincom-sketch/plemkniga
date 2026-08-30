import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getPayload } from 'payload'
import config from '@payload-config'
import { toXlsx } from '@/lib/xlsx'
import {
  buildLactations,
  buildPedigree,
  holdSummary,
  type Built,
  type ExportAnimal,
  type PedigreeSource,
} from '@/lib/fgias-export'

/**
 * Выгрузка книги в шаблоны ФГИАС ПР — «Лактация» и «Родословная».
 *
 * ## Зачем это скриптом, а не кнопкой
 *
 * Кнопка будет, и она проще этого файла. Но первым должен появиться
 * не способ нажать, а способ посмотреть, что уедет: обещанного модуля
 * обмена не будет вовсе, хозяйствам остаются шаблоны, и цена ошибки
 * в первом же файле — отказ реестра без указания колонки.
 *
 * Поэтому здесь всё сразу: файлы, отчёт о придержанных строках
 * с названием недостающего поля и свод по причинам. Хозяйство читает
 * отчёт и знает, что вносить; мы читаем тот же отчёт и знаем, что
 * доделывать в книге.
 *
 *   npm run export:fgias                        — всё стадо
 *   npm run export:fgias -- --owner 12          — одно хозяйство
 *   npm run export:fgias -- --priznak нет       — не проставлять «Признак»
 *
 * ## Что уедет пустым, и почему это правильно
 *
 * Колонка «Идентификатор ФГИАС ПР» пуста у каждой строки: она нужна для
 * обновления уже существующей в реестре записи, а у новой её нет и быть
 * не может. Так же пуста она и в листе «Пример» самого шаблона.
 *
 * ## Даты уходят текстом, и это спорно
 *
 * Шаблон противоречит сам себе: на листе «Описание контракта» дата
 * записана строкой `1111-11-01`, на листе «Пример» — настоящей датой
 * Excel. Мы пишем строку, потому что нормативным считаем лист контракта,
 * а не пример, и потому что строка не зависит от того, какой формат даты
 * стоит у читателя в системе.
 *
 * Если реестр такой файл отвергнет — а узнать это можно только настоящей
 * отправкой, — менять придётся одну колонку в `toXlsx`. Сказано об этом
 * здесь, чтобы искали не в разборе значений.
 */

/* ------------------------------------------------------------------ */

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const DIR = 'data/vygruzka-fgias'
const SIGNUM = (arg('priznak') ?? 'да').toLowerCase() !== 'нет'
const OWNER = arg('owner') ? Number(arg('owner')) : undefined

type Row = Record<string, unknown>

/**
 * Все животные постранично, с сортировкой по `id`.
 *
 * Сортировка не украшение: без неё листание берёт порядок коллекции
 * по умолчанию, а он не уникален, и `LIMIT/OFFSET` по неуникальному ключу
 * возвращает часть строк дважды, а часть теряет. Однажды это уже стоило
 * ложной тревоги на двести тринадцать животных (решение №229).
 */
async function readHerd(payload: Awaited<ReturnType<typeof getPayload>>): Promise<Row[]> {
  const out: Row[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'animals',
      where: OWNER ? { owner: { equals: OWNER } } : {},
      limit: 500,
      page,
      sort: 'id',
      depth: 0,
      overrideAccess: true,
    })
    out.push(...(res.docs as unknown as Row[]))
    if (!res.hasNextPage) break
    page += 1
  }
  return out
}

const relId = (v: unknown): number | null =>
  typeof v === 'number' ? v : v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : null

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/* ------------------------------------------------------------------ */

/**
 * Отчёт по одному шаблону.
 *
 * Список придержанных печатается сводом по причинам, а не перечислением
 * номеров: на двадцати тысячах строк перечисление никто не прочтёт,
 * а вопрос у читателя один — что внести, чтобы уехало больше. Первые
 * несколько номеров всё же показываются: без них причина «Жир, кг»
 * остаётся отвлечённой, а с ними её можно открыть в книге и посмотреть.
 */
const report = (label: string, built: Built, total: number) => {
  console.log(`\n${'─'.repeat(76)}`)
  console.log(label)
  console.log('')
  console.log(`  Уедет строк: ${built.rows.length}`)
  console.log(`  Придержано:  ${built.held.length}   (из ${total} животных в выборке)`)

  if (built.rounded) {
    /*
     * Округление названо вслух, хотя стоит оно полкило из восьми тысяч.
     * Правило общее: любое преобразование данных по дороге к получателю
     * объявляется, иначе первое же необъявленное станет привычкой.
     */
    console.log(`  Округлено до целого: ${built.rounded} значений — контракт требует int`)
  }

  const summary = holdSummary(built.held)
  if (summary.length) {
    console.log('\n  Чего не хватает:')
    for (const s of summary) {
      const examples = built.held
        .filter((h) => h.why === s.why)
        .slice(0, 3)
        .map((h) => h.identNumber)
      console.log(`    ${String(s.count).padStart(6)}  ${s.why}   напр.: ${examples.join(', ')}`)
    }
  }
}

const write = (name: string, built: Built, sheet: string) => {
  const buf = toXlsx(
    built.columns.map((c) => ({
      title: c.title,
      /*
       * Числовыми объявлены только числа. Базовый номер, наш ключ и дата
       * уходят текстом намеренно: uuid Excel числом не сочтёт, а вот дату
       * он показал бы в том виде, какой стоит у читателя в системе, —
       * и файл, собранный у нас и открытый у него, выглядел бы иначе.
       */
      numeric: c.type === 'int' || c.type === 'float',
      width: c.width,
    })),
    built.rows,
    { sheetName: sheet },
  )
  const path = join(DIR, name)
  writeFileSync(path, buf)
  console.log(`\n  Файл: ${path}  (${built.rows.length} строк, ${Math.round(buf.length / 1024)} КБ)`)
}

/* ------------------------------------------------------------------ */

async function main() {
  const payload = await getPayload({ config })
  mkdirSync(DIR, { recursive: true })

  console.log('\nЧитаем книгу…')
  const all = await readHerd(payload)

  /*
   * Архивные не выгружаются: во ФГИАС им делать нечего, а в знаменателе
   * они занижали бы готовность тем сильнее, чем аккуратнее хозяйство
   * чистит стадо.
   */
  const herd = all.filter((a) => a.archived !== true)

  console.log(
    `Животных ${herd.length}` +
      (all.length !== herd.length ? ` (в архиве ещё ${all.length - herd.length})` : '') +
      (OWNER ? `, хозяйство ${OWNER}` : ', всё стадо'),
  )

  const withBase = herd.filter((a) => text((a.fgias as Row | undefined)?.baseUuid)).length
  console.log(`С базовым номером ФГИАС: ${withBase} из ${herd.length}`)

  if (withBase === 0) {
    /*
     * Это не ошибка, а нормальное состояние до первой сдачи «Основных
     * сведений», и сказать о нём надо раньше отчёта — иначе читатель
     * увидит два пустых файла и решит, что сломалась выгрузка.
     */
    console.log(
      '\n  ⚠ Базового номера нет ни у одного животного, и это ожидаемо до первой\n' +
        '    сдачи «Основных сведений». Порядок работ такой:\n' +
        '      1. сдать во ФГИАС «Основные сведения» — там животное названо нашим ключом;\n' +
        '      2. получить обратный файл с проставленными базовыми номерами;\n' +
        '      3. разложить его: npm run import:fgias-return -- ~/Downloads/обратный.xlsx --apply;\n' +
        '      4. вернуться сюда.\n' +
        '    Файлы всё равно соберутся — с шапкой и без строк, чтобы было видно устройство.',
    )
  }

  /* ---------------------------- Лактации ---------------------------- */

  const forLactations: ExportAnimal[] = herd.map((a) => ({
    identNumber: String(a.identNumber ?? ''),
    accountingId: text(a.uuid),
    baseUuid: text((a.fgias as Row | undefined)?.baseUuid),
    lactations: Array.isArray(a.lactations) ? (a.lactations as never[]) : [],
  }))

  const withLactations = forLactations.filter((a) => (a.lactations ?? []).length > 0)
  const lact = buildLactations(forLactations, { signum: SIGNUM })

  report('Лактация: молочная продуктивность', lact, withLactations.length)

  if (SIGNUM && lact.rows.length) {
    /*
     * Догадка объявляется на каждом прогоне, а не один раз в решениях.
     * Решение прочтут раз, а этот отчёт читают перед каждой отправкой —
     * и именно тогда полезно вспомнить, что одна колонка из тринадцати
     * заполнена нашим прочтением, а не данными.
     */
    console.log(
      '\n  ⚠ Колонка «Признак» заполнена догадкой во всех строках.\n' +
        '    Справочник даёт два значения — «наивысшая» и «средняя», — а строка\n' +
        '    шаблона это конкретная лактация. Мы читаем это как «лучшая лактация\n' +
        '    животного против остальных» и помечаем наивысшей ту, у которой больше\n' +
        '    удой за 305 дней. Второе прочтение — что реестр ждёт по две строки\n' +
        '    на животное — сворачивает данные, и потому не выбрано.\n' +
        '    Уточните в поддержке реестра. Выключить: --priznak нет',
    )
  }

  write('КРС_Лактация_молочная_продуктивность.xlsx', lact, 'Пример')

  /* --------------------------- Родословная -------------------------- */

  const forPedigree: PedigreeSource[] = herd.map((a) => ({
    id: a.id as number,
    identNumber: String(a.identNumber ?? ''),
    baseUuid: text((a.fgias as Row | undefined)?.baseUuid),
    fatherId: relId(a.father),
    motherId: relId(a.mother),
  }))

  const ped = buildPedigree(forPedigree)
  report('Родословная', ped, herd.length)

  /*
   * Отдельный счёт: сколько предков книга знает связью, но реестр — нет.
   * Это разные работы и разные деньги. «Предка нет в книге» чинится
   * племсвидетельством и вводом; «предок есть, но не зарегистрирован» —
   * тем, что его надо сдать в «Основных сведениях» вместе с остальными.
   */
  const known = new Map(forPedigree.map((a) => [a.id, a]))
  let linked = 0
  let linkedUnregistered = 0
  for (const a of forPedigree) {
    for (const pid of [a.fatherId, a.motherId]) {
      if (typeof pid !== 'number') continue
      const parent = known.get(pid)
      if (!parent) continue
      linked += 1
      if (!parent.baseUuid) linkedUnregistered += 1
    }
  }
  console.log(
    `\n  Связей с родителями в книге: ${linked}, из них предок не зарегистрирован` +
      ` в реестре: ${linkedUnregistered}`,
  )
  console.log(
    '  Это не «предка не знаем», а «предка знаем, но реестр о нём не слышал» —\n' +
      '  чинится сдачей «Основных сведений» на предков, а не поиском бумаг.',
  )

  write('КРС_Родословная.xlsx', ped, 'Пример')

  /* ------------------------------------------------------------------ */

  console.log(`\n${'─'.repeat(76)}`)
  console.log(
    'Файлы собраны по шаблонам версии 2.6.0. Перед первой отправкой сверьте шапку\n' +
      'с актуальным шаблоном на fgias-pr.mcx.ru: заголовок — единственное, по чему\n' +
      'реестр узнаёт колонку, и меняется он вместе с версией.\n',
  )

  process.exit(0)
}

main().catch((e) => {
  console.error('\nВыгрузка не отработала:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
