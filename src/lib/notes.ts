/**
 * Разборы — раздел витрины, где объясняется, как устроено то, что уже
 * работает в книге.
 *
 * ## Почему начали не с чужих исследований
 *
 * План раздела (`docs/kontent-plan.md`) предлагал начать с трёх выжимок
 * чужих работ. Начали с другого, и это лучше по трём причинам.
 *
 * **Источник у нас на руках.** Разбор чужой статьи стоит ровно столько,
 * сколько стоит наше чтение этой статьи, и проверить его читатель может
 * только сходив в первоисточник. Разбор нашей же базы сравнения
 * проверяется иначе: рядом стоит страница, где это число работает,
 * и число на ней то самое.
 *
 * **Это и есть обещание витрины.** Мы просим верить индексу и отчётам
 * потому, что их можно пересчитать. Раздел, где показано, откуда взято
 * каждое число и что с ним сделано, — не реклама этого обещания,
 * а его исполнение.
 *
 * **Оно не устаревает молча.** Выжимка чужой работы стареет вместе
 * с работой, и заметить это некому. Разбор нашего узла стареет вместе
 * с узлом — то есть вместе с кодом, который правится и проверяется.
 *
 * Чужие работы никуда не деваются: разбор возраста первого отёла
 * наполовину состоит из них. Разница в том, что рамка своя.
 *
 * ## Правила жанра
 *
 * Из `docs/kontent-plan.md`, и они не пожелания:
 *
 * У каждого разбора **паспорт**: что разбирается, откуда числа, когда
 * прочитано. **Имя автора** — аноним, объясняющий генетику, это тот же
 * рекламный буклет. Отдельно — **чего разбор не доказывает**. И ритм:
 * один разбор, который не стыдно показать, лучше пяти наспех.
 *
 * ## Почему только по-русски
 *
 * Тот же довод, что у страниц пород. Шесть языков от разбора на сорок
 * абзацев — это пять машинных переводов текста, вся ценность которого
 * в точности формулировок. Нерусские адреса ведут на ту же русскую
 * страницу и помечены `canonical` на неё.
 */

export type NoteSource = {
  /** Как называется источник — так, чтобы его можно было найти без ссылки. */
  title: string
  url?: string
  /** Что именно взято отсюда. */
  what?: string
}

export type Note = {
  slug: string
  title: string
  /** Одна строка, ради которой страницу открыли. */
  lead: string
  /** Дата разбора, ISO. Не «обновлено»: разбор — высказывание с датой. */
  date: string
  author: string
  authorUrl?: string
  /**
   * Паспорт: что разбирается и на каком материале. Стоит перед текстом,
   * потому что читатель решает по нему, стоит ли читать дальше.
   */
  passport: { label: string; value: string }[]
  sources: NoteSource[]
}

export const NOTE_AUTHOR = 'Дмитрий Васин'
export const NOTE_AUTHOR_URL = 'https://t.me/dvasin'

export const NOTES: Note[] = [
  {
    slug: 'baza-sravneniya',
    title: 'База сравнения: что стоит за строкой CDCB-2025-metric',
    lead:
      'Индекс племенной ценности бессмыслен без базы, относительно которой он считается. ' +
      'Разбираем нашу: откуда взяты стандартные отклонения, что с ними сделано, ' +
      'где у источника не нашлось нужного признака и чем это грозит.',
    date: '2026-09-04',
    author: NOTE_AUTHOR,
    authorUrl: NOTE_AUTHOR_URL,
    passport: [
      { label: 'Что разбирается', value: 'База сравнения, по которой книга считает ИПЦ' },
      { label: 'Версия в системе', value: 'CDCB-2025-metric' },
      { label: 'Первоисточник', value: 'USDA AGIL, ARR NM$9 (01-25), февраль 2025' },
      { label: 'Признаков в базе', value: '11 из 17 у источника' },
    ],
    sources: [
      {
        title: 'VanRaden P. M. et al. Net merit as a measure of lifetime profit: 2025 revision (ARR NM$9)',
        url: 'https://uscdcb.com/wp-content/uploads/2025/02/nmcalc-2025_ARR-NM9_without-type_composites.pdf',
        what: 'Стандартные отклонения признаков и относительные веса NM$ 2025',
      },
      {
        title: 'CDCB. National Dairy Genetic Index Update, Base Change Set for April 2025',
        url: 'https://uscdcb.com/national-dairy-genetic-index-update-base-change-set-for-april-2025/',
        what: 'Смена генетической базы на коров рождения 2020 года и её величина по голштинам',
      },
      {
        title: 'CDCB. Introducing Net Merit 2025',
        url: 'https://uscdcb.com/introducing-net-merit-2025/',
        what: 'История индекса, состав и порядок пересмотра',
      },
    ],
  },
  {
    slug: 'nabor-isthema',
    title: 'Набор Истхэма: 396 471 корова, на которых стоит полоса сравнения',
    lead:
      'В отчёте «Возраст первого отёла» рядом с распределением вашего стада стоит британское. ' +
      'Разбираем, откуда оно взято, почему пересчитано нами заново и что из него ' +
      'нельзя выводить, даже когда очень хочется.',
    date: '2026-09-04',
    author: NOTE_AUTHOR,
    authorUrl: NOTE_AUTHOR_URL,
    passport: [
      { label: 'Что разбирается', value: 'Справочное распределение в отчёте «Возраст первого отёла»' },
      { label: 'Версия в системе', value: 'UK-2018-raw' },
      { label: 'Выборка', value: '396 471 корова, 6 985 стад, Великобритания' },
      { label: 'Отёлы', value: '2006–2008, наблюдение до 2012 года' },
    ],
    sources: [
      {
        title: 'Eastham N. T. et al. Associations between age at first calving and subsequent lactation performance in UK Holstein and Holstein-Friesian dairy cows. PLOS ONE, 2018',
        url: 'https://doi.org/10.1371/journal.pone.0197764',
        what: 'Постановка, выборка и опубликованные модельные кривые',
      },
      {
        title: 'Набор данных к статье, Dryad, лицензия CC0',
        url: 'https://doi.org/10.5061/dryad.85fm181',
        what: 'Исходные записи, по которым мы считали распределение сами',
      },
    ],
  },
  {
    slug: 'indeks-i-nm-tpi',
    title: 'Почему наш индекс нельзя сравнивать с NM$ и TPI',
    lead:
      'У быка в каталоге TPI 3050, а в книге +512 — и это не спор о том, кто прав. ' +
      'Разбираем четыре причины расхождения: шкала, набор признаков, происхождение оценок ' +
      'и база; и то, как международное сравнение делается на самом деле.',
    date: '2026-09-04',
    author: NOTE_AUTHOR,
    authorUrl: NOTE_AUTHOR_URL,
    passport: [
      { label: 'Что разбирается', value: 'Сопоставимость нашего ИПЦ с американскими индексами' },
      { label: 'Что сравнивается', value: 'NM$ 2025 (CDCB) и TPI редакции апреля 2026 (HAUSA)' },
      { label: 'Признаков в NM$', value: '12 отдельных и 5 композитов; шести из них у нас нет' },
      { label: 'Короткий ответ', value: 'Разные шкалы, признаки, оценки и базы' },
    ],
    sources: [
      {
        title: 'VanRaden P. M. et al. Net merit as a measure of lifetime profit: 2025 revision (ARR NM$9)',
        url: 'https://uscdcb.com/wp-content/uploads/2025/02/nmcalc-2025_ARR-NM9_without-type_composites.pdf',
        what: 'Состав NM$ 2025, относительные веса признаков и стандартное отклонение индекса',
      },
      {
        title: 'Holstein Association USA. TPI Formula — April 2026',
        url: 'https://www.holsteinusa.com/genetic_evaluations/ss_tpi_formula.html',
        what: 'Состав TPI, веса групп признаков и постоянная 2845 в формуле',
      },
      {
        title: 'CDCB. National Dairy Genetic Index Update, Base Change Set for April 2025',
        url: 'https://uscdcb.com/national-dairy-genetic-index-update-base-change-set-for-april-2025/',
        what: 'Смена генетической базы на коров рождения 2020 года и её величина',
      },
      {
        title: 'Interbull. Multiple Across Country Evaluation (MACE)',
        url: 'https://interbull.org/ib/mace',
        what: 'Как оценки быков переводятся на шкалу другой страны',
      },
    ],
  },
  {
    slug: 'otsenka-eksterjera',
    title: 'Оценка экстерьера: как её ведут в мире и что взято у нас',
    lead:
      'Корову можно похвалить, а можно описать — и это разные утверждения. ' +
      'Рассказываем, откуда взялась линейная оценка, что в ней согласовано международно, ' +
      'чем от неё отличается бонитировочный класс и почему мы держим оба измерения врозь.',
    date: '2026-09-04',
    author: NOTE_AUTHOR,
    authorUrl: NOTE_AUTHOR_URL,
    passport: [
      { label: 'Что разбирается', value: 'Системы оценки экстерьера и наш выбор шкалы' },
      { label: 'Международная рамка', value: 'ICAR, раздел 5; WHFF — 20 стандартных признаков' },
      { label: 'У нас', value: '18 линейных признаков по шкале 1–9 и 3 композита' },
      { label: 'Отечественная рамка', value: 'Бонитировка: приказ Минсельхоза № 379 от 2010 года' },
    ],
    sources: [
      {
        title: 'ICAR. Section 5 — Conformation Recording',
        url: 'https://wiki.icar.org/index.php/Section_05_%E2%80%93_Conformation_Recording',
        what: 'Список стандартных признаков, шкала 1–9, композиты и границы классов',
      },
      {
        title: 'Holstein Association USA. Classification — Type Evaluation',
        url: 'https://www.holsteinusa.com/programs_services/classification.html',
        what: 'Шкала 1–50, семнадцать признаков, веса разделов, Final Score и BAA',
      },
      {
        title: 'Lactanet. Display of Type Traits with an Intermediate Optimum',
        url: 'https://lactanet.ca/en/display-of-type-traits-with-an-intermediate-optimum/',
        what: 'Решение декабря 2023 года о признаках, у которых лучшее значение посередине',
      },
      {
        title:
          'Приказ Минсельхоза России от 28.10.2010 № 379 «Об утверждении Порядка и условий проведения бонитировки племенного крупного рогатого скота молочного и молочно-мясного направлений продуктивности»',
        url: 'https://normativ.kontur.ru/document?documentId=168882',
        what: 'Стобалльная оценка экстерьера и комплексные классы',
      },
      {
        title: 'Юшкова И. «Рожки да ножки» и другие особенности национальной бонитировки. Журнал «Председатель»',
        url: 'https://predsedatel-apk.ru/zhivotnovodstvo/bonitirovka-novaya-metodika/',
        what: 'Мнение специалиста о том, как бонитировка-2010 применялась на практике',
      },
    ],
  },
]

export const noteBySlug = (slug: string): Note | undefined => NOTES.find((n) => n.slug === slug)
