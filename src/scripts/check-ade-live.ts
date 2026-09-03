import 'dotenv/config'
import { getClient } from '@/lib/payload'
import { SCHEME } from '@/lib/ade/core'

/**
 * Обмен ADE по-настоящему: через сеть, с входом, на живой базе.
 *
 * ## Зачем ещё один прогон, когда есть три
 *
 * Три прежних проверяют то, что можно проверить без сервера: форму
 * ресурса (`check:ade`), приём и повторную отправку (`check:ade-accept`),
 * сверку со схемами ICAR (`check:ade-schema`), разбор фильтров
 * (`check:ade-filters`). Все они видят код, но ни одна не видит **ответ**.
 *
 * А между разобранным фильтром и полученными данными лежит целый слой,
 * который до сих пор не проверялся ничем: маршрут, заголовки, коды
 * ответа, схема локации в адресе. Пример из жизни — проверка руками
 * не показала заголовка с непонятыми фильтрами, и объяснений было два:
 * либо заголовок не отдаётся, либо в адресе стояла схема локации
 * `ru.holstein-russia.org` вместо `ru.holstein-russia.orgid`, запрос
 * не дошёл до отдачи вовсе и получил 404. Разница принципиальная, а на
 * глаз неотличимая: в обоих случаях пусто.
 *
 * Отсюда правило этого прогона: адреса он собирает сам — из `SCHEME`
 * и из базы, — и ни одну строку адреса не берёт из головы. Проверка,
 * в которой имя схемы написано вручную, проверяет вручную написанное имя.
 *
 * ## Почему вход через cookie
 *
 * Тем же способом, что и `smoke`: обычный вход через API формы. Токен
 * заголовком мы принимаем тоже (`lib/ade/auth.ts`), но добывать его
 * отдельно значило бы проверять не тот путь, которым ходит человек,
 * открывший адрес обмена в браузере.
 *
 *   npm run dev                      # в соседнем окне
 *   npm run check:ade-live
 *   BASE=https://… npm run check:ade-live
 */

const BASE = process.env.BASE ?? 'http://localhost:3000'
const EMAIL = process.env.SMOKE_EMAIL ?? 'farmer@nazarovskoe.ru'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'plemkniga123'

const fails: string[] = []
const fail = (m: string) => fails.push(m)
const notes: string[] = []

type Answer = {
  status: number
  headers: Headers
  body: Record<string, unknown>
  total: number
  member: Record<string, unknown>[]
}

async function main() {
  /* ------------------------------- Вход -------------------------------- */

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
    /* ниже */
  }

  if (!cookie) {
    console.log(`\n  ✗ вход не выполнен (${EMAIL} на ${BASE}) — проверять нечего`)
    console.log('    Поднят ли сервер? Тот ли пароль в SMOKE_PASSWORD?')
    process.exit(1)
  }

  /* ------------------------- Что спрашивать ---------------------------- */

  /*
   * Хозяйство и животное берутся из базы тем же клиентом, что и у
   * приложения. Придуманный номер дал бы 404, неотличимый от поломки
   * маршрута, — ровно та ошибка, ради которой этот прогон и написан.
   */
  const payload = await getClient()

  const users = await payload.find({
    collection: 'users',
    where: { email: { equals: EMAIL } },
    limit: 1,
    depth: 0,
  })

  const orgId = Number((users.docs[0] as { organization?: number } | undefined)?.organization)

  if (!Number.isFinite(orgId)) {
    console.log(`\n  ✗ у ${EMAIL} нет хозяйства — обмен идёт по локациям, спрашивать не о чем`)
    process.exit(1)
  }

  const tests = await payload.find({
    collection: 'milk-tests',
    where: { 'animal.owner': { equals: orgId } },
    limit: 200,
    depth: 1,
    sort: 'date',
  })

  type Test = { date?: string; animal?: { identNumber?: string } | number }
  const rows = tests.docs as Test[]
  const withAnimal = rows.filter(
    (r) => r.date && typeof r.animal === 'object' && r.animal?.identNumber,
  )

  if (withAnimal.length === 0) {
    console.log(`\n  ✗ у хозяйства ${orgId} нет контрольных доений — фильтры не на чем проверить`)
    process.exit(1)
  }

  const dates = withAnimal.map((r) => String(r.date).slice(0, 10)).sort()
  const first = dates[0]!
  const last = dates[dates.length - 1]!
  const ident = (withAnimal[0]!.animal as { identNumber: string }).identNumber

  const loc = `${encodeURIComponent(SCHEME.location)}/${orgId}`
  const base = `${BASE}/ade/v1/locations/${loc}/test-day-results`

  console.log(`\nЦель: ${BASE}`)
  console.log(`Локация: ${SCHEME.location}/${orgId}`)
  console.log(`Доения: ${withAnimal.length} записей, с ${first} по ${last}`)
  console.log(`Животное для отбора: ${ident}\n`)

  /* ------------------------------ Запросы ------------------------------ */

  /*
   * За перенаправлением прогон не идёт.
   *
   * `fetch` по умолчанию идёт, и первая же находка этого прогона
   * пришла бы в непонятном виде: обмен на домене книги отвечал 308
   * на витрину, туда уезжал запрос и возвращал оттуда 404. В выводе
   * стояло «ответил 404», хотя обработчик обмена отработал бы верно —
   * до него просто не дошли. Ручной отказ следовать превращает эту
   * поломку из загадки в строчку с адресом, куда нас уводят.
   */
  const ask = async (url: string, init?: RequestInit): Promise<Answer> => {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: { ...(init?.headers ?? {}), cookie },
    })

    if (res.status >= 300 && res.status < 400) {
      const away = res.headers.get('location') ?? '—'
      fail(`адрес обмена уводит перенаправлением (${res.status}) на ${away}`)
    }
    let body: Record<string, unknown> = {}
    try {
      body = (await res.json()) as Record<string, unknown>
    } catch {
      /* не JSON — это тоже результат, и он виден по status */
    }
    const view = body.view as { totalItems?: number } | undefined
    return {
      status: res.status,
      headers: res.headers,
      body,
      total: Number(view?.totalItems ?? 0),
      member: (body.member as Record<string, unknown>[]) ?? [],
    }
  }

  /* Опорная точка: сколько всего. Без неё «отфильтровалось» нечем мерить. */
  const all = await ask(`${base}?pageSize=200`)

  if (all.status !== 200) {
    console.log(`\n  ✗ обычный запрос ответил ${all.status}, а не 200 — дальше мерить нечем`)
    console.log(`    ${base}`)
    for (const f of fails) console.log(`    ${f}`)
    if (all.status >= 300 && all.status < 400) {
      console.log('    Обмен — машинный адрес: он обязан отвечать там, где его спросили.')
      console.log('    Смотреть MACHINE_PATHS в lib/hosts.ts и npm run check:hosts.')
    }
    process.exit(1)
  }

  console.log(`Всего в отдаче: ${all.total}`)

  /* ---------------------------------------------------------------- *
   *  Схема локации: та ли она в адресе                               *
   * ---------------------------------------------------------------- */

  /*
   * Отдельной строкой, потому что именно на этом обожглись руками:
   * `…orgid` работает, `…org` даёт 404, и по пустому выводу
   * не отличить одно от другого. Пусть отличает прогон.
   */
  const wrongScheme = await ask(
    `${BASE}/ade/v1/locations/${encodeURIComponent('ru.holstein-russia.org')}/${orgId}/test-day-results`,
  )
  if (wrongScheme.status !== 404) {
    fail(`чужая схема локации ответила ${wrongScheme.status}, ожидалось 404`)
  }

  /* ---------------------------------------------------------------- *
   *  Непонятые фильтры названы, а не отброшены молча                 *
   * ---------------------------------------------------------------- */

  const ignored = await ask(`${base}?pageSize=200&modifiedSince=2026-01-01&zzz=1`)
  const head = ignored.headers.get('x-icar-ade-ignored-filters') ?? ''

  if (!head.includes('modifiedSince')) {
    fail(
      'заголовок X-ICAR-ADE-Ignored-Filters не назвал modifiedSince — ' +
        `пришло «${head || '(нет заголовка)'}»`,
    )
  }
  if (!head.includes('zzz')) fail(`непонятый zzz не назван в заголовке — пришло «${head}»`)
  if (ignored.total !== all.total) {
    fail(`непонятый фильтр изменил выдачу: ${ignored.total} против ${all.total}`)
  }

  /* Версия стандарта — тоже заголовком, и она обязана быть всегда. */
  if (!all.headers.get('x-icar-ade-version')) {
    fail('нет заголовка X-ICAR-ADE-Version — потребитель не узнает версию до разбора тела')
  }

  /* ---------------------------------------------------------------- *
   *  Отбор по дате события                                           *
   * ---------------------------------------------------------------- */

  /*
   * Диапазон берётся от самой ранней записи до неё же плюс день:
   * так в выдаче обязана остаться хотя бы одна и обязаны пропасть все,
   * что позже. Диапазон «весь год» ничего бы не доказал — он совпал бы
   * с полной выдачей и при вовсе не работающем фильтре.
   */
  const dayAfter = new Date(`${first}T00:00:00Z`)
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
  const to = dayAfter.toISOString().slice(0, 10)

  const narrow = await ask(`${base}?pageSize=200&date-from=${first}&date-to=${to}`)

  if (narrow.total === 0) fail(`отбор по date-from=${first}&date-to=${to} отдал пусто`)

  /*
   * Главное здесь — не «что-то вернулось», а «вернулось меньше».
   * Фильтр, который не сузил выдачу при том, что в книге есть записи
   * за пределами отрезка, не работает вовсе; именно так и оказалось
   * при первом прогоне, и отличить это от «просто все записи в отрезке»
   * можно только сравнением с полной выдачей.
   */
  if (last >= to && narrow.total >= all.total) {
    fail(`date-to не подействовал: в книге есть запись за ${last}, а отдано ${narrow.total} из ${all.total}`)
  }

  for (const m of narrow.member) {
    const d = String(m.eventDateTime ?? '').slice(0, 10)
    if (d && (d < first || d >= to)) {
      fail(`в отбор ${first}…${to} попала запись за ${d}`)
      break
    }
  }

  /* Заведомо пустой отрезок обязан отдать ноль, а не всё. */
  const future = await ask(`${base}?date-from=2099-01-01&date-to=2099-01-02`)
  if (future.total !== 0) fail(`отбор за 2099 год отдал ${future.total} записей вместо нуля`)

  /* ---------------------------------------------------------------- *
   *  Отбор по дате изменения                                         *
   * ---------------------------------------------------------------- */

  const modFuture = await ask(`${base}?meta-modified-from=2099-01-01T00:00:00Z`)
  if (modFuture.total !== 0) {
    fail(`meta-modified-from за 2099 год отдал ${modFuture.total} записей вместо нуля`)
  }

  const modAll = await ask(`${base}?pageSize=200&meta-modified-from=2000-01-01T00:00:00Z`)
  if (modAll.total !== all.total) {
    fail(`meta-modified-from от 2000 года отдал ${modAll.total} вместо ${all.total}`)
  }

  /* ---------------------------------------------------------------- *
   *  Отбор по животному                                              *
   * ---------------------------------------------------------------- */

  const byAnimal = await ask(
    `${base}?pageSize=200&animal-id=${encodeURIComponent(ident)}` +
      `&animal-scheme=${encodeURIComponent(SCHEME.animal)}`,
  )

  if (byAnimal.total === 0) fail(`отбор по животному ${ident} отдал пусто`)

  /*
   * Одно животное не может дать столько же записей, сколько всё
   * хозяйство, — если только в хозяйстве нет ровно одного животного.
   * Без этого сравнения не работающий фильтр выглядит как работающий:
   * записи в ответе есть, и все они, разумеется, «подходят».
   */
  if (byAnimal.total >= all.total && all.total > 0) {
    fail(`отбор по животному ${ident} отдал ${byAnimal.total} из ${all.total} — не сузил`)
  }

  for (const m of byAnimal.member) {
    const a = m.animal as { id?: string } | undefined
    if (a?.id && a.id !== ident) {
      fail(`в отбор по ${ident} попало животное ${a.id}`)
      break
    }
  }

  /* Половина пары — отказ, и отказ объяснённый. */
  const half = await ask(`${base}?animal-id=${encodeURIComponent(ident)}`)
  if (half.status !== 400) fail(`animal-id без схемы ответил ${half.status}, ожидалось 400`)

  const halfErr = (half.body.errors as { code?: string }[] | undefined)?.[0]
  if (halfErr?.code !== 'field-value') {
    fail(`отказ на половину пары пришёл с кодом «${halfErr?.code ?? '—'}», ожидался field-value`)
  }

  /* Несуществующее животное — пусто, но не ошибка: спросили о том, чего нет. */
  const nobody = await ask(
    `${base}?animal-id=НЕТТАКОГО&animal-scheme=${encodeURIComponent(SCHEME.animal)}`,
  )
  if (nobody.status !== 200 || nobody.total !== 0) {
    fail(`отбор по несуществующему животному: ${nobody.status}, записей ${nobody.total}`)
  }

  /* ---------------------------------------------------------------- *
   *  Права и адреса                                                  *
   * ---------------------------------------------------------------- */

  /* Без входа — 401, и это не должно зависеть от фильтров в адресе. */
  const anon = await fetch(`${base}?date-from=${first}`, { redirect: 'manual' })
  if (anon.status !== 401) fail(`без входа ответ ${anon.status}, ожидалось 401`)

  /* Чужая локация — 404, тем же ответом, что и несуществующая. */
  const foreign = await ask(`${BASE}/ade/v1/locations/${encodeURIComponent(SCHEME.location)}/999999/test-day-results`)
  if (foreign.status !== 404) fail(`чужая локация ответила ${foreign.status}, ожидалось 404`)

  /*
   * Пакетный адрес существует. Проверяется негодным телом, а не годным:
   * годное записало бы в базу, и прогон стал бы менять то, что измеряет.
   * Здесь важно только одно — что ответ приходит из обработчика (400),
   * а не от маршрутизатора (404).
   */
  const batch = await ask(`${BASE}/ade/v1/batches/locations/${loc}/test-day-results`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resourceType: 'icarTestDayResultResource' }),
  })
  if (batch.status === 404) fail('пакетный адрес отвечает 404 — для клиента по стандарту его нет')
  else if (batch.status !== 400) notes.push(`пакетный адрес на одиночный ресурс ответил ${batch.status}`)

  /* Закрытая на запись коллекция — 405 с объяснением, а не 404. */
  const readOnly = await ask(`${BASE}/ade/v1/locations/${loc}/animals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resourceType: 'icarAnimalCoreResource' }),
  })
  if (readOnly.status !== 405) fail(`запись в animals ответила ${readOnly.status}, ожидалось 405`)

  /* ------------------------------- Итог -------------------------------- */

  console.log(
    `Проверено: схема локации, заголовки, отбор по дате события и по дате изменения, ` +
      `отбор по животному, права, пакетный адрес, закрытая коллекция`,
  )

  if (notes.length) {
    console.log('')
    for (const n of notes) console.log(`  · ${n}`)
  }

  if (fails.length) {
    console.log('')
    for (const f of fails) console.log(`  ✗ ${f}`)
    process.exit(1)
  }

  console.log('\n  ✓ обмен отвечает так, как обещано интегратору')
  process.exit(0)
}

main().catch((e) => {
  console.log(`\n  ✗ прогон оборвался: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
