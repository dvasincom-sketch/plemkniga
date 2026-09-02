/**
 * Международный идентификатор животного.
 *
 * ## Зачем это книге
 *
 * Национальный племенной номер уникален внутри страны и бессмыслен
 * за её пределами: номер 0000123456 есть и у нас, и в Чехии, и в Канаде.
 * Международный идентификатор снимает это, приписав к номеру страну,
 * пол и породу.
 *
 * Заложить его надо сейчас, и это не преувеличение. Добавить поле легко
 * в любой момент; невозможно другое — восстановить задним числом,
 * из какой страны приехало животное и какой у него был номер там.
 * Стоит один раз перезаписать номер импортной коровы своим — и связь
 * с её родословной в стране происхождения теряется навсегда.
 *
 * ## Из чего состоит
 *
 * Шестнадцать символов международного номера:
 *
 *     NLD M 000574590532
 *     └┬┘ │ └─────┬────┘
 *      │  │       └─ национальный номер, 12 цифр с ведущими нулями
 *      │  └───────── пол: M или F
 *      └──────────── страна по ISO 3166-1, три буквы
 *
 * С кодом породы впереди получается девятнадцать:
 *
 *     HOL NLD M 000574590532
 *
 * Форма проверена по живым данным: списки быков чешской ассоциации
 * (`top-red-byku.pdf`, выпуск 2026/04) состоят ровно из таких номеров —
 * `NLDM000574590532`, `CZEM000944733021`, `DEUM000362097590`.
 *
 * ## Числовой код страны вместо буквенного
 *
 * В том же чешском списке рядом с буквенными стоят номера вида
 * `840M003141693664`. Это не ошибка: там, где номер происходит
 * от радиометки, страна записана числовым кодом ISO 3166-1 — тем самым,
 * который стоит первыми тремя цифрами метки. Обе формы законны,
 * и разбор обязан понимать обе.
 *
 * ## Что здесь не делается
 *
 * Номер не выдумывается. Если у животного нет национального номера
 * или неизвестна страна происхождения, международного номера у него нет,
 * и функция возвращает `null`. Собрать правдоподобный номер из того,
 * что под рукой, значило бы завести в книге идентификатор, которого
 * нет ни в одном реестре мира, — и однажды по нему что-нибудь найдут.
 */

/* ------------------------------------------------------------------ *
 *  Страны                                                            *
 * ------------------------------------------------------------------ */

/**
 * Коды стран по ISO 3166-1: три буквы и число.
 *
 * Список не полон и полным быть не должен: здесь страны, откуда
 * в российские стада реально приезжает голштинский скот, плюс страны
 * ЕАЭС. Неизвестная страна — это `null` из разбора, а не молчаливая
 * подстановка соседней.
 *
 * Числовой код нужен дважды: он же стоит первыми тремя цифрами
 * радиометки по ISO 11784, и по нему метка сопоставляется со страной.
 */
export const COUNTRIES = [
  { alpha3: 'RUS', numeric: '643', ru: 'Россия' },
  { alpha3: 'BLR', numeric: '112', ru: 'Беларусь' },
  { alpha3: 'KAZ', numeric: '398', ru: 'Казахстан' },
  { alpha3: 'KGZ', numeric: '417', ru: 'Киргизия' },
  { alpha3: 'ARM', numeric: '051', ru: 'Армения' },
  { alpha3: 'NLD', numeric: '528', ru: 'Нидерланды' },
  { alpha3: 'DEU', numeric: '276', ru: 'Германия' },
  { alpha3: 'USA', numeric: '840', ru: 'США' },
  { alpha3: 'CAN', numeric: '124', ru: 'Канада' },
  { alpha3: 'FRA', numeric: '250', ru: 'Франция' },
  { alpha3: 'DNK', numeric: '208', ru: 'Дания' },
  { alpha3: 'CZE', numeric: '203', ru: 'Чехия' },
  { alpha3: 'BEL', numeric: '056', ru: 'Бельгия' },
  { alpha3: 'ITA', numeric: '380', ru: 'Италия' },
  { alpha3: 'ESP', numeric: '724', ru: 'Испания' },
  { alpha3: 'GBR', numeric: '826', ru: 'Великобритания' },
  { alpha3: 'IRL', numeric: '372', ru: 'Ирландия' },
  { alpha3: 'AUT', numeric: '040', ru: 'Австрия' },
  { alpha3: 'CHE', numeric: '756', ru: 'Швейцария' },
  { alpha3: 'POL', numeric: '616', ru: 'Польша' },
  { alpha3: 'SWE', numeric: '752', ru: 'Швеция' },
  { alpha3: 'FIN', numeric: '246', ru: 'Финляндия' },
  { alpha3: 'HUN', numeric: '348', ru: 'Венгрия' },
  { alpha3: 'ISR', numeric: '376', ru: 'Израиль' },
  { alpha3: 'EST', numeric: '233', ru: 'Эстония' },
  { alpha3: 'LVA', numeric: '428', ru: 'Латвия' },
  { alpha3: 'LTU', numeric: '440', ru: 'Литва' },
  { alpha3: 'AUS', numeric: '036', ru: 'Австралия' },
  { alpha3: 'NZL', numeric: '554', ru: 'Новая Зеландия' },
  { alpha3: 'URY', numeric: '858', ru: 'Уругвай' },
  { alpha3: 'BRA', numeric: '076', ru: 'Бразилия' },
  { alpha3: 'ARG', numeric: '032', ru: 'Аргентина' },
] as const

export type CountryAlpha3 = (typeof COUNTRIES)[number]['alpha3']

export const RUSSIA: CountryAlpha3 = 'RUS'

/*
 * Ключ объявлен обычной строкой, а не выведенным из `as const` союзом
 * литералов. Иначе поиск требует, чтобы искомое уже было одним
 * из известных кодов, — то есть чтобы мы знали ответ до того, как
 * спросили. Справочник же существует ровно затем, чтобы отвечать
 * на вопрос о неизвестной строке, пришедшей из данных.
 */
type CountryRow = (typeof COUNTRIES)[number]

const BY_ALPHA3 = new Map<string, CountryRow>(COUNTRIES.map((c) => [c.alpha3, c]))
const BY_NUMERIC = new Map<string, CountryRow>(COUNTRIES.map((c) => [c.numeric, c]))

export const countryByAlpha3 = (code?: string | null) =>
  code ? (BY_ALPHA3.get(code.toUpperCase()) ?? null) : null

export const countryByNumeric = (code?: string | null) => (code ? (BY_NUMERIC.get(code) ?? null) : null)

/** Страна по любой из двух форм записи — буквенной или числовой. */
export const countryOf = (code?: string | null) =>
  countryByAlpha3(code) ?? countryByNumeric(code ?? undefined)

/* ------------------------------------------------------------------ *
 *  Радиометка по ISO 11784 / 11785                                   *
 * ------------------------------------------------------------------ */

/**
 * Пятнадцатизначное десятичное представление кода радиометки.
 *
 * Первые три цифры — код страны по ISO 3166-1 либо код изготовителя;
 * различить их по самому номеру нельзя, и это свойство стандарта,
 * а не наша недоработка. Коды изготовителей начинаются с 900 и выше,
 * поэтому число меньше 900, не совпавшее ни с одной страной, —
 * повод усомниться, а не молча принять.
 *
 * Проверяется только форма: длина, цифры и правдоподобие первых трёх.
 * Настоящая проверка метки — считать её сканером; книга видит уже
 * записанное число и может лишь заметить очевидную порчу.
 */
export type RfidCheck =
  | { ok: true; countryNumeric: string; country: string | null; manufacturer: boolean }
  | { ok: false; problem: string }

export function checkRfid(value?: string | null): RfidCheck {
  const raw = String(value ?? '').trim()
  if (!raw) return { ok: false, problem: 'номер пуст' }
  if (!/^\d{15}$/.test(raw)) {
    return { ok: false, problem: `должно быть ровно 15 цифр, а здесь «${raw}» (${raw.length})` }
  }

  const head = raw.slice(0, 3)
  const country = countryByNumeric(head)

  /*
   * 900 и выше — диапазон изготовителей, а не стран. Такая метка законна
   * (её ставят производители чипов), но страну по ней узнать нельзя,
   * и выдавать код изготовителя за код страны нельзя тем более.
   */
  if (Number(head) >= 900) {
    return { ok: true, countryNumeric: head, country: null, manufacturer: true }
  }

  if (!country) {
    return {
      ok: false,
      problem: `первые три цифры «${head}» не совпадают ни с одной известной страной и не похожи на код изготовителя`,
    }
  }

  return { ok: true, countryNumeric: head, country: country.alpha3, manufacturer: false }
}

/* ------------------------------------------------------------------ *
 *  Международный номер                                               *
 * ------------------------------------------------------------------ */

export type Sex = 'female' | 'male'

export type InternationalIdParts = {
  /** Страна: три буквы либо три цифры. */
  country: string
  sex: 'M' | 'F'
  /** Национальный номер, ровно 12 цифр с ведущими нулями. */
  number: string
}

/**
 * Оставить в номере только цифры и дополнить до двенадцати.
 *
 * Национальные номера пишут по-разному: `RU-0000123456`, `RU 0000123456`,
 * `123456`. Международный формат этого не терпит — там ровно двенадцать
 * цифр, — и приведение обязано быть одним на всю систему, иначе одно
 * и то же животное получит два разных международных номера в двух местах.
 *
 * Номер длиннее двенадцати цифр не обрезается: обрезка тихо превратила бы
 * его в чужой. Такой случай — отказ.
 */
export const normalizeNumber = (value?: string | null): string | null => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length > 12) return null
  return digits.padStart(12, '0')
}

export function buildInternationalId(opts: {
  country?: string | null
  sex?: Sex | null
  number?: string | null
}): string | null {
  const country = countryOf(opts.country)
  if (!country) return null

  if (opts.sex !== 'male' && opts.sex !== 'female') return null
  const sex = opts.sex === 'male' ? 'M' : 'F'

  const number = normalizeNumber(opts.number)
  if (!number) return null

  /*
   * Буквенная форма страны предпочтительна: она читается человеком
   * и именно её печатают в племенных документах. Числовая остаётся
   * там, где номер пришёл от радиометки и буквенного кода в нём
   * никогда не было.
   */
  return `${country.alpha3}${sex}${number}`
}

/**
 * Девятнадцать символов: порода впереди международного номера.
 *
 * Код породы — трёхсимвольный по справочнику ICAR, который ведёт
 * Interbull. Голштинская чёрно-пёстрая — `HOL`. Без кода породы
 * возвращается `null`, а не шестнадцатисимвольный номер: это разные
 * идентификаторы, и подменять один другим значило бы отдать наружу
 * номер, который не сойдётся по длине.
 */
export function buildAiid(opts: {
  breedCode?: string | null
  country?: string | null
  sex?: Sex | null
  number?: string | null
}): string | null {
  const breed = String(opts.breedCode ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2,3}$/.test(breed)) return null

  const international = buildInternationalId(opts)
  if (!international) return null

  return `${breed.padEnd(3, ' ').trimEnd()}${international}`
}

/**
 * Разбор международного номера обратно на части.
 *
 * Понимает обе формы страны и обе длины — шестнадцать символов
 * без породы и девятнадцать с ней. Возвращает `null` на всём, что
 * не разобралось: догадываться здесь опаснее, чем отказать.
 */
export function parseInternationalId(
  value?: string | null,
): (InternationalIdParts & { breed?: string }) | null {
  const raw = String(value ?? '').replace(/[\s-]/g, '').toUpperCase()

  /* Девятнадцать символов: первые три — порода. */
  if (raw.length === 19) {
    const breed = raw.slice(0, 3)
    const rest = parseInternationalId(raw.slice(3))
    return rest ? { ...rest, breed } : null
  }

  if (raw.length !== 16) return null

  const country = raw.slice(0, 3)
  const sex = raw.slice(3, 4)
  const number = raw.slice(4)

  if (sex !== 'M' && sex !== 'F') return null
  if (!/^\d{12}$/.test(number)) return null
  if (!countryOf(country)) return null

  return { country, sex, number }
}

/* ------------------------------------------------------------------ *
 *  Три уровня номера                                                 *
 * ------------------------------------------------------------------ */

export type AnimalIdentity = {
  /** Национальный номер в книге. */
  national?: string | null
  /** Страна происхождения по ISO 3166-1, три буквы. */
  originCountry?: string | null
  /**
   * Номер, под которым животное записано в стране происхождения.
   * Заполняется у импортных и **никогда не перезаписывается**.
   */
  originNumber?: string | null
  /** Радиометка по ISO 11785, 15 цифр. */
  rfid?: string | null
  sex?: Sex | null
  breedCode?: string | null
}

/**
 * Международный номер животного по трём уровням.
 *
 * ## Почему у импортного животного номер строится от страны происхождения
 *
 * Это главное правило всей затеи. Корова, приехавшая из Нидерландов,
 * известна миру под голландским номером; её родословная, её оценки
 * и её сёстры ищутся по нему. Наш номер — вторая, местная запись
 * о том же животном, и выдать его за международный значило бы
 * потребовать от чужой системы знать наш реестр, чтобы найти
 * собственную корову.
 *
 * Отсюда порядок: сначала страна происхождения и её номер, и только
 * если их нет — свои. И отсюда же требование никогда не перезаписывать
 * `originNumber`: восстановить его потом неоткуда.
 */
export function identityIds(a: AnimalIdentity): {
  international: string | null
  aiid: string | null
  /** Откуда взялся номер — чтобы страница могла это показать. */
  from: 'origin' | 'national' | null
} {
  const imported =
    a.originNumber && a.originCountry && countryOf(a.originCountry)?.alpha3 !== RUSSIA

  const source = imported
    ? { country: a.originCountry, number: a.originNumber, from: 'origin' as const }
    : { country: a.originCountry ?? RUSSIA, number: a.national, from: 'national' as const }

  const international = buildInternationalId({ ...source, sex: a.sex })
  if (!international) return { international: null, aiid: null, from: null }

  return {
    international,
    aiid: buildAiid({ ...source, sex: a.sex, breedCode: a.breedCode }),
    from: source.from,
  }
}
