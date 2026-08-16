import 'dotenv/config'
import { Pool } from 'pg'
import { resolveDatabase } from '../lib/db-url'

/**
 * Прогон всех страниц: проверка, что ничего не отвалилось, и нагрузка для
 * аудита индексов.
 *
 * Две задачи в одном скрипте, потому что делают они одно и то же — обходят
 * систему по всем сценариям. Первая очевидна: увидеть, что каждая страница
 * отвечает и делает это не за пять секунд. Вторая тоньше: `pg_stat_user_indexes`
 * умеет сказать, какие индексы работают, но только если по системе кто-то
 * работал. На проде такая статистика набирается за месяц, здесь — за минуту
 * прогона.
 *
 * Адреса собираются из настоящих идентификаторов: скрипт лезет в базу
 * за животным, профилем индекса и пакетом данных. Придуманные `id=1` дали бы
 * сплошные 404 и нагрузили бы ровно ничего.
 *
 * Часть сценариев требует входа — личный кабинет, свои животные, настройки
 * профилей. Скрипт логинится обычным способом, через тот же API, что и форма
 * входа. Логин и пароль берутся из переменных или из демо-доступов сида.
 *
 *   npm run smoke                       # против http://localhost:3000
 *   BASE=https://… npm run smoke
 *   SMOKE_EMAIL=… SMOKE_PASSWORD=… npm run smoke
 *
 * Порядок для аудита индексов:
 *
 *   npm run audit:indexes -- --reset
 *   npm run smoke
 *   npm run audit:indexes
 */

const BASE = process.env.BASE ?? 'http://localhost:3000'
const EMAIL = process.env.SMOKE_EMAIL ?? 'farmer@nazarovskoe.ru'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'plemkniga123'

/** Сколько раз повторить весь набор: одного прохода мало для статистики. */
const ROUNDS = Number(process.env.SMOKE_ROUNDS ?? 3)

/** Медленнее этого — повод посмотреть, а не повод падать. */
const SLOW_MS = 1500

const { driverUri, sslConfig } = resolveDatabase()
const pool = new Pool({ connectionString: driverUri, ssl: sslConfig })

const ru = (n: number) => n.toLocaleString('ru-RU')
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length))

type Result = { url: string; status: number; ms: number; auth: boolean }

async function sampleIds() {
  const one = async (sql: string): Promise<string | null> => {
    try {
      const r = await pool.query(sql)
      const v = r.rows[0] ? Object.values(r.rows[0])[0] : null
      return v === null || v === undefined ? null : String(v)
    } catch {
      return null
    }
  }

  return {
    animal: await one(`select id from animals where public_visible order by id limit 1`),
    ownAnimal: await one(
      `select a.id from animals a
         join users u on u.organization_id = a.owner_id
        where u.email = '${EMAIL.replace(/'/g, "''")}' limit 1`,
    ),
    profile: await one(`select id from index_profiles order by id limit 1`),
    submission: await one(`select id from data_submissions order by id desc limit 1`),
    herd: await one(`select id from herds order by id limit 1`),
  }
}

async function main() {
  const ids = await sampleIds()
  console.log(`\nЦель: ${BASE}`)
  console.log(
    `Образцы из базы: животное ${ids.animal ?? '—'}, своё ${ids.ownAnimal ?? '—'}, ` +
      `профиль ${ids.profile ?? '—'}, пакет ${ids.submission ?? '—'}\n`,
  )

  /* --------------------------------- Вход --------------------------------- */

  let cookie = ''
  try {
    const res = await fetch(`${BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    const set = res.headers.get('set-cookie')
    if (res.ok && set) cookie = set.split(';')[0]!
  } catch {
    /* ниже разберёмся */
  }

  console.log(
    cookie
      ? `Вход выполнен: ${EMAIL}\n`
      : `Войти не удалось (${EMAIL}) — сценарии кабинета пропущены\n`,
  )

  /* ------------------------------- Сценарии ------------------------------- */

  /** Публичные страницы: их видит и аноним. */
  const anonymous = [
    '/',
    '/?preset=bulls',
    '/?preset=forSale',
    '/?state=alive&sex=female',
    '/?sex=male',
    '/?sort=milk',
    '/?sort=ipc',
    '/?sort=name',
    '/?sort=birth',
    '/?q=Ромашка',
    '/?q=99000',
    '/?ident=990000',
    '/?page=2',
    '/?page=50',
    '/?page=500',
    '/?trust=3',
    '/?forSale=1',
    '/?relation=bothParents',
    '/?relation=hasOffspring',
    '/?ipcFrom=100&ipcTo=200',
    '/?milkFrom=8000',
    '/?profile=association&sort=profile',
    '/?profile=profit&sort=profile',
    '/?profile=profit&sort=profile&page=20',
    '/?profile=association&sort=profile&sex=female',
    ids.herd ? `/?herd=${ids.herd}` : null,
    ids.animal ? `/animals/${ids.animal}` : null,
    ids.animal ? `/animals/${ids.animal}?tab=evaluation` : null,
    ids.animal ? `/animals/${ids.animal}?tab=events` : null,
    ids.animal ? `/animals/${ids.animal}?tab=origin` : null,
    ids.animal ? `/animals/${ids.animal}?tab=documents` : null,
    ids.animal ? `/animals/${ids.animal}?tab=media` : null,
    '/analytics',
    '/auctions',
    '/privacy',
    '/login',
    '/register',
    '/healthz',
  ].filter(Boolean) as string[]

  /** Кабинет: только вошедшему. */
  const authorized = [
    '/account',
    '/account?tab=animals',
    '/account?tab=animals&page=2',
    '/account?tab=events',
    '/account?tab=documents',
    '/account?tab=settings',
    '/account/indices',
    ids.profile ? `/account/indices/${ids.profile}` : null,
    '/account/import',
    '/account/export',
    '/account/profile',
    '/account/notifications',
    ids.submission ? `/account/submissions/${ids.submission}` : null,
    ids.ownAnimal ? `/animals/${ids.ownAnimal}` : null,
    ids.ownAnimal ? `/animals/${ids.ownAnimal}?tab=evaluation` : null,
    ids.ownAnimal ? `/animals/${ids.ownAnimal}?tab=events` : null,
    ids.ownAnimal ? `/animals/${ids.ownAnimal}/certificate/zootechnical` : null,
    ids.ownAnimal ? `/animals/${ids.ownAnimal}/certificate/pedigree` : null,
  ].filter(Boolean) as string[]

  const results: Result[] = []

  const hit = async (path: string, auth: boolean) => {
    const started = Date.now()
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: auth && cookie ? { cookie } : {},
        redirect: 'manual',
      })
      // Тело нужно вычитать: иначе запрос считается незавершённым
      await res.text()
      results.push({ url: path, status: res.status, ms: Date.now() - started, auth })
    } catch (e) {
      results.push({ url: path, status: 0, ms: Date.now() - started, auth })
    }
  }

  for (let round = 1; round <= ROUNDS; round++) {
    process.stdout.write(`\r\x1b[2KПроход ${round} из ${ROUNDS}…`)
    for (const p of anonymous) await hit(p, false)
    if (cookie) for (const p of authorized) await hit(p, true)
  }
  process.stdout.write('\r\x1b[2K')

  /* -------------------------------- Итоги --------------------------------- */

  // Берём последний проход: первый греет кэши и врёт в большую сторону
  const perUrl = new Map<string, Result>()
  for (const r of results) perUrl.set(r.url, r)
  const last = [...perUrl.values()]

  const broken = last.filter((r) => r.status === 0 || r.status >= 400)
  const redirects = last.filter((r) => r.status >= 300 && r.status < 400)
  const slow = last.filter((r) => r.status < 400 && r.ms > SLOW_MS)

  console.log(`Запросов: ${ru(results.length)}, адресов: ${ru(last.length)}\n`)

  if (broken.length) {
    console.log('Не отвечают\n' + '─'.repeat(70))
    for (const r of broken) {
      console.log(`  ✗  ${pad(r.url, 48)} ${r.status === 0 ? 'нет ответа' : r.status}`)
    }
    console.log('')
  }

  if (redirects.length) {
    console.log('Переадресация (обычно — требуется вход)\n' + '─'.repeat(70))
    for (const r of redirects) console.log(`  ·  ${pad(r.url, 48)} ${r.status}`)
    console.log('')
  }

  console.log('Самые медленные\n' + '─'.repeat(70))
  for (const r of [...last].sort((a, b) => b.ms - a.ms).slice(0, 10)) {
    const mark = r.ms > SLOW_MS ? '✗' : ' '
    console.log(`  ${mark}  ${pad(r.url, 48)} ${(r.ms / 1000).toFixed(2)} с`)
  }

  console.log('')
  if (broken.length) {
    console.log(`Страниц с ошибкой: ${ru(broken.length)}.\n`)
    process.exitCode = 1
  } else {
    console.log(
      `Все страницы отвечают${slow.length ? `, но ${ru(slow.length)} медленнее ${SLOW_MS / 1000} с` : ''}.\n` +
        'Статистика обращений к индексам набрана — можно запускать\n' +
        '`npm run audit:indexes`.\n',
    )
  }
}

main()
  .catch((e) => {
    console.error('\nОшибка:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => pool.end())
