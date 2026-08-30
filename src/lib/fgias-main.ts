import { fgiasDate, fgiasFloat, type FgiasColumn, type Held } from '@/lib/fgias-export'

/**
 * Шаблон «Основные сведения» — тот, с которого всё начинается.
 *
 * ## Почему он первый и почему один такой
 *
 * Во всех прочих шаблонах животное названо базовым номером ФГИАС, которого
 * у нас нет. Здесь наоборот: колонка «Идентификатор учётной системы» стоит
 * первой, и это наш ключ. Хозяйство сдаёт этот файл, реестр присваивает
 * номера и возвращает их обратным файлом — только после этого оживают
 * лактации, родословная и всё остальное.
 *
 * То есть пока этот шаблон не уехал, вся выгрузка книги стоит.
 *
 * ## Строки не придерживаются, и это осознанное расхождение с решением №239
 *
 * В «Лактации» строка с незаполненным обязательным полем не уезжает:
 * реестр отвергает такие молча и целым файлом, а лактации сдаются каждый
 * месяц — потерять один заход дёшево, разбираться в отказе дорого.
 *
 * Здесь цена перевёрнута. Придержать строку значит не получить по ней
 * номер, то есть заморозить это животное во всей выгрузке навсегда.
 * И главное: что здесь **действительно** обязательно, мы не знаем. Лист
 * «Описание контракта» помечает «НЕОБЯЗАТЕЛЬНО» только линию и масть,
 * а из сорока шести колонок половина заведомо не может требоваться
 * от животного, рождённого в своём же хозяйстве, — «Дата импорта»,
 * «Страна-экспортер», реквизиты продавца.
 *
 * Читать это строго значит не отдать ни одной строки и не узнать ничего.
 * Единственный источник правды о том, что реестр требует, — сам реестр,
 * и спросить его можно только отправкой.
 *
 * Поэтому по умолчанию уезжает всё, а отчёт показывает заполненность
 * по каждой колонке: хозяйство видит, где у него тонко, до отправки,
 * а не после. Ключ `--strogo` включает придержание по тем пяти полям,
 * без которых строка бессмысленна заведомо.
 *
 * ## Чего мы не заполняем и почему
 *
 * Реквизиты продавца и всё импортное — дата, страна-экспортёр, импортные
 * номер и кличка. Книга их не ведёт, и заводить пять полей в карточке
 * каждой российской коровы ради десяти импортных дороже, чем польза.
 *
 * Страна, регион и район рождения теперь заполняются — но только у тех
 * животных, кому их проставили: списки загружаются однажды
 * (`npm run sync:fgias-geo`), а вот проставить район каждому животному
 * может только хозяйство.
 */

/* ------------------------------------------------------------------ */
/*  Половозрастные группы                                              */
/* ------------------------------------------------------------------ */

/**
 * Наши шесть групп против шести групп реестра — и они не сходятся.
 *
 * Реестр для КРС держит: Бык, Бык-кастрат, Бычок, Бычок-кастрат, Корова,
 * Телка. Мы держим: Телёнок, Тёлка, Первотёлка, Корова 2 лакт.,
 * Корова 3+ лакт., Бык-производитель.
 *
 * Расходятся они дважды, и по-разному.
 *
 * **Три наши группы схлопываются в одну.** Первотёлка, корова второй
 * лактации и корова третьей и старше — для реестра все просто «Корова».
 * Различение по лактациям наше и остаётся нашим; реестр его не спрашивает
 * и не хранит. Потери тут нет: число лактаций уезжает своим шаблоном.
 *
 * **А одна наша группа требует пола, чтобы разложиться.** «Телёнок» —
 * это «Бычок» или «Телка», и по самой группе не узнать. Пол у нас лежит
 * отдельным полем, поэтому карта берёт оба значения. Телёнок без пола
 * не разложится, и это правильно: угадать здесь — перевернуть половину
 * молодняка.
 *
 * **Кастратов мы не ведём вовсе**, и заводить их ради полноты чужого
 * справочника незачем: в молочном стаде их не бывает, а если появятся —
 * это новая группа у нас, а не догадка здесь.
 */
export const FGIAS_AGE_GROUP = {
  bull: '4f54c60d-ffe4-4faf-948a-269c1c8c39b3',
  bullCalf: '13e95283-a7ab-452c-863c-b90d49368773',
  cow: 'f7f7a679-99e6-4e9c-bec9-d00ddc13271e',
  heifer: 'bf3ddf57-7407-4590-ac10-3f5b66fb3694',
} as const

/**
 * Группа реестра по нашей группе и полу.
 *
 * Возвращает `undefined`, когда разложить нельзя, — а не «Не определено».
 * У реестра есть такое значение, и подставлять его молча значило бы
 * сказать «мы посмотрели и не поняли» там, где мы не посмотрели.
 */
export const fgiasAgeGroup = (
  ageGroup?: string | null,
  sex?: string | null,
): string | undefined => {
  switch (ageGroup) {
    case 'bull':
      return FGIAS_AGE_GROUP.bull
    case 'heifer':
      return FGIAS_AGE_GROUP.heifer
    case 'firstCalf':
    case 'cow2':
    case 'cow3':
      return FGIAS_AGE_GROUP.cow
    case 'calf':
      if (sex === 'male') return FGIAS_AGE_GROUP.bullCalf
      if (sex === 'female') return FGIAS_AGE_GROUP.heifer
      return undefined
    default:
      return undefined
  }
}

/* ------------------------------------------------------------------ */
/*  Колонки                                                            */
/* ------------------------------------------------------------------ */

/**
 * Сорок шесть колонок «КРС_Основные_сведения_v.2.1», слово в слово.
 *
 * Часть заголовков в самом файле записана в две строки прямо внутри
 * ячейки — «Импортный ⏎ идентификационный номер». Здесь они выписаны
 * с настоящим переносом: сверка с шаблоном сравнивает приведённые
 * значения, а приведение схлопывает пробелы и переносы.
 */
export const MAIN_COLUMNS: FgiasColumn[] = [
  { title: 'Идентификатор учётной системы', type: 'string', width: 38 },
  { title: 'Регистрационный номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'Базовый номер ФГИАС ПР', type: 'uuid', width: 38 },
  { title: 'УНЖ (Уникальный номер животного)', type: 'string', width: 20 },
  { title: 'УНСМ (Уникальный Номер Средств Маркирования)', type: 'string', width: 20 },
  { title: 'Импортный\nидентификационный номер\n', type: 'string', width: 20 },
  { title: 'Событие, Тип поступления', type: 'uuid', width: 38 },
  { title: 'Событие, Дата поступления', type: 'date', width: 14 },
  { title: 'Страна регистрации собственника', type: 'uuid', width: 38 },
  { title: 'Наименование собственника ', type: 'string', width: 30 },
  { title: 'ИНН собственника', type: 'string', width: 14 },
  { title: 'КПП собственника', type: 'string', width: 12 },
  { title: 'ОГРН/ОГРНИП собственника', type: 'string', width: 16 },
  { title: 'Страна регистрации продавца', type: 'uuid', width: 38 },
  { title: 'Наименование продавца', type: 'string', width: 30 },
  { title: 'ИНН продавца', type: 'string', width: 14 },
  { title: 'КПП продавца', type: 'string', width: 12 },
  { title: 'ОГРН/ОГРНИП продавца', type: 'string', width: 16 },
  { title: 'Дата импорта', type: 'date', width: 14 },
  { title: 'Страна-экспортер', type: 'uuid', width: 38 },
  { title: 'Импортное наименование/кличка', type: 'string', width: 22 },
  { title: 'Половозрастная группа', type: 'uuid', width: 38 },
  { title: 'Дата определения половозрастной группы', type: 'date', width: 14 },
  { title: 'Назначение', type: 'uuid', width: 38 },
  { title: 'Дата определения назначения', type: 'date', width: 14 },
  { title: 'Тип породы', type: 'uuid', width: 38 },
  { title: 'Порода', type: 'uuid', width: 38 },
  { title: 'Дата определения породы', type: 'date', width: 14 },
  { title: 'Кровность, %', type: 'float', width: 10 },
  { title: 'Дата мечения\nУНСМ', type: 'date', width: 14 },
  { title: 'Технологический номер', type: 'string', width: 16 },
  { title: 'Дата мечения технологическим номером', type: 'date', width: 14 },
  { title: 'Кличка', type: 'string', width: 22 },
  { title: 'Дата рождения', type: 'date', width: 14 },
  { title: 'Страна рождения', type: 'uuid', width: 38 },
  { title: 'Регион рождения', type: 'uuid', width: 38 },
  { title: 'Район рождения', type: 'uuid', width: 38 },
  { title: 'Наименование хозяйства при рождении', type: 'string', width: 30 },
  { title: 'ИНН хозяйства при рождении', type: 'string', width: 14 },
  { title: 'КПП хозяйства при рождении', type: 'string', width: 12 },
  { title: 'ОГРН/ОГРНИП хозяйства при рождении', type: 'string', width: 16 },
  { title: 'Базовый идентификатор ФГИАС ПР отца', type: 'uuid', width: 38 },
  { title: 'Базовый идентификатор ФГИАС ПР матери', type: 'uuid', width: 38 },
  { title: 'Способ получения', type: 'uuid', width: 38 },
  { title: 'Линия', type: 'uuid', width: 38 },
  { title: 'Масть', type: 'uuid', width: 38 },
]

/**
 * Пять полей, без которых строка бессмысленна заведомо.
 *
 * Не «обязательные по контракту» — этого мы не знаем, — а те, при
 * отсутствии которых реестру нечего заводить: он не поймёт, о каком
 * животном речь и что это за животное. Придержание по ним включается
 * ключом `--strogo`; по умолчанию они лишь считаются в отчёте.
 */
export const MAIN_ESSENTIAL = [
  'Идентификатор учётной системы',
  'УНЖ (Уникальный номер животного)',
  'Половозрастная группа',
  'Кличка',
  'Дата рождения',
] as const

/* ------------------------------------------------------------------ */
/*  Сборка                                                             */
/* ------------------------------------------------------------------ */

export type MainAnimal = {
  identNumber: string
  accountingId?: string | null
  baseUuid?: string | null
  registrationUuid?: string | null
  unsm?: string | null
  name?: string | null
  birthDate?: string | null
  sex?: string | null
  ageGroup?: string | null
  ageGroupDate?: string | null
  bloodPercent?: number | null
  inventoryNumber?: string | null
  /** Ключи реестра из наших справочников — уже развёрнутые. */
  breedUuid?: string | null
  breedTypeUuid?: string | null
  breedDate?: string | null
  lineUuid?: string | null
  coatColorUuid?: string | null
  purposeUuid?: string | null
  purposeDate?: string | null
  receiptMethodUuid?: string | null
  /** Место рождения — ключи реестра и реквизиты хозяйства. */
  birthCountryUuid?: string | null
  birthRegionUuid?: string | null
  birthDistrictUuid?: string | null
  birthFarm?: {
    name?: string | null
    inn?: string | null
    kpp?: string | null
    ogrn?: string | null
  } | null
  owner?: {
    name?: string | null
    inn?: string | null
    kpp?: string | null
    ogrn?: string | null
  } | null
}

export type MainBuilt = {
  columns: FgiasColumn[]
  rows: (string | number)[][]
  held: Held[]
  /** Сколько строк заполнило колонку — по заголовку. */
  filled: Map<string, number>
  total: number
}

const s = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '')

export function buildMain(
  animals: MainAnimal[],
  options: { strict?: boolean } = {},
): MainBuilt {
  const rows: (string | number)[][] = []
  const held: Held[] = []
  const filled = new Map<string, number>()
  for (const c of MAIN_COLUMNS) filled.set(c.title, 0)

  for (const a of animals) {
    const group = fgiasAgeGroup(a.ageGroup, a.sex)
    const blood = fgiasFloat(a.bloodPercent)

    /*
     * Порядок значений строго повторяет `MAIN_COLUMNS`. Держать их
     * двумя списками — известный способ однажды сдвинуть всё вправо
     * на одну колонку; проверка сверяет длину строки с числом колонок
     * именно поэтому.
     */
    const row: (string | number)[] = [
      s(a.accountingId),
      s(a.registrationUuid),
      s(a.baseUuid),
      s(a.identNumber),
      s(a.unsm),
      '', // Импортный идентификационный номер — книга не ведёт
      '', // Тип поступления — справочник, значения ещё не проставлены
      '', // Дата поступления
      '', // Страна регистрации собственника — реестр стран, нужен разовый запрос
      s(a.owner?.name),
      s(a.owner?.inn),
      s(a.owner?.kpp),
      s(a.owner?.ogrn),
      '', // Страна регистрации продавца
      '', // Наименование продавца — книга не ведёт
      '', // ИНН продавца
      '', // КПП продавца
      '', // ОГРН продавца
      '', // Дата импорта
      '', // Страна-экспортер
      '', // Импортное наименование
      group ?? '',
      fgiasDate(a.ageGroupDate) ?? '',
      s(a.purposeUuid),
      fgiasDate(a.purposeDate) ?? '',
      s(a.breedTypeUuid),
      s(a.breedUuid),
      fgiasDate(a.breedDate) ?? '',
      blood ?? '',
      '', // Дата мечения УНСМ
      s(a.inventoryNumber),
      '', // Дата мечения технологическим номером
      s(a.name),
      fgiasDate(a.birthDate) ?? '',
      s(a.birthCountryUuid),
      s(a.birthRegionUuid),
      s(a.birthDistrictUuid),
      s(a.birthFarm?.name),
      s(a.birthFarm?.inn),
      s(a.birthFarm?.kpp),
      s(a.birthFarm?.ogrn),
      '', // Базовый идентификатор отца — придёт обратным файлом
      '', // Базовый идентификатор матери
      s(a.receiptMethodUuid),
      s(a.lineUuid),
      s(a.coatColorUuid),
    ]

    /*
     * В строгом режиме строка придерживается по первому же незаполненному
     * существенному полю. Причина называется заголовком колонки — тем же
     * словом, каким её называет реестр.
     */
    if (options.strict) {
      const missing = MAIN_ESSENTIAL.find((title) => {
        const at = MAIN_COLUMNS.findIndex((c) => c.title === title)
        return at === -1 || row[at] === '' || row[at] === undefined
      })
      if (missing) {
        held.push({ identNumber: a.identNumber, what: 'основные сведения', why: missing })
        continue
      }
    }

    MAIN_COLUMNS.forEach((c, i) => {
      if (row[i] !== '' && row[i] !== undefined) filled.set(c.title, (filled.get(c.title) ?? 0) + 1)
    })

    rows.push(row)
  }

  return { columns: MAIN_COLUMNS, rows, held, filled, total: animals.length }
}
