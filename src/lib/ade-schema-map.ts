import schemas from '@/data/ade-schemas.json'

/**
 * Карта схем ICAR: что лежит в копии и что из этого участвует в сверке.
 *
 * ## Почему это отдельный файл, а не текст на странице
 *
 * Числа здесь меняются вместе с копией схем и вместе с нашим набором
 * ресурсов, а страница про них рассказывает. Написав их словами,
 * мы завели бы второе место, где живёт состояние, — и оно отстало бы
 * первым, потому что стоит на самом видном месте.
 *
 * Выписка `src/data/ade-schemas.json` собирается из самих файлов копии
 * (`npm run ade:map`), и всё, что показывает страница, считается из неё.
 *
 * ## Что означает «участвует в сверке»
 *
 * Не «мы её читаем», а «без неё сверка не состоится». Наши одиннадцать
 * ресурсов ссылаются на общие предки, те — на типы, типы —
 * на перечисления. Замкнутый круг этих ссылок и есть множество схем,
 * которыми наш ответ проверяется на самом деле.
 *
 * Остальные лежат в дереве по двум причинам, и обе честные: ссылки
 * должны разрешаться целиком, а обновление стандарта должно быть видно
 * построчным сравнением — включая то, чего мы пока не делаем.
 */

export type AdeSchemaRow = {
  name: string
  /** `resources`, `types`, `enums`, `collections`. */
  dir: string
  /** Участвует ли в сверке наших ресурсов. */
  in: boolean
}

const data = schemas as {
  source: string
  branch: string
  commit: string
  /** День, когда снята копия схем: страница обмена показывает его читателю. */
  fetchedAt: string
  total: number
  used: number
  schemas: AdeSchemaRow[]
}

export const ADE_MAP = data
export const ADE_SCHEMAS: AdeSchemaRow[] = data.schemas

/* ------------------------------------------------------------------ *
 *  Что из этого — наше                                               *
 * ------------------------------------------------------------------ */

/**
 * Имена наших ресурсов — они же ключи перевода.
 *
 * Союзом, а не просто строкой: словарь языка, в котором ресурса нет,
 * не соберётся (`i18n/data/ade-schema.ts`). Именно ради этого раньше
 * стояли парные поля `titleEn`; на шести языках то же требование
 * держит тип ключа.
 */
/**
 * Проза, которую переводят: у ресурса — имя и содержание, у темы —
 * имя и причина, по которой её в книге нет. Оба вида полей объявлены
 * здесь, рядом с русским источником, чтобы словарь языка не мог
 * разойтись с ним по составу полей.
 */
export type AdeResourceText = { title: string; what: string }
export type AdeThemeText = { title: string; why: string }

export type AdeResourceName =
  | 'icarAnimalCoreResource'
  | 'icarTestDayResultEventResource'
  | 'icarReproParturitionEventResource'
  | 'icarReproInseminationEventResource'
  | 'icarWeightEventResource'
  | 'icarReproPregnancyCheckEventResource'
  | 'icarTypeClassificationEventResource'
  | 'icarBreedingValueResource'
  | 'icarMovementArrivalEventResource'
  | 'icarMovementDepartureEventResource'
  | 'icarMovementDeathEventResource'

/**
 * Одиннадцать наших ресурсов: чем они являются в книге.
 *
 * Список написан руками, а не выведен из имён: «icarWeightEventResource»
 * не объясняет зоотехнику ничего, а «взвешивание — живая масса
 * на дату» объясняет всё. Соответствие имени и смысла — единственное
 * место, где перевод со стандартного языка на человеческий делаем мы.
 *
 * Русское пояснение остаётся здесь, потому что оно и есть источник;
 * пять остальных языков лежат словарями в `i18n/data/ade-schema.<язык>.ts`.
 * Само имя схемы не переводится и не транслитерируется ни на одном
 * из них: по нему ищут в стандарте.
 */
export const ADE_OURS: {
  schema: AdeResourceName
  title: string
  what: string
  /** Читается всеми, пишется — только там, где это наблюдение. */
  write: boolean
}[] = [
  {
    schema: 'icarAnimalCoreResource',
    title: 'Животное',
    what: 'Карточка: номера, пол, дата рождения, порода, родители.',
    write: false,
  },
  {
    schema: 'icarTestDayResultEventResource',
    title: 'Контрольное доение',
    what: 'Удой за сутки, жир, белок, соматические клетки на дату.',
    write: true,
  },
  {
    schema: 'icarReproParturitionEventResource',
    title: 'Отёл',
    what: 'Дата, номер отёла, лёгкость, перечень приплода с полом и статусом.',
    write: true,
  },
  {
    schema: 'icarReproInseminationEventResource',
    title: 'Осеменение',
    what: 'Дата, кратность, бык, способ воспроизводства.',
    write: true,
  },
  {
    schema: 'icarWeightEventResource',
    title: 'Взвешивание',
    what: 'Живая масса на дату, в килограммах.',
    write: true,
  },
  {
    schema: 'icarReproPregnancyCheckEventResource',
    title: 'Проверка стельности',
    what: 'Результат теста; живёт при осеменении, своей записи не имеет.',
    write: false,
  },
  {
    schema: 'icarTypeClassificationEventResource',
    title: 'Оценка экстерьера',
    what: 'Линейные признаки и сводные оценки, с указанием оценщика.',
    write: false,
  },
  {
    schema: 'icarBreedingValueResource',
    title: 'Племенная ценность',
    what: 'Значение индекса, достоверность, профиль весов, база сравнения.',
    write: false,
  },
  {
    schema: 'icarMovementArrivalEventResource',
    title: 'Поступление',
    what: 'Животное пришло в хозяйство: покупка, ввоз, перевод.',
    write: false,
  },
  {
    schema: 'icarMovementDepartureEventResource',
    title: 'Выбытие',
    what: 'Животное ушло: продажа, перевод, выбраковка на убой.',
    write: false,
  },
  {
    schema: 'icarMovementDeathEventResource',
    title: 'Падёж',
    what: 'Гибель на ферме — отдельный ресурс со своими полями.',
    write: false,
  },
]

/* ------------------------------------------------------------------ *
 *  Что в стандарте есть, а у нас нет                                 *
 * ------------------------------------------------------------------ */

/**
 * Ключ темы — короткое слово, а не её русское имя.
 *
 * Раньше тема опознавалась по заголовку, и заголовок же показывался
 * читателю. На шести языках так нельзя: заголовок переводится, а ключ,
 * по которому считаются схемы, обязан остаться тем же. Ключ ещё
 * и держит полноту словарей — тема без перевода не соберётся
 * (`i18n/data/ade-schema.ts`).
 */
export type AdeThemeKey =
  | 'feed'
  | 'health'
  | 'slaughter'
  | 'groups'
  | 'devices'
  | 'inventory'
  | 'repro'
  | 'milk'
  | 'other'

/**
 * Темы стандарта за пределами книги.
 *
 * Ключевое слово ищется в имени схемы, поэтому порядок значим: `Milk`
 * встречается и в кормах, и в устройствах, и разбор идёт сверху вниз.
 * Правило грубое и годится ровно для того, для чего заведено, —
 * показать читателю размер стандарта и границы книги.
 *
 * Ни одна из этих тем не «не сделана». Каждая — сознательно вне области:
 * племенная книга отвечает за происхождение и продуктивность,
 * а не за кормовой стол и не за убойный цех.
 *
 * Последняя тема, `other`, слов для поиска не имеет и не должна: в неё
 * попадает всё, что не опознано предыдущими. Стоять она обязана в конце,
 * потому что разбор идёт сверху вниз.
 */
export const ADE_THEMES: {
  key: AdeThemeKey
  title: string
  keys: string[]
  why: string
}[] = [
  {
    key: 'feed',
    title: 'Корма и рационы',
    keys: ['Feed', 'Ration', 'Consumed'],
    why: 'Кормление ведут в системе управления стадом; книге нужен результат, а не рацион.',
  },
  {
    key: 'health',
    title: 'Здоровье и лечение',
    keys: ['Health', 'Diagnosis', 'Treatment', 'Medicine', 'Withdrawal', 'Attention'],
    why: 'Ветеринарный контур отдельный и по закону, и по ответственности.',
  },
  {
    key: 'slaughter',
    title: 'Убой и туши',
    keys: ['Carcass', 'Processing', 'Chain', 'Plant'],
    why: 'Мясной учёт: другая отрасль, другие измерения, другой потребитель.',
  },
  {
    key: 'groups',
    title: 'Группы животных',
    keys: ['Group', 'AnimalSet', 'Sorting'],
    why: 'Групповые события и сортировка нужны роботам на ферме, а не книге.',
  },
  {
    key: 'devices',
    title: 'Устройства и датчики',
    keys: ['Device', 'Position', 'Milking', 'DailyMilking', 'Statistics', 'Observation', 'Metric'],
    why: 'Показания доильного зала и датчиков — сырьё для фермы; в книгу попадает итог.',
  },
  {
    key: 'inventory',
    title: 'Склад и оборот',
    keys: ['Inventory', 'Transaction', 'Product', 'Bottle'],
    why: 'Учёт запасов и движения товара — задача хозяйства, а не племенного учёта.',
  },
  {
    key: 'repro',
    title: 'Воспроизводство сверх нашего',
    keys: ['Heat', 'Abortion', 'Embryo', 'DoNotBreed', 'Mating', 'Gestation', 'Semen', 'Repro'],
    why: 'Охоты, аборты, трансплантация эмбрионов — следующий шаг, названный в разборе ICAR.',
  },
  {
    key: 'milk',
    title: 'Молоко сверх нашего',
    keys: ['Milk', 'Lactation', 'TestDay', 'Quarter', 'Sample'],
    why: 'Подробности дойки по четвертям и визитам; книга ведёт контрольные доения.',
  },
  {
    key: 'other',
    title: 'Прочее ядро стандарта',
    keys: [],
    why: 'Общие предки, ссылки на ресурсы, служебные обёртки коллекций.',
  },
]

/** Тема схемы, не участвующей в сверке. Первое совпадение сверху вниз. */
export const themeOf = (name: string): AdeThemeKey => {
  for (const t of ADE_THEMES) {
    if (t.keys.some((k) => name.includes(k))) return t.key
  }
  return 'other'
}

/** Сколько схем в каждой теме — считается, а не пишется словами. */
export const themeCounts = (): { key: AdeThemeKey; count: number }[] => {
  const outside = ADE_SCHEMAS.filter((s) => !s.in)

  return ADE_THEMES.map((t) => ({
    key: t.key,
    count: outside.filter((s) => themeOf(s.name) === t.key).length,
  })).filter((t) => t.count > 0)
}

/** Каталоги копии схем: `resources`, `types`, `enums`, `collections`. */
export type AdeSchemaDir = 'resources' | 'types' | 'enums' | 'collections'

const ADE_DIRS: AdeSchemaDir[] = ['resources', 'types', 'enums', 'collections']

/**
 * Русские заголовки групп схем.
 *
 * Остальные пять языков лежат словарём (`i18n/data/ade-schema.ts`),
 * и по-английски каталог называется так, как он и лежит в репозитории
 * ICAR: `Resources`, `Types`, `Enumerations`, `Collections`.
 */
export const ADE_DIR_TITLE: Record<AdeSchemaDir, string> = {
  resources: 'Ресурсы',
  types: 'Типы',
  enums: 'Перечисления',
  collections: 'Коллекции',
}

/** Схемы сверки по каталогам — для таблицы «что участвует». */
export const usedByDir = (): { dir: AdeSchemaDir; names: string[] }[] =>
  ADE_DIRS.map((dir) => ({
    dir,
    names: ADE_SCHEMAS.filter((s) => s.in && s.dir === dir)
      .map((s) => s.name)
      .sort((a, b) => a.localeCompare(b)),
  })).filter((g) => g.names.length > 0)
