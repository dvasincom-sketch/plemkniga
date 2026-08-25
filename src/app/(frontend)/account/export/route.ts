import { NextResponse } from 'next/server'
import { getClient, getCurrentUser } from '@/lib/payload'
import { toCsv } from '@/lib/csv'
import { AGE_GROUPS, STATES } from '@/lib/dictionaries'
import { EXPORT_LIMIT, exportFormat, toTsv, toXml } from '@/lib/export-formats'
import { toXlsx } from '@/lib/xlsx'
import type { Payload } from 'payload'

type SqlPool = {
  query: (q: string, p?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>
}

const poolOf = (payload: Payload): SqlPool | null =>
  (payload.db as unknown as { pool?: SqlPool }).pool ?? null

/**
 * Выгрузка стада файлом.
 *
 * ## Что здесь было не так
 *
 * Карточка на странице обещала «pdf, xls/xlsx, csv, json, xml», обработчик
 * умел CSV и JSON. Разошлись они не по чьей-то невнимательности, а потому
 * что список форматов был написан в двух местах: словами в карточке
 * и ветвлением здесь. Теперь он один — `src/lib/export-formats.ts`,
 * и добавить формат в текст, не добавив в код, больше нельзя.
 *
 * ## Почему у JSON свой состав, а у остальных общий
 *
 * XLSX, CSV, TXT и XML отдают один и тот же набор из четырнадцати полей:
 * это табличные форматы, и получателю нужен постоянный, предсказуемый
 * состав колонок. JSON отдаёт записи целиком, как они лежат в книге, —
 * за ним приходят именно тогда, когда таблицы мало. Разница намеренная,
 * и она названа в подсказке к каждому формату, чтобы не выяснялась опытом.
 */

const label = (arr: readonly { value: string; label: string }[], v?: string | null) =>
  arr.find((o) => o.value === v)?.label ?? ''

/**
 * Колонки таблицы: ключ для машины, заголовок для человека.
 *
 * Пара, а не два списка. Пока заголовки лежали отдельным массивом,
 * а значения — отдельным, порядок держался на честном слове: вставленная
 * в середину колонка сдвигала все значения вправо, и заметить это можно
 * было только глазами, открыв файл.
 */
/*
 * Признак `numeric` нужен только книге Excel: в ней у ячейки есть тип,
 * и от него зависит, сложится ли колонка и как она отсортируется.
 * В CSV, TXT и XML типов нет вовсе, и признак там просто не смотрят.
 *
 * Проставлен он вручную, а не выведен из содержимого. Вывод по содержимому
 * означал бы, что колонка номера становится числовой в тех хозяйствах,
 * где номера записаны одними цифрами, — то есть ровно там, где ведущий
 * ноль и теряется.
 *
 * Дата рождения намеренно уходит текстом `ГГГГ-ММ-ДД`, а не датой Excel.
 * Настоящая дата показывается в том виде, какой стоит у читателя
 * в системе, — и файл, выгруженный у нас и открытый у него, выглядит
 * по-разному. А главное, эта же колонка возвращается к нам загрузкой,
 * и разбор дат уже умеет `ГГГГ-ММ-ДД`: круг сходится без единого
 * преобразования по дороге.
 */
const COLUMNS: { key: string; title: string; numeric?: boolean; width?: number }[] = [
  { key: 'identNumber', title: 'Инд.№', width: 18 },
  { key: 'name', title: 'Кличка', width: 22 },
  { key: 'sex', title: 'Пол', width: 6 },
  { key: 'state', title: 'Состояние', width: 16 },
  { key: 'ageGroup', title: 'Возраст', width: 18 },
  { key: 'birthDate', title: 'Дата рождения', width: 15 },
  { key: 'milkYield', title: 'Удой, кг', numeric: true },
  { key: 'fatPercent', title: 'Жир, %', numeric: true },
  { key: 'proteinPercent', title: 'Белок, %', numeric: true },
  { key: 'fatKg', title: 'Жир, кг', numeric: true },
  { key: 'proteinKg', title: 'Белок, кг', numeric: true },
  { key: 'fatProteinSum', title: 'СБП, кг', numeric: true },
  { key: 'ipc', title: 'ИПЦ', numeric: true },
  { key: 'owner', title: 'Владелец', width: 28 },
]

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const format = exportFormat(searchParams.get('format'))

  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)

  const orgName =
    typeof user.organization === 'object' && user.organization
      ? String(user.organization.name ?? '')
      : ''

  const payload = await getClient()

  /*
   * Выгрузка — самое медленное место системы, и разбор по слоям назвал
   * виновного точно.
   *
   * Замер на полумиллионе животных: прямой запрос к базе за теми же
   * двадцатью тысячами строк — 122 мс. Тот же запрос через Payload
   * с просьбой отдать только нужные поля — 6 349 мс. Он же за полным
   * документом — 13 703 мс. С развёрнутыми связями — 19 929 мс.
   *
   * Первой догадкой была глубина связей, и она объяснила шесть секунд
   * из двадцати. Второй — состав документа: у карточки животного больше
   * ста полей, и Payload собирает из строки базы полный документ со всеми
   * группами. `select` уполовинил остаток. Но и после этого между нами
   * и базой оставалось шесть секунд на пустом месте — тридцать долей
   * миллисекунды на запись, помноженные на двадцать тысяч.
   *
   * Пятидесятикратная разница не оставляет выбора: таблица собирается
   * прямым запросом.
   */
  const deep = format.value === 'json'
  const pool = poolOf(payload)

  /*
   * ## Почему обход Payload здесь не обходит правила доступа
   *
   * Это тот самый приём, которым в системе однажды уже пробили дыру
   * (решение №110), поэтому условие названо вслух и сужено до предела.
   *
   * Выгрузка кабинета — это всегда своё стадо: условие `owner = orgId`
   * и есть правило доступа целиком, других оснований видеть чужое
   * животное здесь не бывает. Сотрудник Ассоциации в этот кабинет
   * не попадает вовсе, точечные разрешения на чужие записи в выгрузку
   * не входили никогда, публичная видимость к своему стаду отношения
   * не имеет.
   *
   * И всё же быстрый путь включается только тогда, когда организация
   * известна. Пользователь без организации — случай редкий и неочевидный:
   * что ему видно, решают правила Payload, а не мы. Для него остаётся
   * прежняя дорога, медленная и правильная.
   */
  const fast = !deep && pool !== null && typeof orgId === 'number'

  const result = fast
    ? { docs: [] as never[] }
    : await payload.find({
        collection: 'animals',
        where: orgId ? { owner: { equals: orgId } } : {},
        limit: EXPORT_LIMIT,
        depth: deep ? 1 : 0,
        /*
         * `summary` берётся группой целиком: в таблице из неё нужны шесть
         * полей из шести, и перечислять их по одному значило бы завести
         * четвёртый список тех же имён — после колонок, значений
         * и заголовков.
         */
        select: deep
          ? undefined
          : {
              identNumber: true,
              name: true,
              sex: true,
              state: true,
              ageGroup: true,
              birthDate: true,
              summary: true,
              ipc: true,
              owner: true,
            },
        sort: 'identNumber',
        overrideAccess: false,
        user,
      })

  const stamp = new Date().toISOString().slice(0, 10)
  const file = (ext: string) => `attachment; filename="animals-${stamp}.${ext}"`

  /*
   * JSON — записи целиком и без перекладывания в колонки. За ним приходят
   * ровно тогда, когда таблицы мало: нужны родословная, идентификаторы,
   * события. Обрезать его до четырнадцати полей значило бы оставить
   * без ответа единственный вопрос, ради которого его выбирают.
   */
  if (format.value === 'json') {
    return new NextResponse(JSON.stringify(result.docs, null, 2), {
      headers: { 'Content-Type': format.mime, 'Content-Disposition': file(format.ext) },
    })
  }

  /*
   * Названия хозяйств — одним запросом на всю выгрузку.
   *
   * У хозяйства своё стадо, то есть владелец обычно один; в выгрузке
   * Ассоциации их десятки. И в том и в другом случае двадцать тысяч
   * обращений за одним и тем же названием — работа, которой не должно
   * быть вовсе.
   */
  const ownerIds = [
    ...new Set(
      result.docs
        .map((a) => (typeof a.owner === 'object' && a.owner ? a.owner.id : a.owner))
        .filter((v): v is number => typeof v === 'number'),
    ),
    ...(fast && typeof orgId === 'number' ? [orgId] : []),
  ]

  const owners = new Map<number, string>()
  if (ownerIds.length) {
    const found = await payload.find({
      collection: 'organizations',
      where: { id: { in: ownerIds } },
      limit: ownerIds.length,
      depth: 0,
      overrideAccess: true,
    })
    for (const o of found.docs) owners.set(o.id as number, String(o.name ?? ''))
  }

  const ownerName = (v: unknown): string => {
    if (typeof v === 'object' && v) return String((v as { name?: string }).name ?? '')
    return typeof v === 'number' ? (owners.get(v) ?? '') : ''
  }

  const cell = (v: unknown) => (v === null || v === undefined ? '' : v)

  /*
   * Условие выгрузки записано здесь и повторяет `where` выше слово
   * в слово: `owner = $1`, сортировка по номеру, потолок в двадцать
   * тысяч. Расхождение между этими двумя запросами означало бы, что
   * человек получает разные файлы в зависимости от того, известна ли
   * его организация, — и узнал бы он об этом, сверяя два файла.
   *
   * Архив здесь не исключается, потому что не исключался и раньше:
   * выгрузка отдаёт всё стадо целиком, включая убранные записи. Это
   * расхождение со списками кабинета, где архив скрыт, и оно старое —
   * чинить его заодно с ускорением значило бы поменять содержимое файла
   * под видом починки скорости.
   */
  const fastRows = fast
    ? (
        await pool!.query(
          'select ident_number, name, sex, state, age_group, birth_date,' +
            ' summary_milk_yield, summary_fat_percent, summary_protein_percent,' +
            ' summary_fat_kg, summary_protein_kg, summary_fat_protein_sum, ipc, owner_id' +
            ' from animals where owner_id = $1 order by ident_number limit $2',
          [orgId, EXPORT_LIMIT],
        )
      ).rows ?? []
    : []

  const rows = fast
    ? fastRows.map((a) => [
        a.ident_number,
        cell(a.name),
        a.sex === 'male' ? 'М' : 'Ж',
        label(STATES, a.state as string),
        label(AGE_GROUPS, a.age_group as string),
        a.birth_date ? String(a.birth_date instanceof Date ? a.birth_date.toISOString() : a.birth_date).slice(0, 10) : '',
        cell(a.summary_milk_yield),
        cell(a.summary_fat_percent),
        cell(a.summary_protein_percent),
        cell(a.summary_fat_kg),
        cell(a.summary_protein_kg),
        cell(a.summary_fat_protein_sum),
        cell(a.ipc),
        ownerName(a.owner_id),
      ])
    : result.docs.map((a) => [
        a.identNumber,
        a.name ?? '',
        a.sex === 'male' ? 'М' : 'Ж',
        label(STATES, a.state),
        label(AGE_GROUPS, a.ageGroup),
        a.birthDate ? String(a.birthDate).slice(0, 10) : '',
        a.summary?.milkYield ?? '',
        a.summary?.fatPercent ?? '',
        a.summary?.proteinPercent ?? '',
        a.summary?.fatKg ?? '',
        a.summary?.proteinKg ?? '',
        a.summary?.fatProteinSum ?? '',
        a.ipc ?? '',
        ownerName(a.owner),
      ])

  const titles = COLUMNS.map((c) => c.title)

  /*
   * Книга уходит раньше остальных форматов, потому что она единственная
   * двоичная: `NextResponse` со строкой в теле пережёвывает её в UTF-8
   * и отдаёт битый архив. Ветка стоит до общей сборки тела, чтобы это
   * не могло случиться по недосмотру.
   */
  if (format.value === 'xlsx') {
    const buf = toXlsx(COLUMNS, rows, { sheetName: 'Стадо' })
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': format.mime,
        'Content-Disposition': file(format.ext),
        'Content-Length': String(buf.length),
      },
    })
  }

  const body =
    format.value === 'xml'
      ? toXml(COLUMNS, rows, {
          /*
             Заголовок файла отвечает на вопросы, которые получатель иначе
             задаёт письмом: чьё стадо, на какое число выгружено и сколько
             записей ждать. В таблице для этого места нет — в разметке есть.
          */
          organization: orgName,
          exported: stamp,
          count: rows.length,
          /*
             Признак упёршейся выгрузки. В CSV и TXT его сказать негде,
             не сломав разбор, — там потолок назван в карточке до нажатия;
             здесь он есть, и молчать о нём незачем.
          */
          truncated: rows.length >= EXPORT_LIMIT ? 'true' : undefined,
        })
      : format.value === 'txt'
        ? toTsv(titles, rows)
        : toCsv(titles, rows)

  return new NextResponse(body, {
    headers: { 'Content-Type': format.mime, 'Content-Disposition': file(format.ext) },
  })
}
