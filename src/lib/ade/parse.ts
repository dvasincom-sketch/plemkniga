import { ADE_CALVING_EASE, ADE_INSEMINATION_TYPE, SCHEME } from '@/lib/ade/core'
import { ADE_CODE, adeError, type AdeError } from '@/lib/ade/errors'

/**
 * Разбор входящих ресурсов ADE — без базы и без сети.
 *
 * ## Почему отдельно от записи
 *
 * Разбор — единственная часть приёма, которую можно проверить целиком
 * и дёшево: подставить сто негодных тел и посмотреть, что сказано в ответ.
 * Смешав его с записью, мы получили бы проверку, требующую базы,
 * то есть проверку, которую перестанут запускать.
 *
 * Отсюда правило: здесь ничего не читается и не пишется. На выходе
 * либо «вот значения, годные к записи», либо список ошибок в том виде,
 * в каком они уйдут клиенту.
 *
 * ## Почему разбор строгий
 *
 * Соблазн велик: принять «3,5» вместо `3.5`, «2026-13-01» превратить
 * в январь следующего года, пустую строку счесть отсутствием. Все три
 * снисхождения мы уже проходили на загрузке файлов, и все три кончались
 * одинаково — молчаливой порчей, которую замечали через месяцы
 * (решение о разборе значений).
 *
 * Разница между файлом и обменом в том, что файл шлёт человек, а обмен —
 * программа. Человеку снисхождение помогает; программе оно вредит:
 * приняв «3,5», мы не сообщаем автору программы, что он шлёт не то,
 * и он продолжает слать не то во все системы, а не только к нам.
 *
 * ## Про `meta.sourceId`
 *
 * Ключ всей затеи. Стандарт требует, чтобы он был уникален среди
 * ресурсов **у источника**, и на нём держится повторная отправка:
 * прислав то же событие дважды, программа обязана получить одну запись,
 * а не две. Без него приём превращается в удвоение книги при первом же
 * сбое сети, когда клиент не дождался ответа и повторил запрос.
 *
 * Поэтому `sourceId` обязателен, хотя в стандарте он необязателен.
 * Это ужесточение, и оно осознанное: стандарт описывает и такие обмены,
 * где дубли ловит человек глазами. В племенной книге их не ловит никто.
 */

/* ------------------------------------------------------------------ */

export type AdeIncoming = {
  /** Кто прислал: `meta.source`. Вместе с `sourceId` образует ключ. */
  source: string
  sourceId: string
  /** Животное, к которому относится событие. */
  animal: { scheme: string; id: string }
  /** Удалено на стороне источника — запись надо снять, а не создать. */
  deleted: boolean
  /** Значения, годные к записи. Состав зависит от коллекции. */
  values: Record<string, unknown>
}

export type ParseResult =
  | { ok: true; value: AdeIncoming }
  | { ok: false; errors: AdeError[] }

/* ------------------------------------------------------------------ *
 *  Мелкие разборщики                                                 *
 * ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Дата и время по RFC3339.
 *
 * `new Date(...)` принимает слишком многое — `'2026'`, `'March 3 2026'`,
 * и даже `'2026-02-31'`, которое молча становится третьим марта. Поэтому
 * сперва форма, потом сборка, потом сверка: разобранная дата обязана
 * дать те же число и месяц, что были написаны. Иначе тридцать первое
 * февраля проехало бы в книгу как первое марта — и никто бы не узнал.
 */
const parseDateTime = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(
    v.trim(),
  )
  if (!m) return null

  const [, y, mo, d] = m
  const iso = `${y}-${mo}-${d}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}${m[7] ?? 'Z'}`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  /* Сверка: «2026-02-31» разбирается, но даёт другое число. */
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() + 1 !== Number(mo) ||
    date.getUTCDate() !== Number(d)
  ) {
    /*
     * Со смещением часового пояса расхождение в сутки законно: `+03:00`
     * сдвигает дату при переводе в UTC. Сверяем только то, что написано
     * без смещения, — там расхождение может быть только ошибкой.
     */
    if (!m[7] || m[7] === 'Z') return null
  }

  return date.toISOString()
}

/** Число — только числом. Строка «3.5» приехала из программы, которая врёт о типах. */
const parseNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Число, записанное строкой, — и только там, где строку требует схема.
 *
 * У показателей молока `value` объявлено строкой; это не описка
 * спецификации, и мы сами так отдаём. Разбор здесь строгий: точка,
 * не запятая, никаких пробелов и единиц внутри. «3,5» — не число
 * с другим разделителем, а признак того, что на той стороне склеили
 * строку из локализованного вывода, и принять её значило бы записать
 * тридцать пять процентов жира.
 */
const parseNumericString = (v: unknown): number | null => {
  if (typeof v !== 'string') return null
  if (!/^-?\d+(\.\d+)?$/.test(v.trim())) return null
  const n = Number(v.trim())
  return Number.isFinite(n) ? n : null
}

/**
 * Величина с единицей измерения.
 *
 * Стандарт пишет её по-разному в разных ресурсах: у массы это
 * `{ measurement, units }`, у удоя — `{ value, unitCode }`. Разнобой
 * не наш, но принимать приходится оба вида, и оба мы сами же отдаём.
 *
 * Единица проверяется всегда. Принять фунты как килограммы — записать
 * телёнка вдвое легче, и ни одна последующая проверка этого не поймает:
 * число само по себе правдоподобно.
 */
const parseQuantity = (
  v: unknown,
  field: string,
  errors: AdeError[],
): number | null => {
  if (!isObj(v)) return null

  const units =
    typeof v.units === 'string' ? v.units : typeof v.unitCode === 'string' ? v.unitCode : null

  if (units && units.toUpperCase() !== 'KGM') {
    errors.push(
      adeError(
        400,
        ADE_CODE.fieldValue,
        `Поле ${field}: принимаются только килограммы`,
        'Ожидается KGM — код килограмма по UN/CEFACT Recommendation 20.',
        { field, got: units },
      ),
    )
    return null
  }

  const raw = v.measurement ?? v.value
  return parseNumber(raw)
}

const parseIdentifier = (v: unknown): { scheme: string; id: string } | null => {
  if (!isObj(v)) return null
  const scheme = typeof v.scheme === 'string' ? v.scheme.trim() : ''
  const id = typeof v.id === 'string' ? v.id.trim() : ''
  if (!scheme || !id) return null
  /*
   * Двоеточие и косая черта в схеме запрещены стандартом: схема входит
   * в составной ключ, и разделители внутри неё делают ключ неразбираемым.
   */
  if (scheme.includes(':') || scheme.includes('/')) return null
  return { scheme, id }
}

/* ------------------------------------------------------------------ *
 *  Общая часть любого события                                        *
 * ------------------------------------------------------------------ */

type Head = {
  source: string
  sourceId: string
  animal: { scheme: string; id: string }
  deleted: boolean
}

const parseHead = (body: unknown, errors: AdeError[]): Head | null => {
  if (!isObj(body)) {
    errors.push(
      adeError(400, ADE_CODE.bodyShape, 'Ресурс должен быть объектом JSON'),
    )
    return null
  }

  const meta = isObj(body.meta) ? body.meta : null
  const source = meta && typeof meta.source === 'string' ? meta.source.trim() : ''
  const sourceId = meta && typeof meta.sourceId === 'string' ? meta.sourceId.trim() : ''

  if (!source) {
    errors.push(
      adeError(
        400,
        ADE_CODE.fieldMissing,
        'Не указан meta.source',
        'Источник данных обязателен: по паре «источник + sourceId» повторная отправка узнаётся как та же запись.',
        { field: 'meta.source' },
      ),
    )
  }

  if (!sourceId) {
    errors.push(
      adeError(
        400,
        ADE_CODE.fieldMissing,
        'Не указан meta.sourceId',
        'Идентификатор записи у источника обязателен. Без него повторная отправка того же события создаст вторую запись в книге.',
        { field: 'meta.sourceId' },
      ),
    )
  }

  const animal = parseIdentifier(body.animal)
  if (!animal) {
    errors.push(
      adeError(
        400,
        ADE_CODE.fieldMissing,
        'Не указано животное',
        'Ожидается animal: { scheme, id }. Схема не должна содержать «:» и «/».',
        { field: 'animal', schemes: Object.values(SCHEME) },
      ),
    )
  }

  if (!source || !sourceId || !animal) return null

  return {
    source,
    sourceId,
    animal,
    deleted: meta?.isDeleted === true,
  }
}

/** Требуемое поле: записать ошибку и вернуть `null`, но не прерывать разбор. */
const need = <T>(
  value: T | null,
  field: string,
  what: string,
  errors: AdeError[],
): T | null => {
  if (value === null) {
    errors.push(adeError(400, ADE_CODE.fieldValue, `Поле ${field}: ${what}`, undefined, { field }))
  }
  return value
}

/* ------------------------------------------------------------------ *
 *  Разборщики коллекций                                              *
 * ------------------------------------------------------------------ */

/**
 * Контрольное доение.
 *
 * `icarTestDayResultEvent` несёт удой и показатели отдельными объектами
 * `milkCharacteristics`; удой — самостоятельное поле `milkWeight`.
 */
const parseTestDayResult = (body: Record<string, unknown>, errors: AdeError[]) => {
  const date = need(parseDateTime(body.eventDateTime), 'eventDateTime', 'ожидается дата по RFC3339', errors)

  /*
   * Имя поля — `milkWeight24Hours`, ровно то, которое мы сами отдаём.
   * Это не мелочь: приём, не принимающий собственную выгрузку, —
   * первое, обо что споткнётся интегратор, и споткнётся справедливо.
   */
  const milk = need(
    parseQuantity(body.milkWeight24Hours, 'milkWeight24Hours', errors),
    'milkWeight24Hours',
    'ожидается { value, unitCode: "KGM" }',
    errors,
  )

  /*
   * Показатели приходят массивом «характеристика — значение», а не полями.
   * Так задано стандартом, и это разумно: лабораторий много, наборы
   * показателей у них разные, и плоский набор полей пришлось бы
   * расширять под каждую.
   */
  const chars = Array.isArray(body.milkCharacteristics) ? body.milkCharacteristics : []
  const pick = (code: string): number | null => {
    for (const c of chars) {
      if (isObj(c) && c.characteristic === code) return parseNumericString(c.value)
    }
    return null
  }

  if (milk !== null && milk < 0) {
    errors.push(
      adeError(400, ADE_CODE.fieldValue, 'Поле milkWeight24Hours: удой не бывает отрицательным', undefined, {
        field: 'milkWeight24Hours',
      }),
    )
  }

  return {
    date,
    dailyYield: milk,
    fatPercent: pick('FAT'),
    proteinPercent: pick('PROTEIN'),
    somaticCells: pick('SCC'),
  }
}

/** Отёл. */
const parseParturition = (body: Record<string, unknown>, errors: AdeError[]) => {
  const date = need(parseDateTime(body.eventDateTime), 'eventDateTime', 'ожидается дата по RFC3339', errors)

  const easeRaw = typeof body.calvingEase === 'string' ? body.calvingEase : null
  if (easeRaw && !(ADE_CALVING_EASE as readonly string[]).includes(easeRaw)) {
    errors.push(
      adeError(400, ADE_CODE.fieldValue, 'Поле calvingEase: значение вне перечисления', undefined, {
        field: 'calvingEase',
        allowed: ADE_CALVING_EASE,
      }),
    )
  }

  /*
   * Приплод стандарт передаёт двумя способами сразу, и оба законны.
   *
   * `progenyDetails` — перечень телят с полом и статусом. Из него
   * видно всё, что нам нужно, и потому он читается первым.
   *
   * `liveProgeny` и `totalProgeny` — просто числа, и стандарт держит
   * их именно для случая, когда телята не идентифицированы. Из них
   * восстанавливается число мертворождённых, но **не пол живых**:
   * `liveProgeny: 2` не говорит, тёлочки это или бычки. Записать их
   * в тёлочек значило бы выдумать пол, а книга потом отдаст эту выдумку
   * дальше как факт. Поэтому из чисел заполняется только то, что
   * из них следует.
   *
   * Устаревшее `progeny` читается последним и только на чтение: в 1.5
   * оно помечено `deprecated`, но программы, написанные под 1.4, шлют
   * его до сих пор, и отказывать им незачем.
   */
  const details = Array.isArray(body.progenyDetails)
    ? body.progenyDetails
    : Array.isArray(body.progeny)
      ? body.progeny
      : []

  /*
   * Номер отёла — `damParity`: в него мы этот номер и кладём при отдаче.
   * У нас поле обязательное, а стандарт его не требует, поэтому здесь
   * оно необязательно: чего не прислали, приём досчитает по отёлам
   * животного (`accept.ts`). Отказывать из-за него нельзя — это значило
   * бы принимать отёлы только от тех, кто взял их у нас же.
   */
  const parity = parseNumber(body.damParity)
  if (parity !== null && (!Number.isInteger(parity) || parity < 1)) {
    errors.push(
      adeError(400, ADE_CODE.fieldValue, 'Поле damParity: ожидается номер отёла от 1', undefined, {
        field: 'damParity',
      }),
    )
  }

  if (details.length > 0) {
    const alive = details.filter((p) => isObj(p) && p.birthStatus === 'Alive')
    return {
      date,
      parity,
      ease: easeRaw,
      liveHeifers: alive.filter((p) => isObj(p) && p.gender === 'Female').length,
      liveBulls: alive.filter((p) => isObj(p) && p.gender === 'Male').length,
      stillborn: details.filter((p) => isObj(p) && p.birthStatus === 'Stillborn').length,
      progenyKnown: true,
      sexKnown: true,
    }
  }

  const liveCount = parseNumber(body.liveProgeny)
  const totalCount = parseNumber(body.totalProgeny)

  if (liveCount === null && totalCount === null) {
    return { date, parity, ease: easeRaw, progenyKnown: false, sexKnown: false }
  }

  const still =
    totalCount !== null && liveCount !== null ? Math.max(0, totalCount - liveCount) : null

  return {
    date,
    parity,
    ease: easeRaw,
    stillborn: still ?? undefined,
    progenyKnown: still !== null,
    sexKnown: false,
  }
}

/** Осеменение. */
const parseInsemination = (body: Record<string, unknown>, errors: AdeError[]) => {
  const date = need(parseDateTime(body.eventDateTime), 'eventDateTime', 'ожидается дата по RFC3339', errors)

  const type = typeof body.inseminationType === 'string' ? body.inseminationType : null
  if (type && !(ADE_INSEMINATION_TYPE as readonly string[]).includes(type)) {
    errors.push(
      adeError(400, ADE_CODE.fieldValue, 'Поле inseminationType: значение вне перечисления', undefined, {
        field: 'inseminationType',
        allowed: ADE_INSEMINATION_TYPE,
      }),
    )
  }

  /*
   * Быков стандарт передаёт массивом: у одного быка бывает несколько
   * номеров в разных системах, и все они — про него. Берём первый
   * годный, а не «единственный»: требовать ровно один значило бы
   * отказывать тем, кто честно перечислил все.
   */
  const sires = Array.isArray(body.sireIdentifiers) ? body.sireIdentifiers : []
  const sire = sires.map(parseIdentifier).find((x) => x !== null) ?? null

  /*
   * Обратное превращение типа осеменения в наш справочник методов.
   * `Insemination` в наш `method` не отображается вовсе: у нас это
   * значение по умолчанию, и записывать его отдельно нечем.
   */
  const method = type === 'NaturalService' ? 'natural' : type === 'Implantation' ? 'embryo' : null

  return {
    date,
    method,
    bullIdentifier: sire,
    rank: parseNumber(body.rank),
  }
}

/** Взвешивание. */
const parseWeight = (body: Record<string, unknown>, errors: AdeError[]) => {
  const date = need(parseDateTime(body.eventDateTime), 'eventDateTime', 'ожидается дата по RFC3339', errors)

  const value = need(
    parseQuantity(body.weight, 'weight', errors),
    'weight',
    'ожидается { measurement, units: "KGM" }',
    errors,
  )

  if (value !== null && value <= 0) {
    errors.push(
      adeError(400, ADE_CODE.fieldValue, 'Поле weight: масса должна быть больше нуля', undefined, {
        field: 'weight',
      }),
    )
  }

  return { date, weight: value }
}

/* ------------------------------------------------------------------ */

export const ADE_WRITABLE = [
  'test-day-results',
  'parturitions',
  'inseminations',
  'weights',
] as const

export type AdeWritable = (typeof ADE_WRITABLE)[number]

export const isAdeWritable = (v: string): v is AdeWritable =>
  (ADE_WRITABLE as readonly string[]).includes(v)

/**
 * Почему `animals` в список не входит.
 *
 * Стандарт допускает POST на животных, и технически это несложно. Но
 * запись животного в племенную книгу — не приём события, а утверждение
 * происхождения: кто отец, кто мать, какой номер, какая порода. Именно
 * это Ассоциация и проверяет, и именно за это отвечает перед заводчиком.
 *
 * Открыть на это интерфейс без проверки значило бы, что любая программа
 * с токеном хозяйства заводит животных в книге напрямую, минуя
 * верификацию, — то есть книга перестаёт быть книгой и становится
 * хранилищем чужих утверждений.
 *
 * Отказ здесь — не пробел, а правило, и клиенту он объясняется словами,
 * а не кодом 404: постановка животного на учёт идёт заявкой в кабинете.
 */
export const ADE_READ_ONLY_REASON: Record<string, string> = {
  animals:
    'Постановка животного на учёт идёт через заявку в кабинете: происхождение проверяет Ассоциация. Через обмен принимаются события у уже записанных животных.',
  'breeding-values':
    'Племенная ценность считается книгой, а не принимается извне: это результат оценки, а не наблюдение.',
  'type-classifications':
    'Оценка экстерьера принимается от аккредитованного оценщика через кабинет: в записи обязателен тот, кто оценивал.',
  /*
   * Перемещения отдаются, но не принимаются, и причина та же, что
   * у животных: перемещение меняет владельца в книге, а продажа,
   * заявленная одной стороной, — это не факт, а притязание. Хозяйство,
   * объявившее по обмену «эта корова пришла ко мне», переписало бы
   * владельца чужого животного одним запросом.
   *
   * Оформление сделки идёт через кабинет, где вторая сторона её видит
   * и где есть основание — накладная, договор, ветеринарное свидетельство.
   */
  arrivals:
    'Поступление меняет владельца животного в книге. Односторонняя заявка о переходе прав — притязание, а не факт: сделка оформляется в кабинете, где её видит вторая сторона.',
  departures:
    'Выбытие меняет владельца животного в книге и оформляется в кабинете вместе с основанием — накладной, договором или ветеринарным свидетельством.',
  deaths:
    'Падёж выводит животное из книги. Событие необратимое, и записывается оно в кабинете, а не потоком обмена.',
  /*
   * Проверка стельности своей записи не имеет: она живёт при осеменении.
   * Принять её значило бы угадать, к какому именно осеменению она
   * относится, — а ошибка в угадывании припишет результат чужой случке
   * и испортит расчёт сервис-периода.
   */
  'pregnancy-checks':
    'Проверка стельности записывается при осеменении, а не отдельно. Принять её отдельно значило бы угадывать, к какому осеменению она относится; ошибка припишет результат чужой случке.',
}

/* ------------------------------------------------------------------ */

export function parseAdeResource(collection: AdeWritable, body: unknown): ParseResult {
  const errors: AdeError[] = []
  const head = parseHead(body, errors)

  if (!head) return { ok: false, errors }

  const obj = body as Record<string, unknown>

  const values =
    collection === 'test-day-results'
      ? parseTestDayResult(obj, errors)
      : collection === 'parturitions'
        ? parseParturition(obj, errors)
        : collection === 'inseminations'
          ? parseInsemination(obj, errors)
          : parseWeight(obj, errors)

  /*
   * Удалённая запись разбирается по облегчённым правилам: у неё может
   * не быть ничего, кроме `meta`, и требовать дату события от того,
   * что просят снять, бессмысленно.
   */
  if (head.deleted) return { ok: true, value: { ...head, values: {} } }

  if (errors.length) return { ok: false, errors }

  return { ok: true, value: { ...head, values } }
}
