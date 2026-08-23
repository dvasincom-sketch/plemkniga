import type { Payload } from 'payload'
import {
  HERD_THRESHOLDS as CAPS,
  type CheckLimits,
  type HerdCheckCode,
  type HerdIssue,
} from '@/lib/checks-registry'
import {
  defaultThresholds,
  resolveThresholds,
  type Thresholds,
} from '@/lib/check-thresholds'
import {
  defaultCheckSettings,
  resolveCheckSettings,
  type CheckSettingsMap,
} from '@/lib/check-settings'
import { IDENT_CORE_MIN, IDENT_FIELD_LABEL, IDENT_VALUES_SQL } from '@/lib/animal-id'

/**
 * Проверки, у которых предмет — стадо, а не запись.
 *
 * ## Почему это отдельный вид находок
 *
 * Всё, что до сих пор умела система, отвечало на вопрос «что не так
 * с этой коровой». Есть класс ошибок, на который так ответить нельзя:
 * каждая запись безупречна по отдельности, а вместе они несопоставимы.
 * Половина удоев в килограммах, половина в тоннах; часть доек из
 * лаборатории, часть со слов; индексы посчитаны от разных баз. Ни одну
 * запись здесь не в чем упрекнуть — упрекнуть надо способ ведения учёта.
 *
 * Разница не в оформлении. Находку по записи чинят в карточке; находку
 * по стаду — пересчётом массива или запросом в лабораторию. Свалить их
 * в один список значило бы предложить чинить второе так же, как первое,
 * и получить полсотни одинаковых замечаний вместо одной причины.
 *
 * ## Почему SQL, а не `payload.find`
 *
 * Считаются доли по всему стаду — тысячам записей. Вытаскивать их
 * в память ради подсчёта долей значило бы возить мегабайты туда,
 * где нужно семь чисел. Образец — `farm-stats.ts` и `book-quality.ts`.
 *
 * Отсюда же второе отличие от `checkAnimals`: здесь **нет потолка
 * по числу записей**. Проверка по выборке в пятьсот животных из трёх
 * тысяч дала бы долю по выборке, а сказала бы «по стаду» — то есть
 * соврала бы уверенно. Агрегат по всему стаду стоит одного прохода
 * по индексу и такой цены не требует.
 *
 * ## Что делает падение запроса
 *
 * Ничего не роняет. Каждый запрос падает молча и добавляет оговорку
 * в `limits`: «не проверено» и «нарушений нет» на экране выглядят
 * одинаково, а значат противоположное, и различить их обязана система,
 * а не читатель.
 */

type SqlPool = {
  query: (q: string, p?: unknown[]) => Promise<{ rows?: Record<string, unknown>[] }>
}

const poolOf = (payload: Payload): SqlPool | null =>
  (payload.db as unknown as { pool?: SqlPool }).pool ?? null

const num = (v: unknown): number => Number(v ?? 0)

const pct = (part: number, total: number): string =>
  total ? `${Math.round((part / total) * 100)} %` : '—'

const kg = (v: number): string => v.toLocaleString('ru-RU')

/**
 * Читаемое название единицы по порядку величины относительно килограммов.
 *
 * Гадание намеренно осторожное: система называет вероятную единицу,
 * но не берётся утверждать. Число «в сто раз меньше» может быть
 * и центнерами, и потерянными нулями — какое из двух, знает хозяйство.
 */
const unitGuess = (factor: number): string => {
  if (factor >= 900 && factor <= 1100) return 'похоже на тонны'
  if (factor >= 90 && factor <= 110) return 'похоже на центнеры'
  return 'единицы отличаются'
}

const SOURCE_LABEL: Record<string, string> = {
  lab: 'лаборатория',
  owner: 'собственник',
  import: 'импорт файла',
  api: 'API',
}

export type HerdCheckResult = {
  issues: HerdIssue[]
  limits: CheckLimits
  /** Сколько записей стада участвовало в подсчёте долей. */
  scanned: number
}

export type HerdCheckOptions = {
  settings?: CheckSettingsMap
  thresholds?: Thresholds
  /**
   * Куда сообщить об упавшем запросе.
   *
   * На экране текст ошибки PostgreSQL не нужен никому: хозяйство им ничего
   * не починит, а эксперт не должен читать SQL. Но ревизии (`audit:checks`)
   * он нужен целиком — там как раз и выясняется, что запрос, написанный
   * без запуска, падает на приведении типа. Поэтому наружу идёт оговорка
   * без подробностей, а подробности — тому, кто попросил.
   */
  onQueryError?: (label: string, error: unknown) => void
}

export async function herdIssues(
  payload: Payload,
  organizationId: number | null,
  opts: HerdCheckOptions = {},
): Promise<HerdCheckResult> {
  const issues: HerdIssue[] = []
  const limits: CheckLimits = []

  if (!organizationId) return { issues, limits, scanned: 0 }

  const [resolved, t] = await Promise.all([
    opts.settings
      ? Promise.resolve(opts.settings)
      : resolveCheckSettings(payload).catch(() => defaultCheckSettings()),
    opts.thresholds
      ? Promise.resolve(opts.thresholds)
      : resolveThresholds(payload).catch(() => defaultThresholds()),
  ])

  const pool = poolOf(payload)
  if (!pool) {
    limits.push(
      'Проверки по стаду не выполнялись: прямой доступ к базе недоступен. ' +
        'Проверки по отдельным записям это не затрагивает.',
    )
    return { issues, limits, scanned: 0 }
  }

  const push = (
    code: HerdCheckCode,
    severity: HerdIssue['severity'],
    text: string,
    examples?: HerdIssue['examples'],
  ) => issues.push({ code, severity, text, examples })

  const ask = async (label: string, q: string, p: unknown[]) => {
    const res = await pool.query(q, p).catch((e: unknown) => {
      opts.onQueryError?.(label, e)
      return null
    })
    if (!res) {
      limits.push(`${label}: запрос не выполнился, эта проверка пропущена.`)
      return null
    }
    return res.rows ?? []
  }

  const org = [organizationId]

  /*
   * Пять независимых запросов одним заходом. Зависимый — только выбросы:
   * им нужна медиана, а её приносит второй запрос.
   */
  const [magRows, shapeRows, birthRows, sourceRows, baseRows, yearRows, coreRows] = await Promise.all([
    ask(
      'Единицы измерения удоя',
      `select floor(log(10, a.summary_milk_yield::numeric))::int as mag,
              count(*)::int as n
         from animals a
        where a.owner_id = $1
          and a.archived is not true
          and a.summary_milk_yield is not null
          and a.summary_milk_yield > 0
        group by 1
        order by 1`,
      org,
    ),
    ask(
      'Округление удоев',
      `select count(*)::int as n,
              count(*) filter (where a.summary_milk_yield::numeric % 500 = 0)::int as r500,
              percentile_cont(0.5) within group (order by a.summary_milk_yield::double precision) as median
         from animals a
        where a.owner_id = $1
          and a.archived is not true
          and a.summary_milk_yield is not null
          and a.summary_milk_yield > 0`,
      org,
    ),
    /*
     * `at time zone 'UTC'` не украшение. Даты лежат в `timestamptz`,
     * и `extract` без указания зоны считает по зоне сервера: дата,
     * записанная как полночь первого января, в зоне со сдвигом назад
     * станет тридцать первым декабря — и проверка на «первое января»
     * не найдёт ровно то, ради чего написана.
     */
    ask(
      'Даты рождения',
      `select count(*)::int as n,
              count(*) filter (
                where extract(month from a.birth_date at time zone 'UTC') = 1
                  and extract(day   from a.birth_date at time zone 'UTC') = 1
              )::int as jan1,
              count(*) filter (
                where extract(day from a.birth_date at time zone 'UTC') = 1
              )::int as first_of_month
         from animals a
        where a.owner_id = $1
          and a.archived is not true
          and a.birth_date is not null`,
      org,
    ),
    ask(
      'Источники контрольных доек',
      `select mt.source::text as source, count(*)::int as n
         from milk_tests mt
         join animals a on a.id = mt.animal_id
        where a.owner_id = $1
          and a.archived is not true
        group by 1
        order by 2 desc`,
      org,
    ),
    ask(
      'Базы сравнения индексов',
      `select iv.profile_key, iv.base_version, count(*)::int as n
         from index_values iv
         join animals a on a.id = iv.animal_id
        where a.owner_id = $1
          and a.archived is not true
          and iv.base_version is not null
        group by 1, 2`,
      org,
    ),
    ask(
      'Отёлы по годам',
      `select extract(year from c."date" at time zone 'UTC')::int as y,
              count(*)::int as n
         from calvings c
         join animals a on a.id = c.animal_id
        where a.owner_id = $1
          and a.archived is not true
        group by 1
        order by 1`,
      org,
    ),
    /*
     * Ядро — общая с загрузкой файла выборка идентификаторов
     * (`IDENT_VALUES_SQL`): разойдясь, эти два запроса начали бы отвечать
     * по-разному на один и тот же вопрос.
     */
    ask(
      'Совпадение цифр идентификаторов',
      `with ok as (${IDENT_VALUES_SQL}),
        sized as (select * from ok where length(core) >= $2),
        dup as (
          select core, count(distinct id)::int as animals
            from sized
           group by core
          having count(distinct id) > 1
        ),
        top as (select core from dup order by animals desc, core limit $3)
        select (select count(*) from dup)::int as groups,
               c.core, c.id, c.ident_number, c.field, c.value
          from sized c
          join top t on t.core = c.core
         order by c.core, c.id, c.field`,
      [organizationId, IDENT_CORE_MIN, CAPS.examples],
    ),
  ])

  /* Обе сводки — по одной строке; вынесены, чтобы не тянуть цепочку каждый раз. */
  const shape = shapeRows?.[0] ?? null
  const birth = birthRows?.[0] ?? null

  const scanned = num(shape?.n)

  /* ---------------------- Разные единицы измерения ---------------------- */

  /*
   * Единицы ищутся по порядку величины, а не по границам правдоподобия.
   * Границы говорят «так не бывает» о каждой записи по отдельности;
   * здесь нужен другой вопрос — «а не разложено ли стадо на две кучи,
   * отличающиеся ровно в сто раз».
   *
   * За норму берётся самая населённая куча, а не диапазон килограммов.
   * Хозяйство, которое **всё** ведёт в тоннах, не ошибается — оно просто
   * ведёт иначе, и ловить его этой проверкой не за что; неправдоподобие
   * таких записей поймает своя проверка и скажет ровно то, что есть.
   */
  if (magRows && magRows.length > 1) {
    const buckets = magRows.map((r) => ({ mag: num(r.mag), n: num(r.n) }))
    const total = buckets.reduce((s, b) => s + b.n, 0)
    const main = buckets.reduce((a, b) => (b.n > a.n ? b : a))
    const factorMag = Math.log10(t.herdUnitsFactor)

    const off = buckets.filter((b) => Math.abs(b.mag - main.mag) >= factorMag)
    const offRows = off.reduce((s, b) => s + b.n, 0)

    if (offRows >= CAPS.unitsMinRows) {
      const other = off.reduce((a, b) => (b.n > a.n ? b : a))
      const factor = Math.pow(10, Math.abs(other.mag - main.mag))
      const smaller = other.mag < main.mag

      push(
        'units-mixed',
        'fix',
        `У ${offRows} записей из ${total} удой ${smaller ? 'меньше' : 'больше'} остальных примерно ` +
          `в ${kg(factor)} раз (${unitGuess(factor)}). Основная часть стада — ${main.n} записей ` +
          `в пределах ${kg(Math.pow(10, main.mag))}…${kg(Math.pow(10, main.mag + 1) - 1)} кг. ` +
          'Пока единицы разные, среднее по стаду и сравнение животных между собой ничего не значат',
      )
    }
  }

  /* ------------------------- Круглые значения ------------------------- */

  if (scanned >= t.herdMin) {
    const r500 = num(shape?.r500)
    if (r500 / scanned > t.herdRoundedShare / 100) {
      push(
        'values-rounded',
        'note',
        `${r500} удоев из ${scanned} (${pct(r500, scanned)}) кратны 500 кг. ` +
          'При настоящем замере такое совпадение невозможно: числа либо округлены при переносе, ' +
          'либо поставлены на глаз',
      )
    }
  }

  /* -------------------- Выбросы относительно стада -------------------- */

  const median = shape?.median != null ? Number(shape.median) : null

  if (median !== null && median > 0 && scanned >= t.herdMin) {
    const high = median * t.herdOutlierFactor
    const low = median / t.herdOutlierFactor

    const rows = await ask(
      'Выбросы по удою',
      `select a.id, a.ident_number, a.summary_milk_yield::numeric as milk,
              count(*) over ()::int as total
         from animals a
        where a.owner_id = $1
          and a.archived is not true
          and a.summary_milk_yield is not null
          and a.summary_milk_yield > 0
          and (a.summary_milk_yield > $2 or a.summary_milk_yield < $3)
        order by abs(a.summary_milk_yield::numeric - $4) desc
        limit $5`,
      [organizationId, high, low, median, CAPS.examples],
    )

    if (rows?.length) {
      const total = num(rows[0]!.total)
      push(
        'outlier-vs-herd',
        'note',
        `Медиана удоя по стаду — ${kg(Math.round(median))} кг. ` +
          `${total} записей отличаются от неё больше чем в ${t.herdOutlierFactor} раза: ` +
          `за пределами ${kg(Math.round(low))}…${kg(Math.round(high))} кг. ` +
          'Формально такие удои правдоподобны — неправдоподобны они именно в этом стаде',
        rows.map((r) => ({
          animalId: num(r.id),
          label: `№ ${String(r.ident_number)} — ${kg(Math.round(Number(r.milk)))} кг`,
        })),
      )
    }
  }

  /* ------------------------- Даты рождения -------------------------- */

  const born = num(birth?.n)

  if (born >= t.herdMin) {
    const jan1 = num(birth?.jan1)
    const first = num(birth?.first_of_month)

    /*
     * Две находки об одном явлении не выводим: первое января входит
     * в первое число месяца, и сказать оба значило бы посчитать
     * одни и те же записи дважды. Первое января точнее — оно и берётся,
     * когда сработало.
     */
    if (jan1 / born > t.herdJan1Share / 100) {
      push(
        'birth-date-clustered',
        'note',
        `${jan1} животных из ${born} (${pct(jan1, born)}) числятся рождёнными первого января. ` +
          'При настоящем учёте отёлов первого января около одного процента: ' +
          'похоже, у этих записей был известен только год, а день поставили началом',
      )
    } else if (first / born > t.herdFirstOfMonthShare / 100) {
      push(
        'birth-date-clustered',
        'note',
        `${first} животных из ${born} (${pct(first, born)}) числятся рождёнными первого числа месяца. ` +
          'Обычно так выглядит перенос из учёта, где был известен только месяц',
      )
    }
  }

  /* --------------------- Источники контрольных доек --------------------- */

  if (sourceRows && sourceRows.length > 1) {
    const total = sourceRows.reduce((s, r) => s + num(r.n), 0)
    const lab = sourceRows.find((r) => String(r.source) === 'lab')
    const others = sourceRows.filter((r) => String(r.source) !== 'lab')
    const otherRows = others.reduce((s, r) => s + num(r.n), 0)

    /*
     * Смешение ловится только тогда, когда лабораторные дойки в стаде
     * вообще есть. Хозяйство, которое всё ведёт само, ничего не смешивает —
     * у него просто нет независимого замера, и это разговор о вступлении
     * в контрольное доение, а не находка о качестве данных.
     */
    if (lab && otherRows > 0) {
      push(
        'milk-test-source-mixed',
        'note',
        `Дойки стада получены по-разному: ${num(lab.n)} из ${total} — из лаборатории, ` +
          `${otherRows} — ${others
            .map((r) => `${SOURCE_LABEL[String(r.source)] ?? String(r.source)}: ${num(r.n)}`)
            .join(', ')}. ` +
          'Замер лаборатории и число со слов хозяйства складывать в одно среднее нельзя',
      )
    }
  }

  /* ------------------------ Базы сравнения ------------------------- */

  if (baseRows?.length) {
    const byProfile = new Map<string, Map<string, number>>()
    for (const r of baseRows) {
      const key = String(r.profile_key)
      const version = String(r.base_version)
      const inner = byProfile.get(key) ?? new Map<string, number>()
      inner.set(version, (inner.get(version) ?? 0) + num(r.n))
      byProfile.set(key, inner)
    }

    /*
     * Сравниваются версии **внутри профиля**. Разные профили от разных
     * баз — норма: у племенной ценности своя база, у экономического
     * индекса своя. Сравнить по всем профилям сразу значило бы объявить
     * находкой обычное устройство системы.
     */
    for (const [profile, versions] of byProfile) {
      if (versions.size < 2) continue
      const list = [...versions.entries()].sort((a, b) => b[1] - a[1])
      push(
        'index-base-mixed',
        'note',
        `Профиль «${profile}»: оценки стада посчитаны от ${versions.size} разных баз сравнения — ` +
          `${list.map(([v, n]) => `${v} (${n})`).join(', ')}. ` +
          'Сравнивать такие индексы между собой нельзя; пересчёт от единой базы делает Ассоциация',
      )
    }
  }

  /* -------------------------- Пропущенный год -------------------------- */

  if (yearRows && yearRows.length >= 2) {
    const years = yearRows.map((r) => ({ y: num(r.y), n: num(r.n) })).sort((a, b) => a.y - b.y)
    const first = years[0]!.y
    const last = years[years.length - 1]!.y
    const total = years.reduce((s, y) => s + y.n, 0)
    const span = last - first + 1
    const seen = new Set(years.map((y) => y.y))
    const gaps: number[] = []
    for (let y = first + 1; y < last; y++) if (!seen.has(y)) gaps.push(y)

    /*
     * Порог на плотность — не перестраховка. У хозяйства с двумя отёлами
     * за десять лет «дыры» будут все восемь лет, и находка сообщит ему,
     * что оно маленькое, а не что оно что-то потеряло. Проверка имеет
     * смысл там, где отёлы идут потоком и потому обязаны быть каждый год.
     */
    if (gaps.length && total / span >= t.herdMin) {
      push(
        'event-year-gap',
        'note',
        `Отёлы записаны с ${first} по ${last} год, но за ${gaps.join(', ')} ` +
          `${gaps.length === 1 ? 'год нет ни одного' : 'годы нет ни одного'} — ` +
          `при среднем ${Math.round(total / span)} отёлов в год. ` +
          'Стадо, телившееся до и после, не могло не телиться в промежутке: скорее всего, отчёт за эти годы не передан',
      )
    }
  }

  /* ------------------ Совпадение цифр идентификаторов ------------------ */

  /*
   * Находка на каждую группу совпавших цифр, а не одна общая.
   *
   * Общая пришлось бы читать так: «в стаде семь совпадений» — и дальше
   * искать их самому. Каждая группа — отдельный вопрос к отдельной паре
   * записей, и ответы на них разные: одну пару надо слить, другую оставить
   * как есть.
   *
   * Существенность — «на усмотрение», и иначе быть не может. Совпадение
   * цифр не является ошибкой: в одних хозяйствах это тот же номер в другой
   * записи, в других — независимые системы нумерации, случайно сошедшиеся.
   * Пометка «требует исправления» здесь означала бы, что мы знаем ответ
   * на вопрос, который сами же задаём.
   */
  if (coreRows?.length) {
    type IdentRow = { id: number; ident: string; field: string; value: string }
    const groups = new Map<string, IdentRow[]>()
    for (const r of coreRows) {
      const key = String(r.core)
      const row: IdentRow = {
        id: num(r.id),
        ident: String(r.ident_number),
        field: String(r.field),
        value: String(r.value),
      }
      groups.set(key, [...(groups.get(key) ?? []), row])
    }

    for (const [core, rows] of groups) {
      /*
       * Одно животное в группе — та же цифра в двух своих же полях
       * (номер и бирка, например). Это норма и находкой не является;
       * запрос такие группы уже отбросил, но проверка стоит и здесь:
       * она стоит ничего, а тихая находка «корова совпала сама с собой»
       * стоила бы доверия ко всему списку.
       */
      const byAnimal = new Map<number, IdentRow[]>()
      for (const r of rows) byAnimal.set(r.id, [...(byAnimal.get(r.id) ?? []), r])
      if (byAnimal.size < 2) continue

      const where = [...byAnimal.entries()].map(
        ([, list]) =>
          `№ ${list[0]!.ident} (${list
            .map((r) => `${IDENT_FIELD_LABEL[r.field] ?? r.field}: ${r.value}`)
            .join(', ')})`,
      )

      push(
        'ident-core-shared',
        'note',
        `Цифры ${core} встречаются у ${byAnimal.size} разных записей: ${where.join('; ')}. ` +
          'Единого номера у скота нет, и одно животное ходит под несколькими — ' +
          'поэтому это либо одна корова, заведённая дважды, либо два разных номера, ' +
          'случайно совпавших цифрами. Что именно, знает только хозяйство: ' +
          'записи не объединяются автоматически ни при каком совпадении',
        [...byAnimal.entries()].map(([id, list]) => ({
          animalId: id,
          label: `№ ${list[0]!.ident} — ${IDENT_FIELD_LABEL[list[0]!.field] ?? list[0]!.field}`,
        })),
      )
    }

    const total = num(coreRows[0]!.groups)
    if (total > CAPS.examples) {
      limits.push(
        `Совпадений цифр в идентификаторах найдено ${total}, показаны ${CAPS.examples} ` +
          'с наибольшим числом записей. Остальные появятся после разбора этих.',
      )
    }
  }

  /*
   * Настройки применяются в конце, а не внутри проверок, и по той же
   * причине, что в `checkAnimals`: правило написано в одном месте,
   * решение о его судьбе принято в другом. Цена этого выбора здесь
   * невелика — все проверки уже посчитаны шестью агрегатами, и отбросить
   * результат выключённой дешевле, чем протащить настройку в каждую ветку.
   */
  const applied = issues.flatMap((i) => {
    const rule = resolved.get(i.code)
    if (rule && !rule.enabled) return []
    return [rule ? { ...i, severity: rule.severity } : i]
  })

  return { issues: applied, limits, scanned }
}
