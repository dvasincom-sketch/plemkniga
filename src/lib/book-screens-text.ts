import type { Locale } from '@/lib/i18n/locales'
import { pick, type Translated } from '@/lib/i18n/translated'

/**
 * Слова внутри нарисованных экранов книги.
 *
 * ## Зачем понадобился отдельный набор
 *
 * Экраны разделов (`components/site/BookScreens.tsx`), бланк документа
 * (`CertificateArt.tsx`) и карточка на главной (`ScreenArt.tsx`) нарисованы
 * вёрсткой, а не сняты с экрана, и один из четырёх доводов в пользу вёрстки
 * был такой: рисунок переводится вместе со страницей. Довод оставался
 * обещанием. Подписи стояли прямо в разметке, то есть по-русски на всех
 * шести языках, и английская страница выходила такой: текст переведён,
 * а под ним русская картинка с русскими колонками и русскими кличками.
 *
 * Это хуже непереведённой страницы. Непереведённое видно сразу; наполовину
 * переведённое выглядит небрежностью и заставляет сомневаться в остальном —
 * а витрина только на том и держится, что её можно проверить.
 *
 * ## Почему `Translated`, а не `Record<Locale, …>`
 *
 * По той же причине, что у разбора раздела (`book-page-text.ts`): здесь
 * полторы сотни зоотехнических подписей, и требование «все шесть языков
 * разом» дало бы либо ничего, либо четыре машинных перевода, достоверных
 * на вид для того, кто языка не знает, то есть для нас. Русский и английский
 * написаны, остальные откатываются на русский — видимым откатом, о котором
 * страница говорит вслух.
 *
 * ## Почему клички транслитерированы, а не переведены
 *
 * «Ромашка» на английской странице — `Romashka`, а не `Camomile`: это имя
 * животного, а не слово. Переведённая кличка означала бы, что в книге стоит
 * другое животное, и человек, сверивший рисунок с выгрузкой, увидел бы
 * расхождение там, где его нет. Номера (`RU 4512 087`), коды пород (`HOL`)
 * и международные номера не трогаются вовсе — они одинаковы везде.
 *
 * Названия хозяйств — тот же случай, но с оговоркой: «ООО «Рассвет»» —
 * это форма собственности плюс имя, и по-английски правовая форма чужой
 * страны читателю ничего не сообщает. Остаётся имя и род занятий:
 * `Rassvet farm`.
 *
 * ## Что здесь не живёт
 *
 * Подписи **под** рисунками и заголовки оконных рамок: они часть страницы,
 * а не рисунка, и лежат там же, где остальные её слова
 * (`book-page-text.ts`, `i18n/site-messages.ts`).
 */

/** Строка «подпись — значение»: так устроены почти все таблицы экранов. */
export type ScreenRow = [label: string, value: string]

/** Вклад в индекс: величина у него своя, а имя — переводимое. */
export type IndexPart = 'fat' | 'protein' | 'udder' | 'body'

/** Признак линейной оценки: шкала и желаемое — числа, подписи — слова. */
export type ConformationTrait = 'stature' | 'depth' | 'legs' | 'udder'

/** Исход разбора заявки: цвет плашки от языка не зависит, слова — да. */
export type SubmissionTone = 'ok' | 'doubt' | 'no'

/** Звено цепочки достоверности. */
export type TrustStep = 'declared' | 'lab' | 'signature'

export type BookScreensText = {
  /** Карточка животного в трёх прочтениях. */
  animal: {
    /** Чужое животное: видно то, что хозяйство открыло. */
    outside: {
      title: string
      badge: string
      tabs: string[]
      rows: ScreenRow[]
      note: string
    }
    /** Своё животное: то же плюс работа. */
    own: {
      title: string
      badge: string
      tabs: string[]
      rows: ScreenRow[]
      /** Кнопки нарисованные и не нажимаются. */
      buttons: string[]
    }
    /** Бык: другой предмет разговора, а не та же карточка с пустыми графами. */
    bull: {
      title: string
      badge: string
      tabs: string[]
      rows: ScreenRow[]
      note: string
    }
  }

  pedigree: {
    self: { name: string; number: string }
    parents: [name: string, number: string, dna: boolean][]
    /** Отметка подтверждённого происхождения. */
    dna: string
    /** Ряд дедов; «—» на месте неизвестного. */
    grand: string[]
    unknown: string
    note: string
  }

  quality: {
    title: string
    /** Плашка со счётом находок. */
    found: string
    rows: [animal: string, issue: string, where: string][]
    note: string
  }

  milk: {
    title: string
    /** Метод контроля: обозначение ICAR, одинаковое на всех языках. */
    method: string
    head: [day: string, milk: string, fat: string, protein: string]
    rows: [day: string, milk: string, fat: string, protein: string][]
    /** Что стоит вместо надоя в пропущенном замере. */
    gap: string
    totalLabel: string
    total: string
    note: string
  }

  index: {
    title: string
    value: string
    parts: Record<IndexPart, string>
    note: string
  }

  exchange: {
    /** Заголовок левой половины; правая — «ICAR ADE», имя стандарта. */
    register: string
    rows: ScreenRow[]
  }

  conformation: {
    traits: Record<ConformationTrait, { name: string; low: string; high: string }>
    /** «7 из 9»: число приходит из оценки, слово — отсюда. */
    score: (value: number) => string
    note: string
  }

  mating: {
    title: string
    threshold: string
    /** Подпись перед индексом быка. */
    indexLabel: string
    /** Подпись перед инбридингом будущего потомка. */
    fLabel: string
    /** Причина предупреждения: без неё оно помеха, а не предупреждение. */
    common: string
    note: string
  }

  reports: {
    title: string
    /** Приписка о том, когда отчёт посчитан. */
    computed: string
    rows: [name: string, value: string, count: string][]
    /** Животные под раскрытой строкой. */
    behind: [number: string, name: string, value: string][]
    /** Хвост списка, который на рисунке не поместился. */
    more: string
    note: string
  }

  access: {
    title: string
    until: string
    shownTitle: string
    hiddenTitle: string
    shown: string[]
    hidden: string[]
    logTitle: string
    log: [when: string, what: string, who: string][]
    note: string
  }

  submissions: {
    title: string
    /** Сколько записей в пакете. */
    count: string
    outcomes: Record<SubmissionTone, string>
    /** Кнопка с обоими числами: принимается часть, остальное остаётся. */
    accept: string
    rest: string
    chainTitle: string
    chain: Record<TrustStep, string>
    note: string
  }

  /** Бланк документа по форме Регламента (ЕС) 2016/1012. */
  certificate: {
    book: string
    kind: string
    /** Приписка о форме, по которой сделан бланк. */
    form: string
    rows: ScreenRow[]
    sire: ScreenRow[]
    dam: ScreenRow[]
    valuesTitle: string
    values: ScreenRow[]
    issuedLabel: string
    issued: string
    codeLabel: string
    check: string
  }

  /** Карточка животного на главной и заголовок окна над ней. */
  card: {
    /** Кличка внутри карточки. */
    name: string
    /** Кличка с номером — шапка нарисованного окна. */
    window: string
    /** Три замера: дата, надой, жир. */
    tests: [date: string, milk: string, fat: string][]
    /** Итог за 305 дней: надой и средний процент жира. */
    total: [milk: string, fat: string]
  }

  /** Что читает голосовой доступ на шкале места. */
  rank: (place: string, total: string) => string

  /** Что читает голосовой доступ на записи работы. */
  demo: string

  /**
   * Число разрядами языка.
   *
   * Место в рейтинге и инбридинг считаются кодом, и формат у них
   * не общий: «16 320» и «8,2» по-русски против «16,320» и «8.2»
   * по-английски. Пробел вместо запятой в разряде тысяч — не оттенок:
   * «16,320» русский читатель прочтёт как шестнадцать с третью.
   */
  number: (value: number) => string
}

const RU: BookScreensText = {
  animal: {
    outside: {
      title: 'Чужая корова',
      badge: 'публичный просмотр',
      tabs: ['Основное', 'Происхождение', 'Документы'],
      rows: [
        ['Номер', 'RU 4512 087'],
        ['Порода', 'Голштинская'],
        ['Отец', 'RR Linus'],
        ['ИПЦ', '+460'],
        ['Свидетельство', 'выдано'],
      ],
      note: 'Событий, здоровья и экономики не видно: их открывает владелец, а не система.',
    },
    own: {
      title: 'Своя корова',
      badge: 'владелец',
      tabs: ['Основное', 'Продуктивность', 'События', 'Документы'],
      rows: [
        ['За 305 дней', '9 640 кг'],
        ['Жир / белок', '3,83 / 3,21 %'],
        ['Соматика', '148 тыс.'],
        ['Осеменение', '12.04, бык RR Linus'],
        ['Проверка стельности', '18.05, стельная'],
      ],
      buttons: ['Внести доение', 'Выгрузить в реестр', 'Выпустить документ'],
    },
    bull: {
      title: 'Бык',
      badge: 'другая карточка',
      tabs: ['Основное', 'Дочери', 'Семя'],
      rows: [
        ['Дочерей в книге', '1 284'],
        ['Со сверстницами', '+512 кг'],
        ['Достоверность', '0,91'],
        ['Семя в наличии', 'да, 3 хозяйства'],
        ['Гаплотипы', 'свободен'],
      ],
      note: 'Лактаций у быка нет — вместо них дочери и сравнение со сверстницами.',
    },
  },

  pedigree: {
    self: { name: 'Ромашка', number: 'RU 4512 087' },
    parents: [
      ['RR Linus', 'HODEU000360023959', true],
      ['Берёзка', 'RUSF 000003910444', false],
    ],
    dna: 'ДНК',
    grand: ['Progenesis Lighter', 'Gywer RDC', 'Дубрава', '—'],
    unknown: 'предок неизвестен',
    note:
      'Пропуск в цепочке показан, а не скрыт: коэффициент родства считается по тому, что есть, ' +
      'и рядом стоит полнота данных.',
  },

  quality: {
    title: 'Качество книги',
    found: '3 находки',
    rows: [
      ['RU 4512 087', 'Отец моложе потомка', 'происхождение'],
      ['RU 4512 130', 'Осеменение раньше отёла', 'события'],
      ['RU 4511 902', 'Приплод не сходится с типом рождения', 'отёл'],
    ],
    note:
      'Находка не блокирует работу: правило может ошибаться в редком случае, и решение остаётся ' +
      'за человеком.',
  },

  milk: {
    title: 'Контрольные доения',
    method: 'A4',
    head: ['День лактации', 'Надой, кг', 'Жир, %', 'Белок, %'],
    rows: [
      ['30', '38,2', '3,74', '3,18'],
      ['58', '41,6', '3,68', '3,15'],
      ['86', '—', '—', '—'],
      ['114', '36,9', '3,91', '3,24'],
    ],
    gap: 'пропуск',
    totalLabel: 'За 305 дней',
    total: '9 640 кг',
    note:
      'Метод записан рядом с рядом замеров: без него «9 640 кг» из двух хозяйств несравнимы, ' +
      'а выглядят одинаково.',
  },

  index: {
    title: 'Индекс племенной ценности',
    value: '+460',
    parts: {
      fat: 'Жир',
      protein: 'Белок',
      udder: 'Здоровье вымени',
      body: 'Композит тела',
    },
    note:
      'Профиль назван, достоверность стоит рядом с числом. Индекс без профиля — число ' +
      'без единицы: сравнивать его не с чем.',
  },

  exchange: {
    register: 'Государственный реестр',
    rows: [
      ['Базовый номер', 'RU 4512 087'],
      ['Дата доения', '12.04.2026'],
      ['Надой за сутки, кг', '38,2'],
      ['Массовая доля жира, %', '3,74'],
    ],
  },

  conformation: {
    traits: {
      stature: { name: 'Рост', low: 'низкая', high: 'высокая' },
      depth: { name: 'Глубина туловища', low: 'мелкое', high: 'глубокое' },
      legs: { name: 'Постановка задних ног', low: 'слоновость', high: 'саблистость' },
      udder: { name: 'Прикрепление вымени', low: 'слабое', high: 'плотное' },
    },
    score: (value) => `${value} из 9`,
    note:
      'Светлая полоса — желаемое, и она стоит в разных местах шкалы: у роста ближе к краю, ' +
      'у постановки ног посередине. Девятка не значит «лучше»; она значит «очень».',
  },

  mating: {
    title: 'Подбор к корове Ромашка',
    threshold: 'порог 6,25 %',
    indexLabel: 'ИПЦ',
    fLabel: 'F потомка',
    common: 'общий предок: Progenesis Lighter, отец матери',
    note:
      'Список отсортирован по индексу, а предупреждение стоит у первой строки: лучший ' +
      'по числу бык здесь и есть худший выбор. Увидеть это можно только там, где обе ' +
      'родословные лежат рядом.',
  },

  reports: {
    title: 'Воспроизводство',
    computed: 'пересчитано при открытии',
    rows: [
      ['Средний сервис-период', '118 дн.', '231 гол.'],
      ['Возраст первого отёла', '25,4 мес.', '64 гол.'],
      ['Соматика выше 400 тыс.', '7,4 %', '17 гол.'],
    ],
    behind: [
      ['RU 4512 087', 'Ромашка', '24,1 мес.'],
      ['RU 4512 130', 'Зорька', '26,8 мес.'],
      ['RU 4511 902', 'Ласка', '27,2 мес.'],
    ],
    more: 'ещё 61 животное',
    note:
      'Число раскрывается в список: под средним возрастом 25,4 месяца стоят и 26,8, и 27,2. ' +
      'Среднее прячет тех, ради кого отчёт и открывают.',
  },

  access: {
    title: 'Доступ открыт ООО «Заря»',
    until: 'до 30 сентября',
    shownTitle: 'Что видно',
    hiddenTitle: 'Что не видно',
    shown: ['происхождение', 'линейная оценка', 'индекс', 'документы'],
    hidden: ['события и здоровье', 'экономика', 'остальное стадо'],
    logTitle: 'Журнал',
    log: [
      ['12.04, 10:20', 'доступ открыт', 'Иванов А., ООО «Рассвет»'],
      ['14.04, 09:05', 'просмотр карточки', 'ООО «Заря»'],
      ['30.09', 'доступ закроется сам', 'по сроку выдачи'],
    ],
    note:
      'Доступ выдан на одно животное и на срок, и запись о нём видит и владелец, ' +
      'и Ассоциация. Закроется он сам — отзывать руками нечего.',
  },

  submissions: {
    title: 'Пакет от ООО «Заря»',
    count: '122 записи',
    outcomes: {
      ok: 'проверки пройдены — в книгу',
      doubt: 'осеменение раньше отёла — на решение',
      no: 'отца нет в книге — отклонить',
    },
    accept: 'Принять 118 из 122',
    rest: 'остальное остаётся в заявке',
    chainTitle: 'Достоверность записи',
    chain: {
      declared: 'заявлено хозяйством',
      lab: 'протокол лаборатории',
      signature: 'подпись Ассоциации',
    },
    note:
      'Уровень достоверности не назначается: его поднимает протокол, а подпись Ассоциации — ' +
      'отдельное действие с именем и датой.',
  },

  certificate: {
    book: 'Племенная книга',
    kind: 'Зоотехнический сертификат',
    form: 'Форма по Регламенту (ЕС) 2016/1012 — пятнадцать разделов, два ряда предков',
    rows: [
      ['Индивидуальный №', 'RU 4512 087'],
      ['Международный №', 'RUSF 000004512087'],
      ['Кличка', 'Ромашка'],
      ['Дата рождения', '11.09.2022'],
      ['Порода', 'Голштинская, HOL'],
      ['Кровность по голштину', '93,75 %'],
    ],
    sire: [
      ['Отец', 'RR Linus'],
      ['№', 'HODEU000360023959'],
      ['Рождён', '12.02.2017'],
    ],
    dam: [
      ['Мать', 'Берёзка'],
      ['№', 'RUSF 000003910444'],
      ['Рождена', '04.03.2019'],
    ],
    valuesTitle: 'Племенная ценность',
    values: [
      ['Удой, кг', '+1 154'],
      ['Жир, кг', '+13'],
      ['Белок, кг', '+25'],
      ['Соматика', '3,11'],
      ['Долголетие', '+2,7'],
      ['ИПЦ', '+460'],
    ],
    issuedLabel: 'Выдан',
    issued: '14.08.2026 · Ассоциация',
    codeLabel: 'Код проверки',
    check:
      'Проверяется по коду на сайте книги. Выданный документ не меняется: правка данных ' +
      'создаёт новый, прежний остаётся с отметкой об отзыве.',
  },

  card: {
    name: 'Ромашка',
    window: 'Ромашка · RU 4512 087',
    tests: [
      ['12.04', '34,2', '3,82'],
      ['14.05', '32,8', '3,75'],
      ['11.06', '30,1', '3,91'],
    ],
    total: ['9 640', '3,83'],
  },

  rank: (place, total) => `${place} место из ${total}`,

  demo: 'Запись работы в кабинете. Нажатие останавливает и продолжает показ.',

  number: (value) => value.toLocaleString('ru-RU'),
}

const EN: BookScreensText = {
  animal: {
    outside: {
      title: 'Cow of another farm',
      badge: 'public view',
      tabs: ['Overview', 'Pedigree', 'Documents'],
      rows: [
        ['Number', 'RU 4512 087'],
        ['Breed', 'Holstein'],
        ['Sire', 'RR Linus'],
        ['Index', '+460'],
        ['Certificate', 'issued'],
      ],
      note: 'Events, health and economics are not shown: the owner opens them, not the system.',
    },
    own: {
      title: 'Own cow',
      badge: 'owner',
      tabs: ['Overview', 'Production', 'Events', 'Documents'],
      rows: [
        ['305-day yield', '9,640 kg'],
        ['Fat / protein', '3.83 / 3.21 %'],
        ['Somatic cells', '148 thousand'],
        ['Insemination', '12.04, sire RR Linus'],
        ['Pregnancy check', '18.05, pregnant'],
      ],
      buttons: ['Add a test day', 'Export to the register', 'Issue a document'],
    },
    bull: {
      title: 'Bull',
      badge: 'a different record',
      tabs: ['Overview', 'Daughters', 'Semen'],
      rows: [
        ['Daughters in the book', '1,284'],
        ['Against herdmates', '+512 kg'],
        ['Reliability', '0.91'],
        ['Semen available', 'yes, 3 farms'],
        ['Haplotypes', 'free'],
      ],
      note: 'A bull has no lactations — daughters and the herdmate comparison stand instead.',
    },
  },

  pedigree: {
    self: { name: 'Romashka', number: 'RU 4512 087' },
    parents: [
      ['RR Linus', 'HODEU000360023959', true],
      ['Beryozka', 'RUSF 000003910444', false],
    ],
    dna: 'DNA',
    grand: ['Progenesis Lighter', 'Gywer RDC', 'Dubrava', '—'],
    unknown: 'ancestor unknown',
    note:
      'A gap in the chain is shown, not hidden: the relationship coefficient is computed from ' +
      'what exists, and data completeness stands next to it.',
  },

  quality: {
    title: 'Book quality',
    found: '3 findings',
    rows: [
      ['RU 4512 087', 'Sire younger than progeny', 'pedigree'],
      ['RU 4512 130', 'Insemination before calving', 'events'],
      ['RU 4511 902', 'Calf count does not match the birth type', 'calving'],
    ],
    note:
      'A finding does not block the work: the rule can be wrong in a rare case, and the ' +
      'decision stays with the person.',
  },

  milk: {
    title: 'Test-day recording',
    method: 'A4',
    head: ['Days in milk', 'Yield, kg', 'Fat, %', 'Protein, %'],
    rows: [
      ['30', '38.2', '3.74', '3.18'],
      ['58', '41.6', '3.68', '3.15'],
      ['86', '—', '—', '—'],
      ['114', '36.9', '3.91', '3.24'],
    ],
    gap: 'gap',
    totalLabel: '305-day yield',
    total: '9,640 kg',
    note:
      'The method is recorded next to the series of test days: without it "9,640 kg" from two ' +
      'farms are not comparable, yet they look the same.',
  },

  index: {
    title: 'Breeding value index',
    value: '+460',
    parts: {
      fat: 'Fat',
      protein: 'Protein',
      udder: 'Udder health',
      body: 'Body composite',
    },
    note:
      'The profile is named and reliability stands next to the number. An index without ' +
      'a profile is a number without a unit: there is nothing to compare it with.',
  },

  exchange: {
    register: 'State register',
    rows: [
      ['Base number', 'RU 4512 087'],
      ['Milking date', '12.04.2026'],
      ['24-hour yield, kg', '38.2'],
      ['Fat content, %', '3.74'],
    ],
  },

  conformation: {
    traits: {
      stature: { name: 'Stature', low: 'short', high: 'tall' },
      depth: { name: 'Body depth', low: 'shallow', high: 'deep' },
      legs: { name: 'Rear leg set', low: 'posty', high: 'sickled' },
      udder: { name: 'Udder attachment', low: 'loose', high: 'tight' },
    },
    score: (value) => `${value} of 9`,
    note:
      'The light band is the desirable range, and it sits at different points of the scale: ' +
      'near the end for stature, in the middle for rear legs. Nine does not mean "better"; ' +
      'it means "very".',
  },

  mating: {
    title: 'Mating for the cow Romashka',
    threshold: 'threshold 6.25 %',
    indexLabel: 'index',
    fLabel: 'progeny F',
    common: 'common ancestor: Progenesis Lighter, the dam’s sire',
    note:
      'The list is sorted by index, and the warning stands on the first row: the best bull ' +
      'by the number is the worst choice here. This is visible only where both pedigrees lie ' +
      'side by side.',
  },

  reports: {
    title: 'Reproduction',
    computed: 'recomputed on opening',
    rows: [
      ['Average days open', '118 days', '231 head'],
      ['Age at first calving', '25.4 months', '64 head'],
      ['Somatic cells above 400 thousand', '7.4 %', '17 head'],
    ],
    behind: [
      ['RU 4512 087', 'Romashka', '24.1 months'],
      ['RU 4512 130', 'Zorka', '26.8 months'],
      ['RU 4511 902', 'Laska', '27.2 months'],
    ],
    more: '61 more animals',
    note:
      'The figure expands into a list: under the average of 25.4 months stand 26.8 and 27.2. ' +
      'The average hides the very animals the report is opened for.',
  },

  access: {
    title: 'Access granted to Zarya farm',
    until: 'until 30 September',
    shownTitle: 'What is visible',
    hiddenTitle: 'What is not',
    shown: ['pedigree', 'linear scoring', 'index', 'documents'],
    hidden: ['events and health', 'economics', 'the rest of the herd'],
    logTitle: 'Log',
    log: [
      ['12.04, 10:20', 'access granted', 'A. Ivanov, Rassvet farm'],
      ['14.04, 09:05', 'record viewed', 'Zarya farm'],
      ['30.09', 'access expires by itself', 'by the date of the grant'],
    ],
    note:
      'The grant covers one animal and has an expiry date, and the record of it is seen by ' +
      'the owner and by the Association. It closes by itself — there is nothing to revoke ' +
      'by hand.',
  },

  submissions: {
    title: 'Package from Zarya farm',
    count: '122 records',
    outcomes: {
      ok: 'checks passed — into the book',
      doubt: 'insemination before calving — for decision',
      no: 'sire not in the book — reject',
    },
    accept: 'Accept 118 of 122',
    rest: 'the rest stays in the submission',
    chainTitle: 'Reliability of the record',
    chain: {
      declared: 'declared by the farm',
      lab: 'laboratory report',
      signature: 'Association signature',
    },
    note:
      'The reliability level is not assigned: a laboratory report raises it, and the ' +
      'Association signature is a separate action with a name and a date.',
  },

  /*
   * Названия разделов — из английского бланка Регламента (ЕС) 2016/1012,
   * а не перевод русских подписей обратно. Обратный перевод дал бы
   * «breeding value» там, где в самой форме стоит «results of genetic
   * evaluation», и документ перестал бы узнаваться теми, кто с формой
   * работает.
   */
  certificate: {
    book: 'Herdbook',
    kind: 'Zootechnical certificate',
    form: 'Form under Regulation (EU) 2016/1012 — fifteen sections, two rows of ancestors',
    rows: [
      ['Individual identification number', 'RU 4512 087'],
      ['International number', 'RUSF 000004512087'],
      ['Name of the animal', 'Romashka'],
      ['Date of birth', '11.09.2022'],
      ['Breed', 'Holstein, HOL'],
      ['Holstein share', '93.75 %'],
    ],
    sire: [
      ['Sire', 'RR Linus'],
      ['No.', 'HODEU000360023959'],
      ['Born', '12.02.2017'],
    ],
    dam: [
      ['Dam', 'Beryozka'],
      ['No.', 'RUSF 000003910444'],
      ['Born', '04.03.2019'],
    ],
    valuesTitle: 'Results of genetic evaluation',
    values: [
      ['Milk, kg', '+1,154'],
      ['Fat, kg', '+13'],
      ['Protein, kg', '+25'],
      ['Somatic cells', '3.11'],
      ['Longevity', '+2.7'],
      ['Index', '+460'],
    ],
    issuedLabel: 'Issued',
    issued: '14.08.2026 · Association',
    codeLabel: 'Verification code',
    check:
      'Verified by the code on the herdbook site. An issued document never changes: editing ' +
      'the data creates a new one, and the previous stays marked as revoked.',
  },

  card: {
    name: 'Romashka',
    window: 'Romashka · RU 4512 087',
    tests: [
      ['12.04', '34.2', '3.82'],
      ['14.05', '32.8', '3.75'],
      ['11.06', '30.1', '3.91'],
    ],
    total: ['9,640', '3.83'],
  },

  rank: (place, total) => `rank ${place} of ${total}`,

  demo: 'A recording of work in the account. Click to pause and resume the playback.',

  number: (value) => value.toLocaleString('en-US'),
}

export const BOOK_SCREENS_TEXT: Translated<BookScreensText> = { ru: RU, en: EN }

/**
 * Слова экранов на языке читателя, с откатом на русский.
 *
 * Откат здесь молчаливый, и это единственное место, где так можно:
 * о нём уже сказано страницей — рядом с разбором раздела стоит строка
 * `FALLBACK_NOTICE`, и повторять её внутри рисунка значило бы написать
 * объявление поверх картинки.
 */
export const screensText = (locale: Locale): BookScreensText =>
  pick(BOOK_SCREENS_TEXT, locale).value
