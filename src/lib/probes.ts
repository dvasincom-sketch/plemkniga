import type { Payload } from 'payload'
import { runDoctor } from '@/lib/doctor'
import { herdDrilldown } from '@/lib/herd-drilldown'
import { poolOf } from '@/lib/sql'
import {
  culling,
  geneticTrend,
  heiferAges,
  lactationStructure,
  milkByLactation,
  reproduction,
  udderHealth,
} from '@/lib/herd-analytics'

/**
 * Пробы — проверки, которые умеет прогнать само приложение.
 *
 * ## Зачем они отдельно от скриптов
 *
 * Скрипт печатает в терминал и выходит с кодом. Этого хватает человеку
 * за клавиатурой и не хватает ночному прогону: печать нельзя сохранить,
 * показать на странице и сравнить с прошлым разом.
 *
 * Проба — тот же расчёт, но возвращающий структуру. Расчёт при этом один
 * на двоих: и `npm run check:drilldown`, и ручка прогона зовут отсюда.
 * Две реализации одной проверки разошлись бы, и разошлись бы молча —
 * страница показывала бы зелёное там, где терминал говорит красное.
 *
 * ## Почему не все проверки стали пробами
 *
 * Половина проверок **пишет в базу**: заводит организации, животных,
 * приглашения и потом удаляет. Ночной прогон на боевой книге означал бы,
 * что каждую ночь в ней появляются и исчезают записи, а обрыв посреди
 * прогона оставлял бы мусор, неотличимый от настоящих данных. Такие
 * остаются скриптами и гоняются руками на копии.
 *
 * Ещё три требуют живого HTTP-сервера и ходят по страницам снаружи —
 * им место в ночном действии, а не внутри самого сервера: проверяющий,
 * живущий внутри проверяемого, не заметит, что проверяемый не отвечает.
 *
 * Полный перечень с признаками — `check-registry.ts`.
 */

export type ProbeResult = {
  /** Совпадает с кодом в реестре проверок. */
  code: string
  ok: boolean
  /** Что именно не сошлось. У удачной пробы пусто. */
  findings: string[]
  /** Числа, которые полезны и при удаче: по ним видно, что проверено не пусто. */
  notes: string[]
  ms: number
}

/* ------------------------------------------------------------------ *
 *                     Сходимость списков с числами                    *
 * ------------------------------------------------------------------ */

/**
 * Число в отчёте против длины списка за ним.
 *
 * Условия в `herd-drilldown.ts` списаны с `herd-analytics.ts` вручную,
 * и разойтись они могут от одного лишнего `and archived is not true`,
 * добавленного из лучших побуждений. Расхождение дороже ошибки: ошибку
 * видно, а «двенадцать» в отчёте против одиннадцати строк в списке
 * выглядит правдоподобно с обеих сторон, и человек перестаёт верить
 * обоим сразу.
 *
 * Два случая раньше расходились «законно», и оговорка стояла здесь же:
 * «коров без отёлов» отчёт считал по всем самкам, а список — по одним
 * коровам; «лактаций в ходу» отчёт считал строками, список — коровами.
 * Оговорка и была ошибкой: она объясняла расхождение вместо того, чтобы
 * его убрать, и человеку на экране об этом не говорилось ни слова.
 * Оба свелись (решение №205), и оба проверяются наравне с остальными.
 */
export async function drilldownConsistency(
  payload: Payload,
  organizationId: number,
): Promise<{ findings: string[]; notes: string[] }> {
  const findings: string[] = []
  const notes: string[] = []

  const total = async (code: string): Promise<number | null> => {
    const d = await herdDrilldown(payload, organizationId, code)
    return d ? d.total : null
  }

  const agree = async (name: string, reported: number | null, code: string) => {
    if (reported === null) return
    const drilled = await total(code)
    if (drilled === null) {
      findings.push(`${name}: список не собрался`)
      return
    }
    if (reported !== drilled) {
      findings.push(`${name}: отчёт ${reported}, список ${drilled}`)
      return
    }
    notes.push(`${name} — ${reported}`)
  }

  const heifers = await heiferAges(payload, organizationId)
  if (heifers) {
    await agree('Тёлки до 13 мес.', heifers.young, 'heifers-young')
    await agree('Тёлки 13–15 мес.', heifers.ready, 'heifers-ready')
    await agree('Тёлки в передержке', heifers.overdue, 'heifers-overdue')
  }

  const trend = await geneticTrend(payload, organizationId)
  if (trend) await agree('Инбридинг выше порога', trend.aboveThreshold, 'inbreeding-above')

  const udder = await udderHealth(payload, organizationId)
  if (udder) await agree('Соматика выше порога', udder.above, 'scc-above')

  const cull = await culling(payload, organizationId)
  if (cull) {
    await agree('Выбыло за год', cull.total, 'culled-year')
    await agree('Первотёлок выбыло за год', cull.firstLactation, 'culled-first')
  }

  const structure = await lactationStructure(payload, organizationId)
  if (structure) {
    for (const row of structure.byLactation) {
      await agree(row.label, row.cows, `lactation-${row.lactation}`)
    }
    await agree('Коровы без отёлов', structure.withoutCalvings, 'no-calvings')
  }

  const milk = await milkByLactation(payload, organizationId)
  if (milk) await agree('Коровы с незакрытой лактацией', milk.inProgress, 'milk-in-progress')

  /*
   * Неизвестный код обязан отклоняться. Проверка не про опечатки в адресе,
   * а про то, что список не собирается «по умолчанию»: правило, отдающее
   * что-нибудь на незнакомый запрос, однажды отдаст не то.
   */
  const nonsense = await herdDrilldown(payload, organizationId, 'нет-такого-кода')
  if (nonsense !== null) findings.push('Неизвестный код вернул список вместо отказа')

  return { findings, notes }
}

/* ------------------------------------------------------------------ *
 *                              Сами пробы                             *
 * ------------------------------------------------------------------ */

/**
 * Хозяйство с наибольшим стадом.
 *
 * Подпись обещала это и раньше, а код брал владельца самого свежего
 * животного — `sort: '-createdAt', limit: 1`. Разница не косметическая:
 * последним заведённым легко оказывается хозяйство с одной записью,
 * и тогда сходимость сверяет нули с нулями. Проверка проходит, потому
 * что проверять нечего, и зелёный цвет означает не «сошлось»,
 * а «не смотрели».
 *
 * Считается запросом с группировкой: перебирать записи через Payload
 * ради одного числа на хозяйство — сотни тысяч документов в памяти
 * ради `max(count)`.
 */
export async function biggestHerd(payload: Payload): Promise<number | null> {
  const pool = poolOf(payload)
  if (!pool) return null

  const { rows } = await pool.query(
    `select owner_id
       from animals
      where owner_id is not null and archived is not true
      group by owner_id
      order by count(*) desc
      limit 1`,
  )

  const id = (rows ?? [])[0]?.owner_id
  return typeof id === 'number' ? id : id != null ? Number(id) : null
}

type Probe = (payload: Payload) => Promise<{ findings: string[]; notes: string[] }>

const PROBES: Record<string, Probe> = {
  /* --------------------------- Осмотр базы --------------------------- */
  doctor: async () => {
    const checks = await runDoctor()
    return {
      findings: checks.filter((c) => !c.ok).map((c) => c.title),
      notes: checks.filter((c) => c.ok).map((c) => c.title),
    }
  },

  /* ---------------------- Отчёты по стаду считаются ------------------- */
  /*
   * Проверяется не «числа верные» — правильных чисел проба не знает, —
   * а «запрос выполняется и возвращает то, что обещает тип». Этого хватает
   * ровно для той ошибки, которая случалась: колонка названа не так,
   * как написано по памяти, и `tsc` этого не ловит.
   */
  'check:herd': async (payload) => {
    const orgId = await biggestHerd(payload)
    if (!orgId) return { findings: ['в книге нет животных с хозяйством'], notes: [] }

    const findings: string[] = []
    const notes: string[] = []

    const run = async (name: string, fn: () => Promise<unknown>) => {
      try {
        const res = await fn()
        if (res === null) findings.push(`${name}: расчёт вернул пустоту`)
        else notes.push(name)
      } catch (e) {
        findings.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    await run('Структура по лактациям', () => lactationStructure(payload, orgId))
    await run('Ремонтный молодняк', () => heiferAges(payload, orgId))
    await run('Генетический тренд', () => geneticTrend(payload, orgId))
    await run('Выбытие за год', () => culling(payload, orgId))
    await run('Воспроизводство', () => reproduction(payload, orgId))
    await run('Здоровье вымени', () => udderHealth(payload, orgId))
    await run('Удой по группам', () => milkByLactation(payload, orgId))

    return { findings, notes }
  },

  /* ------------------- Списки сходятся с числами ---------------------- */
  'check:drilldown': async (payload) => {
    const orgId = await biggestHerd(payload)
    if (!orgId) return { findings: ['в книге нет животных с хозяйством'], notes: [] }
    return drilldownConsistency(payload, orgId)
  },

  /* --------------------- Присмотр за пулом ---------------------------- */
  /*
   * Проба смотрит на живой процесс и ничего с ним не делает. Скрипт
   * `check:pool` вдобавок изображает двадцать пересборок `next dev` —
   * это вопрос к разработке, а не к боевому серверу, и трогать
   * работающий пул ради него не нужно.
   *
   * Слушателей обязано быть ровно по одному. Ни одного — обрыв соединения
   * становится `uncaughtException` и убивает процесс; больше одного —
   * каждый обрыв пишет в лог столько же одинаковых строк, а Node с
   * одиннадцатого начинает ругаться.
   */
  'check:pool': async (payload) => {
    const pool = (payload as unknown as { db?: { pool?: { listenerCount?: (e: string) => number } } })
      ?.db?.pool

    if (!pool || typeof pool.listenerCount !== 'function') {
      return { findings: ['пул недоступен — проверять нечего'], notes: [] }
    }

    const findings: string[] = []
    const notes: string[] = []

    for (const [event, what] of [
      ['error', 'обрыв простаивающего соединения'],
      ['acquire', 'выдачу соединения'],
    ] as const) {
      const n = pool.listenerCount(event)
      if (n === 1) notes.push(`${what} слушает один`)
      else findings.push(`${what} слушают ${n}, а должен один`)
    }

    return { findings, notes }
  },
}

export const PROBE_CODES = Object.keys(PROBES)

export async function runProbe(payload: Payload, code: string): Promise<ProbeResult> {
  const probe = PROBES[code]
  const started = Date.now()

  if (!probe) {
    return { code, ok: false, findings: ['такой пробы нет'], notes: [], ms: 0 }
  }

  /*
   * Упавшая проба — это находка, а не поломка прогона. Иначе одна
   * не поднявшаяся проверка уносила бы с собой результаты всех
   * остальных, и ночью выяснить, что именно сломалось, было бы нечем.
   */
  try {
    const { findings, notes } = await probe(payload)
    return { code, ok: findings.length === 0, findings, notes, ms: Date.now() - started }
  } catch (e) {
    return {
      code,
      ok: false,
      findings: [`проба не отработала: ${e instanceof Error ? e.message : String(e)}`],
      notes: [],
      ms: Date.now() - started,
    }
  }
}

/** Все пробы подряд. Последовательно: параллельный прогон соревнуется за пул. */
export async function runAllProbes(payload: Payload): Promise<ProbeResult[]> {
  const out: ProbeResult[] = []
  for (const code of PROBE_CODES) out.push(await runProbe(payload, code))
  return out
}
