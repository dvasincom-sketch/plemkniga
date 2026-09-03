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
export const ADE_THEMES: { title: string; keys: string[]; why: string }[] = [
  {
    title: 'Корма и рационы',
    keys: ['Feed', 'Ration', 'Consumed'],
    why: 'Кормление ведут в системе управления стадом; книге нужен результат, а не рацион.',
  },
  {
    title: 'Здоровье и лечение',
    keys: ['Health', 'Diagnosis', 'Treatment', 'Medicine', 'Withdrawal', 'Attention'],
    why: 'Ветеринарный контур отдельный и по закону, и по ответственности.',
  },
  {
    title: 'Убой и туши',
    keys: ['Carcass', 'Processing', 'Chain', 'Plant'],
    why: 'Мясной учёт: другая отрасль, другие измерения, другой потребитель.',
  },
  {
    title: 'Группы животных',
    keys: ['Group', 'AnimalSet', 'Sorting'],
    why: 'Групповые события и сортировка нужны роботам на ферме, а не книге.',
  },
  {
    title: 'Устройства и датчики',
    keys: [
      'Device',
      'Position',
      'Milking',
      'DailyMilking',
      'Statistics',
      'Observation',
      'Metric',
    ],
    why: 'Показания доильного зала и датчиков — сырьё для фермы; в книгу попадает итог.',
  },
  {
    title: 'Склад и оборот',
    keys: ['Inventory', 'Transaction', 'Product', 'Bottle'],
    why: 'Учёт запасов и движения товара — задача хозяйства, а не племенного учёта.',
  },
  {
    title: 'Воспроизводство сверх нашего',
    keys: [
      'Heat',
      'Abortion',
      'Embryo',
      'DoNotBreed',
      'Mating',
      'Gestation',
      'Semen',
      'Repro',
    ],
    why: 'Охоты, аборты, трансплантация эмбрионов — следующий шаг, названный в разборе ICAR.',
  },
  {
    title: 'Молоко сверх нашего',
    keys: ['Milk', 'Lactation', 'TestDay', 'Quarter', 'Sample'],
    why: 'Подробности дойки по четвертям и визитам; книга ведёт контрольные доения.',
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
export const themeCounts = (): { title: string; why: string; count: number }[] => {
  const outside = ADE_SCHEMAS.filter((s) => !s.in)
  const rest = outside.filter((s) => themeOf(s.name) === 'Прочее ядро стандарта').length

  return [
    ...ADE_THEMES.map((t) => ({
      title: t.title,
      why: t.why,
      count: outside.filter((s) => themeOf(s.name) === t.title).length,
    })).filter((t) => t.count > 0),
    {
      title: 'Прочее ядро стандарта',
      why: 'Общие предки, ссылки на ресурсы, служебные обёртки коллекций.',
      count: rest,
    },
  ]
}

/** Схемы сверки по каталогам — для таблицы «что участвует». */
export const usedByDir = (): { dir: string; title: string; names: string[] }[] => {
  const title: Record<string, string> = {
    resources: 'Ресурсы',
    types: 'Типы',
    enums: 'Перечисления',
    collections: 'Коллекции',
  }

  return ['resources', 'types', 'enums', 'collections']
    .map((dir) => ({
      dir,
      title: title[dir] ?? dir,
      names: ADE_SCHEMAS.filter((s) => s.in && s.dir === dir)
        .map((s) => s.name)
        .sort((a, b) => a.localeCompare(b)),
    }))
    .filter((g) => g.names.length > 0)
}
