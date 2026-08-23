/**
 * Форматы файлов загрузки — единый источник правды.
 *
 * ## Зачем реестр
 *
 * Список принимаемых колонок жил в трёх местах и в трёх видах: словарём
 * заголовков в `actions/data.ts`, строкой «Ожидаемые колонки: …» в карточке
 * импорта и нигде — в виде шаблона, который можно скачать и заполнить.
 *
 * Расходились они мгновенно. В словаре разбора значились «Возраст»
 * и «Состояние», в подсказке их не было, а в записываемые данные они
 * не попадали вовсе: файл с этими колонками принимался, колонки читались,
 * и содержимое молча пропадало. Худший вид ошибки — тот, о котором система
 * знает и молчит.
 *
 * Здесь один список на набор данных, из которого собирается всё: словарь
 * для разбора, таблица на странице и файл-шаблон. Разойтись им теперь негде.
 *
 * ## Почему наборов несколько
 *
 * Загрузка принимала только животных. Отёлы, осеменения и дойки файлом
 * не грузились никогда — при том что именно их и приходит много, тысячами
 * строк из доильного зала и из программы техника. Одиночный ввод для них
 * появился (`/account/events/new`), но он для пяти записей, а не для пяти
 * тысяч.
 *
 * Наборы разведены, а не свалены в один файл с колонкой «тип строки»:
 * у отёла и у дойки нет ни одной общей колонки кроме номера животного,
 * и общий формат означал бы таблицу, где в каждой строке заполнена
 * четверть ячеек.
 */

export type ColumnKind = 'text' | 'number' | 'date' | 'sex' | 'breed' | 'herd' | 'animal'

export type ImportColumn = {
  /** Куда попадает значение — путь в карточке животного. */
  key: string
  /** Канонический заголовок: он идёт в шаблон. */
  title: string
  /** Другие принимаемые написания. Регистр не важен. */
  aliases: string[]
  kind: ColumnKind
  required?: boolean
  what: string
  example: string
  /** Оговорка, без которой колонку поймут неверно. */
  note?: string
}

export type ColumnGroup = {
  key: string
  label: string
  intro: string
  columns: ImportColumn[]
}

/* -------------------------------------------------------------------- */

const PASSPORT: ImportColumn[] = [
  {
    key: 'identNumber',
    title: 'Инд.№',
    aliases: ['инд№', 'индивидуальный номер', 'identnumber', 'номер'],
    kind: 'text',
    required: true,
    what: 'Индивидуальный номер животного. Единственная обязательная колонка: по ней запись узнают при повторной загрузке.',
    example: 'RU1234567890',
    note: 'Если номер уже есть в книге за вашим хозяйством, строка обновит существующую запись, а не заведёт вторую.',
  },
  {
    key: 'name',
    title: 'Кличка',
    aliases: ['name', 'имя'],
    kind: 'text',
    what: 'Кличка животного.',
    example: 'Зорька',
  },
  {
    key: 'sex',
    title: 'Пол',
    aliases: ['sex'],
    kind: 'sex',
    what: 'Принимается «Ж» и «М», а также «женский», «мужской», female, male.',
    example: 'Ж',
    note: 'Колонки нет или значение не распознано — животное записывается коровой. Для файла с быками колонка обязательна, иначе они молча станут самками.',
  },
  {
    key: 'birthDate',
    title: 'Дата рождения',
    aliases: ['birthdate', 'др'],
    kind: 'date',
    what: 'Дата в виде 2023-04-17 или 17.04.2023.',
    example: '2023-04-17',
  },
  {
    key: 'altIds.earTag',
    title: 'Бирка',
    aliases: ['ушная бирка', 'номер бирки', 'eartag'],
    kind: 'text',
    what: 'Номер ушной бирки. Уникальным не считается: бирки меняют и перевешивают.',
    example: '4821',
  },
  {
    key: 'breed',
    title: 'Порода',
    aliases: ['breed'],
    kind: 'breed',
    what: 'Название породы как в справочнике. Ищется без учёта регистра.',
    example: 'Голштинская',
    note: 'Породы, которой нет в справочнике, строка не заведёт: значение будет пропущено, а строка принята.',
  },
  {
    key: 'herd',
    title: 'Стадо',
    aliases: ['группа', 'ферма'],
    kind: 'herd',
    what: 'Название стада внутри вашего хозяйства.',
    example: 'Первое отделение',
  },
  {
    key: 'bloodPercent',
    title: 'Кровность, %',
    aliases: ['кровность', 'кровность по голштину', 'кровность, %'],
    kind: 'number',
    what: 'Доля крови по голштину, от 0 до 100.',
    example: '87,5',
  },
  {
    key: 'ageGroup',
    title: 'Возрастная группа',
    aliases: ['возраст', 'группа животного'],
    kind: 'text',
    what: 'Код группы: calf, heifer, firstCalf, cow, bull.',
    example: 'cow',
  },
  {
    key: 'state',
    title: 'Состояние',
    aliases: [],
    kind: 'text',
    what: 'Код состояния: alive, sold, culled, dead.',
    example: 'alive',
  },
  {
    key: 'notes',
    title: 'Примечание',
    aliases: ['комментарий'],
    kind: 'text',
    what: 'Свободный текст.',
    example: '',
  },
]

const ORIGIN: ImportColumn[] = [
  {
    key: 'pedigreeText.fatherId',
    title: 'Отец, инд.№',
    aliases: ['отец', 'инд.№ отца', 'father'],
    kind: 'text',
    what: 'Номер отца со свидетельства.',
    example: 'HO840003289278542',
    note: 'Записывается текстом. Если предок есть в книге, связь установится по номеру — это отдельный разбор, а не момент загрузки.',
  },
  {
    key: 'pedigreeText.fatherName',
    title: 'Отец, кличка',
    aliases: ['кличка отца'],
    kind: 'text',
    what: 'Кличка отца со свидетельства.',
    example: 'PATRIOT 76',
  },
  {
    key: 'pedigreeText.motherId',
    title: 'Мать, инд.№',
    aliases: ['мать', 'инд.№ матери', 'mother'],
    kind: 'text',
    what: 'Номер матери со свидетельства.',
    example: 'RU0987654321',
  },
  {
    key: 'pedigreeText.motherName',
    title: 'Мать, кличка',
    aliases: ['кличка матери'],
    kind: 'text',
    what: 'Кличка матери со свидетельства.',
    example: 'Ромашка',
  },
]

const PRODUCTION: ImportColumn[] = [
  {
    key: 'summary.milkYield',
    title: 'Удой, кг',
    aliases: ['удой', 'удой, л', 'milkyield'],
    kind: 'number',
    what: 'Удой за лактацию, килограммов.',
    example: '8450',
    note: 'Это сводное значение по карточке, а не контрольная дойка. Отдельные замеры вводятся событием.',
  },
  {
    key: 'summary.fatPercent',
    title: 'Жир, %',
    aliases: ['жир'],
    kind: 'number',
    what: 'Массовая доля жира.',
    example: '3,92',
  },
  {
    key: 'summary.proteinPercent',
    title: 'Белок, %',
    aliases: ['белок'],
    kind: 'number',
    what: 'Массовая доля белка.',
    example: '3,31',
  },
  {
    key: 'summary.fatKg',
    title: 'Жир, кг',
    aliases: [],
    kind: 'number',
    what: 'Молочный жир в килограммах.',
    example: '331',
  },
  {
    key: 'summary.proteinKg',
    title: 'Белок, кг',
    aliases: [],
    kind: 'number',
    what: 'Молочный белок в килограммах.',
    example: '280',
  },
  {
    /*
     * ИПЦ принимается файлом с самого начала, и колонка оставлена, чтобы
     * не сломать уже собранные хозяйствами файлы. Но вообще-то индекс
     * система считает сама, и присланное значение она затрёт при первом же
     * пересчёте. Оговорка ниже — единственное честное, что тут можно
     * сказать, пока колонку не убрали совсем.
     */
    key: 'ipc',
    title: 'ИПЦ',
    aliases: ['ipc'],
    kind: 'number',
    what: 'Индекс племенной ценности.',
    example: '',
    note: 'Система считает индекс сама по базе сравнения. Присланное значение сохранится, но будет заменено при ближайшем пересчёте — колонку лучше не заполнять.',
  },
]


/* ==================================================================== */
/*  Наборы данных                                                       */
/* ==================================================================== */

/**
 * Номер животного — первая колонка у всех наборов событий.
 *
 * Вынесен отдельной сборкой, а не скопирован трижды: заголовок один и тот
 * же, псевдонимы те же, и разойтись они не должны. Разное у наборов только
 * пояснение — что именно случится с этой строкой.
 */
const animalRef = (what: string, note?: string): ImportColumn => ({
  key: 'animal',
  title: 'Инд.№',
  aliases: ['инд№', 'индивидуальный номер', 'identnumber', 'номер', 'номер животного'],
  kind: 'animal',
  required: true,
  what,
  example: 'RU1234567890',
  note:
    note ??
    'Животное должно быть в вашем стаде. Строка с номером чужого или несуществующего животного не принимается — так событие не попадёт не на ту корову.',
})

const CALVINGS: ImportColumn[] = [
  animalRef('Номер коровы, которая отелилась.'),
  {
    key: 'date',
    title: 'Дата отёла',
    aliases: ['дата', 'отёл', 'отел'],
    kind: 'date',
    required: true,
    what: 'Дата в виде 2024-03-15 или 15.03.2024.',
    example: '2024-03-15',
  },
  {
    key: 'number',
    title: 'Номер отёла',
    aliases: ['№ отёла', 'лактация'],
    kind: 'number',
    what: 'По счёту в жизни коровы.',
    example: '',
    note: 'Оставьте пустым — система поставит следующий за последним записанным. Заполнять стоит только при переносе истории из прежней системы учёта, где нумерация уже своя.',
  },
  {
    key: 'result',
    title: 'Результат',
    aliases: ['приплод'],
    kind: 'text',
    what: 'Код: heifer, bull, twins, stillborn, abortion.',
    example: 'heifer',
  },
  {
    key: 'ease',
    title: 'Лёгкость отёла',
    aliases: ['лёгкость', 'легкость'],
    kind: 'text',
    what: 'Код: easy, assisted, hard.',
    example: 'easy',
  },
  {
    key: 'calfWeight',
    title: 'Масса телёнка, кг',
    aliases: ['масса телёнка', 'вес телёнка'],
    kind: 'number',
    what: 'Живая масса при рождении.',
    example: '38',
  },
  {
    key: 'dryOffDate',
    title: 'Дата запуска',
    aliases: ['запуск'],
    kind: 'date',
    what: 'Когда корову запустили после этой лактации.',
    example: '',
  },
  {
    key: 'milkingDays',
    title: 'Дойных дней',
    aliases: ['дней дойки'],
    kind: 'number',
    what: 'Длительность лактации в днях.',
    example: '',
  },
  {
    key: 'comment',
    title: 'Комментарий',
    aliases: ['примечание'],
    kind: 'text',
    what: 'Свободный текст.',
    example: '',
  },
]

const INSEMINATIONS: ImportColumn[] = [
  animalRef('Номер коровы или тёлки, которую осеменяли.'),
  {
    key: 'date',
    title: 'Дата осеменения',
    aliases: ['дата', 'осеменение'],
    kind: 'date',
    required: true,
    what: 'Дата в виде 2024-06-02 или 02.06.2024.',
    example: '2024-06-02',
  },
  {
    key: 'bull',
    title: 'Инд.№ быка',
    aliases: ['бык', 'производитель', 'отец'],
    kind: 'animal',
    what: 'Номер быка-производителя.',
    example: '',
    note: 'Ищется по всей книге, а не только по вашему стаду: семя чаще всего привозное. Не найден — строка принимается, но бык остаётся незаполненным.',
  },
  {
    key: 'attemptNumber',
    title: 'Кратность',
    aliases: ['попытка', 'по счёту'],
    kind: 'number',
    what: 'Которое по счёту осеменение в этот отёл.',
    example: '1',
  },
  {
    key: 'doses',
    title: 'Доз семени',
    aliases: ['дозы'],
    kind: 'number',
    what: 'Сколько доз израсходовано.',
    example: '1',
  },
  {
    key: 'comment',
    title: 'Комментарий',
    aliases: ['примечание'],
    kind: 'text',
    what: 'Свободный текст.',
    example: '',
  },
]

const MILK_TESTS: ImportColumn[] = [
  animalRef('Номер животного, у которого брали замер.'),
  {
    key: 'date',
    title: 'Дата замера',
    aliases: ['дата', 'дата дойки'],
    kind: 'date',
    required: true,
    what: 'Дата контрольной дойки.',
    example: '2024-07-11',
  },
  {
    key: 'dailyYield',
    title: 'Удой за день, кг',
    aliases: ['удой', 'удой, кг', 'суточный удой'],
    kind: 'number',
    required: true,
    what: 'Надой за сутки.',
    example: '28,4',
  },
  {
    key: 'fatPercent',
    title: 'Жир, %',
    aliases: ['жир'],
    kind: 'number',
    what: 'Массовая доля жира.',
    example: '3,92',
  },
  {
    key: 'proteinPercent',
    title: 'Белок, %',
    aliases: ['белок'],
    kind: 'number',
    what: 'Массовая доля белка.',
    example: '3,31',
  },
  {
    key: 'somaticCells',
    title: 'Соматика, тыс./мл',
    aliases: ['соматические клетки', 'соматика', 'scc'],
    kind: 'number',
    what: 'Количество соматических клеток, тысяч на миллилитр.',
    example: '145',
  },
  {
    key: 'lactationNumber',
    title: 'Номер лактации',
    aliases: ['лактация'],
    kind: 'number',
    what: 'По счёту в жизни коровы.',
    example: '',
    note: 'Оставьте пустым — система возьмёт число записанных отёлов.',
  },
]

export type DatasetKey = 'animals' | 'calvings' | 'inseminations' | 'milkTests'

export type Dataset = {
  key: DatasetKey
  label: string
  /** Одной строкой: что делает загрузка этого набора. */
  hint: string
  /** Каким видом заводится пакет загрузки. */
  submissionKind: 'animals' | 'events' | 'productivity'
  groups: ColumnGroup[]
}

export const DATASETS: Dataset[] = [
  {
    key: 'animals',
    label: 'Животные',
    hint: 'Заводит новые карточки и обновляет существующие по номеру',
    submissionKind: 'animals',
    groups: [
      {
        key: 'passport',
        label: 'Паспорт',
        intro: 'Кто это животное. Обязательна одна колонка — индивидуальный номер.',
        columns: PASSPORT,
      },
      {
        key: 'origin',
        label: 'Происхождение',
        intro:
          'Номера родителей со свидетельства. Раньше загрузкой не принимались вовсе, и происхождение приходилось вводить руками по одному животному.',
        columns: ORIGIN,
      },
      {
        key: 'production',
        label: 'Продуктивность',
        intro: 'Сводные значения по карточке — не контрольные дойки.',
        columns: PRODUCTION,
      },
    ],
  },
  {
    key: 'calvings',
    label: 'Отёлы',
    hint: 'Добавляет отёлы существующим коровам',
    submissionKind: 'events',
    groups: [
      {
        key: 'calvings',
        label: 'Отёлы',
        intro:
          'Каждая строка — один отёл. Животное должно уже быть в вашем стаде: загрузка отёлов карточек не заводит.',
        columns: CALVINGS,
      },
    ],
  },
  {
    key: 'inseminations',
    label: 'Осеменения',
    hint: 'Добавляет осеменения существующим коровам и тёлкам',
    submissionKind: 'events',
    groups: [
      {
        key: 'inseminations',
        label: 'Осеменения',
        intro: 'Каждая строка — одно осеменение.',
        columns: INSEMINATIONS,
      },
    ],
  },
  {
    key: 'milkTests',
    label: 'Контрольные дойки',
    hint: 'Добавляет замеры — то, что приходит выгрузкой из доильного зала',
    submissionKind: 'productivity',
    groups: [
      {
        key: 'milkTests',
        label: 'Контрольные дойки',
        intro: 'Каждая строка — один замер по одному животному.',
        columns: MILK_TESTS,
      },
    ],
  },
]

export const datasetByKey = (key: string): Dataset | undefined =>
  DATASETS.find((d) => d.key === key)

export const columnsOf = (ds: Dataset): ImportColumn[] => ds.groups.flatMap((g) => g.columns)

/**
 * Заголовок файла → внутреннее поле.
 *
 * Собирается из реестра, а не пишется руками: колонка, попавшая в таблицу
 * на странице, но не в словарь разбора, — это обещание, которого система
 * не выполнит.
 */
export const headerMapOf = (ds: Dataset): Record<string, string> =>
  Object.fromEntries(
    columnsOf(ds).flatMap((c) => [
      [c.title.toLowerCase(), c.key],
      ...c.aliases.map((a) => [a.toLowerCase(), c.key] as const),
    ]),
  )

/** Заголовки и строка-пример для файла-шаблона. */
export const templateRowsOf = (ds: Dataset): { headers: string[]; example: string[] } => {
  const cols = columnsOf(ds)
  return { headers: cols.map((c) => c.title), example: cols.map((c) => c.example) }
}
