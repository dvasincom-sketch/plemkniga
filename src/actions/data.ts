'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { decodeText, parseCsv, type TextEncodingName } from '@/lib/csv'
import { detectTableKind, readSpreadsheet } from '@/lib/xlsx'
import { columnsOf, datasetByKey, headerMapOf, type Dataset } from '@/lib/import-format'
import { IDENT_FIELD_LABEL, IDENT_VALUES_SQL, identCore } from '@/lib/animal-id'
import { DOMAIN_RULES } from '@/lib/db-constraints'
import { quarantineColumns } from '@/lib/pending-columns'
import { type SqlPool } from '@/lib/sql'

export type ImportState = {
  error?: string
  created?: number
  updated?: number
  skipped?: number
  ok?: boolean
  /** Какой набор загружали — чтобы сообщение говорило о нём, а не «о данных». */
  dataset?: string
  /** Пакет загрузки, заведённый этим импортом. */
  submissionId?: number | string
  submissionNumber?: string
  /** Непринятые строки с причинами — чтобы «пропущено 4» можно было понять. */
  issues?: { row: number; ident?: string; reason: string }[]
  /**
   * Заголовки, которых система не знает.
   *
   * Раньше такие колонки молча пропадали: файл принимался, данные из них
   * не записывались, и человек узнавал об этом через месяц, не найдя
   * в карточках того, что точно грузил. Теперь они названы сразу.
   */
  unknownColumns?: string[]
  /** Значения, которых не нашлось в справочниках, — порода и стадо. */
  unresolved?: string[]
  /**
   * Строки, принятые с вопросом: их цифры совпали с другой записью.
   *
   * Отдельно от `issues` намеренно. Там — строки, которых **нет** в стаде;
   * здесь — строки, которые есть, и всё же требуют взгляда. Свалить их
   * в один список значило бы сказать хозяйству «пропущено 4», когда
   * пропущено ноль.
   */
  identMatches?: IdentMatch[]
  /**
   * Записи, с которых загрузка сняла знак Ассоциации.
   *
   * Отдельным списком, а не строкой в сводке: снятие знака — событие,
   * о котором хозяйство обязано узнать поимённо. «Обновлено 40» ничего
   * не говорит о том, что у двух из сорока пропало подтверждение,
   * добытое неделей ожидания.
   */
  unverified?: { ident: string; fields: string[] }[]
  /**
   * Что именно прочитали из книги Excel.
   *
   * Только для книг: у CSV листа нет, и поле остаётся пустым. Сказано
   * оно вслух по той же причине, что и `unknownColumns`, — прочитанный
   * первый лист из трёх выглядит на экране точно так же, как прочитанная
   * целиком книга, и разницу видно только тому, кто знает, что искать.
   */
  sheet?: { name: string; others: string[]; truncated?: boolean }
  /**
   * Кодировка текстового файла, если она не UTF-8.
   *
   * Названа вслух не ради полноты отчёта, а потому что распознавание
   * может ошибиться — редко, но может, — и тогда человек увидит
   * в кличках вопросительные знаки и эту строку рядом. Без неё
   * он ищет причину в своих данных.
   */
  encoding?: TextEncodingName
}

/**
 * Совпадение цифровой части идентификаторов — вопрос, а не отказ.
 *
 * Текст собирается на сервере целиком: разница между «это одна корова
 * дважды» и «два независимых номера случайно сошлись» объясняется словами,
 * а не полями, и разбирать её на экране заново незачем.
 */
export type IdentMatch = { core: string; text: string; row?: number }

/* ------------------------------------------------------------------ */
/*  Разбор значений                                                    */
/* ------------------------------------------------------------------ */

const numOrUndef = (v?: string) => {
  if (!v) return undefined
  const n = Number(v.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/*
 * Разбор пола из файла хозяйства.
 *
 * «Самка» и «самец» добавлены вместе со сменой подписей в интерфейсе,
 * а «женский» и «мужской» оставлены. Выбросить их было бы ошибкой:
 * выгрузки из хозяйственных программ и старые шаблоны написаны прежними
 * словами, и файл, который вчера читался, перестал бы читаться сегодня —
 * из-за правки, которую делали ради удобства этих же людей.
 */
const sexOf = (v?: string) => {
  const s = (v || '').trim().toLowerCase()
  if (['ж', 'f', 'female', 'женский', 'самка'].includes(s)) return 'female'
  if (['м', 'm', 'male', 'мужской', 'самец'].includes(s)) return 'male'
  return undefined
}

/**
 * Дата в двух видах: 2023-04-17 и 17.04.2023.
 *
 * `Date.parse` разбирает первый и врёт на втором: 17.04.2023 он либо
 * не поймёт, либо поймёт по американскому порядку. Русское написание
 * в выгрузках из «Селэкса» — обычное дело, и молча принять его неверно
 * хуже, чем не принять вовсе.
 */
const dateOrUndef = (v?: string): string | undefined => {
  const s = (v || '').trim()
  if (!s) return undefined

  const ru = /^(\d{2})[.](\d{2})[.](\d{4})$/.exec(s)
  if (ru) return new Date(`${ru[3]}-${ru[2]}-${ru[1]}T00:00:00.000Z`).toISOString()

  const t = Date.parse(s)
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

/** Значение по пути вида `summary.milkYield` — с созданием вложенных объектов. */
const assign = (target: Record<string, unknown>, path: string, value: unknown) => {
  if (value === undefined) return
  const parts = path.split('.')
  let node = target
  for (const key of parts.slice(0, -1)) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  node[parts[parts.length - 1]!] = value
}

const norm = (v: string) => v.trim().toLowerCase()

/** Номера животных сравниваются без учёта разделителей и регистра. */
const identKey = (v: string) => v.replace(/[^0-9a-zA-Zа-яА-Я]/g, '').toUpperCase()

/**
 * Действующее лицо загрузки: кто грузит и от чьего имени.
 *
 * Организация здесь обязательна — её спрашивают хуки коллекций событий.
 */
type Actor = { id: number; organization?: number; role?: string }

/* ------------------------------------------------------------------ */
/*  Ошибки базы на человеческом языке                                  */
/* ------------------------------------------------------------------ */

/**
 * Отказ PostgreSQL, переведённый на язык зоотехника.
 *
 * ## Что было и почему это плохо
 *
 * В список непринятых строк уходил текст исключения как есть, и хозяйство
 * читало: «Failed query: insert into "animals" ("id", "uuid",
 * "ident_number", "id_format", "name", "name_latin", "alt_ids_iso_id"…» —
 * обрезанное на двухстах символах перечисление колонок. Причина отказа
 * в этой строке была, но стояла она за списком колонок и за списком
 * параметров, то есть не помещалась в отведённое место никогда.
 *
 * Хуже простого неудобства: сообщение выглядит поломкой системы, а не
 * ошибкой в данных. Хозяйство, получив такое, идёт не исправлять файл,
 * а писать, что импорт сломался, — и оказывается право по-своему.
 *
 * ## Откуда берётся человеческий текст
 *
 * Из того же списка `DOMAIN_RULES`, по которому ограничения ставятся
 * в саму базу. У каждого правила есть `note` — фраза, написанная для
 * человека («животное не может быть своим отцом»). Заводя новое
 * ограничение, объяснение к нему пишут один раз, и оно само доходит
 * до того, кто наткнётся на отказ.
 *
 * ## Почему обход `cause`, а не разбор текста
 *
 * Payload заворачивает ошибку drizzle, drizzle — ошибку `pg`. Код
 * (`23514`, `23505`) и имя ограничения лежат на самом внутреннем
 * исключении, и добраться до них можно только по цепочке `cause`.
 * Разбор текста оставлен запасным путём: формулировки PostgreSQL
 * переводятся и меняются между версиями, а коды — нет.
 */
type PgLike = {
  code?: unknown
  constraint?: unknown
  detail?: unknown
  column?: unknown
  message?: unknown
  cause?: unknown
}

const pgErrorOf = (e: unknown): PgLike | null => {
  let cur: unknown = e
  for (let depth = 0; depth < 6 && cur && typeof cur === 'object'; depth++) {
    const c = cur as PgLike
    if (typeof c.code === 'string' && /^[0-9A-Z]{5}$/.test(c.code)) return c
    cur = c.cause
  }
  return null
}

/**
 * Все тексты по цепочке `cause` — в одну строку.
 *
 * Payload иногда перевыбрасывает ошибку своей, теряя код и `constraint`,
 * но сохраняя исходный текст в `cause`. Искать имя ограничения только
 * в верхнем сообщении значит промахиваться ровно в этом случае —
 * а он самый частый.
 */
const chainText = (e: unknown): string => {
  const parts: string[] = []
  let cur: unknown = e
  for (let depth = 0; depth < 6 && cur && typeof cur === 'object'; depth++) {
    const c = cur as PgLike
    if (typeof c.message === 'string') parts.push(c.message)
    if (typeof c.detail === 'string') parts.push(c.detail)
    cur = c.cause
  }
  return parts.join(' | ')
}

/** Имя ограничения — со самой ошибки либо из текста, если код потерялся. */
const constraintOf = (pg: PgLike | null, text: string): string | null => {
  if (pg && typeof pg.constraint === 'string') return pg.constraint
  const named = /constraint "([^"]+)"/.exec(text)
  if (named) return named[1]!
  return DOMAIN_RULES.find((r) => text.includes(r.name))?.name ?? null
}

/*
 * Не `export`: в файле с `'use server'` наружу разрешено отдавать только
 * асинхронные функции — всё экспортированное там считается серверным
 * действием и вызывается по сети. Сборка падает на этом сразу
 * («Server Actions must be async functions»), и это правильно: синхронная
 * функция, выставленная как действие, не работала бы вовсе.
 */
const describeDbError = (e: unknown): string => {
  const message = e instanceof Error ? e.message : String(e)

  /*
   * Сообщения самого Payload («Следующее поле недействительно: …»)
   * уже написаны для человека и переводу не подлежат. Признак —
   * отсутствие текста запроса: свои ошибки Payload формулирует словами.
   */
  if (!message.includes('Failed query') && !pgErrorOf(e)) return message.slice(0, 200)

  const pg = pgErrorOf(e)
  const text = chainText(e)
  const code = typeof pg?.code === 'string' ? pg.code : ''
  const constraint = constraintOf(pg, text)
  const rule = constraint ? DOMAIN_RULES.find((r) => r.name === constraint) : undefined
  const detail = typeof pg?.detail === 'string' ? pg.detail : text

  if (code === '23514' || (!code && constraint?.startsWith('chk_'))) {
    return rule
      ? `Значение не проходит правило книги: ${rule.note}`
      : `Значение не проходит ограничение базы${constraint ? ` «${constraint}»` : ''}`
  }

  if (code === '23505' || (!code && /unique constraint/i.test(text))) {
    /* «Key (ident_number)=(RU123) already exists.» — вытаскиваем номер. */
    const key = /\(([^)]+)\)=\(([^)]+)\)/.exec(detail)
    return key
      ? `Такая запись уже есть: ${key[1] === 'ident_number' ? 'номер' : key[1]} ${key[2]} занят`
      : 'Такая запись уже есть'
  }

  if (code === '23503' || (!code && /foreign key constraint/i.test(text)))
    return 'Строка ссылается на запись, которой в книге нет'

  if (code === '23502') {
    const col = typeof pg?.column === 'string' ? pg.column : null
    return col ? `Не заполнено обязательное поле «${col}»` : 'Не заполнено обязательное поле'
  }

  if (code === '22003') return 'Число не помещается в это поле — проверьте разряды'
  if (code === '22P02' || code === '22007')
    return 'Значение не подходит по типу: число там, где ожидался текст, или наоборот'

  /*
   * Неопознанный отказ базы. Текст запроса не показываем всё равно:
   * хозяйству он не поможет, а место занимает целиком. Код оставляем —
   * по нему разговор с поддержкой начинается с сути.
   */
  return `База отклонила строку${code ? ` (код ${code})` : ''}. Проверьте значения в этой строке`
}

/* ------------------------------------------------------------------ */
/*  Что именно меняет строка файла                                     */
/* ------------------------------------------------------------------ */

/**
 * Поля, которые файл действительно меняет в уже записанной карточке.
 *
 * Нужно затем, чтобы отличить настоящую правку от повторной заливки
 * того же файла. Повторная заливка — обычное дело: файл собрали, залили,
 * нашли опечатку в трёх строках, залили весь файл заново. Считать
 * такую заливку правкой всех пятисот записей значило бы снимать знак
 * Ассоциации с тех, где не изменилось ни одного символа.
 *
 * Сравнение нарочно снисходительное. Дата из файла приходит полным
 * временем (`2020-03-14T00:00:00.000Z`), в базе лежит так же, но может
 * отличаться зоной или миллисекундами — сравниваются первые десять
 * символов, то есть сам день. Числа сравниваются числами: «8450»
 * и «8450.0» — одно значение. Пустое, пробел и `null` — тоже одно.
 *
 * Возвращаются человеческие имена полей, а не пути: список уходит прямо
 * в сообщение хозяйству.
 */
const FIELD_TITLES: Record<string, string> = {
  identNumber: 'индивидуальный номер',
  name: 'кличку',
  sex: 'пол',
  birthDate: 'дату рождения',
  breed: 'породу',
  herd: 'стадо',
  bloodPercent: 'кровность',
  ageGroup: 'возрастную группу',
  state: 'состояние',
  inbreeding: 'инбридинг',
  notes: 'примечание',
  'summary.milkYield': 'удой',
  'summary.fatPercent': 'жир, %',
  'summary.proteinPercent': 'белок, %',
  'summary.fatKg': 'жир, кг',
  'summary.proteinKg': 'белок, кг',
}

const atPath = (obj: unknown, path: string): unknown => {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/** Плоский список путей значений внутри собранного объекта строки. */
const pathsOf = (obj: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? pathsOf(v as Record<string, unknown>, path)
      : [path]
  })

const sameValue = (a: unknown, b: unknown): boolean => {
  const empty = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
  if (empty(a) && empty(b)) return true
  if (empty(a) || empty(b)) return false

  /* Связи в записи приходят объектом, в строке файла — числом. */
  const idOf = (v: unknown) =>
    v !== null && typeof v === 'object' && 'id' in (v as object)
      ? (v as { id: unknown }).id
      : v
  const x = idOf(a)
  const y = idOf(b)

  const nx = Number(x)
  const ny = Number(y)
  if (Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny

  const sx = String(x)
  const sy = String(y)
  /* Даты сравниваются днём: время в них не значит ничего. */
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}T/.test(v)
  if (isDate(sx) && isDate(sy)) return sx.slice(0, 10) === sy.slice(0, 10)

  return sx.trim() === sy.trim()
}

const changedFields = (doc: Record<string, unknown>, data: Record<string, unknown>): string[] => {
  const out: string[] = []
  for (const path of pathsOf(data)) {
    /* Служебные поля строки правкой не считаются: их ставим мы сами. */
    if (path === 'owner' || path === 'author') continue
    if (!sameValue(atPath(doc, path), atPath(data, path))) {
      out.push(FIELD_TITLES[path] ?? path)
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Совпадение цифр идентификаторов                                    */
/* ------------------------------------------------------------------ */

/**
 * Загрузка сопоставляет записи **только по точному совпадению**
 * индивидуального номера, и менять это правило нельзя.
 *
 * Единого номера у скота в России нет: одно животное приезжает то под
 * национальным номером, то под `XXRUS…`, то под инвентарным, то под
 * биркой. Соблазн сопоставлять по цифрам понятен — и ошибочен. Цифры
 * совпадают не всегда: в одних хозяйствах это действительно один номер
 * в разной записи, в других системы нумерации независимы. Слияние
 * по цифрам однажды объединит двух разных коров, и разъединить их
 * обратно будет нечем — события, оценки и родословная уже перемешаны.
 * Ошибка «не нашли, завели вторую карточку» чинится за минуту; ошибка
 * «нашли не ту и слили» не чинится вовсе.
 *
 * Поэтому здесь ровно вопрос: строки приняты как есть, а совпадение
 * названо человеку. Что с ним делать, знает хозяйство.
 *
 * Запрос один на всю загрузку, а не по строке на строку: проход по стаду
 * с разбором json — не та цена, чтобы платить её тысячу раз.
 */
type Accepted = { line: number; ident: string; core: string }

async function identCoreMatches(
  payload: Awaited<ReturnType<typeof getClient>>,
  orgId: number,
  accepted: Accepted[],
): Promise<IdentMatch[]> {
  const out: IdentMatch[] = []
  if (!accepted.length) return out

  /* --- Совпадения внутри самого файла --- */

  const byCore = new Map<string, Accepted[]>()
  for (const a of accepted) byCore.set(a.core, [...(byCore.get(a.core) ?? []), a])

  for (const [core, list] of byCore) {
    const idents = [...new Set(list.map((l) => l.ident))]
    if (idents.length < 2) continue
    out.push({
      core,
      row: list[0]!.line,
      text:
        `В файле ${idents.length} разных номера с одними и теми же цифрами ${core}: ` +
        `${idents.join(', ')}. Заведены они как разные животные — ` +
        'если это одно и то же, объединять записи придётся вручную',
    })
  }

  /* --- Совпадения с тем, что уже есть в стаде --- */

  const pool = (payload.db as unknown as { pool?: SqlPool }).pool ?? null
  if (!pool) return out

  const cores = [...byCore.keys()]

  const res = await pool
    .query(
      `with ok as (${IDENT_VALUES_SQL})
       select ident_number, field, value, core from ok where core = any($2::text[])`,
      [orgId, cores],
    )
    /*
     * Падение запроса не отменяет загрузку и не превращается в ошибку
     * на экране: строки уже приняты, а замечание — не условие приёма.
     * След остаётся в логе, потому что «совпадений не найдено»
     * и «совпадения не искали» на экране выглядят одинаково.
     */
    .catch((e: unknown) => {
      console.error('[import] сверка цифр идентификаторов не выполнилась:', e)
      return null
    })

  if (!res) return out

  const inBase = new Map<string, { ident: string; field: string; value: string }[]>()
  for (const r of res.rows ?? []) {
    const core = String(r.core)
    const item = { ident: String(r.ident_number), field: String(r.field), value: String(r.value) }
    inBase.set(core, [...(inBase.get(core) ?? []), item])
  }

  for (const [core, list] of byCore) {
    const idents = new Set(list.map((l) => l.ident))
    /*
     * Своя же запись отбрасывается по номеру животного, а не по значению:
     * совпадение основного номера с собственной биркой — норма, ради
     * которой бирку и заводят, и находкой оно быть не может.
     */
    const others = (inBase.get(core) ?? []).filter((r) => !idents.has(r.ident))
    if (!others.length) continue

    const where = [...new Map(others.map((r) => [r.ident + r.field, r])).values()]
      .slice(0, 5)
      .map((r) => `№ ${r.ident} (${IDENT_FIELD_LABEL[r.field] ?? r.field}: ${r.value})`)

    out.push({
      core,
      row: list[0]!.line,
      text:
        `Номер ${list[0]!.ident} содержит те же цифры ${core}, что и запись, уже заведённая ` +
        `в стаде: ${where.join('; ')}. Загрузка сопоставляет записи только по точному ` +
        'совпадению номера, поэтому строка принята как отдельное животное. ' +
        'Если это то же самое животное под другим номером — объедините записи вручную',
    })
  }

  return out.slice(0, 50)
}

/* ------------------------------------------------------------------ */

type Row = string[]
type Reader = (key: string) => string | undefined

const readerFor = (header: string[], row: Row): Reader => (key) => {
  const idx = header.indexOf(key)
  return idx === -1 ? undefined : row[idx]?.trim()
}

/**
 * Разбор заголовка — общая часть всех наборов и всех форматов файла.
 *
 * Принимает матрицу строк, а не сам файл, и это главное в ней: CSV, TXT
 * и книга Excel различаются ровно до этой точки и одинаковы после. Пока
 * функция читала текст сама, добавление второго формата означало бы
 * ветвление здесь и во всём, что ниже.
 *
 * Неизвестные колонки не отбрасываются молча: они собираются
 * и возвращаются человеку. «Файл принят» при потерянной колонке — это
 * ложь, из-за которой данные считаются загруженными, а их нет.
 */
function readTable(rows: string[][], ds: Dataset) {
  if (rows.length < 2)
    return { error: 'В файле нет строк с данными' as const, unknownColumns: [] as string[] }

  const map = headerMapOf(ds)
  const rawHeader = rows[0].map((h) => h.trim())
  const header = rawHeader.map((h) => map[norm(h)] ?? '')
  const unknownColumns = rawHeader.filter((h, i) => h !== '' && header[i] === '')

  /*
   * Неопознанные колонки не просто называются, а забираются вместе
   * со значениями.
   *
   * Прежде их перечисляли в отчёте и на этом теряли: хозяйство прислало
   * то, что у него есть, а книга ответила «такого признака у меня нет».
   * Между тем именно так и приходит всё новое — не полем в требованиях,
   * а колонкой в чужой выгрузке.
   *
   * Значения собираются здесь, потому что дальше строки уже разбираются
   * по известным ключам, и лишние столбцы после этого не восстановить.
   */
  const unknownData = rawHeader
    .map((title, i) => ({ title, i }))
    .filter(({ title, i }) => title !== '' && header[i] === '')
    .map(({ title, i }) => ({
      title,
      normalized: norm(title),
      values: rows.slice(1).map((r) => (r[i] ?? '').trim()),
    }))

  const required = columnsOf(ds).filter((c) => c.required)
  const missing = required.filter((c) => !header.includes(c.key))

  if (missing.length) {
    return {
      error: `В файле не найдены обязательные колонки: ${missing
        .map((c) => `«${c.title}»`)
        .join(', ')}. Скачайте шаблон, чтобы свериться`,
      unknownColumns,
      unknownData,
    }
  }

  return { rows, header, unknownColumns, unknownData }
}

/* ------------------------------------------------------------------ */
/*  Животные                                                           */
/* ------------------------------------------------------------------ */

async function importAnimals(
  payload: Awaited<ReturnType<typeof getClient>>,
  user: Actor,
  orgId: number,
  ds: Dataset,
  rows: Row[],
  header: string[],
  /**
   * Разрешение трогать записи со знаком Ассоциации.
   *
   * Приходит отметкой из формы загрузки и по умолчанию снято: подпись
   * Ассоциации не должна исчезать оттого, что кто-то залил файл, не читая.
   */
  updateVerified: boolean,
) {
  const cols = columnsOf(ds)

  /*
   * Справочники загружаются один раз на весь файл, а не на строку.
   * Пять тысяч строк — это пять тысяч запросов «найди породу по названию»,
   * и разбор файла упёрся бы не в разбор, а в справочник.
   */
  const [breedList, herdList] = await Promise.all([
    header.includes('breed')
      ? payload.find({ collection: 'breeds', limit: 500, depth: 0, overrideAccess: true })
      : Promise.resolve({ docs: [] as { id: number; name: string }[] }),
    header.includes('herd')
      ? payload.find({
          collection: 'herds',
          where: { organization: { equals: orgId } },
          limit: 500,
          depth: 0,
          overrideAccess: true,
        })
      : Promise.resolve({ docs: [] as { id: number; name: string }[] }),
  ])

  const breeds = new Map(breedList.docs.map((b) => [norm(b.name), b.id as number]))
  const herds = new Map(herdList.docs.map((h) => [norm(h.name), h.id as number]))
  const unresolved = new Set<string>()

  let created = 0
  let updated = 0
  const touched: number[] = []
  /* Цифровые ядра принятых строк — для сверки одним запросом после разбора. */
  const accepted: Accepted[] = []
  /* Записи, с которых эта загрузка сняла знак Ассоциации. */
  const unverified: { ident: string; fields: string[] }[] = []
  const issues: { row: number; ident?: string; reason: string }[] = []
  let skipped = 0
  const skip = (line: number, reason: string, ident?: string) => {
    skipped++
    if (issues.length < 50) issues.push({ row: line, ident, reason })
  }

  for (const [i, row] of rows.slice(1).entries()) {
    const line = i + 2
    const get = readerFor(header, row)

    const identNumber = get('identNumber')
    if (!identNumber) {
      skip(line, 'Пустой индивидуальный номер')
      continue
    }

    const data: Record<string, unknown> = {
      identNumber,
      owner: orgId,
      author: user.id,
      /*
       * Пол по умолчанию — женский. Правило старое и небезобидное: файл
       * с быками без колонки «Пол» молча заводит их коровами. Убрать
       * умолчание нельзя (большинство файлов — коровы и колонки не имеют),
       * поэтому оговорка вынесена в описание формата и в шаблон.
       */
      sex: sexOf(get('sex')) ?? 'female',
    }

    for (const col of cols) {
      if (col.key === 'identNumber' || col.key === 'sex') continue
      const raw = get(col.key)
      if (raw === undefined || raw === '') continue

      switch (col.kind) {
        case 'number':
          assign(data, col.key, numOrUndef(raw))
          break
        case 'date':
          assign(data, col.key, dateOrUndef(raw))
          break
        case 'breed': {
          const id = breeds.get(norm(raw))
          if (id) assign(data, col.key, id)
          else unresolved.add(`порода «${raw}»`)
          break
        }
        case 'herd': {
          const id = herds.get(norm(raw))
          if (id) assign(data, col.key, id)
          else unresolved.add(`стадо «${raw}»`)
          break
        }
        /*
         * Значение не из справочника роняло всю строку: Payload отвергал
         * запись целиком с «Следующее поле недействительно: Общие данные >
         * Возрастная группа». Двадцать полей заполнены верно, одно
         * непонятно — и не сохраняется ничего.
         *
         * Теперь как у породы и стада: строка принимается, поле остаётся
         * пустым, значение названо в «не нашлись в справочниках». Ошибка
         * в одной ячейке не должна стоить всей строки — тем более что
         * заполнить пустую группу потом можно, а восстановить непринятую
         * строку нельзя ничем, кроме повторной загрузки файла.
         *
         * Принимается и код, и русское название: в выгрузках встречается
         * и `cow2`, и «Корова 2 лакт.».
         */
        case 'enum': {
          const opt = (col.options ?? []).find(
            (o) => norm(o.value) === norm(raw) || norm(o.label) === norm(raw),
          )
          if (opt) assign(data, col.key, opt.value)
          else unresolved.add(`${col.title.toLowerCase()} «${raw}»`)
          break
        }
        default:
          assign(data, col.key, raw)
      }
    }

    try {
      const existing = await payload.find({
        collection: 'animals',
        where: { identNumber: { equals: identNumber } },
        limit: 1,
        overrideAccess: true,
      })

      if (existing.totalDocs > 0) {
        const doc = existing.docs[0]
        const docOwner = typeof doc.owner === 'object' ? doc.owner.id : doc.owner
        if (docOwner !== orgId) {
          skip(line, 'Запись принадлежит другой организации', identNumber)
          continue
        }

        /*
         * Запись со знаком Ассоциации файлом молча не переписывается.
         *
         * До сих пор переписывалась. Проверка владельца отбивала чужие
         * строки — и только поэтому эталонная «Поляна» пережила загрузку
         * набора с подменой; будь она записью того же хозяйства, файл
         * переписал бы ей дату рождения, кровность и продуктивность,
         * а знак Ассоциации остался бы стоять. Подпись под данными,
         * которых Ассоциация не видела, — худшее, что может случиться
         * с книгой: она обесценивает не одну запись, а сам знак.
         *
         * Запретить правку совсем нельзя: данные принадлежат хозяйству,
         * и ошибку в подтверждённой записи оно вправе исправить. Поэтому
         * не запрет и не молчание, а выбор — тот же приём, что
         * с повторной заявкой: в форме загрузки есть отметка «обновлять
         * подтверждённые записи», и вместе с обновлением знак снимается.
         *
         * Сравнение с тем, что уже записано, обязательно: повторная
         * заливка того же файла — обычное дело, и снимать знак с записи,
         * в которой ничего не изменилось, значило бы наказывать
         * за аккуратность.
         */
        /*
         * Через `unknown`: у типа `Animal` нет индексной сигнатуры, и tsc
         * справедливо не считает его совместимым с `Record<string, unknown>`.
         * Сравниватель ходит по путям строки файла и знает о записи ровно
         * столько, сколько ему передали, — приведение здесь честное.
         */
        const changed = changedFields(doc as unknown as Record<string, unknown>, data)
        const isVerified = Number((doc as { trustLevel?: unknown }).trustLevel ?? 0) >= 3

        if (isVerified && changed.length > 0 && !updateVerified) {
          skip(
            line,
            `Запись подтверждена Ассоциацией, а файл меняет ${changed.join(', ')}. ` +
              'Отметьте «обновлять подтверждённые записи» — знак Ассоциации при этом снимется',
            identNumber,
          )
          continue
        }

        await payload.update({
          collection: 'animals',
          id: doc.id,
          data: (isVerified && changed.length > 0
            ? { ...data, trustLevel: 0 }
            : data) as never,
          overrideAccess: true,
          /*
           * Загрузка файлом в журнал правок не идёт: её след — сам пакет
           * с исходным файлом и протоколом приёмки. Иначе один импорт
           * оставлял бы десятки тысяч строк и топил в них те несколько,
           * что человек действительно ввёл руками.
           */
          context: { skipJournal: true },
        })
        touched.push(doc.id as number)
        updated++

        if (isVerified && changed.length > 0) {
          unverified.push({ ident: identNumber, fields: changed })
        }
        /*
         * Обновлённая строка сверяется наравне с новой. Она совпала
         * с записью по точному номеру — но третья запись, у которой те же
         * цифры в другой системе нумерации, от этого никуда не делась.
         */
        const core = identCore(identNumber)
        if (core) accepted.push({ line, ident: identNumber, core })
      } else {
        const doc = await payload.create({
          collection: 'animals',
          data: data as never,
          overrideAccess: true,
        })
        touched.push(doc.id as number)
        created++
        const core = identCore(identNumber)
        if (core) accepted.push({ line, ident: identNumber, core })
      }
    } catch (e) {
      /*
       * Сообщения проверок написаны для человека («Некорректный
       * индивидуальный номер. Национальный номер РФ: от 6 до 15 цифр…»),
       * и доходят как есть. Отказы самой базы переводятся: их текст
       * начинается с запроса на пятьсот символов, а причина стоит
       * за ним и до экрана не доезжает никогда.
       */
      skip(line, describeDbError(e) || 'Запись не сохранилась', identNumber)
    }
  }

  const identMatches = await identCoreMatches(payload, orgId, accepted)

  return {
    created,
    updated,
    skipped,
    issues,
    touched,
    unresolved: [...unresolved].slice(0, 20),
    identMatches,
    unverified,
  }
}

/* ------------------------------------------------------------------ */
/*  События: отёлы, осеменения, дойки                                  */
/* ------------------------------------------------------------------ */

/**
 * Загрузка событий устроена иначе, чем загрузка животных, и разница
 * не техническая.
 *
 * Файл животных **заводит** карточки: номера, которого нет, ещё не было,
 * и это нормально. Файл событий карточек не заводит — он привязывает
 * запись к уже существующему животному. Номер, которого нет в стаде, тут
 * не «новое животное», а ошибка: событие уйдёт не туда либо повиснет
 * на пустой карточке, которую никто не заполнит.
 *
 * Поэтому животные разрешаются одним запросом до разбора строк, и строка
 * с ненайденным номером отклоняется с понятной причиной.
 */
async function importEvents(
  payload: Awaited<ReturnType<typeof getClient>>,
  user: Actor,
  orgId: number,
  ds: Dataset,
  rows: Row[],
  header: string[],
) {
  const cols = columnsOf(ds)
  const body = rows.slice(1)

  /* --- Свои животные: разрешаются одним запросом на весь файл --- */

  const wanted = new Set<string>()
  for (const row of body) {
    const v = readerFor(header, row)('animal')
    if (v) wanted.add(identKey(v))
  }

  const mine = new Map<string, { id: number; sex?: string | null }>()
  if (wanted.size) {
    const { docs } = await payload.find({
      collection: 'animals',
      where: { owner: { equals: orgId } },
      limit: 20_000,
      depth: 0,
      overrideAccess: true,
    })
    for (const a of docs) {
      const k = identKey(a.identNumber)
      if (wanted.has(k)) mine.set(k, { id: a.id as number, sex: a.sex })
    }
  }

  /* --- Быки: ищутся по всей книге, семя чаще всего привозное --- */

  const bulls = new Map<string, number>()
  if (header.includes('bull')) {
    const wantedBulls = new Set<string>()
    for (const row of body) {
      const v = readerFor(header, row)('bull')
      if (v) wantedBulls.add(identKey(v))
    }
    if (wantedBulls.size) {
      const { docs } = await payload.find({
        collection: 'animals',
        where: { sex: { equals: 'male' } },
        limit: 20_000,
        depth: 0,
        overrideAccess: true,
      })
      for (const a of docs) {
        const k = identKey(a.identNumber)
        if (wantedBulls.has(k)) bulls.set(k, a.id as number)
      }
    }
  }

  /* --- Номера отёлов: считаются от того, что уже записано --- */

  const nextCalving = new Map<number, number>()
  if (ds.key === 'calvings' || ds.key === 'inseminations' || ds.key === 'milkTests') {
    const ids = [...mine.values()].map((a) => a.id)
    if (ids.length) {
      const { docs } = await payload.find({
        collection: 'calvings',
        where: { animal: { in: ids } },
        limit: 20_000,
        sort: 'number',
        depth: 0,
        overrideAccess: true,
      })
      for (const c of docs) {
        const aid = typeof c.animal === 'object' && c.animal ? (c.animal as { id: number }).id : (c.animal as number)
        if (!aid) continue
        const cur = nextCalving.get(aid) ?? 0
        const num = typeof c.number === 'number' ? c.number : cur + 1
        nextCalving.set(aid, Math.max(cur, num))
      }
    }
  }

  const collection =
    ds.key === 'calvings' ? 'calvings' : ds.key === 'inseminations' ? 'inseminations' : 'milk-tests'

  /* --- Заслон от повторной заливки того же файла --- */

  /*
   * Файл описывает факты, а не действия: «эта корова отелилась такого-то
   * числа» верно и при первой заливке, и при второй. Значит вторая заливка
   * не должна ничего добавлять — а до этого заслона добавляла, удваивая
   * дойки и уводя вперёд нумерацию отёлов.
   *
   * Ключ — животное и день. У дойки в ключ входит ещё и удой: две записи
   * за один день с разными числами это утро и вечер, а не дубль,
   * а с одинаковыми — дубль наверняка.
   *
   * Множество пополняется по ходу разбора, поэтому ловятся и повторы
   * внутри самого файла, а не только совпадения с уже записанным.
   */
  const seen = new Set<string>()
  const dayOf = (iso: string) => iso.slice(0, 10)
  const keyOf = (animalId: number, iso: string, extra?: number | null) =>
    `${animalId}|${dayOf(iso)}${extra === null || extra === undefined ? '' : `|${extra}`}`

  const existingIds = [...mine.values()].map((a) => a.id)
  if (existingIds.length) {
    const { docs } = await payload
      .find({
        collection: collection as never,
        where: { animal: { in: existingIds } },
        limit: 50_000,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))

    for (const d of docs as Record<string, unknown>[]) {
      const aid =
        typeof d.animal === 'object' && d.animal
          ? (d.animal as { id: number }).id
          : (d.animal as number)
      const date = d.date as string | undefined
      if (!aid || !date) continue
      seen.add(
        keyOf(aid, date, ds.key === 'milkTests' ? (d.dailyYield as number | null) : null),
      )
    }
  }

  let created = 0
  let skipped = 0
  const touched = new Set<number>()
  const unresolved = new Set<string>()
  const issues: { row: number; ident?: string; reason: string }[] = []
  const skip = (line: number, reason: string, ident?: string) => {
    skipped++
    if (issues.length < 50) issues.push({ row: line, ident, reason })
  }

  for (const [i, row] of body.entries()) {
    const line = i + 2
    const get = readerFor(header, row)

    const rawIdent = get('animal')
    if (!rawIdent) {
      skip(line, 'Не указан номер животного')
      continue
    }

    const animal = mine.get(identKey(rawIdent))
    if (!animal) {
      skip(line, 'Животного с таким номером нет в вашем стаде', rawIdent)
      continue
    }

    const date = dateOrUndef(get('date'))
    if (!date) {
      skip(line, 'Дата не заполнена или не разобрана', rawIdent)
      continue
    }
    if (new Date(date).getTime() > Date.now()) {
      skip(line, 'Дата в будущем', rawIdent)
      continue
    }

    const data: Record<string, unknown> = { animal: animal.id, date }

    for (const col of cols) {
      if (['animal', 'date', 'bull'].includes(col.key)) continue
      const raw = get(col.key)
      if (raw === undefined || raw === '') continue

      if (col.kind === 'enum') {
        /* То же правило, что у животных: непонятное значение стоит поля, а не строки. */
        const opt = (col.options ?? []).find(
          (o) => norm(o.value) === norm(raw) || norm(o.label) === norm(raw),
        )
        if (opt) assign(data, col.key, opt.value)
        else unresolved.add(`${col.title.toLowerCase()} «${raw}»`)
        continue
      }

      assign(data, col.key, col.kind === 'number' ? numOrUndef(raw) : col.kind === 'date' ? dateOrUndef(raw) : raw)
    }

    if (ds.key === 'calvings') {
      if (animal.sex === 'male') {
        skip(line, 'Отёл записывается корове, а не быку', rawIdent)
        continue
      }
      if (typeof data.number !== 'number') {
        const next = (nextCalving.get(animal.id) ?? 0) + 1
        data.number = next
        nextCalving.set(animal.id, next)
      }
    }

    if (ds.key === 'inseminations') {
      if (animal.sex === 'male') {
        skip(line, 'Осеменяют корову или тёлку, а не быка', rawIdent)
        continue
      }
      const rawBull = get('bull')
      const bullId = rawBull ? bulls.get(identKey(rawBull)) : undefined
      if (bullId) data.bull = bullId
      data.lactationNumber = (nextCalving.get(animal.id) ?? 0) + 1
      data.source = 'import'
    }

    if (ds.key === 'milkTests') {
      if (typeof data.lactationNumber !== 'number') {
        const done = nextCalving.get(animal.id) ?? 0
        if (done) data.lactationNumber = done
      }
      data.source = 'import'
    }

    const key = keyOf(
      animal.id,
      date,
      ds.key === 'milkTests' ? ((data.dailyYield as number | undefined) ?? null) : null,
    )
    if (seen.has(key)) {
      skip(
        line,
        ds.key === 'milkTests'
          ? 'Такая дойка уже записана — та же дата и тот же удой'
          : 'Такое событие на эту дату уже записано',
        rawIdent,
      )
      continue
    }

    try {
      await payload.create({
        collection: collection as never,
        data: data as never,
        overrideAccess: true,
        user,
      })
      seen.add(key)
      touched.add(animal.id)
      created++
    } catch (e) {
      skip(line, describeDbError(e) || 'Запись не сохранилась', rawIdent)
    }
  }

  /*
   * У файла событий цифровых совпадений не бывает по построению: он
   * не заводит карточек, а привязывается к существующим по точному номеру.
   * Пустой список стоит здесь, чтобы обе ветви загрузки возвращали
   * одинаковую форму, — иначе о нём пришлось бы помнить на каждом шаге.
   */
  return {
    created,
    updated: 0,
    skipped,
    issues,
    touched: [...touched],
    unresolved: [...unresolved].slice(0, 20),
    identMatches: [] as IdentMatch[],
    unverified: [] as { ident: string; fields: string[] }[],
  }
}

/* ------------------------------------------------------------------ */

export async function importDataAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Требуется авторизация' }

  const orgId =
    typeof user.organization === 'object' && user.organization
      ? user.organization.id
      : (user.organization as number | undefined)
  if (!orgId) return { error: 'У пользователя не заполнена организация' }

  const ds = datasetByKey(String(formData.get('kind') || 'animals'))
  if (!ds) return { error: 'Неизвестный вид данных' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'Выберите файл' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Файл больше 8 МБ' }

  /*
   * Файл читается в байты один раз на весь разбор.
   *
   * Раньше он читался дважды: `file.text()` для разбора и
   * `file.arrayBuffer()` ниже, для сохранения исходника. С книгой Excel
   * так уже нельзя — `text()` вернул бы распакованный мусор, — но дело
   * не только в этом: восьмимегабайтный файл в памяти дважды и есть
   * восьмимегабайтный файл в памяти дважды.
   */
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = detectTableKind(bytes)

  /*
   * Старый `.xls` и новый `.xlsx` различаются форматом до последнего
   * байта, но для нас это одна ветка: библиотека читает оба и отдаёт
   * одинаковую матрицу. Различать их пришлось бы, только если бы мы
   * умели один и не умели другой.
   */
  /*
   * Кодировка распознаётся, а не предполагается. Выгрузки российских
   * программ учёта приходят в windows-1251, и раньше такой файл
   * принимался целиком, а в книгу ложились клички из вопросительных
   * знаков — разбор в `src/lib/csv.ts`.
   */
  const decoded = kind === 'text' ? decodeText(bytes) : null

  const read = decoded ? { rows: parseCsv(decoded.text) } : readSpreadsheet(bytes)

  if ('error' in read) return { error: read.error, dataset: ds.label }

  const sheet =
    'sheet' in read
      ? { name: read.sheet, others: read.otherSheets, truncated: read.truncated || undefined }
      : undefined

  /*
   * Про кодировку сообщаем, только когда она не UTF-8. У правильно
   * сохранённого файла эта строка говорила бы «всё хорошо», а такие
   * строки перестают читать — вместе с теми, в которых сказано важное.
   */
  const encoding = decoded && decoded.encoding !== 'utf-8' ? decoded.encoding : undefined

  const parsed = readTable(read.rows, ds)
  if ('error' in parsed) {
    return {
      error: parsed.error,
      unknownColumns: parsed.unknownColumns,
      dataset: ds.label,
      sheet,
      encoding,
    }
  }

  const payload = await getClient()

  /*
   * Организация в действующем лице — не украшение, а условие работы.
   *
   * Загрузка событий передаёт `user` в `payload.create`, а хук
   * `requireOwnAnimal` на отёлах, осеменениях и дойках спрашивает
   * у этого пользователя его организацию. Раньше сюда уходило
   * `{ id }` — и хук честно отвечал «У вашей учётной записи нет
   * организации» на каждой строке файла, при том что организация
   * у человека есть и животные из того же кабинета грузились.
   *
   * Соблазн был не передавать `user` вовсе — тогда хук считает вызов
   * серверным скриптом и пропускает всё. Так делать нельзя: заслон
   * снимается ради удобства, а стоит он на том, чтобы файл не попал
   * в чужое стадо. Правильный способ — назвать действующее лицо целиком.
   *
   * `role` здесь по той же причине: Ассоциация ведёт чужие данные
   * по долгу службы, и хук отпускает её раньше проверки организации.
   */
  const actor = {
    id: user.id as number,
    organization: orgId,
    role: (user as { role?: string }).role,
  }

  /*
   * Неопознанные колонки уходят в карантин до разбора строк.
   *
   * До разбора — потому что дальше строки раскладываются по известным
   * ключам, и лишние столбцы после этого не восстановить. А ещё потому,
   * что файл может не приняться целиком: колонка при этом всё равно
   * приезжала, и знать о ней Ассоциации полезно независимо от судьбы
   * самих строк.
   *
   * Загрузка этого не ждёт: карантин — заметка рядом с данными, а не сами
   * данные, и его отказ не должен отвергать файл, который в остальном
   * хорош. Разбор в `src/lib/pending-columns.ts`.
   */
  await quarantineColumns(payload, parsed.unknownData, {
    datasetLabel: ds.label,
    organizationId: orgId,
  })

  const res =
    ds.key === 'animals'
      ? await importAnimals(
          payload,
          actor,
          orgId,
          ds,
          parsed.rows,
          parsed.header,
          String(formData.get('updateVerified') || '') === '1',
        )
      : await importEvents(payload, actor, orgId, ds, parsed.rows, parsed.header)

  /*
   * Пакет загрузки — не бюрократия, а условие доверия к данным.
   *
   * Записи попадают в стадо сразу: это данные владельца, и держать их
   * взаперти до чужой проверки незачем. Но уровень достоверности у них
   * остаётся черновиком, пока Ассоциация не посмотрит пакет и владелец
   * не согласится с результатом.
   *
   * Сбой на этом шаге не отменяет уже загруженные записи: данные важнее
   * сопроводительной записи о них, и терять их из-за неё нельзя.
   */
  let submissionId: number | string | undefined
  let submissionNumber: string | undefined
  try {
    const media = await payload.create({
      collection: 'media',
      overrideAccess: true,
      /*
       * Исходник загрузки — закрытый файл своего хозяйства.
       *
       * В нём всё стадо построчно: номера, удои, родословные. Владелец
       * и видимость проставляются здесь явно, а не оставляются на умолчание
       * коллекции: путь этот единственный, по которому в систему попадают
       * чужие данные целым файлом, и полагаться тут на умолчание — значит
       * однажды его поменять и не заметить.
       */
      data: { alt: `Файл импорта ${file.name}`, owner: orgId, visibility: 'private' },
      file: {
        data: Buffer.from(bytes),
        name: file.name,
        /*
         * Тип берётся от того, что в файле нашлось на самом деле, а не
         * от того, что о нём сказал браузер. Браузер выводит тип из
         * расширения по таблице операционной системы, и книга, названная
         * `.csv`, приехала бы в хранилище с типом `text/csv` — то есть
         * с ярлыком, по которому её потом не откроют. Умолчание остаётся
         * для текстового файла: там браузер обычно молчит.
         */
        mimetype:
          kind === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : kind === 'xls'
              ? 'application/vnd.ms-excel'
              : file.type || 'text/csv',
        size: file.size,
      },
    })

    const submission = await payload.create({
      collection: 'data-submissions',
      overrideAccess: true,
      data: {
        kind: ds.submissionKind,
        status: 'uploaded',
        organization: orgId,
        submittedBy: user.id,
        submittedAt: new Date().toISOString(),
        sourceFile: media.id,
        animals: res.touched,
        intake: {
          rows: parsed.rows.length - 1,
          created: res.created,
          updated: res.updated,
          skipped: res.skipped,
          issues: res.issues,
        },
        consent: { agreed: false },
      },
    })
    submissionId = submission.id
    submissionNumber = submission.number ?? undefined
  } catch (e) {
    // Пакет не завёлся — данные всё равно загружены, о чём и сообщаем
    console.error('[import] не удалось создать пакет загрузки:', e)
  }

  revalidatePath('/account')
  return {
    ok: true,
    dataset: ds.label,
    created: res.created,
    updated: res.updated,
    skipped: res.skipped,
    submissionId,
    submissionNumber,
    issues: res.issues,
    unknownColumns: parsed.unknownColumns,
    unresolved: res.unresolved,
    identMatches: res.identMatches,
    unverified: res.unverified,
    sheet,
    encoding,
  }
}
