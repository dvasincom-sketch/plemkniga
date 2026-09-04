import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { biggestHerd } from '@/lib/biggest-herd'
import { buildService, SERVICE_MAX, SERVICE_MIN, type ServiceAnimal } from '@/lib/fgias-export'
import { reproduction, serviceSql } from '@/lib/herd-analytics'
import { poolOf } from '@/lib/sql'

/**
 * Сервис-период отчёта против сервис-периода выгрузки.
 *
 * ## Из-за чего появилась
 *
 * Одно и то же число книга считала дважды и по-разному. В реестр уезжали
 * дни от отёла до плодотворного осеменения, а зоотехнику на «Обзоре»
 * показывались дни до первого — и оба назывались сервис-периодом,
 * и рядом с обоими стоял ориентир 85–110 дней, который относится только
 * ко второму. У коровы, ставшей стельной с третьей попытки, эти числа
 * расходятся на полтора месяца; хозяйство видело благополучные девяносто
 * дней там, где реестр получал полторы сотни.
 *
 * Ни одна проверка не сравнивала два эти числа между собой — оттого
 * расхождение и прожило незамеченным. Проверок было тридцать с лишним,
 * каждая честно смотрела внутрь своего куска, и ни одна не спросила,
 * говорят ли два куска об одном.
 *
 * ## Что она утверждает
 *
 * Что на одних и тех же животных сервис-период отчёта равен
 * сервис-периоду выгрузки — день в день, по каждой лактации отдельно.
 * Не «оба правдоподобны» и не «средние похожи»: средние сходятся и
 * у разных показателей, если стадо благополучное, и именно так ошибка
 * и держится.
 *
 * Сверка не тавтологична, хотя определение теперь общее. Отчёт считает
 * запросом в базе, выгрузка — перебором документов Payload: разные
 * приведения дат (отметка времени с зоной против строки ISO), разный
 * отбор событий отёла, разный порядок сортировки. Один и тот же замысел,
 * посчитанный двумя путями, — единственный способ поймать день,
 * потерянный на часовом поясе.
 *
 * ## Что сверить нельзя
 *
 * Лактацию, которая ещё идёт. У выгрузки для неё числа нет вовсе:
 * плодотворное осеменение она узнаёт по следующему отёлу, а его пока
 * не было. Отчёт такие лактации считает по отметке «Стельная» — иначе
 * он показывал бы стадо девятимесячной давности. Эти строки проверка
 * не сравнивает, а пересчитывает и называет: непроверенное должно быть
 * видно, а не растворяться в зелёном.
 *
 * ## И среднее заодно
 *
 * Между проверенными строками и числом на странице лежит отбор — окно
 * и границы правдоподобия. Проверка называет их заново и сверяет своё
 * среднее со страничным: прежние границы 20–250 достались сервис-периоду
 * от другого показателя и отсекали как раз яловых коров, то есть тех,
 * ради которых его и смотрят. Такая ошибка не ломает ни одной строки —
 * она меняет только итог, и поймать её можно лишь итогом.
 *
 * ## Сколько это длится
 *
 * Проверка поднимает все отёлы и все осеменения стада: на книге
 * в десять тысяч голов это минуты, а не секунды. Поэтому она ручная,
 * а не ночная проба, и поэтому у неё есть --org: правку удобнее гонять
 * на маленьком хозяйстве от seed:farm.
 *
 *   npm run check:service-period
 *   npm run check:service-period -- --org=12    хозяйство поимённо
 */

type Row = Record<string, unknown>

const rel = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object') return ((v as Row).id as number) ?? null
  return null
}

const txt = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

const failures: string[] = []
const fail = (m: string) => failures.push(m)

async function main() {
  const payload = await getPayload({ config })
  const pool = poolOf(payload)

  if (!pool) {
    console.log('  ✗ у адаптера базы нет пула — запрос отчёта выполнить нечем')
    process.exit(1)
  }

  /*
   * Хозяйство берётся тем же кодом, что и у прогона отчётов: проверка,
   * которая смотрит на другое стадо, отвечает не на тот вопрос.
   */
  const explicit = process.argv.find((a) => a.startsWith('--org='))?.slice(6)
  const orgId = explicit ? Number(explicit) : await biggestHerd(payload)

  if (!orgId || !Number.isFinite(orgId)) {
    console.log('  ✗ в книге нет животных с хозяйством — сверять нечего')
    process.exit(1)
  }

  console.log(`\nСервис-период: отчёт против выгрузки, хозяйство #${orgId}\n`)

  /*
   * Сторона отчёта — тем же фрагментом SQL, которым считает страница,
   * но без окна в восемнадцать месяцев: сверять надо всю историю,
   * а не последний год. Копия запроса здесь была бы бесполезна — она
   * сверяла бы копию с оригиналом, а не отчёт с выгрузкой.
   */
  const { rows } = await pool.query(
    `
    with mine as (
      select id from animals
       where owner_id = $1 and archived is not true and sex = 'female'
    ),
    ${serviceSql()}
    select s.animal_id, s.lactation, s.calved, s.next_calved, s.days, s.first_days,
           a.ident_number
      from service s
      join animals a on a.id = s.animal_id
     where s.days is not null
     order by s.animal_id, s.calved`,
    [orgId],
  )

  const analytics = (rows ?? []) as Row[]
  const closed = analytics.filter((r) => r.next_calved !== null)
  const open = analytics.length - closed.length

  console.log(
    `  Отчёт насчитал сервис-периодов: ${analytics.length} ` +
      `(закрытых следующим отёлом ${closed.length}, по отметке «Стельная» ${open})`,
  )

  if (closed.length === 0) {
    /*
     * Ноль сравнимых строк — не успех. Проверка, которой нечего сравнить,
     * зелёная ровно так же, как проверка, у которой всё сошлось, и это
     * худшее, что она может показать: пустоту, похожую на порядок.
     */
    console.log(
      '\n  ✗ ни одной закрытой лактации: сверять нечего, а зелёный цвет ' +
        'означал бы, что сверили\n',
    )
    process.exit(1)
  }

  /* -------------------- Сторона выгрузки -------------------- */

  /*
   * Животные для выгрузки берутся не из строк отчёта, а из стада: все,
   * у кого отёлов хотя бы два. Возьми мы только тех, кого отчёт уже
   * посчитал, — и сверка перестала бы замечать пропуск: лактацию,
   * которую запрос не увидел вовсе, сравнивать было бы не с чем,
   * и её молчание сошло бы за согласие.
   */
  const herd = await pool.query(
    `select a.id, a.ident_number
       from animals a
      where a.owner_id = $1 and a.archived is not true and a.sex = 'female'
        and (select count(*) from calvings k
              where k.animal_id = a.id
                and (k.event_type is null or k.event_type = 'calving')) >= 2
      order by a.id`,
    [orgId],
  )

  const identOf = new Map<number, string>()
  for (const r of (herd.rows ?? []) as Row[]) {
    identOf.set(Number(r.id), String(r.ident_number ?? r.id))
  }
  for (const r of analytics) {
    const id = Number(r.animal_id)
    if (!identOf.has(id)) identOf.set(id, String(r.ident_number ?? id))
  }

  const ids = [...identOf.keys()]
  console.log(`  Животных под сверкой: ${ids.length}`)

  /** Документы коллекции по животным — постранично, как их берёт выгрузка. */
  const collect = async (collection: 'calvings' | 'inseminations') => {
    const map = new Map<number, Row[]>()
    for (let page = 1; ; page++) {
      const res = await payload.find({
        collection,
        where: { animal: { in: ids } },
        limit: 500,
        page,
        sort: 'id',
        depth: 0,
        overrideAccess: true,
      })
      for (const d of res.docs as unknown as Row[]) {
        const id = rel(d.animal)
        if (id === null) continue
        const list = map.get(id) ?? []
        list.push(d)
        map.set(id, list)
      }
      if (!res.hasNextPage) break
    }
    return map
  }

  const [calvingsOf, inseminationsOf] = await Promise.all([
    collect('calvings'),
    collect('inseminations'),
  ])

  /*
   * Номера ФГИАС ПР подставляются заглушкой, и это не подгонка. Без них
   * выгрузка придержала бы строку как «нет базового номера» — то есть
   * сравнение усохло бы до тех животных, которых успели зарегистрировать
   * в реестре, и молчало бы обо всех остальных. Проверяется здесь
   * арифметика периода, а не готовность стада к отправке; за вторым есть
   * check:fgias-readiness.
   *
   * Учётный идентификатор подменён номером животного в книге намеренно:
   * он приезжает в готовую строку третьей колонкой, и по нему строка
   * возвращается к тому животному, от которого пошла.
   */
  const animals: ServiceAnimal[] = ids.map((id) => ({
    identNumber: String(id),
    accountingId: String(id),
    baseUuid: 'сверка',
    calvings: (calvingsOf.get(id) ?? [])
      .filter((c) => !c.eventType || c.eventType === 'calving')
      .map((c) => ({ number: num(c.number), date: txt(c.date) })),
    inseminationDates: (inseminationsOf.get(id) ?? []).map((i) => txt(i.date)),
  }))

  const built = buildService(animals)

  const key = (animal: number, lactation: number) => `${animal}#${lactation}`

  const exported = new Map<string, number>()
  for (const row of built.rows) {
    exported.set(key(Number(row[2]), Number(row[3])), Number(row[4]))
  }

  const heldOf = new Map<string, string>()
  for (const h of built.held) heldOf.set(`${h.identNumber} ${h.what}`, h.why)

  console.log(`  Выгрузка насчитала: ${built.rows.length}, придержала: ${built.held.length}`)

  /* -------------------- Сверка -------------------- */

  /*
   * Двойники по номеру лактации сравнивать нельзя: ключ «животное плюс
   * номер» перестаёт быть ключом, и сравнение начнёт сличать чужую
   * строку с чужой. Такие лактации считаются отдельно и называются —
   * это находка о данных, а не о расчёте, и разбирает её другая проверка.
   */
  const seen = new Set<string>()
  const twins = new Set<string>()
  for (const r of closed) {
    const k = key(Number(r.animal_id), Number(r.lactation))
    if (seen.has(k)) twins.add(k)
    seen.add(k)
  }

  let compared = 0
  let missing = 0

  for (const r of closed) {
    const animal = Number(r.animal_id)
    const lactation = Number(r.lactation)
    const k = key(animal, lactation)
    if (twins.has(k)) continue

    const days = Number(r.days)
    const theirs = exported.get(k)

    if (theirs === undefined) {
      /*
       * Строки вне границ контракта выгрузка придерживает, и это её право:
       * в реестр они не едут. Отчёт их тоже не усредняет. Расхождением
       * это не считается — считается только молчание там, где число
       * контрактное.
       */
      if (days < SERVICE_MIN || days > SERVICE_MAX) continue

      missing += 1
      const why = heldOf.get(`${animal} лактация № ${lactation}`)
      fail(
        `${identOf.get(animal)}, лактация ${lactation}: отчёт насчитал ${days} дн., ` +
          `выгрузка не дала строки${why ? ` — «${why}»` : ''}`,
      )
      continue
    }

    compared += 1
    if (theirs !== days) {
      fail(
        `${identOf.get(animal)}, лактация ${lactation}: отчёт ${days} дн., ` +
          `выгрузка ${theirs} дн. — расхождение ${Math.abs(theirs - days)}`,
      )
    }
  }

  /* Обратная сторона: строка реестра, которой у отчёта нет вовсе. */
  let orphan = 0
  for (const [k, days] of exported) {
    if (twins.has(k)) continue
    if (seen.has(k)) continue
    orphan += 1
    const animal = Number(k.split('#')[0])
    fail(
      `${identOf.get(animal) ?? animal}, лактация ${k.split('#')[1]}: выгрузка ` +
        `насчитала ${days} дн., а отчёт эту лактацию не видит`,
    )
  }

  console.log(`  Сверено лактаций: ${compared}`)
  if (missing) console.log(`  Есть у отчёта, нет у выгрузки: ${missing}`)
  if (orphan) console.log(`  Есть у выгрузки, нет у отчёта: ${orphan}`)
  if (twins.size) console.log(`  Пропущено из-за двойных номеров лактации: ${twins.size}`)
  if (open) console.log(`  Не сверялось (лактация ещё идёт, у выгрузки числа нет): ${open}`)

  /* -------------------- Среднее на странице -------------------- */

  /*
   * Последняя ниточка: число, которое видит зоотехник, должно вырастать
   * из тех же строк. Сверка выше говорит о каждой лактации порознь,
   * а на страницу выходит одно среднее — и между строками и средним
   * лежит отбор: окно в восемнадцать месяцев и границы контракта.
   * Ошибись отбор — и число на странице разойдётся с проверенными
   * строками, оставшись при этом правдоподобным. Ровно так прежние
   * границы 20–250, взятые от другого показателя, отсекали яловых коров.
   *
   * Окно и границы названы здесь заново, а не взяты из запроса страницы:
   * повтори мы её выражение целиком, сверять было бы нечего — выражение
   * сошлось бы само с собой.
   */
  const repro = await reproduction(payload, orgId)

  const avg = await pool.query(
    `
    with mine as (
      select id from animals
       where owner_id = $1 and archived is not true and sex = 'female'
    ),
    ${serviceSql('18 months')}
    select round(avg(days), 0) as mean, count(*)::int as n
      from service
     where days between ${SERVICE_MIN} and ${SERVICE_MAX}`,
    [orgId],
  )

  const recomputed = num(((avg.rows ?? [])[0] as Row | undefined)?.mean)
  const inWindow = num(((avg.rows ?? [])[0] as Row | undefined)?.n) ?? 0

  console.log(
    `  Среднее на странице: ${repro?.serviceperiod ?? '—'} дн. ` +
      `(пересчёт по ${inWindow} строкам: ${recomputed ?? '—'})`,
  )
  console.log(`  Дней до первого осеменения: ${repro?.daysToFirstService ?? '—'}`)

  if (repro?.serviceperiod != null && recomputed != null) {
    /*
     * Допуск в один день оставлен на округление: обе стороны просят
     * у базы round(avg(...)), но на границе окна за время между двумя
     * запросами может добавиться отёл. Второй день расхождения — уже
     * не округление, а другой отбор строк.
     */
    const gap = Math.abs(repro.serviceperiod - recomputed)
    if (gap > 1) {
      fail(
        `среднее на странице ${repro.serviceperiod} дн., а по строкам выходит ${recomputed} — ` +
          'под числом лежат не те строки',
      )
    }
  }

  if (repro?.serviceperiod != null && repro.daysToFirstService != null) {
    /*
     * Сервис-период короче дней до первого осеменения быть не может:
     * плодотворное осеменение — либо первое, либо одно из следующих.
     * Средние считаются по разным наборам строк, поэтому пара дней
     * разницы законна, а перевёрнутая пара означает, что показатели
     * снова поменялись местами — ровно та ошибка, ради которой всё это.
     */
    if (repro.daysToFirstService > repro.serviceperiod + 5) {
      fail(
        `дни до первого осеменения (${repro.daysToFirstService}) больше сервис-периода ` +
          `(${repro.serviceperiod}) — показатели перепутаны местами`,
      )
    }
  }

  if (failures.length) {
    console.log('')
    for (const f of failures.slice(0, 40)) console.log(`  ✗ ${f}`)
    if (failures.length > 40) console.log(`  … и ещё ${failures.length - 40}`)
    console.log(
      `\nРасхождений: ${failures.length}. Книга показывает зоотехнику одно число, ` +
        'а в реестр отдаёт другое — чинить до отправки.\n',
    )
    process.exit(1)
  }

  console.log('\n  ✓ сервис-период отчёта и реестра сходится день в день\n')
  process.exit(0)
}

main().catch((e) => {
  console.error('\nПроверка не отработала:', e instanceof Error ? e.message : e, '\n')
  process.exit(1)
})
