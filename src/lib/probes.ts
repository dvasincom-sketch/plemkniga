import type { Payload } from 'payload'
import { runDoctor } from '@/lib/doctor'
import { herdDrilldown } from '@/lib/herd-drilldown'
import { herdConditions } from '@/lib/herd-condition'
import { herdSignals } from '@/lib/herd-signals'
import { biggestHerd } from '@/lib/biggest-herd'
import { compareBounds } from '@/lib/bounds-check'
import { numOf, poolOf } from '@/lib/sql'
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
 * Часть проверок **пишет в базу**: заводит организации, животных,
 * приглашения и потом удаляет. Ночной прогон на боевой книге означал бы,
 * что каждую ночь в ней появляются и исчезают записи, а обрыв посреди
 * прогона оставлял бы мусор, неотличимый от настоящих данных. Такие
 * остаются скриптами и гоняются руками на копии.
 *
 * Другие требуют живого HTTP-сервера и ходят по страницам снаружи —
 * им место в ночном действии, а не внутри самого сервера: проверяющий,
 * живущий внутри проверяемого, не заметит, что проверяемый не отвечает.
 *
 * Сколько тех и других, считает сам реестр (`CHECK_WRITES`,
 * `CHECK_SERVER`): написанные здесь словами, эти числа отставали втрое.
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
    /*
     * Пропуск называется вслух. Раньше пара с пустой стороной молча
     * не сверялась, и проба отвечала «списки сходятся», не сверив
     * ни одной пары: на свежей или показательной книге отчёты возвращают
     * пустоту, и сверять там нечего — но сказать об этом обязан прогон,
     * а не догадаться человек.
     */
    if (reported === null) {
      notes.push(`${name} — нет данных, не сверялось`)
      return
    }
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
 *          Числа Ассоциации против чисел самого хозяйства              *
 * ------------------------------------------------------------------ */

/**
 * Одно стадо, посчитанное двумя путями.
 *
 * Кабинет хозяйства считает свои сигналы четырьмя запросами по одному
 * владельцу; кабинет Ассоциации — одним запросом с группировкой по всем.
 * Условия у них общие (`sql-herd.ts`), но запросы разной формы, и форма
 * умеет соврать там, где правило верно: `left join` по владельцу
 * без животных даёт `null` вместо нуля, `distinct on` в подзапросе берёт
 * последний замер по другому порядку, `count(*) filter` считает строки
 * соединения вместо коров.
 *
 * Цена расхождения не в числах, а в разговоре: Ассоциация звонит
 * про передержку у двенадцати тёлок, хозяйство открывает свой кабинет
 * и видит восемь. После такого не верят уже ничему в системе.
 */
export async function conditionConsistency(
  payload: Payload,
  organizationId: number,
): Promise<{ findings: string[]; notes: string[] }> {
  const findings: string[] = []
  const notes: string[] = []

  const all = await herdConditions(payload)
  const mine = all.get(organizationId)

  if (!mine) {
    return { findings: [`хозяйства #${organizationId} нет в сводке по всем`], notes }
  }

  const [heifers, trend, cull, udder] = await Promise.all([
    heiferAges(payload, organizationId),
    geneticTrend(payload, organizationId),
    culling(payload, organizationId),
    udderHealth(payload, organizationId),
  ])

  const agree = (name: string, own: number | null | undefined, joint: number) => {
    if (own === null || own === undefined) {
      notes.push(`${name} — нет данных, не сверялось`)
      return
    }
    if (own !== joint) {
      findings.push(`${name}: у хозяйства ${own}, у Ассоциации ${joint}`)
      return
    }
    notes.push(`${name} — ${joint}`)
  }

  agree('Тёлок всего', heifers?.total, mine.heifers?.total ?? 0)
  agree('Тёлок пора осеменять', heifers?.ready, mine.heifers?.ready ?? 0)
  agree('Тёлок в передержке', heifers?.overdue, mine.heifers?.overdue ?? 0)
  agree('С посчитанным инбридингом', trend?.withInbreeding, mine.trend?.withInbreeding ?? 0)
  agree('Инбридинг выше порога', trend?.aboveThreshold, mine.trend?.aboveThreshold ?? 0)
  agree('Коров с замером соматики', udder?.measured, mine.udder?.measured ?? 0)
  agree('Соматика выше порога', udder?.above, mine.udder?.above ?? 0)
  agree('Выбыло за год', cull?.total, mine.cull?.total ?? 0)
  agree('Первотёлок выбыло', cull?.firstLactation, mine.cull?.firstLactation ?? 0)

  /*
   * Сами подписи сигналов тоже обязаны совпасть, а не только числа
   * под ними: собирает их один и тот же `herdSignals`, и если он вдруг
   * получит с двух сторон разное — например, пустую базу вместо
   * известной, — числа сойдутся, а сообщения разойдутся.
   */
  const ownSignals = herdSignals({ heifers, trend, udder, cull })
  const jointSignals = herdSignals(mine)
  const line = (s: { key: string; count: number }[]) =>
    s.map((x) => `${x.key}:${x.count}`).join(' ')

  if (line(ownSignals) !== line(jointSignals)) {
    findings.push(`сигналы разошлись: «${line(ownSignals)}» против «${line(jointSignals)}»`)
  } else {
    notes.push(`Сигналов совпало: ${ownSignals.length}`)
  }

  return { findings, notes }
}

/* ------------------------------------------------------------------ *
 *                              Сами пробы                             *
 * ------------------------------------------------------------------ */

type Probe = (payload: Payload) => Promise<{ findings: string[]; notes: string[] }>

/**
 * Отчёты по стаду — списком, а не перечислением в двух местах.
 *
 * Шапка этого файла обещает, что расчёт у пробы и у скрипта один
 * на двоих. Для разбора и для сводки Ассоциации так и было, а вот
 * семь отчётов по стаду перечислялись дважды: здесь и в
 * `check-herd-analytics.ts`. Отчёт, добавленный в одно место, во второе
 * не попадал, и два прогона под одним именем отвечали на разные вопросы.
 *
 * Скрипт печатает по каждому отчёту свои подробности и потому зовёт их
 * сам; но список — общий, и скрипт сверяет, что покрыл его целиком.
 */
export const HERD_REPORTS: {
  name: string
  run: (payload: Payload, orgId: number) => Promise<unknown>
}[] = [
  { name: 'Структура по лактациям', run: (p, o) => lactationStructure(p, o) },
  { name: 'Ремонтный молодняк', run: (p, o) => heiferAges(p, o) },
  { name: 'Генетический тренд', run: (p, o) => geneticTrend(p, o) },
  { name: 'Выбытие за год', run: (p, o) => culling(p, o) },
  { name: 'Воспроизводство', run: (p, o) => reproduction(p, o) },
  { name: 'Здоровье вымени', run: (p, o) => udderHealth(p, o) },
  { name: 'Удой по группам', run: (p, o) => milkByLactation(p, o) },
]

const PROBES: Record<string, Probe> = {
  /* --------------------------- Осмотр базы --------------------------- */
  doctor: async () => {
    const checks = await runDoctor()
    return {
      findings: checks.filter((c) => !c.ok).map((c) => c.title),
      notes: checks.filter((c) => c.ok).map((c) => c.title),
    }
  },

  /*
   * Выбытие без даты выбытия.
   *
   * Проба считает то же, что и прогон, но короче: сколько выбывших
   * животных не попадает ни в один отчёт о выбытии и у скольких из них
   * дата уже лежит рядом — в перемещении или в событии ленты. Подробности
   * (поимённый список, разбивка по хозяйствам, верхняя оценка настоящей
   * доли) остаются за `npm run check:disposal-date`: ночному прогону
   * нужен ответ «сколько», а не разбор.
   *
   * Признак `probe` у этой проверки в реестре стоял, а самой пробы
   * не было: ночной прогон каждую ночь находил «такой пробы нет» —
   * то есть красил строку по причине, к данным отношения не имеющей.
   * Связаны признак и реализация только именем, и теперь их сверяет
   * `check:registry`.
   */
  'check:disposal-date': async (payload) => {
    const pool = poolOf(payload)
    if (!pool) return { findings: ['прямой доступ к базе недоступен'], notes: [] }

    const res = await pool.query(
      `select
         count(*) filter (where a.state is not null and a.state <> 'alive'
                            and a.disposal_date is null)::int as dateless,
         count(*) filter (where a.state is not null and a.state <> 'alive'
                            and a.disposal_date is null
                            and least(
                              (select min(m."date") from movements m
                                where m.animal_id = a.id and m.kind in ('cull', 'death')),
                              (select min(e."date") from events e
                                where e.animal_id = a.id and e.type = 'disposal')
                            ) is not null)::int as recoverable
       from animals a`,
    )

    const row = (res.rows?.[0] ?? {}) as { dateless?: unknown; recoverable?: unknown }
    const dateless = numOf(row.dateless)
    const recoverable = numOf(row.recoverable)

    if (dateless === 0) return { findings: [], notes: ['у всех выбывших проставлена дата выбытия'] }

    return {
      findings: [
        `выбытие без даты у ${dateless} животных: в отчёты о выбытии они не попадают` +
          (recoverable > 0
            ? `; у ${recoverable} дата уже есть рядом — переносит npm run fix:disposal-date`
            : ''),
      ],
      notes: [],
    }
  },

  /*
   * Отложенные следствия записи.
   *
   * Проба открывает свою транзакцию и закрывает её, ничего в базу
   * не записав: откладывается присвоение переменной. Проверяется
   * устройство, а не данные, — потому и в ночном прогоне.
   */
  'check:after-commit': async (payload) => {
    const { runAfterCommitProbe } = await import('@/lib/after-commit-probe')
    return runAfterCommitProbe(payload)
  },

  /*
   * Границы формы и границы базы.
   *
   * Проба чисто счётная — ни одного запроса, — и потому в ночной прогон
   * попадает даром. Расхождение здесь означает не «данные плохи»,
   * а «человеку вместо понятного отказа покажут имя ограничения»,
   * и узнавать об этом надо до того, как он его увидит.
   */
  'check:bounds': async (payload) => {
    const { ok, bad, ranged } = compareBounds(payload)
    if (!ranged) return { findings: ['ни одного правила с границами — сверять нечего'], notes: [] }
    return { findings: bad, notes: ok }
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

  /* --------- Сводка Ассоциации сходится с кабинетом хозяйства --------- */
  'check:condition': async (payload) => {
    const orgId = await biggestHerd(payload)
    if (!orgId) return { findings: ['в книге нет животных с хозяйством'], notes: [] }
    return conditionConsistency(payload, orgId)
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
