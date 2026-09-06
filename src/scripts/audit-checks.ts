import 'dotenv/config'
import { getPayload, type Payload, type Where } from 'payload'
import config from '@payload-config'
import type { Animal } from '@/payload-types'
import { checkAnimals, type CheckCoverage } from '@/lib/data-checks'
import { analyzeAncestry } from '@/lib/ancestry'
import { herdIssues } from '@/lib/checks-herd'
import { farmStats } from '@/lib/farm-stats'
import { ALL_CHECKS, CHECKS, checkSpec, guardedChecks, type CheckCode } from '@/lib/checks-registry'
import { trustLabel } from '@/lib/dictionaries'
import { poolOf } from '@/lib/sql'

/**
 * Ревизия автоматических проверок на настоящих данных.
 *
 * ## Зачем это отдельным скриптом
 *
 * Правил в реестре десятки, и почти все написаны без единого запуска: правило
 * читается глазами, компилируется и выглядит верным. Компиляция здесь
 * не доказывает ничего. `percentile_cont` над `numeric`, остаток от деления
 * денежного типа, `extract` без указания зоны — каждое такое место падает
 * или молча врёт по-своему, и tsc об этом не знает.
 *
 * Второй вопрос дороже первого: пороги. Пять процентов на «первое января»,
 * четверть на круглые удои, втрое от медианы стада — числа взяты из головы.
 * Проверка, срабатывающая на половине книги, бесполезна ровно так же,
 * как не срабатывающая никогда: и то и другое эксперт перестаёт читать
 * после третьего пакета. Понять, какая из двух бед случилась, можно
 * единственным способом — прогнать по настоящим данным и посмотреть доли.
 *
 * ## Что скрипт делает и чего не делает
 *
 * Только читает. Ни одной записи не создаёт, не меняет и не удаляет —
 * его не страшно запускать на боевой базе.
 *
 * Печатает три вещи:
 *
 *  1. упавшие запросы — с текстом ошибки PostgreSQL целиком, а не оговоркой,
 *     которую видит хозяйство;
 *  2. сколько находок дала каждая проверка и какую долю разобранных записей
 *     она задела;
 *  3. отдельно — проверки, не сработавшие ни разу, и проверки, сработавшие
 *     слишком часто. Первые не проверены, вторые подозрительны порогом.
 *
 * ## Как читать «ни разу не сработала»
 *
 * Это **не** значит «проверка сломана», и скрипт такого не утверждает.
 * Значит только, что данных, на которых её видно, в базе нет — и что о её
 * работоспособности мы по-прежнему ничего не знаем. Различить два случая
 * машина не может.
 *
 * Для этого заведён стенд: `npm run seed:flaws` создаёт хозяйство,
 * в котором на каждое правило приходится своя нарочно испорченная группа
 * записей. Прогон по нему (`--org=<номер стенда>`) отвечает на вопрос
 * «работает ли правило вообще», а прогон по книге — на вопрос «не врёт ли
 * порог». Смешивать их нельзя: брак, подсыпанный в общую книгу, сделал бы
 * доли выдуманными нами же.
 *
 * ## Разбор одной записи
 *
 * `--animal=<номер>` прогоняет все правила по единственной карточке
 * и печатает вдобавок разбор её родословной: заявленный коэффициент
 * инбридинга против посчитанного, глубину и общих предков с вкладами.
 *
 * Нужно это ровно для одного — подтвердить сам расчёт. В общем прогоне
 * инбридинг сверяется у пятидесяти записей, и попадёт ли в них та самая,
 * у которой коэффициент известен заранее, — вопрос удачи. Здесь удачи
 * не требуется.
 *
 *   npm run audit:checks                        # 300 записей, все хозяйства
 *   npm run audit:checks -- --limit=1000        # больше записей в разбор
 *   npm run audit:checks -- --all               # вся книга, без выборки
 *   npm run audit:checks -- --org=12            # одно хозяйство
 *   npm run audit:checks -- --quiet             # без списка примеров
 *   npm run audit:checks -- --animal=RU1234567  # одна карточка и её родословная
 */

/** Сколько записей идёт в разбор по умолчанию. */
const DEFAULT_LIMIT = 300

/** Выше этой доли разобранных записей проверка считается шумной. */
const NOISY_SHARE = 0.2

/**
 * Меньше этого числа проверенных записей доля не считается вовсе.
 *
 * На контрольном хозяйстве `inbreeding-mismatch` сверила две записи
 * и нашла две находки — сто процентов, и отчёт потребовал разобраться
 * с порогом. Разбираться там не с чем: обе записи для того и заведены.
 *
 * Доля от двух — не доля, а пересказ числителя. То же правило уже
 * применено к проверкам по стаду (`HERD_THRESHOLDS.minHerd`), и здесь
 * оно нужно ровно по той же причине.
 */
const NOISY_MIN = 20

/** Сколько хозяйств смотрим по стаду, если не указано одно. */
const ORG_CAP = 25

/** Сколько примеров текста показываем под шумной проверкой. */
const SAMPLES = 2

const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

const has = (name: string) => process.argv.includes(`--${name}`)

const num = (v: string | null, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length))
const padL = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s)

const pct = (part: number, total: number): string =>
  total ? `${((part / total) * 100).toFixed(1)} %` : '—'

const describeError = (e: unknown): string => {
  if (e instanceof Error) {
    const detail = (e as { detail?: string }).detail
    const hint = (e as { hint?: string }).hint
    const code = (e as { code?: string }).code
    return [e.message, code ? `код ${code}` : null, detail, hint].filter(Boolean).join(' · ')
  }
  return String(e)
}

const nameOf = (v: unknown): string =>
  v && typeof v === 'object' && 'name' in v ? String((v as { name?: string }).name ?? '—') : '—'

type Tally = { count: number; animals: Set<number>; samples: string[] }

const bump = (map: Map<string, Tally>, code: string, animalId: number | null, text: string) => {
  const t = map.get(code) ?? { count: 0, animals: new Set<number>(), samples: [] }
  t.count += 1
  if (animalId !== null) t.animals.add(animalId)
  if (t.samples.length < SAMPLES) t.samples.push(text)
  map.set(code, t)
}

/**
 * Происхождение самой записи: чья, какого уровня достоверности, кто
 * и когда её менял.
 *
 * ## Зачем это в ревизии проверок
 *
 * Разбор одной карточки до сих пор отвечал на вопрос «что не так
 * с данными». Оказалось, что в половине случаев нужен другой вопрос:
 * **откуда эти данные взялись**. Расхождение заявленного инбридинга
 * с посчитанным читается совершенно по-разному, если знать, менял ли
 * кто-нибудь запись после того, как её завели, и не переписал ли её
 * загруженный файл.
 *
 * Без этого блока пришлось бы гадать по косвенным признакам — а гадание,
 * выданное за установленную причину, здесь уже случалось однажды и стоило
 * дороже, чем стоил бы запрос.
 *
 * ## Почему журнал и пакеты вместе, а не по отдельности
 *
 * Они дополняют друг друга ровно в том месте, где каждый по отдельности
 * молчит. Ручная правка идёт в журнал правок; загрузка файлом в журнал
 * **не идёт** — она помечена `skipJournal`, и след от неё один: пакет
 * загрузки, в списке которого стоит эта запись. Пустой журнал сам по себе
 * не означает «запись не трогали»: он означает «руками не трогали».
 */
async function cardFacts(payload: Payload, animal: Animal) {
  const ownerId = typeof animal.owner === 'object' ? animal.owner?.id : animal.owner

  const [org, revisions, submissions] = await Promise.all([
    ownerId
      ? payload
          .findByID({ collection: 'organizations', id: ownerId, depth: 0, overrideAccess: true })
          .catch(() => null)
      : Promise.resolve(null),
    payload
      .find({
        collection: 'animal-revisions',
        where: { animal: { equals: animal.id } },
        sort: '-at',
        limit: 5,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null),
    payload
      .find({
        collection: 'data-submissions',
        where: { animals: { in: [animal.id] } },
        sort: '-submittedAt',
        limit: 5,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null),
  ])

  const when = (v: unknown): string =>
    v ? new Date(String(v)).toLocaleString('ru-RU', { timeZone: 'UTC' }) : '—'

  console.log('  КАРТОЧКА')
  console.log('')
  console.log(`    владелец               ${org ? `${org.name} (№ ${ownerId})` : `№ ${ownerId ?? '—'}`}`)
  console.log(
    `    достоверность          ${trustLabel(animal.trustLevel)} (${animal.trustLevel ?? 0})`,
  )
  console.log(`    заведена               ${when(animal.createdAt)}`)
  console.log(`    изменена               ${when(animal.updatedAt)}`)

  /*
   * Уровень 3 назван отдельной строкой, а не оставлен в общем списке.
   * «Верифицировано ассоциацией» — единственный уровень, который что-то
   * обещает наружу, и вопрос «пережил ли знак перезапись данных под ним»
   * должен читаться с первого взгляда, а не вычисляться из числа.
   */
  if ((animal.trustLevel ?? 0) >= 3) {
    console.log('')
    console.log('    На записи стоит знак Ассоциации. Всё, что ниже, — про то,')
    console.log('    менялись ли данные после того, как знак был поставлен.')
  }

  console.log('')
  if (!revisions) {
    console.log('    Журнал правок прочитать не удалось.')
  } else if (!revisions.docs.length) {
    console.log('    Правок руками не записано. Это не значит «не меняли»:')
    console.log('    загрузка файлом в журнал не идёт — её след ниже, в пакетах.')
  } else {
    console.log(`    Последние правки руками (всего ${revisions.totalDocs}):`)
    for (const r of revisions.docs) {
      console.log(
        `      ${pad(when((r as { at?: unknown }).at), 20)} ` +
          `${pad(String((r as { label?: unknown }).label ?? (r as { path?: unknown }).path ?? '—'), 28)} ` +
          `${String((r as { before?: unknown }).before ?? '—')} → ${String((r as { after?: unknown }).after ?? '—')}`,
      )
    }
  }

  console.log('')
  if (!submissions) {
    console.log('    Пакеты загрузки прочитать не удалось.')
  } else if (!submissions.docs.length) {
    console.log('    Ни в один пакет загрузки запись не входила: файлом её не трогали.')
  } else {
    console.log(`    Пакеты загрузки, в которые запись входила (всего ${submissions.totalDocs}):`)
    for (const s of submissions.docs) {
      const d = s as { number?: unknown; kind?: unknown; status?: unknown; submittedAt?: unknown }
      console.log(
        `      ${pad(when(d.submittedAt), 20)} ` +
          `${pad(`№ ${String(d.number ?? '—')}`, 16)} ` +
          `${String(d.kind ?? '—')}, ${String(d.status ?? '—')}`,
      )
    }
  }

  console.log('')
}

/**
 * Разбор одной карточки: все правила плюс родословная с числами.
 *
 * Потолок инбридинга здесь не срабатывает — записей всё равно одна,
 * а пятьдесят это больше одной. Именно поэтому проверка расчёта делается
 * так, а не общим прогоном: в общем она сверяет пятьдесят записей
 * из полутора сотен, и попадёт ли туда нужная — вопрос удачи.
 */
async function auditOne(payload: Payload, ident: string) {
  const found = await payload.find({
    collection: 'animals',
    where: { identNumber: { equals: ident } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const animal = found.docs[0] as Animal | undefined
  if (!animal) {
    console.log(`\nЖивотного с номером «${ident}» в книге нет.\n`)
    process.exitCode = 1
    return
  }

  const { issues, limits } = await checkAnimals(payload, [animal])

  console.log('')
  console.log(`РАЗБОР ОДНОЙ ЗАПИСИ: № ${animal.identNumber}${animal.name ? ` «${animal.name}»` : ''}`)
  console.log('')

  await cardFacts(payload, animal)

  if (!issues.length) {
    console.log('  Замечаний нет.')
  } else {
    for (const i of issues) {
      console.log(`  [${i.severity === 'fix' ? 'исправить' : 'на усмотрение'}] ${i.code}`)
      console.log(`    ${i.text}`)
    }
  }

  for (const l of limits) console.log(`  · ${l}`)

  /* --------------------------- Родословная --------------------------- */

  const stated = typeof animal.inbreeding === 'number' ? animal.inbreeding : null

  const report = await analyzeAncestry(payload, animal).catch((e: unknown) => {
    console.log(`\n  Родословную разобрать не удалось: ${describeError(e)}\n`)
    return null
  })

  if (!report) return

  console.log('')
  console.log('  РОДОСЛОВНАЯ')
  console.log('')
  console.log(`    заявленный инбридинг   ${stated === null ? 'не указан' : `${stated} %`}`)
  console.log(`    посчитанный            ${report.coi} %`)
  console.log(`    глубина                ${report.deepest} колен из ${report.depth}`)
  console.log(`    различных предков      ${report.totalDistinct}`)

  const shared = report.ancestors.filter((a) => a.onBothSides)
  if (shared.length) {
    console.log('')
    console.log('    Общие предки — те, из-за кого коэффициент вообще не ноль:')
    for (const a of shared) {
      console.log(
        `      ${pad(`${a.identNumber}${a.name ? ` «${a.name}»` : ''}`, 32)}` +
          `${padL(`${a.coiContribution} %`, 10)}   путей ${a.occurrences}`,
      )
    }
  } else {
    console.log('')
    console.log('    Общих предков нет — коэффициент равен нулю по построению,')
    console.log('    а не потому, что расчёт чего-то не нашёл.')
  }

  /*
   * Главный вывод скрипта в этом режиме. Ноль, посчитанный на родословной
   * без общих предков, ничего не доказывает: так же выглядел бы расчёт,
   * всегда возвращающий ноль. Подтверждает расчёт только совпадение
   * с величиной, известной заранее.
   */
  console.log('')
  if (stated === null) {
    console.log('    Сверять не с чем: коэффициент в карточке не заполнен.')
  } else if (Math.abs(report.coi - stated) <= 0.1) {
    console.log(`    Сошлось: ${report.coi} % против заявленных ${stated} %.`)
    if (report.coi === 0) {
      console.log('    Но ноль против нуля — слабое подтверждение: расчёт, всегда')
      console.log('    возвращающий ноль, выглядел бы так же. Нужна запись')
      console.log('    с заранее известным ненулевым коэффициентом.')
    } else {
      console.log('    Обход родословной сошёлся с величиной, посчитанной вне кода.')
    }
  } else {
    console.log(`    РАСХОЖДЕНИЕ: посчитано ${report.coi} %, заявлено ${stated} %.`)
    console.log('    Если заявленное число посчитано руками по этой же родословной,')
    console.log('    ошибка в расчёте. Если взято из чужой книги — в исходных данных.')
  }
  console.log('')
}

async function main() {
  /*
   * `--all` берёт книгу целиком.
   *
   * Заведён после того, как ревизия объявила `age-group-vs-sex`
   * несработавшей — «данных, на которых её видно, в базе нет». Данные
   * были: восемь животных мужского пола с коровьей группой. Просто
   * выборка в триста записей из без малого двух тысяч их не захватила,
   * а ожидание при такой доле — одна находка, и ноль не отличить
   * от поломки.
   *
   * Правило с настоящей частотой ниже процента неотличимо от сломанного
   * на любой выборке, и лечится это не хитростью, а полным проходом.
   * По записям он идёт секунды: две с половиной на триста записей,
   * то есть меньше двадцати на всю книгу.
   */
  const limit = has('all') ? Number.MAX_SAFE_INTEGER : num(arg('limit'), DEFAULT_LIMIT)
  const onlyOrg = arg('org') ? Number(arg('org')) : null
  const quiet = has('quiet')

  const payload = await getPayload({ config })

  const one = arg('animal')
  if (one) {
    await auditOne(payload, one)
    return
  }

  /*
   * Ошибки запросов собираются, а не печатаются на месте: иначе они лягут
   * посреди таблицы и потеряются. Это единственное, ради чего скрипт
   * вообще существует, и место у них — первое.
   */
  const failures: { where: string; error: string }[] = []

  /* ------------------------- Проверки по стаду ------------------------- */

  const stats = await farmStats(payload)
  const withAnimals = [...stats.values()].filter(
    (s) => s.animals > 0 && (onlyOrg === null || s.organizationId === onlyOrg),
  )
  const orgTotal = withAnimals.length
  const orgIds = withAnimals
    .sort((a, b) => b.animals - a.animals)
    .slice(0, onlyOrg === null ? ORG_CAP : 1)
    .map((s) => s.organizationId)

  const orgs = orgIds.length
    ? await payload
        .find({
          collection: 'organizations',
          where: { id: { in: orgIds } },
          limit: orgIds.length,
          depth: 0,
          overrideAccess: true,
        })
        .then((r) => new Map(r.docs.map((o) => [o.id as number, nameOf(o)])))
        .catch(() => new Map<number, string>())
    : new Map<number, string>()

  const herdTally = new Map<string, Tally>()
  const herdLimits = new Set<string>()
  const perOrg: { id: number; name: string; scanned: number; found: number }[] = []

  const herdStart = Date.now()

  for (const id of orgIds) {
    const res = await herdIssues(payload, id, {
      onQueryError: (label, e) =>
        failures.push({ where: `стадо ${id} · ${label}`, error: describeError(e) }),
    })

    // Во втором поле `Tally` здесь лежат хозяйства, а не животные:
    // у находки по стаду животного нет, а считать надо, скольких хозяйств
    // она касается.
    for (const i of res.issues) bump(herdTally, i.code, id, i.text)
    for (const l of res.limits) herdLimits.add(l)

    perOrg.push({
      id,
      name: orgs.get(id) ?? `#${id}`,
      scanned: res.scanned,
      found: res.issues.length,
    })
  }

  const herdMs = Date.now() - herdStart

  /* ------------------------ Проверки по записям ------------------------ */

  /*
   * Выборка устойчивая и по всей книге — а не первые триста по номеру.
   *
   * Стояло `sort: 'identNumber'` с пределом в триста, и довод под этим
   * был верный: случайная выборка давала бы каждый раз другой ответ,
   * и «проверка перестала срабатывать» нельзя было бы отличить
   * от «в этот раз не попались такие записи».
   *
   * Но устойчивость была куплена ценой представительности. Синтетика
   * заводится с приставкой `99`, живые записи начинаются с `30` и `36` —
   * и триста первых по номеру это всегда одни и те же семьсот старых
   * записей ручного сида. Ревизия печатала «записей в разборе 300
   * из 280 708», а смотрела на одну тысячную книги, всегда на одну
   * и ту же, и выводы делала оттуда же: «сработали больше чем
   * на 20 % разобранных» — на двухстах записях, заведённых руками
   * два года назад.
   *
   * Поймалось это на правке сида: `state-vs-disposal` («выбыло,
   * а причина не указана») продолжала показывать 49 % после того, как
   * причина стала проставляться всем выбывшим. Причину проставили
   * в синтетике, а ревизия синтетику не видела ни разу.
   *
   * Устойчивость сохраняется другим способом: порядок задаёт хеш
   * от идентификатора. Он не меняется от прогона к прогону, но и не
   * связан ни с номером, ни с возрастом записи, — выборка ложится
   * на всю книгу и повторяется в точности, пока книга та же.
   */
  const pool = poolOf(payload)
  if (!pool) {
    console.log('\nПрямой доступ к базе недоступен — ревизия по записям не проводится\n')
    process.exit(1)
  }

  const picked = await pool.query(
    `select id from animals
      ${onlyOrg === null ? '' : 'where owner_id = $2'}
      order by md5(id::text)
      limit $1`,
    onlyOrg === null ? [limit] : [limit, onlyOrg],
  )
  const pickedIds = (picked.rows ?? []).map((r) => Number((r as { id: unknown }).id))

  /* Размер книги — знаменатель для строки «записей в разборе». */
  const sizeRow = await pool.query(
    `select count(*)::int as n from animals
      ${onlyOrg === null ? '' : 'where owner_id = $1'}`,
    onlyOrg === null ? [] : [onlyOrg],
  )
  const bookSize = Number((sizeRow.rows?.[0] as { n?: unknown })?.n ?? 0)

  /*
   * Тип указан явно. Вытащенный в переменную объект-условие TypeScript
   * расширяет до объединения с `?: undefined`, а это нарушает индексную
   * подпись `Where` — ошибка вылезает не здесь, а в `payload.find`,
   * и читается как ошибка вызова.
   */
  const where: Where = { id: { in: pickedIds } }

  const found = pickedIds.length
    ? await payload.find({
        collection: 'animals',
        where,
        limit,
        depth: 0,
        overrideAccess: true,
      })
    : { docs: [] }

  const animals = found.docs as Animal[]

  const animalStart = Date.now()
  const { issues, limits, coverage } = animals.length
    ? await checkAnimals(payload, animals)
    : { issues: [], limits: [] as string[], coverage: [] as CheckCoverage[] }
  const animalMs = Date.now() - animalStart

  const animalTally = new Map<string, Tally>()
  for (const i of issues) bump(animalTally, i.code, i.animalId, `${i.ident}: ${i.text}`)

  /*
   * Знаменатель у проверки с потолком — не весь набор.
   *
   * `inbreeding-mismatch` смотрит пятьдесят записей из ста шестидесяти
   * девяти. Тридцать девять её находок — это тринадцать процентов набора
   * и семьдесят восемь процентов проверенного. Первое число успокаивает,
   * второе требует разбираться сегодня, и печатать надо второе.
   */
  const looked = new Map(coverage.map((c) => [c.code as string, c]))
  const denomOf = (code: string) => looked.get(code)?.looked ?? animals.length
  const capped = (code: string) => looked.has(code)

  /* ------------------------------ Отчёт ------------------------------- */

  console.log('')
  console.log('РЕВИЗИЯ АВТОМАТИЧЕСКИХ ПРОВЕРОК')
  console.log('')
  /*
     Знаменатель — вся книга, а не то, что попало в выборку: иначе
     строка читалась бы как «разобрали всё».
  */
  console.log(`  записей в разборе   ${animals.length} из ${bookSize} (по всей книге)`)
  console.log(`  хозяйств по стаду   ${orgIds.length}`)
  console.log(`  время               по записям ${animalMs} мс, по стаду ${herdMs} мс`)
  console.log('')

  if (failures.length) {
    console.log('УПАВШИЕ ЗАПРОСЫ')
    console.log('')
    for (const f of failures) {
      console.log(`  ${f.where}`)
      console.log(`    ${f.error}`)
    }
    console.log('')
    console.log('  Это ошибка в самом SQL, а не в данных. Пока запрос падает,')
    console.log('  проверка не выполняется вовсе, а на экране выглядит как «чисто».')
    console.log('')
  }

  console.log('ПО ЗАПИСЯМ')
  console.log('')
  console.log(
    `  ${pad('код', 38)}${pad('группа', 15)}${padL('находок', 9)}${padL('записей', 9)}${padL('из', 7)}${padL('доля', 9)}`,
  )
  console.log(`  ${'─'.repeat(87)}`)

  const animalChecks = CHECKS.filter((c) => c.group !== 'herd')
  const sortedAnimal = [...animalChecks].sort(
    (a, b) => (animalTally.get(b.code)?.count ?? 0) - (animalTally.get(a.code)?.count ?? 0),
  )

  for (const spec of sortedAnimal) {
    const t = animalTally.get(spec.code)
    const denom = denomOf(spec.code)
    console.log(
      `  ${pad(spec.code, 38)}${pad(spec.group, 15)}${padL(String(t?.count ?? 0), 9)}` +
        `${padL(String(t?.animals.size ?? 0), 9)}${padL(String(denom) + (capped(spec.code) ? '*' : ''), 7)}` +
        `${padL(pct(t?.animals.size ?? 0, denom), 9)}`,
    )
  }

  if (coverage.length) {
    console.log('')
    console.log('  * проверка с потолком: знаменатель — сколько записей она успела посмотреть,')
    console.log('    а не сколько было в наборе. Полностью:')
    for (const c of coverage) {
      console.log(`      ${pad(c.code, 38)}${c.looked} из ${c.eligible} подходящих`)
    }
  }

  console.log('')
  console.log('ПО СТАДУ')
  console.log('')

  if (!orgIds.length) {
    console.log('  Хозяйств с животными не нашлось — проверять нечего.')
  } else {
    /*
     * Знаменатель называется. Раздел смотрит верхние хозяйства по числу
     * животных, а печаталось только их число — и вывод «правило
     * не сработало ни разу» читался как вывод по всей книге. Для проверок
     * по записям такая оговорка уже стояла; для проверок по стаду —
     * не стояла.
     */
    console.log(
      orgTotal > orgIds.length
        ? `  Разобрано хозяйств: ${orgIds.length} из ${orgTotal} — самые крупные по поголовью.\n`
        : `  Разобрано хозяйств: ${orgIds.length} — все, у кого есть животные.\n`,
    )
    console.log(`  ${pad('код', 34)}${padL('находок', 9)}${padL('хозяйств', 10)}`)
    console.log(`  ${'─'.repeat(53)}`)
    for (const spec of CHECKS.filter((c) => c.group === 'herd')) {
      const t = herdTally.get(spec.code)
      console.log(
        `  ${pad(spec.code, 34)}${padL(String(t?.count ?? 0), 9)}${padL(String(t?.animals.size ?? 0), 10)}`,
      )
    }

    console.log('')
    console.log(`  ${pad('хозяйство', 40)}${padL('записей', 9)}${padL('находок', 9)}`)
    console.log(`  ${'─'.repeat(58)}`)
    for (const o of perOrg.sort((a, b) => b.found - a.found)) {
      console.log(`  ${pad(o.name, 40)}${padL(String(o.scanned), 9)}${padL(String(o.found), 9)}`)
    }
  }

  /* ------------------------ Что требует внимания ------------------------ */

  /*
   * Молчащие делятся надвое, и разница существенная.
   *
   * Одни не сработали потому, что подходящих данных в базе нет — про них
   * мы не знаем ничего. Другие не сработают никогда: ограничение базы
   * не даёт такие данные записать (`dbGuard` в реестре). Валить их в один
   * список значит требовать завести данные, которые `insert` отвергнет, —
   * ровно на этом остановился первый прогон контрольного хозяйства.
   */
  const guardedCodes = new Set(guardedChecks().map((c) => c.code))

  const silentAll = ALL_CHECKS.filter((c) => !animalTally.has(c.code) && !herdTally.has(c.code))
  const silent = silentAll.filter((c) => !guardedCodes.has(c.code))
  const unreachable = silentAll.filter((c) => guardedCodes.has(c.code))

  const noisy = [...animalTally.entries()]
    .filter(
      ([code, t]) =>
        denomOf(code) >= NOISY_MIN && t.animals.size / denomOf(code) > NOISY_SHARE,
    )
    .sort((a, b) => b[1].animals.size / denomOf(b[0]) - a[1].animals.size / denomOf(a[0]))

  console.log('')
  console.log('ТРЕБУЕТ ВНИМАНИЯ')
  console.log('')

  if (noisy.length) {
    console.log(`  Сработали больше чем на ${Math.round(NOISY_SHARE * 100)} % разобранных записей:`)
    console.log('')
    for (const [code, t] of noisy) {
      const spec = checkSpec(code as CheckCode)
      console.log(
        `    ${pad(code, 38)}${padL(pct(t.animals.size, denomOf(code)), 8)}` +
          `${capped(code) ? ` (из ${denomOf(code)} проверенных)` : ''}  ${spec?.threshold ?? ''}`,
      )
      if (!quiet) for (const s of t.samples) console.log(`      ${s}`)
    }
    console.log('')
    console.log('    Такая доля означает одно из двух: порог не тот либо в книге')
    console.log('    действительно массовая беда. Второе бывает — но решать это')
    console.log('    надо разговором с хозяйствами, а не проверкой, которую')
    console.log('    эксперт перестанет читать после третьего пакета.')
    console.log('')
  }

  if (silent.length) {
    console.log(`  Не сработали ни разу (${silent.length} из ${CHECKS.length}):`)
    console.log('')
    console.log('    ' + silent.map((c) => c.code).join(', '))
    console.log('')
    /*
     * Формулировка правилась после того, как ревизия соврала.
     *
     * Стояло «данных, на которых их видно, в базе нет» — утверждение
     * о всей книге, сделанное по выборке в шестую её часть. Для
     * `age-group-vs-sex` оно было прямо ложным: восемь таких животных
     * в книге есть, просто в триста выбранных они не попали.
     *
     * Отчёт не вправе говорить о том, чего не смотрел. Теперь он
     * называет долю и предлагает `--all` — единственный способ
     * превратить «не попалось» в «нет».
     */
    if (bookSize === 0) {
      /*
       * Пустая книга — не «разобрана вся». Условие `animals.length >= bookSize`
       * при нулях истинно, и ревизия делала на пустой (или недосчитанной)
       * базе ровно то утверждение, ради запрета которого этот блок
       * и переписывали.
       */
      console.log('    В книге нет ни одного животного: разбирать было нечего,')
      console.log('    и «правило не сработало» здесь ничего не значит.')
    } else if (animals.length >= bookSize) {
      console.log('    Разобрана вся книга: данных, на которых эти правила видно,')
      console.log('    в ней действительно нет.')
    } else {
      const share = Math.round((animals.length / Math.max(bookSize, 1)) * 100)
      console.log(`    Разобрано ${share} % книги — про остальные ${100 - share} % ревизия`)
      console.log('    не знает ничего. Правило с частотой ниже процента на такой')
      console.log('    выборке неотличимо от сломанного: чтобы отличить, нужен')
      console.log('    полный проход — npm run audit:checks -- --all')
    }
    console.log('')
  }

  if (unreachable.length) {
    console.log(`  Недостижимы, пока действует ограничение базы (${unreachable.length}):`)
    console.log('')
    for (const c of unreachable) console.log(`    ${pad(c.code, 38)}${c.dbGuard}`)
    console.log('')
    console.log('    Данных под них в этой базе не бывает: `insert` их отвергает.')
    console.log('    Правила оставлены намеренно — ограничения приписываются к схеме')
    console.log('    хуком, а не миграцией, и на чужом дампе или на записях старше')
    console.log('    самого ограничения нарушения встречаются.')
    console.log('')
  }

  if (!noisy.length && !silent.length) {
    console.log('  Каждая проверка сработала хотя бы раз и ни одна не задела')
    console.log(`  больше ${Math.round(NOISY_SHARE * 100)} % записей.`)
    /*
     * Доля считается только при выборке от NOISY_MIN записей: на меньшей
     * она ничего не значит. Прежде утверждение о доле печаталось и там,
     * где доля не считалась вовсе, — то есть ревизия сообщала результат
     * проверки, которой не было.
     */
    if (animals.length < NOISY_MIN) {
      console.log(`  Про долю сказать нечего: разобрано ${animals.length} записей,`)
      console.log(`  а доля считается от ${NOISY_MIN}.`)
    }
    console.log('')
  }

  const allLimits = [...limits, ...herdLimits]
  if (allLimits.length) {
    console.log('ЧТО ПРОВЕРЕНО НЕ ПОЛНОСТЬЮ')
    console.log('')
    for (const l of allLimits) console.log(`  ${l}`)
    console.log('')
  }

  /*
   * Ненулевой код возврата — только у упавших запросов. Шумная проверка
   * и молчащая проверка требуют решения человека, а не остановки сборки:
   * объявить их провалом значило бы уронить CI на данных, которые просто
   * такие, какие есть.
   */
  if (failures.length) process.exitCode = 1
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('\nОшибка:\n  ' + describeError(e) + '\n')
    process.exit(1)
  })
