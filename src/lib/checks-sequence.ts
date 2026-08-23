import type { Payload } from 'payload'
import type { Animal } from '@/payload-types'
import { VOLUNTARY_WAIT_DAYS, type CheckLimits, type Issue } from '@/lib/checks-registry'

/**
 * Проверки, которые смотрят на события во времени.
 *
 * ## Что здесь ловится и почему этого не видно глазами
 *
 * Каждое значение по отдельности правдоподобно. Невозможен только их
 * порядок: осеменение через десять дней после отёла, дойка за месяц
 * до первого отёла, бык, родившийся позже осеменения, которым его
 * записали. Человек читает таблицу построчно, а ошибка живёт **между**
 * строками — и потому не находится вниманием, сколько его ни прикладывай.
 *
 * ## Дубли — долг, который мы сами создали
 *
 * Массовая загрузка отёлов, осеменений и доек появилась недавно,
 * и заслона от повторной заливки того же файла в ней сначала не было.
 * Заслон теперь стоит в самом импорте, но он спасает только от точного
 * повтора: две выгрузки с пересекающимися периодами, собранные по-разному,
 * пройдут мимо него. Эта проверка — второй рубеж.
 *
 * Цена дубля высокая и незаметная: средние по животному считаются
 * по удвоенным данным, а нумерация отёлов уходит вперёд и тянет
 * за собой возраст первого отёла.
 *
 * ## Потолки
 *
 * Контрольных доек у стада десятки тысяч, и выбрать их все ради проверки
 * порядка нельзя. Потолок есть, и он не молчаливый.
 */

const CALVING_CAP_PER_ANIMAL = 12
const INSEMINATION_CAP_PER_ANIMAL = 20
const MILK_TEST_CAP = 20_000
const DAY = 86_400_000

const idOf = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'id' in v) return (v as { id: number }).id
  return null
}

const time = (d?: string | null): number | null => {
  if (!d) return null
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? null : t
}

const asDate = (d?: string | null | number): string => {
  if (d === null || d === undefined) return '—'
  const t = new Date(d)
  return Number.isNaN(t.getTime())
    ? String(d)
    : t.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** День без времени: события сравниваются по дате, а не по часам. */
const dayKey = (d: string): string => String(d).slice(0, 10)

/** Первое повторяющееся значение в списке, если оно есть. */
const firstRepeat = (keys: string[]): { key: string; times: number } | null => {
  const count = new Map<string, number>()
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1)
  for (const [key, times] of count) if (times > 1) return { key, times }
  return null
}

type CalvingRow = {
  animal: number
  date: string
  number: number | null
  result?: string | null
  dryOffDate?: string | null
  calves: number[]
}

type InseminationRow = {
  animal: number
  date: string
  bull: number | null
  pregnancyCheckDate?: string | null
}

export async function sequenceIssues(
  payload: Payload,
  animals: Animal[],
): Promise<{ issues: Issue[]; limits: CheckLimits }> {
  const out: Issue[] = []
  const limits: CheckLimits = []
  if (!animals.length) return { issues: out, limits }

  const byId = new Map(animals.map((a) => [a.id as number, a]))
  const ids = [...byId.keys()]

  const push = (
    animalId: number,
    code: Issue['code'],
    text: string,
    field?: string,
    severity: Issue['severity'] = 'fix',
  ) => {
    const a = byId.get(animalId)
    if (!a) return
    out.push({ code, animalId, ident: a.identNumber, field, severity, text })
  }

  /* ----------------------------- Выборки ----------------------------- */

  const calvingLimit = ids.length * CALVING_CAP_PER_ANIMAL
  const inseminationLimit = ids.length * INSEMINATION_CAP_PER_ANIMAL

  const [calvingRes, inseminationRes, milkRes] = await Promise.all([
    payload
      .find({
        collection: 'calvings',
        where: { animal: { in: ids } },
        limit: calvingLimit,
        sort: 'date',
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null),
    payload
      .find({
        collection: 'inseminations',
        where: { animal: { in: ids } },
        limit: inseminationLimit,
        sort: 'date',
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null),
    payload
      .find({
        collection: 'milk-tests',
        where: { animal: { in: ids } },
        limit: MILK_TEST_CAP,
        sort: 'date',
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null),
  ])

  if (calvingRes && calvingRes.totalDocs > calvingLimit) {
    limits.push(`Отёлы просмотрены частично: ${calvingLimit} записей из ${calvingRes.totalDocs}.`)
  }
  if (inseminationRes && inseminationRes.totalDocs > inseminationLimit) {
    limits.push(
      `Осеменения просмотрены частично: ${inseminationLimit} записей из ${inseminationRes.totalDocs}.`,
    )
  }
  if (milkRes && milkRes.totalDocs > MILK_TEST_CAP) {
    limits.push(
      `Контрольные дойки просмотрены частично: ${MILK_TEST_CAP} записей из ${milkRes.totalDocs}. ` +
        'Порядок доек проверен не у всех животных.',
    )
  }

  const calvings = new Map<number, CalvingRow[]>()
  for (const c of calvingRes?.docs ?? []) {
    const aid = idOf(c.animal)
    if (!aid || !c.date) continue
    const calves = Array.isArray(c.calves)
      ? c.calves.map(idOf).filter((x): x is number => x !== null)
      : []
    calvings.set(aid, [
      ...(calvings.get(aid) ?? []),
      {
        animal: aid,
        date: c.date,
        number: typeof c.number === 'number' ? c.number : null,
        result: c.result,
        dryOffDate: c.dryOffDate,
        calves,
      },
    ])
  }

  const inseminations = new Map<number, InseminationRow[]>()
  for (const i of inseminationRes?.docs ?? []) {
    const aid = idOf(i.animal)
    if (!aid || !i.date) continue
    inseminations.set(aid, [
      ...(inseminations.get(aid) ?? []),
      {
        animal: aid,
        date: i.date,
        bull: idOf(i.bull),
        pregnancyCheckDate: i.pregnancyCheckDate,
      },
    ])
  }

  const milkDates = new Map<number, string[]>()
  for (const m of milkRes?.docs ?? []) {
    const aid = idOf(m.animal)
    if (!aid || !m.date) continue
    milkDates.set(aid, [...(milkDates.get(aid) ?? []), m.date])
  }

  /* ------------- Быки и телята: догружаются одним запросом ------------- */

  const bullIds = [
    ...new Set(
      [...inseminations.values()].flatMap((list) =>
        list.map((i) => i.bull).filter((x): x is number => x !== null),
      ),
    ),
  ]
  const calfIds = [
    ...new Set([...calvings.values()].flatMap((list) => list.flatMap((c) => c.calves))),
  ]

  const [bullRes, calfRes] = await Promise.all([
    bullIds.length
      ? payload
          .find({
            collection: 'animals',
            where: { id: { in: bullIds } },
            limit: bullIds.length,
            depth: 0,
            overrideAccess: true,
          })
          .catch(() => null)
      : Promise.resolve(null),
    calfIds.length
      ? payload
          .find({
            collection: 'animals',
            where: { id: { in: calfIds } },
            limit: calfIds.length,
            depth: 0,
            overrideAccess: true,
          })
          .catch(() => null)
      : Promise.resolve(null),
  ])

  const bulls = new Map(
    (bullRes?.docs ?? []).map((b) => [
      b.id as number,
      { ident: b.identNumber, born: time(b.birthDate) },
    ]),
  )
  const calves = new Map(
    (calfRes?.docs ?? []).map((c) => [
      c.id as number,
      { ident: c.identNumber, born: c.birthDate },
    ]),
  )

  /* ============================ Проверки ============================= */

  for (const animalId of ids) {
    const cs = (calvings.get(animalId) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
    const is = (inseminations.get(animalId) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
    const ms = (milkDates.get(animalId) ?? []).slice().sort()

    /* --------------------------- Дубли --------------------------- */

    for (const [rows, label, field] of [
      [cs.map((c) => dayKey(c.date)), 'отёла', 'calvings'],
      [is.map((i) => dayKey(i.date)), 'осеменения', 'inseminations'],
      [ms.map(dayKey), 'контрольной дойки', 'milkTests'],
    ] as const) {
      const repeat = firstRepeat([...rows])
      if (repeat) {
        push(
          animalId,
          'duplicate-event',
          `Две записи ${label} на ${asDate(repeat.key)}${repeat.times > 2 ? ` (всего ${repeat.times})` : ''} — вероятно, файл загружен дважды. Пока дубль не убран, средние по животному считаются по удвоенным данным`,
          field,
        )
      }
    }

    /* ------------- Осеменение слишком рано после отёла ------------- */

    for (const ins of is) {
      const insAt = time(ins.date)
      if (insAt === null) continue

      /*
       * Ищется ближайший предшествующий отёл, а не любой: между отёлом
       * и следующим отёлом осеменений бывает несколько, и мерить надо
       * от того, после которого корова восстанавливалась.
       */
      let prev: CalvingRow | null = null
      for (const c of cs) {
        const cAt = time(c.date)
        if (cAt !== null && cAt <= insAt) prev = c
      }
      if (!prev) continue

      const days = Math.round((insAt - time(prev.date)!) / DAY)
      if (days < VOLUNTARY_WAIT_DAYS) {
        push(
          animalId,
          'insemination-too-soon',
          `Осеменение ${asDate(ins.date)} — через ${days} дн. после отёла ${asDate(prev.date)}. Раньше ${VOLUNTARY_WAIT_DAYS} дней осеменять физически не в чем: ошибка в одной из дат`,
          'inseminations',
        )
        break
      }
    }

    /* ---------------- Тест на стельность раньше осеменения --------- */

    for (const ins of is) {
      const check = time(ins.pregnancyCheckDate)
      const insAt = time(ins.date)
      if (check === null || insAt === null) continue
      if (check < insAt) {
        push(
          animalId,
          'pregnancy-check-before-insemination',
          `Тест на стельность ${asDate(ins.pregnancyCheckDate)} стоит раньше самого осеменения ${asDate(ins.date)}`,
          'inseminations',
        )
        break
      }
    }

    /* --------------- Бык родился позже осеменения ------------------ */

    for (const ins of is) {
      if (!ins.bull) continue
      const bull = bulls.get(ins.bull)
      const insAt = time(ins.date)
      if (!bull || bull.born === null || insAt === null) continue
      if (bull.born > insAt) {
        push(
          animalId,
          'bull-born-later',
          `Бык № ${bull.ident} родился ${asDate(bull.born)} — позже осеменения ${asDate(ins.date)}, которым он записан. Связь установлена не с тем животным`,
          'inseminations',
        )
        break
      }
    }

    /* ------------------- Приплод и результат отёла ------------------ */

    for (const c of cs) {
      const linked = c.calves.map((id) => calves.get(id)).filter(Boolean) as {
        ident: string
        born?: string | null
      }[]

      if (linked.length) {
        const off = linked.find((calf) => calf.born && dayKey(calf.born) !== dayKey(c.date))
        if (off) {
          push(
            animalId,
            'calf-birth-vs-calving',
            `Телёнок № ${off.ident} записан приплодом отёла ${asDate(c.date)}, но его дата рождения — ${asDate(off.born)}`,
            'calvings',
            'note',
          )
        }
      }

      /*
       * Пустой приплод — не расхождение, а отсутствие данных: телят
       * часто не заводят карточками вовсе. Проверка молчит там, где
       * сравнивать не с чем.
       */
      if (c.result === 'twins' && linked.length > 0 && linked.length !== 2) {
        push(
          animalId,
          'twins-mismatch',
          `Отёл ${asDate(c.date)} отмечен двойней, а в приплоде ${linked.length === 1 ? 'один телёнок' : `${linked.length} телят`}`,
          'calvings',
          'note',
        )
      }
    }

    /* --------------------- Дойка вне лактации ---------------------- */

    if (ms.length && cs.length) {
      const firstCalving = time(cs[0]!.date)

      const before = firstCalving === null ? [] : ms.filter((d) => (time(d) ?? 0) < firstCalving)
      if (before.length) {
        push(
          animalId,
          'milk-test-outside-lactation',
          `${before.length === 1 ? 'Контрольная дойка' : `Контрольных доек: ${before.length}`} записан${before.length === 1 ? 'а' : 'о'} раньше первого отёла ${asDate(cs[0]!.date)} — доить до отёла нечего`,
          'milkTests',
          'note',
        )
      }

      /*
       * После запуска — только если запуск был последним событием.
       * У коровы, отелившейся снова, «после запуска» означает новую
       * лактацию, а не нарушение.
       */
      const last = cs[cs.length - 1]!
      const dry = time(last.dryOffDate)
      const lastCalving = time(last.date)

      if (dry !== null && lastCalving !== null && dry > lastCalving) {
        const after = ms.filter((d) => (time(d) ?? 0) > dry)
        if (after.length) {
          push(
            animalId,
            'milk-test-outside-lactation',
            `${after.length === 1 ? 'Контрольная дойка' : `Контрольных доек: ${after.length}`} записан${after.length === 1 ? 'а' : 'о'} после запуска ${asDate(last.dryOffDate)}`,
            'milkTests',
            'note',
          )
        }
      }
    }
  }

  return { issues: out, limits }
}
