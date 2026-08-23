'use server'

import { revalidatePath } from 'next/cache'
import { getClient, getCurrentUser } from '@/lib/payload'
import { parseCsv } from '@/lib/csv'
import { columnsOf, datasetByKey, headerMapOf, type Dataset } from '@/lib/import-format'
import { IDENT_FIELD_LABEL, IDENT_VALUES_SQL, identCore } from '@/lib/animal-id'

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

const sexOf = (v?: string) => {
  const s = (v || '').trim().toLowerCase()
  if (['ж', 'f', 'female', 'женский'].includes(s)) return 'female'
  if (['м', 'm', 'male', 'мужской'].includes(s)) return 'male'
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

type SqlPool = {
  query: (q: string, p?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>
}

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
 * Разбор файла и заголовка — общая часть всех наборов.
 *
 * Неизвестные колонки не отбрасываются молча: они собираются
 * и возвращаются человеку. «Файл принят» при потерянной колонке — это
 * ложь, из-за которой данные считаются загруженными, а их нет.
 */
function readFile(text: string, ds: Dataset) {
  const rows = parseCsv(text)
  if (rows.length < 2)
    return { error: 'В файле нет строк с данными' as const, unknownColumns: [] as string[] }

  const map = headerMapOf(ds)
  const rawHeader = rows[0].map((h) => h.trim())
  const header = rawHeader.map((h) => map[norm(h)] ?? '')
  const unknownColumns = rawHeader.filter((h, i) => h !== '' && header[i] === '')

  const required = columnsOf(ds).filter((c) => c.required)
  const missing = required.filter((c) => !header.includes(c.key))

  if (missing.length) {
    return {
      error: `В файле не найдены обязательные колонки: ${missing
        .map((c) => `«${c.title}»`)
        .join(', ')}. Скачайте шаблон, чтобы свериться`,
      unknownColumns,
    }
  }

  return { rows, header, unknownColumns }
}

/* ------------------------------------------------------------------ */
/*  Животные                                                           */
/* ------------------------------------------------------------------ */

async function importAnimals(
  payload: Awaited<ReturnType<typeof getClient>>,
  user: { id: number },
  orgId: number,
  ds: Dataset,
  rows: Row[],
  header: string[],
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
        await payload.update({
          collection: 'animals',
          id: doc.id,
          data: data as never,
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
       * поэтому показываем их как есть, а не подменяем общей фразой.
       */
      const message = e instanceof Error ? e.message : String(e)
      skip(line, message.slice(0, 200) || 'Запись не сохранилась', identNumber)
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
  user: { id: number },
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
      const message = e instanceof Error ? e.message : String(e)
      skip(line, message.slice(0, 200) || 'Запись не сохранилась', rawIdent)
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
    unresolved: [] as string[],
    identMatches: [] as IdentMatch[],
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

  const parsed = readFile(await file.text(), ds)
  if ('error' in parsed) {
    return { error: parsed.error, unknownColumns: parsed.unknownColumns, dataset: ds.label }
  }

  const payload = await getClient()
  const actor = { id: user.id as number }

  const res =
    ds.key === 'animals'
      ? await importAnimals(payload, actor, orgId, ds, parsed.rows, parsed.header)
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
      data: { alt: `Файл импорта ${file.name}` },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        name: file.name,
        mimetype: file.type || 'text/csv',
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
  }
}
