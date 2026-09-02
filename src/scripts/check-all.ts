import 'dotenv/config'
import { spawn } from 'node:child_process'
import { getPayload } from 'payload'
import config from '@payload-config'
import { CHECKS } from '@/lib/check-registry'
import { isLocalDatabase, maskUri, resolveDatabase } from '@/lib/db-url'
import { CURRENT_VERSION } from '@/lib/product-versions'

/**
 * Полный прогон: всё, что не умеет ночная ручка.
 *
 * ## Зачем
 *
 * Ручка `/checks` гоняет четыре пробы из двадцати пяти проверок —
 * только те, что ничего не пишут и не ходят наружу. Остальные двадцать
 * одна запускались по одной, руками, и на странице «Статус» честно
 * значились как «не гонялись». Двадцать одна команда подряд — это работа,
 * которую не делают: её откладывают до случая, а случаем оказывается
 * поломка.
 *
 * Здесь они собраны в один прогон, и его результат ложится туда же,
 * куда ночной, — на вкладку «Статус». Смысл в том, что после него
 * зелёными становятся все строки, а не четыре.
 *
 * ## Почему дочерними процессами, а не вызовом функций
 *
 * Каждая проверка — самостоятельный скрипт: поднимает свой Payload,
 * печатает и заканчивается `process.exit`. Позвать её как функцию нельзя
 * — первый же `exit` убил бы весь прогон на первой проверке. Переписать
 * двадцать одну проверку под общий вид можно, но это работа, за которую
 * платят до того, как узнают, нужна ли она.
 *
 * Плата за дочерние процессы — время: каждый заново собирает Payload.
 * Прогон идёт минуты, а не секунды, и это его цена.
 *
 * ## Почему подряд, а не разом
 *
 * Проверки делят одну базу, и половина из них заводит записи с одними
 * и теми же приметными номерами: `CHK-BULL`, `CHK-MOVE`, `TEST-MATING`.
 * Запущенные разом, они сталкивались бы на уникальных номерах и падали
 * бы не по делу — а разобрать такое падение стоило бы дороже, чем
 * сэкономленные минуты.
 *
 * ## Почему по умолчанию только своя база
 *
 * Десять проверок **пишут**: заводят организации, животных, приглашения
 * и потом удаляют. Обрыв посреди прогона оставит мусор, неотличимый
 * от настоящих данных. На боевой книге такое недопустимо, и отказ здесь
 * до подключения, а не по его следам.
 *
 * ## Как гонять по боевой базе
 *
 * Только читающие — их пятнадцать против четырёх у ночной ручки:
 *
 *   DATABASE_URI='postgres://…прод…' BASE='https://адрес' \
 *     npm run check:all -- --readonly --label Прод
 *
 * `BASE` нужен трём проверкам, которые ходят по страницам снаружи:
 * обход, ссылки навигации и страница документации. Без него они пойдут
 * на localhost и либо пропустятся, либо проверят не то.
 *
 *   npm run check:all
 *   npm run check:all -- --label "Разработка"
 *   npm run check:all -- --readonly       # только читающие
 *   npm run check:all -- --skip check:xlsx,smoke
 *   npm run check:all -- --dry            # только показать список
 */

const args = process.argv.slice(2)
const argOf = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`)
  return at >= 0 ? args[at + 1] : undefined
}
const DRY = args.includes('--dry')
const REMOTE = args.includes('--remote')

/**
 * Только те проверки, что ничего не пишут.
 *
 * Нужен ровно для одного случая — прогона по боевой базе. Все двадцать
 * пять там запустить нельзя и не будет можно: десять заводят записи,
 * и обрыв посреди прогона оставит в книге мусор, неотличимый
 * от настоящих данных.
 *
 * Пятнадцать оставшихся читают — их по проду гонять безопасно, и это
 * ровно то, чего не хватало: ночная ручка умеет четыре, а тут пятнадцать.
 */
const READONLY = args.includes('--readonly')
const LABEL = (argOf('label') ?? 'Разработка').trim() || 'Разработка'
const SKIP = new Set((argOf('skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean))

/**
 * Куда стучаться, чтобы понять, поднят ли сервер.
 *
 * `BASE` первым: его же читают сами проверки страниц, и знать о сервере
 * они с прогоном обязаны одно и то же. Разойдись эти два значения —
 * прогон решил бы, что сервер поднят, а проверки пошли бы на другой
 * адрес и упали бы «не по делу».
 */
const SERVER = process.env.BASE ?? process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'

/**
 * Потолок на одну проверку.
 *
 * Пять минут: самая долгая (выгрузка книги Excel по настоящему стаду)
 * укладывается в минуту с запасом. Без потолка одна зависшая проверка
 * останавливала бы весь прогон навсегда, и ночью это выглядело бы как
 * «прогон не закончился», а не как «такая-то проверка висит».
 */
const TIMEOUT_MS = 5 * 60 * 1000

const { uri, driverUri } = resolveDatabase()

type Outcome = {
  code: string
  ok: boolean
  skipped: string | null
  findings: string[]
  ms: number
}

/** Одна проверка отдельным процессом. */
function runOne(code: string): Promise<Outcome> {
  const started = Date.now()

  return new Promise((resolve) => {
    const child = spawn('npm', ['run', '--silent', code], {
      /*
       * Прогоны не правят схему базы.
       *
       * Payload включает `push` на локальной базе, и каждый прогон при
       * старте приводил схему к конфигу. Три беды разом.
       *
       * Первая: гонка. Сорок восемь процессов правят одну схему
       * вперемешку, и drizzle падает у случайных трёх — сегодня
       * у `check:trust`, завтра у `check:mating`. Ровно это мы
       * и наблюдали: устроены они одинаково, а падали разные.
       *
       * Вторая: время. «Pulling schema from database» — те самые
       * двенадцать секунд у каждого прогона, которому схема не нужна
       * вовсе: он читает данные.
       *
       * Третья и худшая: `check:schema` сравнивает ожидаемую схему
       * с настоящей, а push приводил их к согласию **до** сравнения.
       * Проверка, созданная ловить забытую миграцию, зеленела именно
       * потому, что молча её заменяла.
       */
      env: { ...process.env, PAYLOAD_DB_PUSH: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let out = ''
    child.stdout.on('data', (b) => (out += String(b)))
    child.stderr.on('data', (b) => (out += String(b)))

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
    }, TIMEOUT_MS)

    child.on('close', (codeExit, signal) => {
      clearTimeout(timer)

      /*
       * Находки берутся из строк с крестиком — тем самым, которым все
       * проверки помечают неудачу. Договорённость неформальная,
       * но соблюдается во всех двадцати пяти; свести их к общему виду
       * стоило бы двадцати одной правки ради того же результата.
       *
       * Если крестиков нет, а код возврата ненулевой — значит проверка
       * упала до того, как что-то сказала. Тогда в находку идут
       * последние строки вывода: они и объяснят, обо что.
       *
       * Вместе со строкой-крестиком берутся и подробности под ней.
       *
       * Первый полный прогон вернул «Циклы в родословной: 1» — и на этом
       * останавливался, хотя сам скрипт печатал под этим заголовком
       * номера животных. Находка без подробностей заставляет запускать
       * проверку заново руками, то есть отменяет смысл общего прогона.
       *
       * Подробностями считаются отступленные строки до пустой: так
       * печатают все проверки, и это единственный признак, по которому
       * их можно отличить от следующего заголовка.
       */
      const lines = out.split('\n')
      const marked: string[] = []

      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].includes('✗')) continue

        marked.push(lines[i].replace(/^\s*✗\s*/, '').trim())

        for (let j = i + 1; j < lines.length && j <= i + 6; j += 1) {
          const next = lines[j]
          if (!next.trim() || next.includes('✗') || next.includes('✓')) break
          if (!/^\s{4,}/.test(next)) break
          marked.push(`    ${next.trim()}`)
        }
      }

      const tail = out.split('\n').filter((l) => l.trim()).slice(-3)

      const ok = codeExit === 0 && !signal
      const findings = ok
        ? []
        : marked.length
          ? marked.slice(0, 8)
          : signal
            ? [`проверка не закончилась за ${TIMEOUT_MS / 60000} минут и была снята`]
            : tail

      resolve({ code, ok, skipped: null, findings, ms: Date.now() - started })
    })
  })
}

/** Отвечает ли сервер: без него три проверки бессмысленны. */
async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(SERVER, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
    return res.status < 500
  } catch {
    return false
  }
}

async function main() {
  console.log(`\nБаза: ${maskUri(uri ?? '')}`)

  /*
   * Отказ до подключения, а не после: узнать, что писали не туда, надо
   * раньше первой записи. Тот же порядок, что у сидов.
   */
  if (!DRY && !isLocalDatabase(driverUri ?? '') && !REMOTE && !READONLY) {
    console.error(
      '\nЭта база не на вашей машине, а половина проверок в неё пишет.\n' +
        'Гонять их по боевой книге нельзя: обрыв посреди прогона оставит\n' +
        'записи, неотличимые от настоящих.\n\n' +
        'По боевой базе гоняют только читающие:\n' +
        '  npm run check:all -- --readonly --label Прод\n\n' +
        'Если это копия и нужны все — повторите с --remote:\n' +
        '  npm run check:all -- --remote\n',
    )
    process.exit(1)
  }

  const up = await serverUp()
  if (!up) {
    console.log(`Сервер по адресу ${SERVER} не отвечает — проверки страниц будут пропущены.`)
  }

  const local = isLocalDatabase(driverUri ?? '')

  /*
   * Присмотр за пулом на чужой базе считает слушателей у своего пула,
   * а не у боевого сервера, — и отвечает зелёным, ничего про прод
   * не узнав. Ложная удача хуже пропуска: пропуск виден, зелёное нет.
   * На проде за этим следит ночная проба: она живёт внутри того самого
   * процесса.
   */
  const plan = CHECKS.filter((c) => {
    if (SKIP.has(c.code)) return false
    if (READONLY && c.writes) return false
    if (!local && c.aboutThisProcess) return false
    return true
  })

  if (READONLY) {
    const left = CHECKS.filter((c) => c.writes).length
    console.log(`Только читающие: ${left} пишущих проверок пропущено.`)
  }
  if (!local) {
    console.log('База не местная: проверки о собственном процессе пропущены.')
  }

  console.log(`\nПрогон «${LABEL}»: проверок ${plan.length}\n`)

  if (DRY) {
    for (const c of plan) console.log(`  · ${c.code} — ${c.title}`)
    console.log('\nЭто был показ списка. Повторите без --dry.\n')
    process.exit(0)
  }

  const outcomes: Outcome[] = []
  const startedAll = Date.now()

  for (const spec of plan) {
    /*
     * Пропуск — не удача. Проверка страниц при лежащем сервере ничего
     * не проверила, и отметить её зелёной значило бы соврать ровно
     * там, где страница «Статус» заведена ради честности.
     */
    if (spec.needsServer && !up) {
      console.log(`  · ${spec.code} — пропущена: сервер не отвечает`)
      outcomes.push({
        code: spec.code,
        ok: false,
        skipped: 'сервер не отвечает',
        findings: [],
        ms: 0,
      })
      continue
    }

    process.stdout.write(`  … ${spec.code}`)
    const res = await runOne(spec.code)
    outcomes.push(res)

    const secs = (res.ms / 1000).toFixed(1)
    console.log(`\r  ${res.ok ? '✓' : '✗'} ${spec.code} — ${secs} с`)
    for (const f of res.findings) console.log(`      ${f}`)
  }

  const ms = Date.now() - startedAll
  const failed = outcomes.filter((o) => !o.ok && !o.skipped).length
  const skipped = outcomes.filter((o) => o.skipped).length

  console.log(
    `\nПрогон занял ${(ms / 1000).toFixed(0)} с. ` +
      `С находками ${failed}, пропущено ${skipped}, сошлось ${outcomes.length - failed - skipped}.`,
  )

  /* ------------------------- Запись прогона ------------------------- */

  /*
   * Результат ложится туда же, куда ночной прогон ручки, — одной записью
   * на среду. Повторный прогон заменяет прежний: смотрят на вкладку
   * за нынешним состоянием, а не за лентой одинаковых прогонов.
   */
  const payload = await getPayload({ config })
  const record = {
    label: LABEL,
    ranAt: new Date().toISOString(),
    ok: failed === 0 && skipped === 0,
    failed: failed + skipped,
    total: outcomes.length,
    ms,
    version: CURRENT_VERSION,
    results: outcomes.map((o) => ({
      code: o.code,
      ok: o.ok,
      findings: o.skipped ? [`пропущена: ${o.skipped}`] : o.findings,
      notes: [],
      ms: o.ms,
    })),
  }

  try {
    const existing = await payload.find({
      collection: 'check-runs',
      where: { label: { equals: LABEL } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    if (existing.docs[0]) {
      await payload.update({
        collection: 'check-runs',
        id: existing.docs[0].id,
        data: record,
        overrideAccess: true,
      })
    } else {
      await payload.create({ collection: 'check-runs', data: record, overrideAccess: true })
    }
    console.log(`Записано как «${LABEL}» — смотрите /evolution?tab=status\n`)
  } catch (e) {
    console.error('Прогон не записан:', e instanceof Error ? e.message : e, '\n')
  }

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\nПрогон не отработал:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
