/**
 * Карта соответствия руководствам ICAR — один источник на две страницы.
 *
 * ## Почему отдельным модулем
 *
 * Страниц две: короткая таблица на `/icar` и разбор пробелов
 * на `/icar/gaps`. Обе говорят об одном и том же, и разойтись им негде
 * только пока список один. Копия здесь была бы худшего сорта: таблица
 * показывала бы «учтено» там, где разбор объясняет, чего не хватает,
 * — и читатель поверил бы той странице, которую открыл первой.
 *
 * ## Почему полностью учтённых разделов нет ни одного
 *
 * Это не скромность и не осторожность формулировок. Руководства ICAR
 * писались для национальных служб учёта с лабораториями, инспекторами
 * и обязательным участием хозяйств; часть их требований к системе
 * не относится вовсе, а часть относится, но требует того, чего у книги
 * пока нет. Список из одних галочек был бы рекламой; список, где нет
 * ни одной, — это состояние на сегодня, и оно честнее.
 *
 * ## Что означает «вне области»
 *
 * Разделы про сертификацию молокомеров, ушных бирок и аккредитацию
 * лабораторий. Это про железо и лаборатории, а не про учётную систему;
 * книга принимает результаты таких приборов, но не сертифицирует их
 * и не претендует.
 *
 * ## Где смотреть
 *
 * `src/app/(frontend)/icar/page.tsx` — таблица,
 * `src/app/(frontend)/icar/gaps/page.tsx` — разбор,
 * `docs/icar.md` — правила использования марки и письмо в ICAR.
 */

export type IcarState = 'full' | 'partial' | 'out'

export const ICAR_STATE_LABEL: Record<IcarState, string> = {
  full: 'Учтено',
  partial: 'Частично',
  out: 'Вне области',
}

/**
 * То же по-английски — для витрины.
 *
 * `Record` по состоянию, а не список: новое состояние не соберётся без
 * подписи на обоих языках, и на английской странице не появится русское
 * «Частично» рядом с английской таблицей.
 */
export const ICAR_STATE_LABEL_EN: Record<IcarState, string> = {
  full: 'Covered',
  partial: 'Partial',
  out: 'Out of scope',
}

export const ICAR_STATE_CLASS: Record<IcarState, string> = {
  full: 'bg-brand-50 text-forest-600',
  partial: 'bg-amber-50 text-amber-800',
  out: 'bg-ink-50 text-ink-500',
}

/**
 * Пробел: чего нет, почему это важно и что потребуется.
 *
 * Английские поля обязательные, а не необязательные. Пробел, заведённый
 * без английского, просто не соберётся — и это единственный способ
 * не получить английскую страницу с русским абзацем посередине:
 * необязательное поле забывают молча, и узнаётся об этом от читателя.
 */
export type IcarGap = {
  what: string
  why: string
  need: string
  whatEn: string
  whyEn: string
  needEn: string
}

export type IcarSection = {
  /** Номер раздела как в руководствах. Нумерация не сплошная. */
  section: string
  title: string
  /**
   * Название раздела по-английски.
   *
   * Берётся у ICAR со списка руководств, а не переводится обратно
   * с русского: «Section 05 – Conformation Recording» — это слова самого
   * документа, и специалист ищет по ним, а не по нашему пересказу.
   * У девяти разделов оно совпадает с `title`: там имя ICAR стоит
   * по-английски и на русской странице — переводить чужой нормативный
   * заголовок значило бы завести второе имя одному документу.
   * Отличается только сводная строка про приборы и лаборатории: она
   * наша, а не ICAR, и названа на обоих языках своими словами.
   */
  titleEn: string
  /** Якорь для ссылки и для страницы разбора. */
  slug: string
  /** Страница раздела на wiki.icar.org. */
  wiki: string
  state: IcarState
  /** Что требует раздел — коротко, своими словами, без цитирования. */
  about: string
  /** Как это устроено в книге. */
  ours: string
  /** То же по-английски; обязательно — см. `IcarGap`. */
  aboutEn: string
  oursEn: string
  gaps: IcarGap[]
}

/*
 * Номера и названия сверены со списком на wiki.icar.org 2 сентября 2026 года.
 * Проверять при обновлении: нумерация не сплошная — тринадцатого раздела
 * нет вовсе, — и «раздел про молоко» по памяти называют четвёртым, хотя
 * четвёртый про ДНК, а молоко второе.
 */
export const ICAR_SECTIONS: IcarSection[] = [
  {
    section: '01',
    title: 'General Rules',
    titleEn: 'General Rules',
    slug: 'general-rules',
    wiki: 'Section_01_-_General_Rules',
    state: 'partial',
    about:
      'Общие правила учёта: кто ведёт записи, как подтверждается их достоверность, ' +
      'что делает организация учёта и за что она отвечает перед заводчиком.',
    ours:
      'Роли, права доступа и журнал изменений по каждой записи. Верификация записей ' +
      'Ассоциацией — отдельный поток заявок.',
    aboutEn:
      'General rules of recording: who keeps the records, how their trustworthiness is ' +
      'confirmed, what a recording organisation does and what it answers for before the breeder.',
    oursEn:
      'Roles, access rights and a change log on every record. Verification of records by the ' +
      'Association runs as a separate stream of applications.',
    gaps: [
      {
        what: 'Нет внешнего аудита процедур.',
        why:
          'Правило, которое проверяет только тот, кто его написал, — это обещание, ' +
          'а не правило. Раздел построен вокруг того, что достоверность подтверждает ' +
          'третья сторона, и заменить её собственным прогоном нельзя.',
        need:
          'ICAR Certificate of Quality по направлениям Herd-book recording и Data ' +
          'processing — единственная в мире отраслевая сертификация ведения племенной ' +
          'книги. Доступна только членам ICAR, и это упирается в вещи за пределами кода ' +
          '(см. docs/icar.md).',
        whatEn: 'There is no external audit of the procedures.',
        whyEn:
          'A rule checked only by whoever wrote it is a promise, not a rule. The section is ' +
          'built around trustworthiness being confirmed by a third party, and a run of our own ' +
          'cannot take its place.',
        needEn:
          'The ICAR Certificate of Quality for Herd-book recording and Data processing — the ' +
          'only industry certification of herd book keeping in the world. It is open to ICAR ' +
          'members only, and that runs into matters outside the code (see docs/icar.md).',
      },
      {
        what: 'Процедуры учёта не описаны отдельным документом.',
        why:
          'Порядок работы живёт в коде и в решениях разработчика. Пока систему ведёт ' +
          'один человек, это работает; при передаче Ассоциации или при аудите — нет.',
        need:
          'Регламент ведения книги: кто вносит, кто проверяет, в какие сроки, что ' +
          'считается ошибкой и как она исправляется. Работа Ассоциации, а не системы.',
        whatEn: 'The recording procedures are not written down as a document of their own.',
        whyEn:
          'The order of work lives in the code and in the decisions of the developer. While ' +
          'one person runs the system that works; on handover to the Association, or under an ' +
          'external audit, it does not.',
        needEn:
          'Written rules for keeping the book: who enters, who checks, within what deadlines, ' +
          'what counts as an error and how it is corrected. Work for the Association, not for ' +
          'the system.',
      },
    ],
  },
  {
    section: '02',
    title: 'Cattle Milk Recording',
    titleEn: 'Cattle Milk Recording',
    slug: 'milk-recording',
    wiki: 'Section_02_-_Cattle_Milk_Recording',
    state: 'partial',
    about:
      'Учёт молочной продуктивности: схемы контрольных доений, интервалы между ними, ' +
      'расчёт лактации, обозначение метода (A4, B4 и прочие), обращение с пропусками.',
    ours:
      'Контрольные доения с датой, удоем, жиром, белком и соматикой; лактация считается ' +
      'из них, а не вводится числом. Метод контроля записывается перечислениями стандарта: ' +
      'кто снимал показания, какие доения вошли, как и когда взята проба, — и привычное ' +
      'обозначение A4 или B4 собирается из них, а не хранится строкой. Проверки ловят разрывы в ряду доений и лактации ' +
      'без обязательных показателей.',
    aboutEn:
      'Recording of milk yield: test-day schemes, the intervals between them, computing the ' +
      'lactation, the designation of the performance recording method (A4, B4 and the rest) ' +
      'and the handling of missing tests.',
    oursEn:
      'Test days with date, yield, fat, protein and somatic cells; the lactation is computed ' +
      'from them rather than entered as a number. The performance recording method is written ' +
      'down through the enumerations of the standard: who took the readings, which milkings ' +
      'were included, how and when the sample was taken — and the familiar A4 or B4 ' +
      'designation is assembled from those rather than stored as a string. Checks catch breaks ' +
      'in the run of test days and lactations without the mandatory figures.',
    gaps: [
      {
        what: 'Интервал между контролями не проверяется.',
        why:
          'Раздел задаёт допустимые интервалы, и выход за них означает, что лактация ' +
          'посчитана по слишком редким точкам. Наша проверка ловит только полный ' +
          'разрыв в ряду, а не растянутый интервал.',
        need: 'Правило в реестре проверок: интервал между соседними доениями в днях.',
        whatEn: 'The interval between test days is not checked.',
        whyEn:
          'The section sets the permissible intervals, and going beyond them means the ' +
          'lactation has been computed from points too far apart. Our check catches only a ' +
          'complete break in the run, not a stretched interval.',
        needEn:
          'A rule in the check registry: the interval between neighbouring test days, in days.',
      },
    ],
  },
  {
    section: '04',
    title: 'DNA Technology',
    titleEn: 'DNA Technology',
    slug: 'dna',
    wiki: 'Section_04_-_DNA_Technology',
    state: 'partial',
    about:
      'Работа с генотипами: подтверждение и уточнение происхождения, обмен генотипами ' +
      'между организациями, требования к лабораториям.',
    ours:
      'ДНК-тест с лабораторией, датой, методом и результатом подтверждения происхождения; ' +
      'расхождение с записанными родителями попадает в проверки.',
    aboutEn:
      'Work with genotypes: parentage verification and discovery, the exchange of genotypes ' +
      'between organisations, and the requirements on laboratories.',
    oursEn:
      'A DNA test with the laboratory, date, method and the result of parentage verification; ' +
      'a disagreement with the recorded parents goes into the checks.',
    gaps: [
      {
        what: 'Хранится результат теста, а не сам генотип.',
        why:
          'Мы знаем, что происхождение подтверждено, но не можем ни перепроверить это ' +
          'сами, ни передать генотип другой организации. При смене лаборатории ' +
          'подтверждение придётся покупать заново.',
        need:
          'Хранение маркеров: 12 обязательных STR и не менее 200 SNP из набора ISAG, ' +
          'формат TOP/AB, расчёт вероятностей исключения. Стандарт ADE тут не помощник — ' +
          'генотипов в нём нет вовсе.',
        whatEn: 'The result of the test is stored, not the genotype itself.',
        whyEn:
          'We know that parentage is confirmed, but we can neither re-check it ourselves nor ' +
          'hand the genotype to another organisation. On a change of laboratory the ' +
          'confirmation would have to be bought again.',
        needEn:
          'Genotype storage: the 12 mandatory STR markers and at least 200 SNP from the ISAG ' +
          'panel, TOP/AB format, computation of exclusion probabilities. The ADE standard is ' +
          'no help here — it has no genotypes at all.',
      },
      {
        what: 'Нет обмена генотипами с другими организациями.',
        why:
          'Международный обмен идёт через GenoEx-PSE, и он закрыт: нужно членство ICAR ' +
          'плюс сертификация как DNA Data Interpretation Centre. Российских организаций ' +
          'в списке двадцати семи центров нет.',
        need:
          'Сначала — хранение генотипов у себя; обмен возможен только после того, ' +
          'как изменится внешняя ситуация.',
        whatEn: 'There is no exchange of genotypes with other organisations.',
        whyEn:
          'International exchange goes through GenoEx-PSE, and it is closed: ICAR membership ' +
          'plus certification as a DNA Data Interpretation Centre are required. No Russian ' +
          'organisation is among the twenty-seven centres.',
        needEn:
          'Genotype storage of our own first; exchange becomes possible only once the external ' +
          'situation changes.',
      },
    ],
  },
  {
    section: '05',
    title: 'Conformation Recording',
    titleEn: 'Conformation Recording',
    slug: 'conformation',
    wiki: 'Section_05_-_Conformation_Recording',
    state: 'partial',
    about:
      'Оценка экстерьера: линейные признаки на девятибалльной шкале, сводные оценки ' +
      'по стобалльной, требования к оценщику и к повторяемости оценок.',
    ours:
      'Линейная оценка по признакам 1–9, сводные оценки 50–100 и оценка молодняка. ' +
      'У каждой оценки записан оценщик и дата. Шестнадцать линейных признаков и четыре ' +
      'сводных отображаются в номенклатуру ICAR при обмене по ADE.',
    aboutEn:
      'Conformation recording: linear traits on a nine-point scale, composite scores on a ' +
      'hundred-point scale, and the requirements on the classifier and on the repeatability ' +
      'of scores.',
    oursEn:
      'Linear scoring on traits 1–9, composite scores 50–100 and the scoring of young stock. ' +
      'Every score carries the classifier and the date. Sixteen linear traits and four ' +
      'composites are mapped to the ICAR nomenclature when exchanging over ADE.',
    gaps: [
      {
        what: 'Два сводных признака в номенклатуру ICAR не ложатся.',
        why:
          '«Объём туловища» и «задняя треть туловища» — наши составные показатели, ' +
          'и соответствия им в перечислении icarConformationTraitType нет. При обмене ' +
          'они просто не уезжают. Выдать их за соседние по смыслу значило бы отправить ' +
          'чужой системе число под чужим именем.',
        need:
          'Либо решение Ассоциации перейти на состав признаков ICAR, либо признание ' +
          'того, что эти два остаются внутренними. Решение зоотехническое, не техническое.',
        whatEn: 'Two composite traits do not fit the ICAR nomenclature.',
        whyEn:
          '“Body volume” and “rear third of the body” are composites of our own, and the ' +
          'icarConformationTraitType enumeration has no counterpart for them. In an exchange ' +
          'they simply do not travel. Passing them off as the nearest traits by meaning would ' +
          'be sending another system a figure under someone else’s name.',
        needEn:
          'Either a decision by the Association to move to the ICAR set of traits, or the ' +
          'recognition that these two remain internal. The decision is a breeding one, not a ' +
          'technical one.',
      },
      {
        what: 'Повторяемость оценок оценщиками не проверяется.',
        why:
          'Раздел требует, чтобы разные оценщики ставили одному животному близкие ' +
          'оценки, и чтобы это измерялось. Без такой проверки экстерьерный рейтинг ' +
          'отражает не столько корову, сколько привычки конкретного бонитёра.',
        need:
          'Повторные оценки одного животного разными оценщиками и расчёт расхождения. ' +
          'Данные для этого надо собирать специально — из обычной работы они не берутся.',
        whatEn: 'The repeatability of scores between classifiers is not measured.',
        whyEn:
          'The section requires that different classifiers give one animal close scores and ' +
          'that this is measured. Without such a check the conformation rating reflects the ' +
          'habits of a particular classifier as much as it reflects the cow.',
        needEn:
          'Repeat scoring of the same animal by different classifiers and computation of the ' +
          'divergence. That data has to be collected on purpose — ordinary work does not ' +
          'produce it.',
      },
    ],
  },
  {
    section: '06',
    title: 'AI and ET Data and Fertility Analysis',
    titleEn: 'AI and ET Data and Fertility Analysis',
    slug: 'repro',
    wiki: 'Section_06_-_AI_and_ET_Data_and_Fertility_Analysis',
    state: 'partial',
    about:
      'Учёт осеменений и пересадок эмбрионов, расчёт показателей воспроизводства: ' +
      'сервис-период, межотельный период, индекс осеменения.',
    ours:
      'Осеменения с быком, дозой, техником и результатом; сервис-период и межотельный ' +
      'считаются из событий. Проверки ловят слишком короткий межотельный период ' +
      'и осеменение раньше отёла.',
    aboutEn:
      'Recording of inseminations and embryo transfers, and the computation of fertility ' +
      'figures: days open, the calving interval, services per conception.',
    oursEn:
      'Inseminations with the sire, dose, technician and result; days open and the calving ' +
      'interval are computed from the events. Checks catch a calving interval that is too ' +
      'short and an insemination dated before the calving.',
    gaps: [
      {
        what: 'Трансплантация эмбрионов не ведётся.',
        why:
          'Раздел покрывает и ЭТ, а у нас нет ни вымывания, ни донора с реципиентом, ' +
          'ни документации на эмбрион. Телёнок от пересадки записывается как обычный, ' +
          'и родословная у него получается неверной: мать-реципиент попадает в неё ' +
          'вместо генетической матери.',
        need:
          'Событие вымывания, карточка эмбриона, тип родства «реципиент» в родословной. ' +
          'В ADE для этого всё есть: icarReproEmbryoFlushingEventResource, ' +
          'icarReproEmbryoResource и значение Recipient в icarAnimalRelationType. ' +
          'Требуется правилами WHFF при регистрации.',
        whatEn: 'Embryo transfer is not recorded.',
        whyEn:
          'The section covers ET as well, and we have neither a flushing, nor a donor and a ' +
          'recipient, nor documentation for an embryo. A calf from a transfer is recorded as ' +
          'an ordinary one, and its pedigree comes out wrong: the recipient dam enters it ' +
          'instead of the genetic dam.',
        needEn:
          'A flushing event, an embryo record and a “recipient” relation type in the pedigree. ' +
          'ADE has everything for this: icarReproEmbryoFlushingEventResource, ' +
          'icarReproEmbryoResource and the value Recipient in icarAnimalRelationType. ' +
          'Required by the WHFF rules on registration.',
      },
    ],
  },
  {
    section: '07',
    title: 'Bovine Functional Traits',
    titleEn: 'Bovine Functional Traits',
    slug: 'functional-traits',
    wiki: 'Section_07_-_Bovine_Functional_Traits',
    state: 'partial',
    about:
      'Функциональные признаки: здоровье вымени, лёгкость отёла, сохранность приплода, ' +
      'долголетие — что именно записывать и как это кодировать.',
    ours:
      'Соматика по контрольным доениям, лёгкость отёла, живой и мёртвый приплод, ' +
      'выбытие с датой и причиной.',
    aboutEn:
      'Functional traits: udder health, calving ease, calf survival, longevity — what exactly ' +
      'to record and how to code it.',
    oursEn:
      'Somatic cells from the test days, calving ease, live and dead calves, and disposal with ' +
      'the date and the reason.',
    gaps: [
      {
        what: 'Единый код здоровья ICAR (Central Health Key) не используется.',
        why:
          'Записи о болезнях ведутся свободнее, чем требует справочник, и сравнить ' +
          'частоту мастита у нас и в другой стране нельзя: там код, у нас текст. ' +
          'Это же закрывает дорогу к международной оценке признаков здоровья.',
        need:
          'Справочник Central Health Key, поле кода у лечения и диагноза, перевод ' +
          'существующих записей. Тот же код использует ADE в icarDiagnosisEventResource.',
        whatEn: 'The ICAR Central Health Key is not used.',
        whyEn:
          'Disease records are kept more freely than the reference list requires, and the ' +
          'frequency of mastitis here cannot be compared with another country: there it is a ' +
          'code, here it is text. The same closes the road to international evaluation of ' +
          'health traits.',
        needEn:
          'The Central Health Key reference list, a code field on the treatment and the ' +
          'diagnosis, and conversion of the existing records. ADE uses the same key in ' +
          'icarDiagnosisEventResource.',
      },
      {
        what: 'Лёгкость отёла в трёх степенях вместо пяти.',
        why:
          'У нас «лёгкий, с помощью, тяжёлый», в международной шкале пять степеней ' +
          'с отдельным кесаревым. При обмене наши три растягиваются в чужие пять ' +
          'однозначно, а обратно — уже нет: два разных чужих значения приходят ' +
          'в одно наше, и различие теряется молча.',
        need:
          'Расширить справочник до пяти степеней по icarReproCalvingEaseType ' +
          'и перевести существующие записи.',
        whatEn: 'Calving ease in three degrees instead of five.',
        whyEn:
          'We have “easy, with assistance, difficult”, while the international scale has five ' +
          'degrees with a caesarean of its own. In an exchange our three map onto the other ' +
          'five unambiguously, but not back: two different foreign values arrive as one of ' +
          'ours, and the difference is lost silently.',
        needEn:
          'Extend the reference list to five degrees per icarReproCalvingEaseType and convert ' +
          'the existing records.',
      },
    ],
  },
  {
    section: '09',
    title: 'Dairy Cattle Genetic Evaluation',
    titleEn: 'Dairy Cattle Genetic Evaluation',
    slug: 'genetic-evaluation',
    wiki: 'Section_09_-_Dairy_Cattle_Genetic_Evaluation',
    state: 'partial',
    about:
      'Генетическая оценка молочного скота: из чего складывается племенная ценность, ' +
      'как считается достоверность, как публикуются результаты и база сравнения.',
    ours:
      'Индекс племенной ценности с профилями весов, достоверностью по каждому признаку ' +
      'и по индексу в целом, с версией базы сравнения рядом со значением. Рейтинг ' +
      'по книге публикуется поимённо.',
    aboutEn:
      'Genetic evaluation of dairy cattle: what breeding value is made of, how reliability is ' +
      'computed, how results are published, and the comparison base.',
    oursEn:
      'A breeding value index with weight profiles, reliability for each trait and for the ' +
      'index as a whole, and the version of the comparison base beside the value. The ranking ' +
      'within the book is published by name.',
    gaps: [
      {
        what: 'База сравнения заимствована, а не своя.',
        why:
          'Стандартные отклонения и наследуемости взяты из американской базы ' +
          'CDCB-2025 и переведены в метрические единицы. Для российской популяции ' +
          'они приблизительны: индекс внутренне согласован, но его абсолютное ' +
          'значение не означает того же, что в стране, где база своя.',
        need:
          'Расчёт генетических параметров по российской популяции — работа ' +
          'научного учреждения, а не системы. Наша часть — версия базы рядом ' +
          'с каждым значением, чтобы смена была прослеживаема; это уже сделано.',
        whatEn: 'The comparison base is borrowed rather than our own.',
        whyEn:
          'Standard deviations and heritabilities are taken from the American CDCB-2025 base ' +
          'and converted into metric units. For the Russian population they are approximate: ' +
          'the index is internally consistent, but its absolute value does not mean what it ' +
          'means in a country with a base of its own.',
        needEn:
          'Computation of genetic parameters on the Russian population — work for a research ' +
          'institute, not for the system. Our part is the base version beside every value, so ' +
          'that a change stays traceable; that is already done.',
      },
      {
        what: 'Нет валидации генетического тренда.',
        why:
          'Раздел требует проверять, что оценка не «плывёт» год от года: методы I–III ' +
          'Interbull именно об этом. Без такой проверки медленный сдвиг базы выглядит ' +
          'как генетический прогресс, и заметить подмену нельзя.',
        need:
          'Реализация валидационных тестов трендов методами I–III. Делается без всякого ' +
          'членства и остаётся правильной архитектурой, даже если участие в Interbull ' +
          'никогда не случится.',
        whatEn: 'There is no validation of the genetic trend.',
        whyEn:
          'The section requires checking that the evaluation does not drift from year to year: ' +
          'Interbull methods I–III are about exactly that. Without such a check a slow shift ' +
          'of the base looks like genetic progress, and the substitution cannot be noticed.',
        needEn:
          'Implementation of the trend validation tests, methods I–III. It is done without any ' +
          'membership and remains the right architecture even if participation in Interbull ' +
          'never happens.',
      },
      {
        what: 'Оценка не участвует в международном сравнении.',
        why:
          'MACE Interbull приводит оценки разных стран к общей шкале. Без этого ' +
          'наш индекс несопоставим с чужим ни в какую сторону — ни быка сравнить, ' +
          'ни импортную корову оценить.',
        need:
          'Требует членства ICAR и валидированной национальной оценки в единой базе. ' +
          'Сегодня закрыто.',
        whatEn: 'The evaluation takes no part in international comparison.',
        whyEn:
          'Interbull MACE brings the evaluations of different countries onto a common scale. ' +
          'Without it our index is comparable with no one’s in either direction — neither to ' +
          'compare a sire nor to judge an imported cow.',
        needEn:
          'Requires ICAR membership and a validated national evaluation in the common base. ' +
          'Closed today.',
      },
    ],
  },
  {
    section: '15',
    title: 'Data Exchange',
    titleEn: 'Data Exchange',
    slug: 'data-exchange',
    wiki: 'Section_15_-_Data_Exchange',
    state: 'partial',
    about:
      'Обмен данными между системами: словари, форматы, схемы. Современная линия — ' +
      'открытый стандарт ADE на JSON и REST, спецификация лежит на GitHub под Apache 2.0.',
    ours:
      'Обмен с ФГИАС ПР по двадцати шаблонам реестра — выгрузка и обратная загрузка. ' +
      'Собственный REST-интерфейс книги. Отдача семи коллекций ADE по адресам ' +
      'из спецификации: животные, контрольные доения, отёлы, осеменения, оценки ' +
      'экстерьера, взвешивания, племенная ценность, поступление, выбытие, падёж, ' +
      'проверка стельности. Приём POST по четырём из них — контрольные доения, ' +
      'отёлы, осеменения, взвешивания — с распознаванием повторной отправки по паре ' +
      '«источник + его номер записи», построчным ответом icarBatchResult и отказами ' +
      'в виде icarErrorResource. Отдаваемое сверяется с настоящими схемами ' +
      'из репозитория adewg/ICAR, а не с нашей копией перечислений. Отбор выборки — ' +
      'именами самого стандарта: meta-modified-from и meta-modified-to по дате записи, ' +
      'date-from и date-to по дате события, пара animal-id с animal-scheme по животному; ' +
      'непонятые параметры называются в заголовке ответа, а не отбрасываются молча. ' +
      'Животные, оценка экстерьера, племенная ценность и перемещения на запись ' +
      'закрыты намеренно: запись животного и переход прав — утверждения, ' +
      'за которые Ассоциация отвечает, и они идут заявкой с проверкой, ' +
      'а не строкой в потоке обмена; каждой отвечается 405 с объяснением.',
    aboutEn:
      'Data exchange between systems: dictionaries, formats, schemas. The current line is the ' +
      'open ADE standard on JSON and REST, its specification held on GitHub under Apache 2.0.',
    oursEn:
      'Exchange with FGIAS PR over the twenty templates of the registry — export and reverse ' +
      'import. A REST interface of the book’s own. Seven ADE collections served at the paths ' +
      'of the specification: animals, test days, calvings, inseminations, conformation scores, ' +
      'weights, breeding values, arrivals, departures, deaths, pregnancy checks. POST intake ' +
      'on four of them — test days, calvings, inseminations, weights — with repeat submissions ' +
      'recognised by the pair “source plus its record number”, a line-by-line icarBatchResult ' +
      'response and refusals as icarErrorResource. What is served is validated against the ' +
      'real schemas from the adewg/ICAR repository rather than against our own copy of the ' +
      'enumerations. Selection uses the names of the standard itself: meta-modified-from and ' +
      'meta-modified-to by record date, date-from and date-to by event date, the animal-id and ' +
      'animal-scheme pair by animal; parameters that were not understood are named in the ' +
      'response header rather than dropped silently. Animals, conformation scores, breeding ' +
      'values and movements are deliberately closed to writing: registering an animal and the ' +
      'transfer of rights are statements the Association answers for, and they go through an ' +
      'application with verification rather than as a line in an exchange stream; each is ' +
      'answered with 405 and an explanation.',
    gaps: [
      {
        what: 'В обмене одиннадцать ресурсов стандарта, а их около полусотни.',
        why:
          'Оба способа обмена работают целиком, но возят они то, что книга ведёт: ' +
          'животных, доения, отёлы, осеменения, экстерьер, взвешивания, племенную ' +
          'ценность, движение и стельность. Здоровье и лечение, кормление, групповые ' +
          'события, убой, показания приборов — ресурсы стандарта, которых у нас нет ' +
          'в самой книге, и обмен тут ни при чём: возить нечего.',
        need:
          'Ведение соответствующих разделов в книге. Обмен подхватит их без правки ' +
          'протокола: адрес коллекции и набор данных заводятся одной строкой — ' +
          'ровно ради этого стандарт и сделан не зависящим от типа ресурса.',
        whatEn: 'The exchange carries eleven resources of the standard, and there are some fifty.',
        whyEn:
          'Both ways of exchanging work in full, but they carry what the book keeps: animals, ' +
          'test days, calvings, inseminations, conformation, weights, breeding values, ' +
          'movement and pregnancy. Health and treatment, feeding, group events, slaughter, ' +
          'device readings are resources of the standard that we do not have in the book ' +
          'itself, and the exchange has nothing to do with it: there is nothing to carry.',
        needEn:
          'Keeping the corresponding sections in the book. The exchange will pick them up ' +
          'without a change to the protocol: the collection path and the data set are added in ' +
          'one line — which is exactly why the standard was made independent of the resource ' +
          'type.',
      },
    ],
  },
  {
    section: '18',
    title: 'Breed Associations',
    titleEn: 'Breed Associations',
    slug: 'breed-associations',
    wiki: 'Section_18_-_Breed_Associations',
    state: 'partial',
    about:
      'Работа породных ассоциаций и ведение племенных книг: правила записи животного ' +
      'в книгу, разделы книги, требования к происхождению и к членству.',
    ours:
      'Ведение книги, членство хозяйств, выпуск племенных свидетельств, разбор заявок, ' +
      'верификация записей.',
    aboutEn:
      'The work of breed associations and the keeping of herd books: the rules for entering an ' +
      'animal in the book, the sections of the book, and the requirements on descent and on ' +
      'membership.',
    oursEn:
      'Keeping the book, membership of holdings, issuing breeding certificates, handling ' +
      'applications, verification of records.',
    gaps: [
      {
        what: 'Разделов племенной книги нет.',
        why:
          'В международной практике книга делится по степени чистопородности ' +
          '(основная часть, приложения), и от раздела зависит, что животное может ' +
          'получить и по какой цене продаётся. У нас книга одна и плоская.',
        need:
          'Решение Ассоциации о структуре разделов, затем поле раздела у животного ' +
          'и правила попадания в него. Первое важнее второго и не наша работа.',
        whatEn: 'The herd book has no sections.',
        whyEn:
          'In international practice the book is divided by degree of purity of breeding (a ' +
          'main part and appendices), and what an animal can be granted and the price it sells ' +
          'at depend on the section. Our book is single and flat.',
        needEn:
          'A decision by the Association on the structure of the sections, then a section field ' +
          'on the animal and the rules for entering it. The first matters more than the second ' +
          'and is not our work.',
      },
      {
        what: 'Родословная не гарантирует пяти поколений.',
        why:
          'Registration Guidelines WHFF требуют пять поколений с данными продуктивности ' +
          'и флаг не-голштинского предка в них. Мы собираем столько, сколько есть ' +
          'в данных, и не отмечаем, где родословная обрывается или где в неё входит ' +
          'чужая порода.',
        need:
          'Признак полноты родословной у животного, флаг чужой породы в пяти поколениях, ' +
          'коды рецессивов Mulefoot, BLAD, CVM, DUMPS.',
        whatEn: 'The pedigree does not guarantee five generations.',
        whyEn:
          'The WHFF Registration Guidelines require five generations with performance data and ' +
          'a flag for a non-Holstein ancestor among them. We collect as much as the data ' +
          'holds and do not mark where the pedigree breaks off or where another breed enters ' +
          'it.',
        needEn:
          'A pedigree completeness attribute on the animal, a flag for a foreign breed within ' +
          'five generations, and codes for the Mulefoot, BLAD, CVM and DUMPS recessives.',
      },
    ],
  },
  {
    section: '10, 11, 12',
    title: 'Устройства и лаборатории',
    /*
     * Три раздела ICAR в одной строке: сертификация средств идентификации,
     * испытания молокомеров, оценка анализаторов молока. Своего имени
     * у такой сводки у ICAR нет, и брать имя одного из трёх значило бы
     * назвать строку тем, чем она не является. Поэтому имя своё —
     * единственное на этой странице.
     */
    titleEn: 'Devices and Laboratories',
    slug: 'devices',
    wiki: 'Section_11_-_Testing,_Approval_and_Checking_of_Measuring,_Recording_and_Sampling_Devices',
    state: 'out',
    about:
      'Сертификация средств идентификации, испытания молокомеров и пробоотборников, ' +
      'оценка анализаторов молока.',
    ours:
      'Это про железо и лаборатории, а не про учётную систему. Книга принимает результаты ' +
      'таких приборов, но не сертифицирует их и не претендует на это.',
    aboutEn:
      'Certification of identification devices, testing of milk meters and samplers, and the ' +
      'evaluation of milk analysers.',
    oursEn:
      'This is about hardware and laboratories, not about a recording system. The book accepts ' +
      'the results of such devices but does not certify them and makes no claim to.',
    gaps: [],
  },
]

export const ICAR_WIKI = 'https://wiki.icar.org/index.php/'

/** Разделы, у которых есть чего добирать. Порядок — как в списке. */
export const ICAR_WITH_GAPS = ICAR_SECTIONS.filter((s) => s.gaps.length > 0)

export const ICAR_GAP_COUNT = ICAR_SECTIONS.reduce((n, s) => n + s.gaps.length, 0)
