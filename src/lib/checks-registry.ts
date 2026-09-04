/**
 * Реестр автоматических проверок.
 *
 * ## Зачем отдельный файл
 *
 * До сих пор коды проверок существовали только строковыми литералами внутри
 * `if`-веток `data-checks.ts`: перечислить их программно было нельзя.
 * Пока проверки видел один эксперт, это сходило с рук. Как только их надо
 * показать хозяйству — «вот что система умеет проверять», — список пришлось
 * бы написать второй раз руками, и он разошёлся бы с кодом на первой же
 * правке. Расходящийся список хуже отсутствующего: по нему принимают
 * решения, не зная, что он врёт.
 *
 * Поэтому реестр — источник правды, а не копия. Тип `CheckCode` выведен
 * из него, и `data-checks.ts` типизирует им свои находки: проверка
 * с кодом, которого нет в реестре, **не скомпилируется**. Каталог не может
 * отстать от кода, потому что код не соберётся раньше.
 *
 * ## Пороги тоже здесь
 *
 * Раньше границы правдоподобия лежали в `data-checks.ts`, а порог возраста
 * первого отёла — в `afc.ts`. Хозяйству в каталоге нужно видеть именно
 * число («удой вне 500…25 000 кг»), и брать его из второго места значило бы
 * снова завести две правды об одном пороге.
 *
 * ## Чего здесь нет и не будет
 *
 * Выключателей. Разбор ниже — в `docs/protsessy.md`: проверки настраивает
 * Ассоциация, а не проверяемый. Хозяйство видит каталог, чтобы починить
 * данные до подачи, а не чтобы отключить неудобное.
 */

export type CheckSeverity = 'fix' | 'note'

export type CheckGroup =
  | 'passport'
  | 'pedigree'
  | 'reproduction'
  | 'production'
  | 'lifecycle'
  | 'herd'

/**
 * Группа правил: русское название и английское — обязательной парой.
 *
 * Обязательной по той же причине, что и у самих правил: группа, заведённая
 * без английского, молча вышла бы на витрину русским заголовком посреди
 * английской страницы. Пусть лучше не соберётся.
 */
export type CheckGroupSpec = {
  key: CheckGroup
  label: string
  labelEn: string
  intro: string
  introEn: string
}

export const CHECK_GROUPS: CheckGroupSpec[] = [
  {
    key: 'passport',
    label: 'Паспорт',
    labelEn: 'Passport',
    intro: 'Поля самой карточки: номер, дата рождения, порода, кровность.',
    introEn:
      'Fields of the record itself: identifier, date of birth, breed, breed percentage.',
  },
  {
    key: 'pedigree',
    label: 'Происхождение',
    labelEn: 'Parentage',
    intro:
      'Родители, родословная и всё, что из неё считается. Ошибка здесь дороже прочих: она не портит одну запись, а искажает оценку всех потомков.',
    introEn:
      'Parents, the pedigree and everything computed from it. An error here costs more than the rest: it does not spoil one record, it distorts the evaluation of every descendant.',
  },
  {
    key: 'reproduction',
    label: 'Воспроизводство',
    labelEn: 'Reproduction',
    intro: 'Отёлы и осеменения — не по отдельности, а как последовательность во времени.',
    introEn: 'Calvings and inseminations — not one by one, but as a sequence in time.',
  },
  {
    key: 'production',
    label: 'Продуктивность',
    labelEn: 'Production',
    intro: 'Удои, жир, белок и их согласованность между собой.',
    introEn: 'Milk yield, fat, protein and how well they agree with one another.',
  },
  {
    key: 'lifecycle',
    label: 'Состояние и выбытие',
    labelEn: 'Status and disposal',
    intro: 'Согласованность статуса животного с тем, что о нём записано.',
    introEn: 'Whether the status of an animal agrees with what is recorded about it.',
  },
  {
    key: 'herd',
    label: 'Сопоставимость по стаду',
    labelEn: 'Comparability across the herd',
    intro:
      'Единственная группа, где находка относится не к записи, а ко всему стаду сразу. ' +
      'Каждая запись по отдельности здесь безупречна — беда в том, что вместе они получены ' +
      'по-разному и сравнивать их между собой нельзя. Поэтому и считаются они не по заявке, ' +
      'а по всему стаду: доля, посчитанная по выборке, назвалась бы долей по стаду и соврала бы. ' +
      'Видны в «Проверить моё стадо» и у эксперта при разборе заявки; подачу они не блокируют.',
    introEn:
      'The only group where a finding belongs not to a record but to the herd as a whole. ' +
      'Every record here is faultless on its own — the trouble is that together they were ' +
      'obtained in different ways and cannot be compared with one another. That is why they ' +
      'are computed over the whole herd rather than over the submission: a share computed ' +
      'from a sample would call itself a share of the herd and would lie. They are visible ' +
      'in “Check my herd” and to the expert reviewing a submission; they do not block ' +
      'submission.',
  },
]

/**
 * Числовая граница правила.
 *
 * Либо её нет вовсе, либо она есть на обоих языках. Промежуточного
 * состояния тип не допускает намеренно: русская граница на английской
 * странице — не только чужое слово, но и чужой формат числа («2,0…6,5 %»
 * читается по-английски как два числа подряд).
 */
type CheckThreshold =
  | { threshold?: undefined; thresholdEn?: undefined }
  | { threshold: string; thresholdEn: string }

type CheckSpecBase = {
  code: string
  group: CheckGroup
  label: string
  /**
   * Английские подписи правила.
   *
   * ## Почему обязательные, а не «по возможности»
   *
   * Витрина `/en/rules` показывает эти три поля и только их. Правило,
   * заведённое без английского, вышло бы на страницу русской строкой
   * среди английских — и заметил бы это не автор правила, а читатель,
   * которому мы и так рассказываем про проверяемость.
   *
   * Необязательное поле здесь означало бы «переведём потом», а потом
   * не наступает: за полгода до этой правки страница целиком стояла
   * по-русски на всех шести языках. Требование обходится в десять минут
   * при заведении правила — дешевле, чем страница, наполовину английская.
   */
  labelEn: string
  /** Что именно сверяется — одной фразой, языком зоотехника. */
  what: string
  whatEn: string
  /** Почему это стоит ловить. Без этого проверка читается как придирка. */
  why: string
  whyEn: string
  severity: CheckSeverity
  /**
   * Имя ограничения PostgreSQL, которое не даёт такие данные записать.
   *
   * Появилось после того, как контрольное хозяйство отказалось заводиться:
   * база отвергла кровность 140 % и животное, назначенное себе отцом.
   * Обе проверки написаны верно и не сработают никогда — данных, на которых
   * они видны, `insert` в эту базу не пропустит.
   *
   * Удалять их за это неправильно. Ограничения приписываются к схеме
   * хуком (`addDomainConstraints`), а не миграцией: на базе, восстановленной
   * из чужого дампа, или на записях старше самого ограничения нарушения
   * встречаются — и тогда единственный, кто их назовёт, это проверка.
   *
   * Но и молчать о них нельзя. Проверка, не сработавшая ни разу, читается
   * в отчёте ревизии как непроверенная; отличить «нечего ловить» от
   * «нечему появиться» можно только здесь.
   */
  dbGuard?: string
}

export type CheckSpec = CheckSpecBase & CheckThreshold

/* -------------------------------------------------------------------------
 * Пороги. Одно место на весь проект.
 * ---------------------------------------------------------------------- */

/** Рамки правдоподобия. Не нормативы — границы, за которыми «так не бывает». */
export const PLAUSIBLE = {
  milkYield: { min: 500, max: 25_000, unit: 'кг за лактацию' },
  fatPercent: { min: 2.0, max: 6.5, unit: '%' },
  proteinPercent: { min: 2.0, max: 5.0, unit: '%' },
  bloodPercent: { min: 0, max: 100, unit: '%' },
  ageYears: 25,
} as const

/**
 * Допуск по кровности потомка относительно полусуммы родительских.
 *
 * Кровность делится пополам каждое поколение, и записывают её долями
 * восьмой части — отсюда 12,5. Расхождение в одну такую долю бывает
 * от округления при вводе, поэтому это замечание на усмотрение.
 * Расхождение в четверть округлением быть не может: там ошибка
 * в кровности либо в самом родителе.
 */
export const BLOOD_TOLERANCE = { note: 12.5, fix: 25 } as const

/**
 * Допуск по инбридингу между введённым числом и посчитанным.
 *
 * Порог низкий, а существенность — «на усмотрение», и это не
 * противоречие. Наш коэффициент считается по той родословной, которая
 * есть **у нас**; хозяйство могло взять своё число из более полной.
 * Расхождение поэтому не обвинение, а вопрос: по какой родословной
 * считали. Одна десятая процента — округление, целый процент — уже
 * разные родословные.
 */
export const INBREEDING_TOLERANCE = 1.0

/**
 * Стельность. Меньше этого между двумя отёлами быть не может физически.
 *
 * У голштинов стельность около 279 дней; 270 взято с запасом, чтобы
 * ранний отёл не попадал в находки. Разбор — `docs/vozrast-pervogo-otela.md`.
 */
export const GESTATION_MIN_DAYS = 270

/**
 * Сколько записей сверяется по инбридингу за один разбор.
 *
 * Расчёт коэффициента обходит девять колен родословной запросами в базу —
 * это самая дорогая проверка из всех, и прогнать её по пятистам записям
 * значило бы заставить эксперта ждать минуты. Потолок не молчаливый:
 * сколько записей осталось несверенными, разбор говорит вслух.
 */
export const INBREEDING_CHECK_LIMIT = 50

/**
 * Добровольный период ожидания после отёла.
 *
 * Раньше двадцатого дня матку не осеменяют: она ещё не восстановилась.
 * Двадцать — не норматив (в хозяйствах ждут 45–60), а граница
 * физиологической возможности: запись раньше означает ошибку в дате,
 * а не смелый менеджмент.
 */
export const VOLUNTARY_WAIT_DAYS = 20

/**
 * Возраст родителя на момент рождения потомка.
 *
 * Нижняя граница та же, что у возраста первого отёла, и по той же
 * причине: стельность около 279 дней. Верхняя — не биология, а здравый
 * смысл: корова старше двадцати лет в племенном учёте встречается,
 * потомок от неё — почти всегда связь не с тем животным.
 */
export const PARENT_AGE = { minMonths: 19, maxYears: 20 } as const

/**
 * Глубина поиска цикла в родословной.
 *
 * Больше девяти колен не смотрит и сам расчёт инбридинга
 * (`ANCESTRY_DEPTH`), а цикл, спрятанный глубже, на оценку уже
 * не влияет — зато поиск начинает стоить как полный обход.
 */
export const CYCLE_DEPTH = 9

/**
 * Пороги проверок по стаду.
 *
 * Все они — про **долю**, а не про величину, и это главное отличие
 * от порогов выше. Одна корова, родившаяся первого января, — совпадение;
 * четверть стада первого января — способ ведения учёта. Ловить надо
 * второе, поэтому у каждой проверки два условия сразу: доля и
 * минимальное число записей, ниже которого доля ничего не значит.
 *
 * `minHerd` стоит там, где считается доля: в стаде из шести животных
 * любая доля — случайность, и находка по ней была бы не наблюдением,
 * а шумом. У проверок, которые ищут не долю, а сам факт разнобоя —
 * смешанные единицы, два источника доек, две базы индекса, общий корень
 * номеров, — его нет намеренно: две записи в разных единицах остаются
 * ошибкой и в стаде из шести.
 *
 * Прежде здесь стояло «`minHerd` есть у всех», и это было неправдой
 * ровно про эти четыре.
 */
export const HERD_THRESHOLDS = {
  /** Кратность единиц, ниже которой расхождение — не другая единица, а разброс. */
  unitsFactor: 100,
  /** Сколько записей должно выпадать из общего порядка, чтобы это была система. */
  unitsMinRows: 3,
  /** Доля рождённых первого января, выше которой это уже не совпадение. */
  jan1Share: 0.05,
  /** То же для первого числа любого месяца: при равномерном учёте — около 3 %. */
  firstOfMonthShare: 0.2,
  /** Доля удоев, кратных пятистам. */
  roundedShare: 0.25,
  /** Во сколько раз надо отличаться от медианы стада, чтобы попасть в находку. */
  outlierFactor: 3,
  /** Меньше этого числа записей доли не считаем вовсе. */
  minHerd: 20,
  /** Сколько примеров показываем под находкой. */
  examples: 5,
} as const

/* -------------------------------------------------------------------------
 * Сам реестр
 * ---------------------------------------------------------------------- */

export const CHECKS = [
  /* ------------------------------ Паспорт ------------------------------ */
  {
    code: 'no-birth-date',
    group: 'passport',
    label: 'Нет даты рождения',
    labelEn: 'No date of birth',
    what: 'В карточке не заполнена дата рождения.',
    whatEn: 'The record has no date of birth.',
    why: 'Без неё нельзя рассчитать возраст, возраст первого отёла и выпустить свидетельство.',
    whyEn: 'Without it there is no age, no age at first calving and no herdbook certificate.',
    severity: 'fix',
  },
  {
    code: 'birth-in-future',
    group: 'passport',
    label: 'Дата рождения в будущем',
    labelEn: 'Date of birth in the future',
    what: 'Дата рождения позже сегодняшнего дня.',
    whatEn: 'The date of birth is later than today.',
    why: 'Обычно перепутаны местами день и месяц либо ошибка в годе.',
    whyEn: 'Usually the day and the month have been swapped, or the year is wrong.',
    severity: 'fix',
  },
  {
    code: 'no-breed',
    group: 'passport',
    label: 'Не указана порода',
    labelEn: 'Breed not stated',
    what: 'У карточки не выбрана порода.',
    whatEn: 'No breed is selected on the record.',
    why: 'Порода определяет базу сравнения, по которой считается индекс.',
    whyEn: 'The breed determines the comparison base the index is computed against.',
    severity: 'note',
  },
  {
    code: 'blood-out-of-range',
    group: 'passport',
    dbGuard: 'chk_animals_blood_percent',
    label: 'Кровность вне диапазона',
    labelEn: 'Breed percentage out of range',
    what: 'Кровность меньше нуля или больше ста процентов.',
    whatEn: 'The breed percentage is below zero or above one hundred per cent.',
    why: 'Доля крови — часть целого, за сто процентов она выйти не может.',
    whyEn: 'A share of blood is a part of a whole and cannot go beyond one hundred per cent.',
    severity: 'fix',
    threshold: '0…100 %',
    thresholdEn: '0…100%',
  },
  {
    code: 'duplicate-ear-tag',
    group: 'passport',
    label: 'Ушная бирка повторяется',
    labelEn: 'Ear tag repeated',
    what: 'Один номер бирки стоит у нескольких животных пакета.',
    whatEn: 'One tag number stands on several animals in the batch.',
    why: 'Бирку меняют и перевешивают, поэтому уникальной она не считается. Но два живых животных с одной биркой в одном хозяйстве — почти всегда опечатка.',
    whyEn:
      'Tags are replaced and moved between animals, so a tag is not treated as unique. But two live animals under one tag on one farm are almost always a typing error.',
    severity: 'note',
  },

  /* --------------------------- Происхождение --------------------------- */
  {
    code: 'pedigree-cycle',
    group: 'pedigree',
    label: 'Животное встречается среди своих предков',
    labelEn: 'Animal appears among its own ancestors',
    what: 'Идя вверх по родословной, приходим обратно к этому же животному.',
    whatEn: 'Walking up the pedigree leads back to this same animal.',
    why: 'Обход родословной на таком месте зацикливается. Расчёт инбридинга это переживает — там стоит заглушка, — но ценой того, что настоящий коэффициент посчитать нельзя ни у этого животного, ни у его потомков.',
    whyEn:
      'Traversal of the pedigree loops at that point. The inbreeding computation survives it — there is a guard in place — but at the cost that the true coefficient cannot be computed either for this animal or for any of its descendants.',
    severity: 'fix',
    threshold: 'поиск на 9 колен',
    thresholdEn: 'search nine generations deep',
  },
  {
    code: 'parent-age-implausible',
    group: 'pedigree',
    label: 'Невозможный возраст родителя',
    labelEn: 'Impossible parent age',
    what: 'На момент рождения потомка родителю было меньше 19 месяцев или больше 20 лет.',
    whatEn:
      'At the birth of the offspring the parent was younger than 19 months or older than 20 years.',
    why: 'Меньше девятнадцати — физически невозможно: стельность около 279 дней. Больше двадцати лет — почти всегда связь не с тем животным, например с полным тёзкой по кличке.',
    whyEn:
      'Younger than nineteen months is physically impossible: gestation lasts about 279 days. Older than twenty years is almost always a link to the wrong animal — to a namesake, for instance.',
    severity: 'fix',
    threshold: '19 месяцев … 20 лет',
    thresholdEn: '19 months … 20 years',
  },
  {
    code: 'siblings-too-close',
    group: 'pedigree',
    label: 'Мать родила дважды подряд слишком быстро',
    labelEn: 'Dam gave birth twice in a row too quickly',
    what: 'У одной матери двое потомков с разницей меньше 270 дней, и это не двойня.',
    whatEn: 'One dam has two offspring less than 270 days apart, and it is not a twin birth.',
    why: 'Корова не может выносить два приплода быстрее, чем длится стельность. Либо один из потомков записан не той матери, либо это двойня, отмеченная как два отдельных отёла.',
    whyEn:
      'A cow cannot carry two calves faster than gestation lasts. Either one of the offspring is recorded under the wrong dam, or it is a twin birth entered as two separate calvings.',
    severity: 'fix',
    threshold: 'меньше 270 дней между потомками',
    thresholdEn: 'less than 270 days between offspring',
  },
  {
    code: 'father-disposed-before',
    group: 'pedigree',
    label: 'Отец выбыл задолго до зачатия',
    labelEn: 'Sire left the herd long before conception',
    what: 'Отец выбыл раньше, чем мог быть зачат потомок: между выбытием и рождением больше срока стельности.',
    whatEn:
      'The sire was disposed of before the offspring could have been conceived: more than a gestation period lies between the disposal and the birth.',
    why: 'Само по себе не ошибка: замороженное семя работает десятилетиями, и это обычный случай. Но если хозяйство семя не хранит, значит связь установлена не с тем быком.',
    whyEn:
      'Not an error in itself: frozen semen keeps for decades, and this is an ordinary case. But if the farm stores no semen, the link points to the wrong bull.',
    severity: 'note',
  },
  {
    code: 'self-parent',
    group: 'pedigree',
    dbGuard: 'chk_animals_not_own_father',
    label: 'Животное записано своим родителем',
    labelEn: 'Animal recorded as its own parent',
    what: 'В поле отца или матери стоит само это животное.',
    whatEn: 'The sire or dam field holds this same animal.',
    why: 'Обход родословной на такой записи зацикливается, и коэффициент инбридинга посчитать нельзя.',
    whyEn:
      'Traversal of the pedigree loops on such a record, and the inbreeding coefficient cannot be computed.',
    severity: 'fix',
  },
  {
    code: 'parent-wrong-sex',
    group: 'pedigree',
    label: 'Родитель не того пола',
    labelEn: 'Parent of the wrong sex',
    what: 'Отцом записана самка либо матерью записан самец.',
    whatEn: 'A female is recorded as the sire, or a male as the dam.',
    why: 'Чаще всего перепутаны местами поля отца и матери при вводе.',
    whyEn: 'Most often the sire and dam fields were swapped during entry.',
    severity: 'fix',
  },
  {
    code: 'parent-younger',
    group: 'pedigree',
    label: 'Родитель моложе потомка',
    labelEn: 'Parent younger than the offspring',
    what: 'Родитель родился позже потомка или в тот же день.',
    whatEn: 'The parent was born after the offspring, or on the same day.',
    why: 'Прямое противоречие: обычно связь установлена не с тем животным — например, с полным тёзкой по кличке.',
    whyEn:
      'A direct contradiction: usually the link points to the wrong animal — to a namesake, for instance.',
    severity: 'fix',
  },
  {
    code: 'no-parents',
    group: 'pedigree',
    label: 'Не указан ни один родитель',
    labelEn: 'Neither parent stated',
    what: 'Нет ни ссылок на родителей, ни их номеров по документам.',
    whatEn: 'There are neither links to parents nor their identifiers from the documents.',
    why: 'Запись без происхождения не участвует в оценке по родословной и не годится для свидетельства.',
    whyEn:
      'A record without parentage takes no part in pedigree evaluation and will not carry a herdbook certificate.',
    severity: 'note',
  },
  {
    code: 'pedigree-text-mismatch',
    group: 'pedigree',
    label: 'Родословная по бумаге не сходится со связью',
    labelEn: 'Pedigree on paper disagrees with the link',
    what: 'Номер родителя, переписанный со свидетельства, отличается от номера животного, с которым установлена связь.',
    whatEn:
      'The parent identifier copied from the certificate differs from the identifier of the animal the link points to.',
    why: 'Родословная хранится дважды: связью и текстом с документа. Пока они совпадают, это подстраховка; как только разошлись — одна из двух записей неверна, и какая, знает только хозяйство.',
    whyEn:
      'The pedigree is stored twice: as a link and as text from the document. While the two agree it is a safeguard; once they diverge, one of the two is wrong, and only the farm knows which.',
    severity: 'fix',
  },
  {
    code: 'blood-vs-parents',
    group: 'pedigree',
    label: 'Кровность не сходится с родительской',
    labelEn: 'Breed percentage disagrees with the parents',
    what: 'Кровность отличается от полусуммы родительских больше чем на допуск.',
    whatEn:
      'The breed percentage differs from the mean of the parental values by more than the tolerance.',
    why: 'Доля крови потомка — среднее долей родителей. Расхождение означает ошибку либо в кровности, либо в самом родителе; второе гораздо хуже, потому что портит и всех остальных потомков этого родителя. Единственная проверка, у которой существенность зависит от величины расхождения: пометка слева говорит о частом случае, а большое расхождение приходит как «требует исправления».',
    whyEn:
      'The breed percentage of the offspring is the mean of the parental ones. A divergence means an error either in the percentage or in the parent itself; the second is far worse, because it spoils every other offspring of that parent as well. This is the only check whose severity depends on the size of the divergence: the marker on the left names the common case, while a large divergence arrives as one to be fixed.',
    severity: 'note',
    threshold: 'больше 12,5 п.п. — замечание, больше 25 — требует исправления',
    thresholdEn: 'over 12.5 percentage points is a warning, over 25 must be fixed',
  },
  {
    code: 'inbreeding-mismatch',
    group: 'pedigree',
    label: 'Инбридинг не сходится с родословной',
    labelEn: 'Inbreeding disagrees with the pedigree',
    what: 'Введённый в карточку коэффициент инбридинга отличается от посчитанного по родословной.',
    whatEn:
      'The inbreeding coefficient entered on the record differs from the one computed from the pedigree.',
    why: 'Расхождение не всегда ошибка: наш расчёт идёт по той родословной, что есть в книге, а хозяйство могло считать по более полной. Но это всегда вопрос — по какой именно.',
    whyEn:
      'A divergence is not always an error: our computation runs on the pedigree held in the book, while the farm may have computed on a fuller one. But it is always a question — on which pedigree.',
    severity: 'note',
    threshold: 'больше 1 процентного пункта',
    thresholdEn: 'over 1 percentage point',
  },
  {
    code: 'high-inbreeding',
    group: 'pedigree',
    label: 'Высокий инбридинг',
    labelEn: 'High inbreeding',
    what: 'Коэффициент инбридинга превышает установленную границу.',
    whatEn: 'The inbreeding coefficient exceeds the limit that has been set.',
    why: 'Такое значение получается при близкородственном спаривании и требует подтверждения происхождения документами.',
    whyEn:
      'A value like this comes from close mating and calls for parentage confirmed by documents.',
    severity: 'fix',
  },

  /* -------------------------- Воспроизводство -------------------------- */
  {
    code: 'afc-too-young',
    group: 'reproduction',
    label: 'Первый отёл слишком рано',
    labelEn: 'First calving too early',
    what: 'Возраст первого отёла меньше девятнадцати месяцев.',
    whatEn: 'The age at first calving is under nineteen months.',
    why: 'Стельность длится около 279 дней, значит такой отёл потребовал бы оплодотворения до полового созревания. Это ошибка в дате, других объяснений нет.',
    whyEn:
      'Gestation lasts about 279 days, so such a calving would have required conception before puberty. This is an error in the date; there is no other explanation.',
    severity: 'fix',
    threshold: 'младше 19 месяцев',
    thresholdEn: 'younger than 19 months',
  },
  {
    code: 'afc-too-old',
    group: 'reproduction',
    label: 'Первый отёл слишком поздно',
    labelEn: 'First calving too late',
    what: 'Возраст первого отёла больше сорока восьми месяцев.',
    whatEn: 'The age at first calving is over forty-eight months.',
    why: 'Отёл в четыре года возможен, просто дорог. Но чаще это значит, что более ранние отёлы просто не записаны, — и тогда неверен не возраст, а полнота данных.',
    whyEn:
      'Calving at four years is possible, merely expensive. More often it means that the earlier calvings were simply never recorded — and then what is wrong is not the age but the completeness of the data.',
    severity: 'note',
    threshold: 'старше 48 месяцев',
    thresholdEn: 'older than 48 months',
  },
  {
    code: 'duplicate-first-calving',
    group: 'reproduction',
    label: 'Два отёла помечены первым',
    labelEn: 'Two calvings marked as the first',
    what: 'Номер 1 стоит у нескольких отёлов одной коровы.',
    whatEn: 'Number 1 stands on several calvings of one cow.',
    why: 'Номер отёла — сквозная нумерация жизни коровы, первый бывает один.',
    whyEn: 'The calving number runs through the whole life of a cow; there is only one first.',
    severity: 'fix',
  },
  {
    code: 'calving-order',
    group: 'reproduction',
    label: 'Отёлы идут не по порядку',
    labelEn: 'Calvings out of order',
    what: 'Отёл с бо́льшим номером записан более ранней датой, чем предыдущий.',
    whatEn: 'A calving with a higher number carries an earlier date than the one before it.',
    why: 'Каждое значение по отдельности правдоподобно, невозможен только их порядок. Обычно перепутана нумерация при переносе из прежней системы учёта.',
    whyEn:
      'Every value on its own is plausible; only their order is impossible. Usually the numbering was mixed up when the data was carried over from the previous recording system.',
    severity: 'fix',
  },
  {
    code: 'calving-interval-short',
    group: 'reproduction',
    label: 'Между отёлами меньше стельности',
    labelEn: 'Calving interval shorter than gestation',
    what: 'Промежуток между соседними отёлами короче двухсот семидесяти дней.',
    whatEn:
      'The interval between neighbouring calvings is shorter than two hundred and seventy days.',
    why: 'Корова не может отелиться дважды быстрее, чем длится стельность. Либо ошибка в дате, либо второй записью отмечен аборт.',
    whyEn:
      'A cow cannot calve twice faster than gestation lasts. Either the date is wrong, or the second entry records an abortion.',
    severity: 'fix',
    threshold: 'меньше 270 дней',
    thresholdEn: 'less than 270 days',
  },
  {
    code: 'calving-number-gap',
    group: 'reproduction',
    label: 'Пропуск в нумерации отёлов',
    labelEn: 'Gap in the calving numbers',
    what: 'В ряду номеров отёлов не хватает одного или нескольких.',
    whatEn: 'One or more numbers are missing from the run of calving numbers.',
    why: 'Либо отёл не записан — и тогда неполны все пожизненные величины, — либо номера проставлены неверно.',
    whyEn:
      'Either a calving was never recorded — and then every lifetime figure is incomplete — or the numbers were entered wrongly.',
    severity: 'note',
  },

  {
    code: 'duplicate-event',
    group: 'reproduction',
    label: 'Событие записано дважды',
    labelEn: 'Event recorded twice',
    what: 'У одного животного два одинаковых события в одну дату: два отёла, два осеменения или две дойки.',
    whatEn:
      'One animal has two identical events on one date: two calvings, two inseminations or two test-day recordings.',
    why: 'Обычно это повторная загрузка того же файла. Пока дубль не убран, все средние по животному считаются по удвоенным данным, а нумерация отёлов уходит вперёд.',
    whyEn:
      'Usually the same file was uploaded twice. Until the duplicate is removed, every average for the animal is computed on doubled data and the calving numbers run ahead.',
    severity: 'fix',
  },
  {
    code: 'insemination-too-soon',
    group: 'reproduction',
    label: 'Осеменение слишком рано после отёла',
    labelEn: 'Insemination too soon after calving',
    what: 'Между отёлом и осеменением меньше двадцати дней.',
    whatEn: 'Fewer than twenty days between the calving and the insemination.',
    why: 'Раньше двадцатого дня матка не восстановилась, и осеменять физически не в чем. Это не смелый менеджмент, а ошибка в дате.',
    whyEn:
      'Before the twentieth day the uterus has not recovered, and there is physically nothing to inseminate. This is not bold management but an error in the date.',
    severity: 'fix',
    threshold: 'меньше 20 дней',
    thresholdEn: 'less than 20 days',
  },
  {
    code: 'pregnancy-check-before-insemination',
    group: 'reproduction',
    label: 'Тест на стельность раньше осеменения',
    labelEn: 'Pregnancy check earlier than the insemination',
    what: 'Дата проверки стельности стоит раньше даты самого осеменения.',
    whatEn: 'The date of the pregnancy check falls before the date of the insemination itself.',
    why: 'Порядок событий перевёрнут: проверять нечего до того, как осеменили.',
    whyEn: 'The order of events is reversed: there is nothing to check before the insemination.',
    severity: 'fix',
  },
  {
    code: 'bull-born-later',
    group: 'reproduction',
    label: 'Бык родился позже осеменения',
    labelEn: 'Bull born after the insemination',
    what: 'Бык-производитель, записанный в осеменение, родился после его даты.',
    whatEn: 'The service sire recorded on the insemination was born after its date.',
    why: 'Связь установлена не с тем животным — как правило, с тёзкой по кличке или по короткому номеру.',
    whyEn:
      'The link points to the wrong animal — as a rule to a namesake, or to a match on a short identifier.',
    severity: 'fix',
  },
  {
    code: 'calf-birth-vs-calving',
    group: 'reproduction',
    label: 'Телёнок родился не в день отёла',
    labelEn: 'Calf not born on the day of the calving',
    what: 'Дата рождения животного, записанного приплодом, не совпадает с датой отёла.',
    whatEn:
      'The date of birth of the animal recorded as the calf does not match the date of the calving.',
    why: 'Отёл и рождение телёнка — один факт, записанный дважды. Расхождение означает, что приплодом отмечено не то животное либо в одной из дат опечатка.',
    whyEn:
      'A calving and the birth of a calf are one fact recorded twice. A divergence means that either the wrong animal is marked as the calf, or one of the two dates has a typing error.',
    severity: 'note',
  },
  {
    /*
     * Пришла на смену `twins-mismatch` — «Двойне без двух телят».
     *
     * Та смотрела на одно значение из шести и уцелела при смене
     * перечисления случайно: код `twins` пережил переход, а «Тёлка»
     * и «Бычок» стали числами. Тройня, множественные роды и все три
     * числа приплода не сверялись ни с чем.
     *
     * Код правила заменён, а не расширен молча: правило, изменённое
     * под прежним именем, читается как прежнее, и настройка Ассоциации
     * к нему относилась бы уже к другому предмету.
     */
    code: 'birth-count-mismatch',
    group: 'reproduction',
    label: 'Приплод не сходится сам с собой',
    labelEn: 'Offspring counts disagree with one another',
    what: 'Тип рождения, числа живых тёлочек, бычков и мертворождённых и карточки телят говорят о разном количестве.',
    whatEn:
      'The birth type, the counts of live heifer calves, bull calves and stillborn, and the calf records themselves state different numbers.',
    why: 'Сколько родилось, книга знает трижды, и три источника завелись в разное время: тип рождения переносили из прежней системы, числа проставляют вручную, карточки заводят не на всех телят. Расхождение означает, что одно из трёх записано неверно, а какое именно — видно по самой находке.',
    whyEn:
      'How many were born, the book knows three times over, and the three sources appeared at different times: the birth type was carried over from the previous system, the counts are entered by hand, and records are not created for every calf. A divergence means that one of the three is wrong, and which one is visible from the finding itself.',
    severity: 'note',
    threshold:
      'мертворождённые в число карточек не входят: карточку заводят живому. «Не определено» и «Множественные роды смешанного типа» ни с чем не сверяются',
    thresholdEn:
      'stillborn calves are not counted among the records: a record is created for a live calf. “Not stated” and “mixed multiple birth” are not cross-checked against anything',
  },
  {
    code: 'milk-test-outside-lactation',
    group: 'reproduction',
    label: 'Дойка вне лактации',
    labelEn: 'Test-day recording outside the lactation',
    what: 'Контрольная дойка записана раньше первого отёла коровы или после даты запуска.',
    whatEn:
      'A test-day recording is dated before the first calving of the cow or after the dry-off date.',
    why: 'Доить нечего до первого отёла и после запуска. Обычно перепутано животное либо съехал год в дате.',
    whyEn:
      'There is nothing to milk before the first calving or after dry-off. Usually the wrong animal was picked, or the year in the date slipped.',
    severity: 'note',
  },
  {
    code: 'dna-parentage-excluded',
    group: 'pedigree',
    label: 'ДНК-тест исключил происхождение',
    labelEn: 'DNA test excluded the parentage',
    what: 'По результатам теста происхождение не подтверждено, а родители в карточке остались.',
    whatEn: 'The test did not confirm the parentage, yet the parents are still on the record.',
    why: 'Это прямое противоречие между документом и записью — и единственный случай, когда система знает, что родословная неверна, наверняка.',
    whyEn:
      'A direct contradiction between the document and the record — and the only case in which the system knows for certain that the pedigree is wrong.',
    severity: 'fix',
  },

  /* --------------------------- Продуктивность -------------------------- */
  {
    code: 'milk-implausible',
    group: 'production',
    label: 'Удой вне правдоподобных границ',
    labelEn: 'Milk yield outside the plausible limits',
    what: 'Удой за лактацию меньше пятисот или больше двадцати пяти тысяч килограммов.',
    whatEn: 'Lactation yield below five hundred or above twenty-five thousand kilograms.',
    why: 'Двадцать пять тысяч встречается у мировых рекордисток, сорок — ни у кого. Такая рамка ловит ошибку в единицах измерения и не задевает хорошее животное.',
    whyEn:
      'Twenty-five thousand occurs in world record holders, forty thousand in no one. Limits drawn this wide catch an error in the unit of measurement without touching a good animal.',
    severity: 'fix',
    threshold: '500…25 000 кг',
    thresholdEn: '500…25,000 kg',
  },
  {
    code: 'fat-implausible',
    group: 'production',
    label: 'Жир вне правдоподобных границ',
    labelEn: 'Fat outside the plausible limits',
    what: 'Массовая доля жира вне диапазона от двух до шести с половиной процентов.',
    whatEn: 'Fat content outside the range from two to six and a half per cent.',
    why: 'За этими границами обычно не жирность, а перепутанные колонки.',
    whyEn: 'Beyond these limits it is usually not fat content but swapped columns.',
    severity: 'fix',
    threshold: '2,0…6,5 %',
    thresholdEn: '2.0…6.5%',
  },
  {
    code: 'protein-implausible',
    group: 'production',
    label: 'Белок вне правдоподобных границ',
    labelEn: 'Protein outside the plausible limits',
    what: 'Массовая доля белка вне диапазона от двух до пяти процентов.',
    whatEn: 'Protein content outside the range from two to five per cent.',
    why: 'То же самое: за границами — перепутанные колонки, а не рекорд.',
    whyEn: 'The same again: beyond the limits lie swapped columns, not a record.',
    severity: 'fix',
    threshold: '2,0…5,0 %',
    thresholdEn: '2.0…5.0%',
  },
  {
    code: 'bull-own-production',
    group: 'production',
    label: 'У быка заполнена собственная продуктивность',
    labelEn: 'A bull has production of his own filled in',
    what: 'В карточке быка стоят удой, жир, белок или лактации — как у коровы.',
    whatEn:
      'The record of a bull carries milk yield, fat, protein or lactations, as a cow record would.',
    why: 'Собственной продуктивности у быка не бывает: доить его нечем. Число попало туда переносом из чужой таблицы либо перепутанным полом, и оно портит любое среднее по стаду, куда бык попадает наравне с коровами.',
    whyEn:
      'A bull has no production of his own: there is nothing to milk. The figure got there from someone else’s spreadsheet or from a wrongly entered sex, and it spoils any herd average the bull enters alongside the cows.',
    severity: 'fix',
  },
  {
    code: 'eval-vs-book-divergence',
    group: 'production',
    label: 'Привезённая оценка расходится с расчётом книги',
    labelEn: 'Imported evaluation diverges from the computation of the book',
    what: 'Место животного по привезённой оценке и по расчёту книги отличается больше чем на сорок процентилей.',
    whatEn:
      'The rank of the animal by the imported evaluation and by the computation of the book differs by more than forty percentiles.',
    why: 'Оценки на разных базах не обязаны совпадать, но обязаны быть об одном животном. Расхождение в сорок процентилей означает, что одна из них про другое: перепутан столбец, оценка чужого животного, индекс другой породы или другой шкалы. Процентили сравниваются потому, что это единственная общая величина: очки индекса у разных центров несопоставимы, а место в своей популяции — да.',
    whyEn:
      'Evaluations on different bases need not agree, but they must be about the same animal. A divergence of forty percentiles means one of them is about something else: a swapped column, the evaluation of another animal, an index of another breed or of another scale. Percentiles are what gets compared because they are the only common measure: index points from different evaluation centres are incomparable, whereas a rank within one’s own population is not.',
    severity: 'note',
    threshold: 'расхождение больше 40 процентилей',
    thresholdEn: 'divergence over 40 percentiles',
  },
  {
    code: 'eval-source-unnamed',
    group: 'production',
    label: 'Не указано, кто считал привезённую оценку',
    labelEn: 'It is not stated who computed the imported evaluation',
    what: 'В карточке есть привезённая оценка, но не заполнено, чей это расчётный центр и по какой базе.',
    whatEn:
      'The record carries an imported evaluation, but neither the evaluation centre nor the base it was computed against is filled in.',
    why: 'Безымянная оценка нечитаема: индекс TPI из американского каталога и индекс областного центра — разные величины, и без имени источника сравнить их не с чем. Это же поле делает осмысленным расхождение с нашим расчётом: без него любое расхождение объясняется словами «разные базы» и потому не объясняется ничем.',
    whyEn:
      'An unnamed evaluation cannot be read: a TPI figure from an American catalogue and an index from a regional centre are different quantities, and without the name of the source there is nothing to compare them against. The same field is what makes a divergence from our own computation meaningful: without it, any divergence is explained away as “different bases” and therefore explained by nothing.',
    severity: 'note',
  },
  {
    code: 'eval-fat-kg-mismatch',
    group: 'production',
    label: 'Оценка по жиру в кг не сходится с оценками удоя и процента',
    labelEn: 'Fat kg evaluation disagrees with the yield and percentage evaluations',
    what: 'Племенная ценность по жиру в килограммах отличается больше чем на стандартное отклонение от того, что следует из оценок удоя и процента жира.',
    whatEn:
      'The breeding value for fat in kilograms differs by more than one standard deviation from what follows from the evaluations for yield and fat percentage.',
    why: 'Килограммы в оценке не самостоятельное число: они выводятся из удоя и процента. Расхождение означает, что числа собраны из разных источников — и в индекс уходит то, чего у животного нет. Каждое число при этом по отдельности правдоподобно, поэтому границы правдоподобия такую ошибку не видят.',
    whyEn:
      'Kilograms in an evaluation are not an independent figure: they follow from the yield and the percentage. A divergence means the figures were assembled from different sources — and what goes into the index is something the animal does not have. Each figure on its own is plausible, which is why the plausibility limits do not see this error.',
    severity: 'fix',
    threshold: 'расхождение больше 11,3 кг',
    thresholdEn: 'divergence over 11.3 kg',
  },
  {
    code: 'eval-protein-kg-mismatch',
    group: 'production',
    label: 'Оценка по белку в кг не сходится с оценками удоя и процента',
    labelEn: 'Protein kg evaluation disagrees with the yield and percentage evaluations',
    what: 'Племенная ценность по белку в килограммах отличается больше чем на стандартное отклонение от того, что следует из оценок удоя и процента белка.',
    whatEn:
      'The breeding value for protein in kilograms differs by more than one standard deviation from what follows from the evaluations for yield and protein percentage.',
    why: 'То же самое, что с жиром, и опаснее: белок весит в профиле Ассоциации четырнадцать процентов, а разброс по нему втрое уже, чем по жиру. Лишние сорок килограммов белка вытаскивают животное в первый процент книги.',
    whyEn:
      'The same as with fat, and more dangerous: protein carries fourteen per cent of the weight in the Association profile, and its spread is three times narrower than that of fat. Forty extra kilograms of protein pull an animal into the top one per cent of the book.',
    severity: 'fix',
    threshold: 'расхождение больше 6,9 кг',
    thresholdEn: 'divergence over 6.9 kg',
  },
  {
    code: 'fat-kg-mismatch',
    group: 'production',
    label: 'Жир в килограммах не сходится с процентом',
    labelEn: 'Fat in kilograms disagrees with the percentage',
    what: 'Молочный жир в килограммах отличается от произведения удоя на процент жира больше чем на десятую долю.',
    whatEn:
      'Milk fat in kilograms differs from the yield multiplied by the fat percentage by more than a tenth.',
    why: 'Расхождение больше округления означает, что числа взяты из разных источников, и какой из них верен, знает только хозяйство.',
    whyEn:
      'A divergence larger than rounding means the figures were taken from different sources, and only the farm knows which of them is right.',
    severity: 'note',
    threshold: 'расхождение больше 10 %',
    thresholdEn: 'divergence over 10%',
  },

  /* ----------------------- Состояние и выбытие ------------------------- */
  {
    code: 'too-old-alive',
    group: 'lifecycle',
    label: 'Слишком большой возраст при статусе «в стаде»',
    labelEn: 'Age too high for an animal listed as in the herd',
    what: 'Животное старше предельного возраста и при этом числится живым.',
    whatEn: 'The animal is older than the age limit and is still listed as alive.',
    why: 'Почти всегда означает, что выбытие не отмечено, а не что корова дожила до рекорда.',
    whyEn:
      'Almost always it means that a disposal was never recorded, not that the cow lived to a record age.',
    severity: 'fix',
  },
  {
    code: 'disposal-vs-state',
    group: 'lifecycle',
    label: 'Выбытие указано, но животное в стаде',
    labelEn: 'Disposal stated, yet the animal is in the herd',
    what: 'Заполнена причина выбытия, а состояние осталось «в стаде».',
    whatEn: 'A disposal reason is filled in while the status has stayed as in the herd.',
    why: 'Животное попадает в списки и счётчики стада, которого уже не покидало только на бумаге.',
    whyEn:
      'The animal keeps appearing in herd lists and counts, having left the herd everywhere except on paper.',
    severity: 'fix',
  },
  {
    code: 'state-vs-disposal',
    group: 'lifecycle',
    label: 'Выбытие без причины',
    labelEn: 'Disposal without a reason',
    what: 'Состояние не «в стаде», а причина выбытия не указана.',
    whatEn: 'The status is not in the herd, and no disposal reason is stated.',
    why: 'Причина выбытия — часть племенного учёта: по ней видно, почему стадо теряет животных.',
    whyEn:
      'The reason for disposal is part of breeding records: it is what shows why a herd loses animals.',
    severity: 'note',
  },

  /* ---------------------- Сопоставимость по стаду ---------------------- */
  {
    code: 'units-mixed',
    group: 'herd',
    label: 'Удои заведены в разных единицах',
    labelEn: 'Milk yields entered in different units',
    what: 'В стаде есть записи, где удой отличается от остальных на два порядка: часть в килограммах, часть — похоже, в тоннах или центнерах.',
    whatEn:
      'The herd holds records where the yield differs from the rest by two orders of magnitude: some in kilograms, some apparently in tonnes or centners.',
    why: 'По отдельности такие записи ловит проверка правдоподобия, и хозяйство видит полсотни одинаковых замечаний вместо одной причины. Пока единицы разные, любое среднее по стаду и любое сравнение животных между собой бессмысленны.',
    whyEn:
      'One by one such records are caught by the plausibility check, and the farm sees fifty identical warnings instead of one cause. While the units differ, any herd average and any comparison between animals is meaningless.',
    severity: 'fix',
    threshold: 'разница в 100 раз и больше',
    thresholdEn: 'a difference of 100 times or more',
  },
  {
    code: 'milk-test-source-mixed',
    group: 'herd',
    label: 'Дойки получены из разных источников',
    labelEn: 'Test-day recordings come from different sources',
    what: 'Контрольные дойки стада записаны частью из лаборатории, частью со слов собственника или импортом.',
    whatEn:
      'The test-day recordings of the herd come partly from a laboratory, partly from the owner or from an import.',
    why: 'Лабораторный замер и замер хозяйства — разные по точности числа, и складывать их в одно среднее нельзя. Это не запрет: замечание говорит, что часть данных не подтверждена независимо, и по ним нельзя судить о стаде как о едином.',
    whyEn:
      'A laboratory measurement and a farm measurement are figures of different accuracy, and they cannot be added into one average. This is not a prohibition: the warning says that part of the data is not independently confirmed, and the herd cannot be judged from it as a whole.',
    severity: 'note',
  },
  {
    code: 'index-base-mixed',
    group: 'herd',
    label: 'Индексы посчитаны по разным базам сравнения',
    labelEn: 'Indexes computed against different comparison bases',
    what: 'В пределах одного профиля оценки животных стада ссылаются на разные версии базы сравнения.',
    whatEn:
      'Within one profile the evaluations of the animals of the herd refer to different versions of the comparison base.',
    why: 'Индекс — это отклонение от базы. Два животных, посчитанных от разных баз, нельзя ни сравнить, ни поставить в один список: разница между ними частью отражает разницу баз, а не животных.',
    whyEn:
      'An index is a deviation from a base. Two animals computed from different bases can neither be compared nor put in one list: part of the difference between them reflects the difference between the bases, not between the animals.',
    severity: 'note',
  },
  {
    code: 'event-year-gap',
    group: 'herd',
    label: 'Год без единого отёла',
    labelEn: 'A year without a single calving',
    what: 'В ряду лет между первым и последним отёлом стада есть год, за который не записано ни одного. Смотрится только у стад, которые телятся регулярно: при редких отёлах пустой год ничего не значит.',
    whatEn:
      'In the run of years between the first and the last calving of the herd there is a year with none recorded. Looked at only in herds that calve regularly: where calvings are rare, an empty year means nothing.',
    why: 'Стадо, которое телилось до и после, не могло не телиться в промежутке. Почти всегда это непереданный за год отчёт, а не простой: пожизненные величины и возраст первого отёла по этим годам считаются неверно.',
    whyEn:
      'A herd that calved before and after cannot have stopped calving in between. Almost always it is a report that was never submitted for that year rather than an idle spell: lifetime figures and age at first calving are computed wrongly for those years.',
    severity: 'note',
  },
  {
    code: 'birth-date-clustered',
    group: 'herd',
    label: 'Даты рождения сходятся в одну дату',
    labelEn: 'Dates of birth cluster on one date',
    what: 'Заметная доля стада числится рождённой первого января или первого числа месяца.',
    whatEn:
      'A noticeable share of the herd is listed as born on the first of January or on the first day of a month.',
    why: 'Так выглядит перенос из бумажного учёта, где известен был только год или месяц: недостающее заполняли началом периода. Возраст первого отёла по таким записям смещён на месяцы, и хозяйство выглядит хуже или лучше, чем оно есть.',
    whyEn:
      'This is what a transfer from paper records looks like, where only the year or the month was known: the missing part was filled in with the start of the period. Age at first calving on such records is shifted by months, and the farm looks worse or better than it is.',
    severity: 'note',
    threshold: 'первое января — больше 5 % стада',
    thresholdEn: 'the first of January on more than 5% of the herd',
  },
  {
    code: 'values-rounded',
    group: 'herd',
    label: 'Удои подозрительно круглые',
    labelEn: 'Milk yields suspiciously round',
    what: 'Заметная доля удоев в стаде кратна пятистам килограммам.',
    whatEn: 'A noticeable share of the yields in the herd is a multiple of five hundred kilograms.',
    why: 'Измеренный удой круглым бывает редко. Массовая кратность означает оценку на глаз или перенос из отчёта, где числа уже округлили, — и такие данные нельзя использовать для оценки племенной ценности.',
    whyEn:
      'A measured yield is rarely round. Roundness across the board means an estimate by eye or a transfer from a report where the figures had already been rounded — and such data cannot be used for breeding value evaluation.',
    severity: 'note',
    threshold: 'кратных 500 кг больше четверти',
    thresholdEn: 'multiples of 500 kg on more than a quarter',
  },
  {
    code: 'outlier-vs-herd',
    group: 'herd',
    label: 'Удой не сходится с остальным стадом',
    labelEn: 'Milk yield disagrees with the rest of the herd',
    what: 'Удой отдельных животных отличается от медианы своего же стада больше чем втрое в любую сторону.',
    whatEn:
      'The yield of individual animals differs from the median of their own herd by more than threefold in either direction.',
    why: 'Рамка правдоподобия одна на всю книгу и заведомо широкая. Стадо — куда более точная мерка: в хозяйстве со средним удоем 7 000 кг запись на 22 000 формально правдоподобна, а на деле это почти всегда лишний ноль или чужая строка.',
    whyEn:
      'The plausibility limits are the same for the whole book and deliberately wide. The herd is a far more precise yardstick: on a farm averaging 7,000 kg a record of 22,000 is formally plausible, while in practice it is almost always an extra zero or someone else’s row.',
    severity: 'note',
    threshold: 'втрое от медианы стада',
    thresholdEn: 'threefold from the herd median',
  },
  {
    code: 'duplicate-calving-number',
    group: 'reproduction',
    label: 'Два отёла под одним номером',
    labelEn: 'Two calvings under one number',
    what: 'У животного несколько отёлов с одинаковым номером — например, два третьих.',
    whatEn:
      'An animal has several calvings with the same number — two third calvings, for instance.',
    why: 'Номер отёла сквозной по жизни коровы и повторяться не может. Повтор означает либо задвоенную загрузку, либо съехавшую привязку: отёл записался не тому животному. Второе опаснее — событие пропадает у одной коровы и появляется у другой, а число отёлов, по которому считается номер лактации и возрастная группа, врёт у обеих.',
    whyEn:
      'The calving number runs through the life of a cow and cannot repeat. A repeat means either a doubled upload or a slipped link: the calving was recorded against the wrong animal. The second is the more dangerous — the event disappears from one cow and appears on another, and the number of calvings, from which the lactation number and the age group are derived, lies for both.',
    severity: 'fix',
  },
  {
    code: 'age-group-vs-sex',
    group: 'production',
    label: 'Возрастная группа не сходится с полом',
    labelEn: 'Age group disagrees with the sex',
    what: 'У животного мужского пола стоит коровья возрастная группа — «первотёлка», «корова 2 лактации» или «корова 3+».',
    whatEn:
      'A male animal carries a cow age group — first-lactation cow, cow in second lactation or cow in third and later.',
    why: 'Одно из двух полей неверно, и какое именно — снаружи не видно. Если ошибся пол, животное считается коровой во всех отчётах по группам и может получить отёл. Если ошиблась группа, бык попадает в выборки коров и портит их средние. Система не выбирает за человека: сама она знает только, что вместе эти два значения существовать не могут.',
    whyEn:
      'One of the two fields is wrong, and from outside it is not visible which. If the sex is wrong, the animal counts as a cow in every report by group and can be given a calving. If the group is wrong, a bull falls into selections of cows and spoils their averages. The system does not choose on behalf of the person: all it knows by itself is that these two values cannot exist together.',
    severity: 'fix',
  },
  {
    code: 'production-before-calving',
    group: 'production',
    label: 'Продуктивность у не телившегося животного',
    labelEn: 'Production on an animal that has never calved',
    what: 'У животного из группы «телёнок» или «тёлка» заполнены удой, жир, белок или лактации.',
    whatEn:
      'An animal in the calf or heifer group has milk yield, fat, protein or lactations filled in.',
    why: 'До первого отёла лактации не бывает — доить нечем. Либо возрастная группа устарела и животное давно отелилось, либо строка продуктивности приехала от другого животного. Первое портит отчёты по группам, второе — оценку быка по дочерям.',
    whyEn:
      'There is no lactation before the first calving — there is nothing to milk. Either the age group is out of date and the animal calved long ago, or the production row arrived from another animal. The first spoils reports by group, the second the evaluation of a bull on his daughters.',
    severity: 'fix',
  },
  {
    code: 'no-milk-tests-year',
    group: 'herd',
    label: 'Коровы без единой контрольной дойки за год',
    labelEn: 'Cows without a single test-day recording for a year',
    what: 'У части живых самок за последние двенадцать месяцев не записано ни одного замера. Считается по всем живым самкам, включая тёлок: тем же условием, которым это число выводится в полосе дел кабинета.',
    whatEn:
      'For part of the live females no measurement has been recorded over the last twelve months. Computed over all live females, heifers included: by the same condition that produces this figure in the task strip of the farm account.',
    why: 'Продуктивность в книге считается по контрольным дойкам. Корова без замеров не участвует ни в оценке быка по дочерям, ни в средних по стаду — она есть в списке и отсутствует в расчётах. Это же число хозяйство видит в полосе дел кабинета: там оно называет работу, здесь — её причину.',
    whyEn:
      'Production in the book is computed from test-day recordings. A cow without measurements takes part neither in the evaluation of a bull on his daughters nor in the herd averages — she is on the list and absent from the computations. The farm sees this same figure in the task strip of its account: there it names the work, here the reason for it.',
    severity: 'note',
    threshold: 'ни одного замера за 12 месяцев; у стад меньше порога по размеру не считается',
    thresholdEn: 'no measurement in 12 months; not computed for herds below the size threshold',
  },
  {
    code: 'ident-core-shared',
    group: 'herd',
    label: 'Разные записи под одним номером',
    labelEn: 'Different records under one number',
    what: 'У двух и более записей стада совпадает цифровая часть идентификаторов — при том, что записаны они в разных полях или в разных системах нумерации.',
    whatEn:
      'Two or more records of the herd share the numeric part of their identifiers — although those identifiers are held in different fields or in different numbering systems.',
    why: 'Единого номера у скота в России нет: одно животное ходит под национальным номером, под XXRUS…, под инвентарным и под биркой. Совпадение цифр означает одно из двух — либо это одна корова, заведённая дважды, либо два разных номера, случайно сошедшихся цифрами. Различить их может только хозяйство, и замечание задаёт вопрос, а не отвечает на него.',
    whyEn:
      'Cattle in Russia have no single identifier: one animal goes under a national number, under XXRUS…, under an inventory number and under an ear tag. A match in the digits means one of two things — either it is one cow entered twice, or two different numbers that happen to coincide in digits. Only the farm can tell them apart, and the warning asks the question rather than answering it.',
    severity: 'note',
    threshold: 'совпадение не короче 8 цифр',
    thresholdEn: 'a match of at least 8 digits',
  },
] as const satisfies readonly CheckSpec[]

/**
 * Код существующей проверки.
 *
 * Им типизированы находки в `data-checks.ts`. Смысл этого типа один:
 * проверку, которой нет в реестре, нельзя завести незаметно — сборка
 * упадёт раньше, чем каталог успеет отстать от кода.
 */
export type CheckCode = (typeof CHECKS)[number]['code']

/**
 * Код проверки по стаду — и код проверки по записи.
 *
 * Реестр один на оба вида: настройки Ассоциации, каталог и защита
 * от незарегистрированного кода написаны по нему один раз, и заводить
 * им вторую половину значило бы удваивать всё это ради разницы
 * в форме находки.
 *
 * А вот сами находки разной формы, и типы это разделяют: у проверки
 * по стаду нет животного, к которому её прицепить, а у проверки
 * по записи оно обязано быть. Один общий код позволил бы написать
 * находку по стаду с `animalId` наугад — здесь это не скомпилируется.
 */
export type HerdCheckCode = Extract<(typeof CHECKS)[number], { group: 'herd' }>['code']
export type AnimalCheckCode = Exclude<CheckCode, HerdCheckCode>

/**
 * Находка по одной записи.
 *
 * Живёт здесь, а не в `data-checks.ts`, чтобы модули проверок могли
 * её импортировать, не замыкая круг: оркестратор зовёт их, они его — нет.
 */
export type Issue = {
  code: AnimalCheckCode
  animalId: number
  ident: string
  /** Поле карточки, к которому относится замечание. */
  field?: string
  severity: CheckSeverity
  text: string
}

/**
 * Оговорка о полноте разбора.
 *
 * Проверки с потолком обязаны говорить, где он сработал: «замечаний
 * не найдено» и «замечаний не искали» выглядят на экране одинаково,
 * а значат противоположное.
 */
export type CheckLimits = string[]

/**
 * Находка по стаду целиком.
 *
 * Отдельный тип, а не `Issue` с необязательным животным. Разница
 * содержательная: «у этой коровы нет даты рождения» чинят в карточке,
 * «в стаде смешаны единицы измерения» — пересчётом всего массива.
 * Показывать их одним списком значило бы предложить чинить второе
 * так же, как первое.
 *
 * `examples` — не полный перечень, а доказательство: находка по стаду
 * без единой записи, на которой её видно, читается как гадание.
 */
export type HerdIssue = {
  code: HerdCheckCode
  severity: CheckSeverity
  /** Что нашли — с числами, на которых это видно. */
  text: string
  /** Несколько записей или значений для примера. */
  examples?: { animalId?: number; label: string }[]
}

export const checkSpec = (code: CheckCode): CheckSpec | undefined =>
  CHECKS.find((c) => c.code === code)

/**
 * То же по произвольной строке — для тех, кто приходит с кодом извне
 * системы типов.
 *
 * Такой вызывающий один: сводка качества книги (`book-quality.ts`).
 * Она считает противоречия своими запросами по всей базе и знает коды
 * строками; часть из них в реестре есть, часть — нет (сводка разделяет
 * отца и мать там, где реестр держит одно правило на обоих родителей).
 * Приводить строку к `CheckCode` значило бы соврать системе типов
 * о том, чего она проверить не может; честнее принять строку и вернуть
 * `undefined`, если такой проверки нет.
 */
export const checkSpecByCode = (code: string): CheckSpec | undefined =>
  ALL_CHECKS.find((c) => c.code === code)


/**
 * Реестр с расширенным типом — для перебора.
 *
 * `as const satisfies` у самого реестра сохраняет литеральные типы, и это
 * нужно: из них выведен `CheckCode`, из них же — разделение на проверки
 * по записи и по стаду. Оборотная сторона в том, что у элемента, где
 * необязательное поле не написано, этого поля нет и в типе: перебор
 * по всему реестру спотыкается на `c.dbGuard`, хотя `CheckSpec` его
 * объявляет.
 *
 * Отсюда второе имя того же массива, с объявленным типом. Приведение
 * на месте (`CHECKS as readonly CheckSpec[]`) сделало бы то же самое,
 * но его пришлось бы повторять при каждом переборе — и однажды кто-нибудь
 * привёл бы к типу пошире.
 */
export const ALL_CHECKS: readonly CheckSpec[] = CHECKS

/**
 * Проверки, данных под которые база не примет.
 *
 * Нужны отчётам о полноте: без этого списка они называют непроверенным
 * то, чему неоткуда взяться, и требуют завести данные, которые `insert`
 * отвергнет.
 */
export const guardedChecks = (): readonly CheckSpec[] => ALL_CHECKS.filter((c) => c.dbGuard)
