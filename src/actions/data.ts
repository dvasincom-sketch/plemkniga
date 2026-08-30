'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { decodeText, parseCsv, type TextEncodingName } from '@/lib/csv'
import { detectTableKind, readSpreadsheet } from '@/lib/xlsx'
import {
  columnsOf,
  datasetByKey,
  detectDataset,
  matchHeader,
  normalizeHeader,
  type Dataset,
} from '@/lib/import-format'
import { parseDate, parseNumber } from '@/lib/import-values'
import { fgiasTemplateOf } from '@/lib/fgias-export'
import { duplicateIdents, isMangledNumber, isServiceRow, parseSex } from '@/lib/import-rows'
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
  /**
   * Файл опознан как шаблон ФГИАС ПР — и какой именно.
   *
   * Без этой строки отчёт о загрузке файла реестра читается как разгром:
   * тридцать три нераспознанных заголовка, и не понять, беда это или
   * норма. С ней — «это шаблон ФГИАС, книга ведёт тринадцать колонок
   * из сорока шести», и вопросов не остаётся.
   */
  fgiasTemplate?: string
  /**
   * Набор определить не удалось — форме надо показать выбор.
   *
   * Отдельным признаком, а не догадкой по тексту ошибки: сообщение
   * пишут для человека и переписывают, когда оно плохо читается,
   * а форма не должна ломаться от правки формулировки.
   */
  needsKind?: boolean
  /** Набор, определённый по шапке, — чтобы сказать, чем грузили. */
  detected?: string
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
   * Ячейки, которые не разобрались: строка принята, поле осталось пустым.
   *
   * До этого списка такие ячейки исчезали бесследно — «3,85 %» в колонке
   * жира, «10 458 кг» в колонке удоя, «март 2026» в колонке даты. Файл
   * принимался, в сводке стояло «обновлено 500», и потеря обнаруживалась
   * через месяц по пустой колонке в карточках. Отвергнутый файл человек
   * перезальёт; про молча потерянную ячейку он не узнает вовсе.
   */
  valueIssues?: { row: number; ident?: string; columnTitle: string; reason: string }[]
  /** Сколько таких ячеек всего: список показывает первые пятьдесят. */
  valueProblems?: number
  /**
   * Строки отчёта, а не данных: «Итого», «Всего по ферме», подпись.
   *
   * Отдельно от непринятых строк намеренно. Это не ошибка хозяйства —
   * так устроен любой отчёт, выгруженный для печати, — и считать их
   * пропущенными значит послать человека искать беду, которой нет.
   * Но и молчать нельзя: до этой правки «Итого» заводило карточку
   * животного, потому что номер у него непустой.
   */
  serviceRows?: number[]
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

/*
 * Разбор чисел и дат уехал в `lib/import-values`, и это не перекладывание
 * кода из файла в файл. Здешние две функции возвращали `undefined` и на
 * пустой ячейке, и на непонятой, — то есть отвечали одним и тем же
 * на «не заполнено» и на «не смог прочитать». Из-за этого «3,85 %»
 * пропадало без единой строки в протоколе, а `00.00.0000` роняло разбор
 * файла целиком. Теперь разбор отвечает парой «значение или причина»,
 * и причина обязана дойти до человека — за это отвечает `note` ниже.
 */

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
 * Указатель на животное, как он приходит в файле.
 *
 * ## Зачем три ключа вместо одного
 *
 * В шаблонах ФГИАС, кроме «Основных сведений», индивидуального номера
 * нет: животное названо либо нашим ключом учётной системы, либо базовым
 * номером реестра. Файл выставок или лактаций, скачанный из реестра,
 * без такого поиска не привязать ни к одной карточке — привязывать
 * не по чему.
 *
 * ## Как различаются
 *
 * По виду значения, а не по названию колонки: колонка одна, а прийти
 * в неё может любой из трёх. Uuid отличается от индивидуального номера
 * настолько, что спутать их нельзя: тридцать шесть знаков, четыре дефиса
 * в известных местах.
 *
 * Различить между собой наш ключ и базовый номер по виду невозможно —
 * оба uuid. Поэтому ищутся оба, по очереди: сначала наш (он есть
 * у каждого животного), потом номер реестра. Совпасть они не могут:
 * наш выдаёт `randomUUID()`, реестр — свой генератор, и вероятность
 * столкновения тут не отличается от вероятности столкновения любых двух
 * uuid.
 */
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim())

/**
 * Карты поиска животного по всем трём ключам сразу.
 *
 * Строится одним проходом по стаду: три карты дешевле трёх запросов
 * на каждую строку файла.
 */
type AnimalIndex = {
  byIdent: Map<string, { id: number; sex?: string | null }>
  byUuid: Map<string, { id: number; sex?: string | null }>
  byBaseUuid: Map<string, { id: number; sex?: string | null }>
}

const indexAnimals = (
  docs: { id: number; identNumber?: string | null; uuid?: string | null; sex?: string | null; fgias?: { baseUuid?: string | null } | null }[],
): AnimalIndex => {
  const idx: AnimalIndex = { byIdent: new Map(), byUuid: new Map(), byBaseUuid: new Map() }
  for (const a of docs) {
    const ref = { id: a.id, sex: a.sex }
    if (a.identNumber) idx.byIdent.set(identKey(a.identNumber), ref)
    if (a.uuid) idx.byUuid.set(a.uuid.trim().toLowerCase(), ref)
    const base = a.fgias?.baseUuid
    if (base) idx.byBaseUuid.set(base.trim().toLowerCase(), ref)
  }
  return idx
}

/**
 * Идентификаторы всех проиндексированных животных, по одному разу.
 *
 * Одно животное лежит в трёх картах сразу, поэтому простое объединение
 * значений дало бы каждое трижды — и запрос `id in (…)` вырос бы втрое
 * без всякой пользы.
 */
const indexedIds = (idx: AnimalIndex): number[] => [
  ...new Set([...idx.byIdent.values(), ...idx.byUuid.values(), ...idx.byBaseUuid.values()].map((a) => a.id)),
]

/** Найти животное по тому, что написано в колонке. */
const findAnimal = (idx: AnimalIndex, raw: string) => {
  const v = raw.trim()
  if (!v) return undefined
  if (isUuid(v)) {
    const k = v.toLowerCase()
    return idx.byUuid.get(k) ?? idx.byBaseUuid.get(k)
  }
  return idx.byIdent.get(identKey(v))
}

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

  const rawHeader = rows[0].map((h) => h.trim())
  const { header, unknown: unknownColumns } = matchHeader(rawHeader, ds)

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
      normalized: normalizeHeader(title),
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
      fgiasTemplate: fgiasTemplateOf(rawHeader) ?? undefined,
      unknownData,
    }
  }

  return {
    rows,
    header,
    unknownColumns,
    unknownData,
    /* `null` наружу не отдаём: у состояния поле необязательное, и `undefined`
       читается как «не шаблон ФГИАС» без второго значения для того же. */
    fgiasTemplate: fgiasTemplateOf(rawHeader) ?? undefined,
  }
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
  /*
   * Справочники грузятся по списку колонок, а не поимённо.
   *
   * Здесь стояло `header.includes('breed')` и один запрос к породам —
   * порода была единственным справочным видом. С появлением линии, масти
   * и назначения перечислять их тут значило бы писать одно и то же четыре
   * раза и на пятый разойтись: колонка есть, а справочник к ней забыли
   * загрузить, и вся колонка молча уходит в «не нашлись».
   *
   * Теперь список коллекций собирается из самого набора: какие справочные
   * колонки в файле есть, те справочники и читаются.
   */
  const wanted = [
    ...new Set(
      cols
        .filter((c) => c.kind === 'dictionary' && c.collection && header.includes(c.key))
        .map((c) => c.collection as string),
    ),
  ]

  const dictionaries = new Map<string, Map<string, number>>()
  await Promise.all(
    wanted.map(async (slug) => {
      const res = await payload.find({
        collection: slug as never,
        limit: 0,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const map = new Map<string, number>()
      for (const d of res.docs as unknown as { id: number; name: string; fgiasUuid?: string | null }[]) {
        map.set(norm(d.name), d.id)
        /*
         * Ключ реестра ложится в ту же карту: в файлах ФГИАС значение
         * записано ключом, а не словом. Столкнуться приведённое название
         * и uuid не могут ни при каких условиях.
         */
        if (d.fgiasUuid) map.set(norm(d.fgiasUuid), d.id)
      }
      dictionaries.set(slug, map)
    }),
  )

  const [herdList] = await Promise.all([
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

  /*
   * Порода узнаётся и по названию, и по ключу реестра ФГИАС.
   *
   * ## Зачем вторая карта
   *
   * У хозяйства уже лежат файлы, заполненные по шаблонам ФГИАС ПР: оно
   * сдаёт их в реестр каждый месяц. Загрузить их к нам как есть быстрее,
   * чем перекладывать в наш формат, — но в этих файлах порода записана
   * не словом «Голштинская», а ключом `1bd6b3f1-648a-…`. Разбор, знающий
   * только названия, объявлял бы такую колонку целиком не найденной
   * в справочниках.
   *
   * Ключ реестра лежит у нас рядом с названием (`fgiasUuid`, миграция
   * `20260830_170000_fgias_uuid`), и добавить его в ту же карту стоит
   * одной строки.
   *
   * ## Почему в ту же карту, а не во вторую
   *
   * Столкновений быть не может: приведённое название породы и uuid
   * ни при каких условиях не совпадут. Вторая карта потребовала бы двух
   * поисков подряд в каждой ветке разбора — и первого же дня, когда
   * кто-нибудь добавит третий способ назвать породу, их станет три.
   */
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

  /*
   * Ячейки, которые не разобрались, — отдельным списком от непринятых строк.
   *
   * Свалить их в `issues` было бы проще и неверно по смыслу: там строки,
   * которых в книге **нет**, а здесь строки, которые есть, но приехали
   * неполными. Сказать «пропущено 4», когда пропущено ноль, а испорчено
   * четыре ячейки, значит послать человека искать не то.
   *
   * Счётчик считает всё, список хранит первые пятьдесят: файл, у которого
   * вся колонка написана не так, даст пять тысяч одинаковых заметок,
   * и протокол из пяти тысяч строк не читает никто.
   */
  const valueIssues: { row: number; ident?: string; columnTitle: string; reason: string }[] = []
  let valueProblems = 0
  const note = (line: number, columnTitle: string, reason: string, ident?: string) => {
    valueProblems++
    if (valueIssues.length < 50) valueIssues.push({ row: line, ident, columnTitle, reason })
  }

  /*
   * Номера, встречающиеся в файле дважды, считаются заранее — до разбора
   * строк, потому что решение о первой строке зависит от того, будет ли
   * вторая. Так выглядит выгрузка «по строке на лактацию»: одно животное,
   * три строки, в каждой свой удой. Прежде последняя молча переписывала
   * предыдущие, и хозяйство недосчитывалось двух лактаций из трёх.
   * Разбор, почему отклоняются все три, — в `lib/import-rows`.
   */
  const identColumn = header.indexOf('identNumber')
  const repeated = duplicateIdents(
    identColumn === -1 ? [] : rows.slice(1).map((r) => r[identColumn] ?? ''),
  )

  /*
   * Служебные строки — отдельным счётчиком, а не среди непринятых.
   *
   * «Итого» и подпись зоотехника не ошибка хозяйства: так устроен любой
   * отчёт, выгруженный для печати. Считать их непринятыми строками значит
   * сказать «пропущено 3» там, где пропущено ноль, и отправить человека
   * искать ошибку, которой нет. Но и промолчать нельзя — до этой правки
   * «Итого» проходило все заслоны и заводило карточку животного: номер
   * непустой, а номер у нас единственная обязательная колонка.
   */
  const serviceRows: number[] = []

  for (const [i, row] of rows.slice(1).entries()) {
    const line = i + 2
    const get = readerFor(header, row)

    const identNumber = get('identNumber')
    if (!identNumber) {
      skip(line, 'Пустой индивидуальный номер')
      continue
    }

    if (isServiceRow(identNumber)) {
      serviceRows.push(line)
      continue
    }

    if (isMangledNumber(identNumber)) {
      skip(
        line,
        `Номер «${identNumber}» записан научной записью — так Excel показывает длинное число. ` +
          'Исходные цифры по нему не восстановить: задайте колонке номера текстовый формат ' +
          'и выгрузите файл заново',
        identNumber,
      )
      continue
    }

    if (repeated.has(identNumber.trim())) {
      skip(
        line,
        `Номер встречается в файле ${repeated.get(identNumber.trim())} раза. В наборе «Животные» ` +
          'строка описывает животное целиком, поэтому какая из них верна — не определить. ' +
          'Если это выгрузка по лактациям, оставьте по строке на животное, а лактации загрузите ' +
          'набором «Контрольные дойки»',
        identNumber,
      )
      continue
    }

    /*
     * Пол: непонятое значение больше не растворяется в умолчании.
     *
     * Умолчание осталось прежним — женский: большинство файлов о коровах
     * и колонки «Пол» не имеют вовсе, и требовать её значило бы отвергать
     * половину настоящих выгрузок. Но раньше «бычок» и «1» давали то же
     * самое молча, и файл с быками заводил стадо коров. Теперь ячейка,
     * которую разобрать не вышло, попадает в протокол приёмки поимённо.
     */
    const sex = parseSex(get('sex'))
    if (sex.problem) note(line, 'Пол', sex.problem, identNumber)

    const data: Record<string, unknown> = {
      identNumber,
      owner: orgId,
      author: user.id,
      sex: sex.value ?? 'female',
    }

    for (const col of cols) {
      if (col.key === 'identNumber' || col.key === 'sex') continue
      const raw = get(col.key)
      if (raw === undefined || raw === '') continue

      switch (col.kind) {
        case 'number': {
          const n = parseNumber(raw)
          if (n.problem) note(line, col.title, n.problem, identNumber)
          assign(data, col.key, n.value)
          break
        }
        case 'date': {
          const dt = parseDate(raw)
          if (dt.problem) note(line, col.title, dt.problem, identNumber)
          assign(data, col.key, dt.value)
          break
        }
        case 'dictionary': {
          const id = dictionaries.get(col.collection ?? '')?.get(norm(raw))
          if (id) assign(data, col.key, id)
          /*
           * Неразобранный ключ реестра называется ключом, а не «породой
           * такой-то». Строка «порода «1bd6b3f1-648a-…»» в протоколе
           * приёмки читается как опечатка в названии, тогда как чинится
           * она совсем иначе — сверкой справочников, а не правкой файла.
           *
           * Название колонки берётся из неё самой: писать «порода» там,
           * где разбирается масть, — верный способ отправить человека
           * чинить не то.
           */
          else if (/^[0-9a-f-]{36}$/i.test(raw.trim())) {
            unresolved.add(
              `${col.title.toLowerCase()} по ключу ФГИАС «${raw}» — проставьте его сверкой справочников`,
            )
          } else unresolved.add(`${col.title.toLowerCase()} «${raw}»`)
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
    valueIssues,
    valueProblems,
    serviceRows,
  }
}

/* ------------------------------------------------------------------ */
/*  События: отёлы, осеменения, дойки                                  */
/* ------------------------------------------------------------------ */

/**
 * Выставки: строки дописываются в массив карточки, а не создают записи.
 *
 * ## Почему отдельный разбор
 *
 * Отёлы, осеменения и дойки — свои коллекции, и `importEvents` создаёт
 * в них строки. Выставки живут массивом внутри животного (решение №264:
 * их читают только в карточке, и коллекция дала бы вторую таблицу
 * и правила доступа ради данных, которые всегда запрашиваются вместе
 * с животным).
 *
 * Разница видна только здесь: вместо `create` нужен `update`, дописывающий
 * в массив. Для человека и для распознавания шапки это такой же файл
 * про события, как остальные.
 *
 * ## Повторная загрузка не задваивает
 *
 * Ключ повтора — животное, дата и название. Хозяйство перезаливает файл
 * чаще, чем кажется: поправило одну строку и отправило целиком. Без
 * ключа второй заход удвоил бы все выставки, и заметить это можно было бы
 * только в карточке глазами.
 *
 * Сравнение по приведённому названию (регистр, пробелы, «ё»), потому что
 * «Агроферма-2026» и «АГРОФЕРМА 2026» — одно мероприятие. Это тот же
 * довод, по которому справочника мероприятий у нас нет.
 *
 * ## Запись по животному, а не по строке
 *
 * Строки группируются по животному, и на каждое идёт один `update`.
 * Иначе корова с тремя выставками означала бы три чтения и три записи
 * одного и того же массива, причём вторая запись перетирала бы первую:
 * массив пишется целиком.
 */
async function importShows(
  payload: Awaited<ReturnType<typeof getClient>>,
  user: Actor,
  orgId: number,
  ds: Dataset,
  rows: Row[],
  header: string[],
) {
  const body = rows.slice(1)

  const wanted = new Set<string>()
  for (const row of body) {
    const v = readerFor(header, row)('animal')
    if (v) wanted.add(identKey(v))
  }

  /*
   * Свои животные — одним запросом на весь файл. Чужие не ищутся вовсе:
   * выставку чужому животному дописать нельзя, и строка отклоняется
   * с той же причиной, что у прочих событий.
   */
  let mine: AnimalIndex = { byIdent: new Map(), byUuid: new Map(), byBaseUuid: new Map() }
  const showsOf = new Map<number, unknown[]>()
  if (wanted.size) {
    const { docs } = await payload.find({
      collection: 'animals',
      where: { owner: { equals: orgId } },
      limit: 20_000,
      depth: 0,
      overrideAccess: true,
    })
    mine = indexAnimals(docs as never)
    /*
     * Уже записанные выставки нужны для проверки на повтор, и берутся
     * они тем же запросом: второй заход в базу за тем же стадом стоил бы
     * ровно столько же, сколько первый.
     */
    for (const a of docs) showsOf.set(a.id as number, Array.isArray(a.shows) ? a.shows : [])
  }

  /** Ключ повтора: дата плюс приведённое название. */
  const showKey = (date: unknown, title: unknown) =>
    `${String(date ?? '').slice(0, 10)}|${String(title ?? '')
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')}`

  const issues: { row: number; ident?: string; reason: string }[] = []
  const perAnimal = new Map<number, { add: Record<string, unknown>[]; had: unknown[] }>()
  let skipped = 0

  body.forEach((row, i) => {
    const line = i + 2
    const get = readerFor(header, row)

    const ident = get('animal')
    if (!ident) {
      skipped += 1
      issues.push({ row: line, reason: 'не указан номер животного' })
      return
    }

    const animal = findAnimal(mine, ident)
    if (!animal) {
      skipped += 1
      issues.push({ row: line, ident, reason: 'животного нет в вашем стаде' })
      return
    }

    const date = parseDate(get('date'))
    if (!date.value) {
      skipped += 1
      issues.push({ row: line, ident, reason: date.problem ?? 'не разобрана дата мероприятия' })
      return
    }

    const title = (get('title') ?? '').trim()
    if (!title) {
      skipped += 1
      issues.push({ row: line, ident, reason: 'не указано название мероприятия' })
      return
    }

    const bucket = perAnimal.get(animal.id) ?? { add: [], had: showsOf.get(animal.id) ?? [] }

    const key = showKey(date.value, title)
    const already =
      bucket.had.some(
        (s) => showKey((s as Record<string, unknown>).date, (s as Record<string, unknown>).title) === key,
      ) || bucket.add.some((s) => showKey(s.date, s.title) === key)

    if (already) {
      skipped += 1
      issues.push({ row: line, ident, reason: 'такая выставка уже записана' })
      return
    }

    bucket.add.push({
      date: date.value,
      title,
      place: (get('place') ?? '').trim() || undefined,
      awards: (get('awards') ?? '').trim() || undefined,
      prize: (get('prize') ?? '').trim() || undefined,
    })
    perAnimal.set(animal.id, bucket)
  })

  let created = 0
  const touched: number[] = []

  for (const [animalId, bucket] of perAnimal) {
    if (bucket.add.length === 0) continue
    try {
      await payload.update({
        collection: 'animals',
        id: animalId,
        overrideAccess: false,
        user,
        /*
         * Журнал правок пропускается: файл на сотню выставок дал бы
         * сотню записей о правке массива и утопил бы в них те несколько,
         * что внесены руками. След у загрузки свой — пакет данных
         * с исходником.
         */
        context: { skipJournal: true },
        data: { shows: [...bucket.had, ...bucket.add] } as never,
      })
      created += bucket.add.length
      touched.push(animalId)
    } catch (e) {
      skipped += bucket.add.length
      issues.push({
        row: 0,
        reason: `не удалось записать выставки животного: ${e instanceof Error ? e.message : e}`,
      })
    }
  }

  /*
   * Состав ответа повторяет `importEvents` до поля: он собирается
   * в одном месте выше по потоку, и набор, отдающий меньше остальных,
   * пришлось бы обкладывать проверками на каждом обращении.
   *
   * Пустые списки здесь — правда о выставках, а не заглушки. Служебных
   * строк («итого», «зоотехник») в таком файле не бывает: строка без
   * номера животного отклоняется раньше. Знака Ассоциации выставки
   * не снимают: они ничего не утверждают о самом животном, только
   * о том, где оно побывало.
   */
  return {
    created,
    updated: 0,
    skipped,
    dataset: ds.label,
    issues,
    touched,
    unresolved: [] as string[],
    identMatches: [] as IdentMatch[],
    unverified: [] as { ident: string; fields: string[] }[],
    valueIssues: [] as { row: number; ident?: string; columnTitle: string; reason: string }[],
    valueProblems: 0,
    serviceRows: [] as number[],
  }
}

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

  /*
   * Стадо индексируется по трём ключам сразу: индивидуальному номеру,
   * нашему ключу учётной системы и базовому номеру реестра. Какой
   * из трёх стоит в файле, решает сам файл — в шаблонах ФГИАС
   * индивидуального номера нет вовсе.
   *
   * Фильтр `wanted` здесь убран: он экономил память на карте, но требовал
   * знать вид ключа до чтения строк. Стадо и так читается целиком
   * одним запросом, и три карты на нём стоят миллисекунды.
   */
  let mine: AnimalIndex = { byIdent: new Map(), byUuid: new Map(), byBaseUuid: new Map() }
  if (wanted.size) {
    const { docs } = await payload.find({
      collection: 'animals',
      where: { owner: { equals: orgId } },
      limit: 20_000,
      depth: 0,
      overrideAccess: true,
    })
    mine = indexAnimals(docs as never)
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
    const ids = indexedIds(mine)
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

  /*
   * Соответствие набора и коллекции. Взвешивания добавлены сюда, а
   * не отдельной веткой разбора: по форме это то же событие, что дойка, —
   * животное, дата, число, — и общий путь избавляет от второй копии
   * правил про своих животных, дубли и пакет загрузки.
   */
  const collection =
    ds.key === 'calvings'
      ? 'calvings'
      : ds.key === 'inseminations'
        ? 'inseminations'
        : ds.key === 'weighings'
          ? 'weighings'
          : 'milk-tests'

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
  /*
   * `extra` принимает и число, и строку: у доек это удой, у взвешиваний
   * признак. Различитель тут по смыслу один — «что ещё отличает две
   * записи одного дня», — и заводить под него два ключа значило бы
   * развести один вопрос на две дороги.
   */
  const keyOf = (animalId: number, iso: string, extra?: number | string | null) =>
    `${animalId}|${dayOf(iso)}${extra === null || extra === undefined ? '' : `|${extra}`}`

  const existingIds = indexedIds(mine)
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

  /*
   * Заголовок колонки даты берётся из набора, а не пишется словом:
   * у отёлов это «Дата отёла», у доек «Дата замера», и сообщение,
   * называющее чужую колонку, отправляет человека править не то место.
   */
  const dateTitle = cols.find((c) => c.key === 'date')?.title ?? 'Дата'

  /* То же, что у животных: непонятая ячейка — не непринятая строка. */
  const valueIssues: { row: number; ident?: string; columnTitle: string; reason: string }[] = []
  let valueProblems = 0
  const note = (line: number, columnTitle: string, reason: string, ident?: string) => {
    valueProblems++
    if (valueIssues.length < 50) valueIssues.push({ row: line, ident, columnTitle, reason })
  }

  for (const [i, row] of body.entries()) {
    const line = i + 2
    const get = readerFor(header, row)

    const rawIdent = get('animal')
    if (!rawIdent) {
      skip(line, 'Не указан номер животного')
      continue
    }

    const animal = findAnimal(mine, rawIdent)
    if (!animal) {
      skip(line, 'Животного с таким номером нет в вашем стаде', rawIdent)
      continue
    }

    /*
     * Дата события обязательна, поэтому её причина уходит в `issues`,
     * а не в заметки: строка без даты не принимается, и человек должен
     * увидеть её среди непринятых. Прежнее «дата не заполнена или
     * не разобрана» соединяло два разных случая в один и не говорило,
     * какой из них случился, — а починить их надо по-разному.
     */
    const parsedDate = parseDate(get('date'))
    if (!parsedDate.value) {
      skip(
        line,
        parsedDate.problem ? `${dateTitle}: ${parsedDate.problem}` : `${dateTitle} не заполнена`,
        rawIdent,
      )
      continue
    }
    const date = parsedDate.value
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

      if (col.kind === 'number' || col.kind === 'date') {
        const p = col.kind === 'number' ? parseNumber(raw) : parseDate(raw)
        if (p.problem) note(line, col.title, p.problem, rawIdent)
        assign(data, col.key, p.value)
        continue
      }

      assign(data, col.key, raw)
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

    /*
     * Ключ дубля. У доек к паре «животное + день» добавляется удой:
     * за сутки доят несколько раз, и два замера в один день — норма.
     *
     * У взвешиваний добавляется признак: одно животное в один день
     * взвешивают дважды с разной привязкой — «при продаже» и «на возраст»
     * могут совпасть по дате, и считать их дублем значило бы потерять
     * одну из двух записей, которых реестр ждёт обеих.
     */
    const key = keyOf(
      animal.id,
      date,
      ds.key === 'milkTests'
        ? ((data.dailyYield as number | undefined) ?? null)
        : ds.key === 'weighings'
          ? ((data.sign as string | undefined) ?? null)
          : null,
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
    valueIssues,
    valueProblems,
    /*
     * У набора событий служебных строк не бывает по построению: строка
     * без номера животного отклоняется раньше, а «Итого» номером
     * животного быть не может. Пустой список стоит здесь затем же,
     * зачем и пустой `identMatches`, — чтобы обе ветви загрузки
     * возвращали одинаковую форму.
     */
    serviceRows: [] as number[],
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

  /*
   * Вид данных берётся из формы, только если человек его назвал сам.
   * Обычно он этого не делает — набор определяется по шапке ниже,
   * когда файл уже прочитан. Раньше выбор стоял первым полем формы
   * и был обязательным, и ошибались в нём чаще, чем в самом файле.
   */
  const chosen = String(formData.get('kind') || '')
  const picked = chosen ? datasetByKey(chosen) : undefined
  if (chosen && !picked) return { error: 'Неизвестный вид данных' }

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

  /*
   * Набор здесь ещё неизвестен — его определяют по шапке, а шапку
   * из нечитаемого файла не взять. Поэтому отказ без названия набора:
   * подставить сюда «Животные» значило бы сказать, что мы пытались
   * прочесть файл животных, чего мы не знаем.
   */
  if ('error' in read) return { error: read.error, dataset: picked?.label }

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

  /*
   * Набор определяется по шапке — и только если человек не назвал его сам.
   * Названный человеком выбор старше распознавания: он видел файл,
   * а мы видели заголовки.
   */
  const guess = picked ? null : detectDataset((read.rows[0] ?? []).map((h) => String(h ?? '')))

  if (guess && guess.kind === 'unclear') {
    /*
     * Отказ, а не выбор наугад. Ошибиться молча здесь означало бы завести
     * отёлы животными; поэтому система признаётся, что не поняла,
     * и показывает выбор — тот самый, что убран из формы за ненадобностью
     * в остальных случаях.
     */
    const near = guess.candidates
      .map((c) => `«${c.dataset.label}» (${c.matched} колонок)`)
      .join(', ')
    return {
      error: near
        ? `Не удалось определить, что в файле: подходят и ${near}. Выберите вид данных сами.`
        : 'Не удалось определить, что в файле: ни один набор колонок не узнан. ' +
          'Проверьте, что шапка стоит первой строкой, и выберите вид данных сами.',
      needsKind: true,
      unknownColumns: (read.rows[0] ?? []).map((h) => String(h ?? '')).filter(Boolean).slice(0, 20),
      sheet,
      encoding,
    }
  }

  const ds = picked ?? (guess && guess.kind === 'sure' ? guess.dataset : undefined)
  if (!ds) return { error: 'Неизвестный вид данных' }

  /*
   * Определённый набор называется в ответе. Не «для порядка»: человек
   * больше ничего не выбирал, и если система поняла файл иначе, чем он,
   * узнать об этом надо здесь, а не через месяц по недостающим карточкам.
   */
  const detected = guess && guess.kind === 'sure' ? ds.label : undefined

  const parsed = readTable(read.rows, ds)
  if ('error' in parsed) {
    return {
      error: parsed.error,
      unknownColumns: parsed.unknownColumns,
      fgiasTemplate: parsed.fgiasTemplate,
      dataset: ds.label,
      detected,
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
      : ds.key === 'shows'
        ? await importShows(payload, actor, orgId, ds, parsed.rows, parsed.header)
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
          valueIssues: res.valueIssues,
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
    detected,
    created: res.created,
    updated: res.updated,
    skipped: res.skipped,
    submissionId,
    submissionNumber,
    issues: res.issues,
    unknownColumns: parsed.unknownColumns,
    fgiasTemplate: parsed.fgiasTemplate,
    unresolved: res.unresolved,
    identMatches: res.identMatches,
    unverified: res.unverified,
    valueIssues: res.valueIssues,
    valueProblems: res.valueProblems,
    serviceRows: res.serviceRows,
    sheet,
    encoding,
  }
}
