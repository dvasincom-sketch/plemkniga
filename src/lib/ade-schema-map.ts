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
 * Одиннадцать наших ресурсов: чем они являются в книге.
 *
 * Список написан руками, а не выведен из имён: «icarWeightEventResource»
 * не объясняет зоотехнику ничего, а «взвешивание — живая масса
 * на дату» объясняет всё. Соответствие имени и смысла — единственное
 * место, где перевод со стандартного языка на человеческий делаем мы.
 */
export const ADE_OURS: {
  schema: string
  title: string
  what: string
  /**
   * То же по-английски — для витрины.
   *
   * Полем рядом с русским, а не отдельным словарём по имени схемы:
   * словарь в другом файле разъезжается молча, ресурс добавили здесь,
   * перевести забыли, и на английской странице появляется «Падёж».
   * Поле обязательное — без него не соберётся.
   *
   * Имена взяты из самого стандарта, а не переведены с русского:
   * `parturition`, `type classification`, `test-day result` — это слова
   * ADE, и партнёр ищет по ним, а не по нашему пересказу.
   *
   * Кабинет остаётся русским и этих полей не видит.
   */
  titleEn: string
  whatEn: string
  /** Читается всеми, пишется — только там, где это наблюдение. */
  write: boolean
}[] = [
  {
    schema: 'icarAnimalCoreResource',
    title: 'Животное',
    what: 'Карточка: номера, пол, дата рождения, порода, родители.',
    titleEn: 'Animal',
    whatEn: 'The record: identifiers, sex, date of birth, breed, parents.',
    write: false,
  },
  {
    schema: 'icarTestDayResultEventResource',
    title: 'Контрольное доение',
    what: 'Удой за сутки, жир, белок, соматические клетки на дату.',
    titleEn: 'Test-day result',
    whatEn: 'Daily yield, fat, protein and somatic cells on a date.',
    write: true,
  },
  {
    schema: 'icarReproParturitionEventResource',
    title: 'Отёл',
    what: 'Дата, номер отёла, лёгкость, перечень приплода с полом и статусом.',
    titleEn: 'Parturition',
    whatEn: 'Date, parity, calving ease, the list of calves with sex and status.',
    write: true,
  },
  {
    schema: 'icarReproInseminationEventResource',
    title: 'Осеменение',
    what: 'Дата, кратность, бык, способ воспроизводства.',
    titleEn: 'Insemination',
    whatEn: 'Date, service number, sire, method of reproduction.',
    write: true,
  },
  {
    schema: 'icarWeightEventResource',
    title: 'Взвешивание',
    what: 'Живая масса на дату, в килограммах.',
    titleEn: 'Weight',
    whatEn: 'Live weight on a date, in kilograms.',
    write: true,
  },
  {
    schema: 'icarReproPregnancyCheckEventResource',
    title: 'Проверка стельности',
    what: 'Результат теста; живёт при осеменении, своей записи не имеет.',
    titleEn: 'Pregnancy check',
    whatEn: 'The result of the test; it lives on the insemination and has no record of its own.',
    write: false,
  },
  {
    schema: 'icarTypeClassificationEventResource',
    title: 'Оценка экстерьера',
    what: 'Линейные признаки и сводные оценки, с указанием оценщика.',
    titleEn: 'Type classification',
    whatEn: 'Linear traits and composite scores, with the classifier named.',
    write: false,
  },
  {
    schema: 'icarBreedingValueResource',
    title: 'Племенная ценность',
    what: 'Значение индекса, достоверность, профиль весов, база сравнения.',
    titleEn: 'Breeding value',
    whatEn: 'Index value, reliability, weight profile, comparison base.',
    write: false,
  },
  {
    schema: 'icarMovementArrivalEventResource',
    title: 'Поступление',
    what: 'Животное пришло в хозяйство: покупка, ввоз, перевод.',
    titleEn: 'Arrival',
    whatEn: 'The animal came to the holding: purchase, import, transfer.',
    write: false,
  },
  {
    schema: 'icarMovementDepartureEventResource',
    title: 'Выбытие',
    what: 'Животное ушло: продажа, перевод, выбраковка на убой.',
    titleEn: 'Departure',
    whatEn: 'The animal left: sale, transfer, culling for slaughter.',
    write: false,
  },
  {
    schema: 'icarMovementDeathEventResource',
    title: 'Падёж',
    what: 'Гибель на ферме — отдельный ресурс со своими полями.',
    titleEn: 'Death',
    whatEn: 'Death on the farm — a separate resource with fields of its own.',
    write: false,
  },
]

/* ------------------------------------------------------------------ *
 *  Что в стандарте есть, а у нас нет                                 *
 * ------------------------------------------------------------------ */

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
 */
export const ADE_THEMES: {
  title: string
  keys: string[]
  why: string
  /**
   * Тема и причина по-английски — обязательными полями, по той же
   * причине, что и у `ADE_OURS`: новая тема без английского имени
   * не соберётся, и на витрине не появится русская строка среди
   * английской таблицы.
   */
  titleEn: string
  whyEn: string
}[] = [
  {
    title: 'Корма и рационы',
    keys: ['Feed', 'Ration', 'Consumed'],
    why: 'Кормление ведут в системе управления стадом; книге нужен результат, а не рацион.',
    titleEn: 'Feed and rations',
    whyEn:
      'Feeding is kept in the herd management system; the book needs the result, not the ration.',
  },
  {
    title: 'Здоровье и лечение',
    keys: ['Health', 'Diagnosis', 'Treatment', 'Medicine', 'Withdrawal', 'Attention'],
    why: 'Ветеринарный контур отдельный и по закону, и по ответственности.',
    titleEn: 'Health and treatment',
    whyEn: 'The veterinary side is separate both in law and in responsibility.',
  },
  {
    title: 'Убой и туши',
    keys: ['Carcass', 'Processing', 'Chain', 'Plant'],
    why: 'Мясной учёт: другая отрасль, другие измерения, другой потребитель.',
    titleEn: 'Slaughter and carcasses',
    whyEn: 'Meat recording: another industry, other measurements, another consumer.',
  },
  {
    title: 'Группы животных',
    keys: ['Group', 'AnimalSet', 'Sorting'],
    why: 'Групповые события и сортировка нужны роботам на ферме, а не книге.',
    titleEn: 'Animal groups',
    whyEn: 'Group events and sorting are needed by robots on the farm, not by the book.',
  },
  {
    title: 'Устройства и датчики',
    keys: ['Device', 'Position', 'Milking', 'DailyMilking', 'Statistics', 'Observation', 'Metric'],
    why: 'Показания доильного зала и датчиков — сырьё для фермы; в книгу попадает итог.',
    titleEn: 'Devices and sensors',
    whyEn:
      'Readings from the milking parlour and from sensors are raw material for the farm; the book takes the result.',
  },
  {
    title: 'Склад и оборот',
    keys: ['Inventory', 'Transaction', 'Product', 'Bottle'],
    why: 'Учёт запасов и движения товара — задача хозяйства, а не племенного учёта.',
    titleEn: 'Inventory and turnover',
    whyEn: 'Stock and the movement of goods are the holding’s task, not that of breed recording.',
  },
  {
    title: 'Воспроизводство сверх нашего',
    keys: ['Heat', 'Abortion', 'Embryo', 'DoNotBreed', 'Mating', 'Gestation', 'Semen', 'Repro'],
    why: 'Охоты, аборты, трансплантация эмбрионов — следующий шаг, названный в разборе ICAR.',
    titleEn: 'Reproduction beyond ours',
    whyEn: 'Heats, abortions, embryo transfer — the next step, named in the ICAR section map.',
  },
  {
    title: 'Молоко сверх нашего',
    keys: ['Milk', 'Lactation', 'TestDay', 'Quarter', 'Sample'],
    why: 'Подробности дойки по четвертям и визитам; книга ведёт контрольные доения.',
    titleEn: 'Milk beyond ours',
    whyEn: 'Milking detail by quarter and by visit; the book keeps test-day recordings.',
  },
]

/** Тема схемы, не участвующей в сверке. Первое совпадение сверху вниз. */
export const themeOf = (name: string): string => {
  for (const t of ADE_THEMES) {
    if (t.keys.some((k) => name.includes(k))) return t.title
  }
  return 'Прочее ядро стандарта'
}

/** Сколько схем в каждой теме — считается, а не пишется словами. */
export const themeCounts = (): {
  title: string
  why: string
  titleEn: string
  whyEn: string
  count: number
}[] => {
  const outside = ADE_SCHEMAS.filter((s) => !s.in)
  const rest = outside.filter((s) => themeOf(s.name) === 'Прочее ядро стандарта').length

  return [
    ...ADE_THEMES.map((t) => ({
      title: t.title,
      why: t.why,
      titleEn: t.titleEn,
      whyEn: t.whyEn,
      count: outside.filter((s) => themeOf(s.name) === t.title).length,
    })).filter((t) => t.count > 0),
    {
      title: 'Прочее ядро стандарта',
      why: 'Общие предки, ссылки на ресурсы, служебные обёртки коллекций.',
      titleEn: 'The rest of the standard core',
      whyEn: 'Common ancestors, references to resources, service wrappers for collections.',
      count: rest,
    },
  ]
}

/** Схемы сверки по каталогам — для таблицы «что участвует». */
export const usedByDir = (): {
  dir: string
  title: string
  titleEn: string
  names: string[]
}[] => {
  const title: Record<string, string> = {
    resources: 'Ресурсы',
    types: 'Типы',
    enums: 'Перечисления',
    collections: 'Коллекции',
  }

  /*
   * Английские имена каталогов — те же слова, что и в самом репозитории
   * ICAR: витрина называет каталог так, как он там и лежит.
   */
  const titleEn: Record<string, string> = {
    resources: 'Resources',
    types: 'Types',
    enums: 'Enumerations',
    collections: 'Collections',
  }

  return ['resources', 'types', 'enums', 'collections']
    .map((dir) => ({
      dir,
      title: title[dir] ?? dir,
      titleEn: titleEn[dir] ?? dir,
      names: ADE_SCHEMAS.filter((s) => s.in && s.dir === dir)
        .map((s) => s.name)
        .sort((a, b) => a.localeCompare(b)),
    }))
    .filter((g) => g.names.length > 0)
}
