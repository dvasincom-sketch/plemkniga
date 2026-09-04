/**
 * Реестр соответствия: чему книга следует и чем это подтверждается.
 *
 * ## Зачем страница, если есть карта ICAR
 *
 * Карта на `/icar` отвечает на один вопрос — что из двадцати пяти разделов
 * руководств учтено. Вопросов же больше, и задают их разные люди. Эксперт
 * спрашивает про племенное дело, интегратор — про форматы обмена,
 * закупщик — про реестр отечественного ПО и ГОСТы, партнёр из другой
 * страны — про то, на каком языке мы вообще разговариваем.
 *
 * До сих пор ответы на это лежали в четырёх документах и трёх страницах,
 * и собрать их вместе мог только тот, кто и так всё знает. Здесь они
 * в одном месте и в одном виде.
 *
 * ## Главное правило: доказательство, а не заявление
 *
 * У каждой позиции есть `evidence` — ссылка на то, чем соответствие
 * подтверждается: прогон, страница, файл, документ. Позиция без
 * доказательства может быть только в состоянии «план» или «вне области».
 *
 * Это не формальность. Заявление «соответствует» стоит ровно столько,
 * сколько стоит способ его проверить; список из одних утверждений —
 * реклама, и читатель это чувствует раньше, чем успевает не поверить.
 *
 * Что ссылки ведут на существующее, следит `npm run check:compliance`:
 * прогон сверяет имена команд с `package.json`, пути файлов — с диском,
 * адреса страниц — с деревом маршрутов. Ссылка на несуществующий прогон
 * хуже отсутствия соответствия: первое — обман, второе — пробел.
 *
 * ## Почему «закрыто» — отдельное состояние
 *
 * Часть позиций недоступна не потому, что руки не дошли, а потому, что
 * членство в ICAR требует санкционной декларации, а членство в EHRC
 * приостановлено с июля 2022 года. Смешать это с «планом» значило бы
 * пообещать то, что от нас не зависит.
 *
 * ## Почему английские поля обязательные, а не необязательные
 *
 * Витрина открывается на шести языках, и страница соответствия — та,
 * ради которой иностранный читатель приходит: он ищет здесь ответ,
 * на каком языке система разговаривает с чужими системами. Русский
 * абзац посреди английской страницы отвечает на этот вопрос раньше
 * и хуже любого текста.
 *
 * Необязательное английское поле забывают молча: позицию добавили,
 * перевести забыли, и узнаётся об этом от читателя. Поэтому английский
 * стоит рядом с русским в самом типе и требуется наравне с ним —
 * позиция без него не соберётся.
 *
 * ## Где смотреть
 *
 * `src/app/(frontend)/compliance/page.tsx` — страница,
 * `src/scripts/check-compliance.ts` — прогон,
 * `docs/mezhdunarodnye-standarty.md` — разбор, откуда взяты оценки,
 * `docs/mezhdunarodnyy-plan.md` — что и в каком порядке делать дальше.
 */

import { ADE_COLLECTIONS } from '@/lib/ade/core'
import { ADE_WRITABLE } from '@/lib/ade/parse'
import { ICAR_GAP_COUNT, ICAR_WITH_GAPS } from '@/lib/icar-map'

export type ComplianceState = 'done' | 'partial' | 'planned' | 'blocked' | 'out'

export const STATE_LABEL: Record<ComplianceState, string> = {
  done: 'Выполнено',
  partial: 'Частично',
  planned: 'В плане',
  blocked: 'Закрыто извне',
  out: 'Вне области',
}

/**
 * То же по-английски — для витрины.
 *
 * `Record` по состоянию, а не список: новое состояние не соберётся без
 * подписи на обоих языках, и в английской сводке не окажется русского
 * «Частично» рядом с английскими числами.
 */
export const STATE_LABEL_EN: Record<ComplianceState, string> = {
  done: 'Done',
  partial: 'Partial',
  planned: 'Planned',
  blocked: 'Blocked externally',
  out: 'Out of scope',
}

export const STATE_CLASS: Record<ComplianceState, string> = {
  done: 'bg-brand-50 text-forest-600',
  partial: 'bg-amber-50 text-amber-800',
  planned: 'bg-ink-50 text-ink-700',
  blocked: 'bg-[#f6e9e7] text-[#8a2d22]',
  out: 'bg-ink-50 text-ink-500',
}

export const STATE_HINT: Record<ComplianceState, string> = {
  done: 'Сделано и подтверждается прогоном или страницей',
  partial: 'Основное сделано, чего именно не хватает — сказано в строке',
  planned: 'Не начато. Работа известна, срок не назначен',
  blocked: 'Зависит не от нас: членство, санкционная проверка, решение чужого органа',
  out: 'Не наша область: железо, лаборатории, задачи государства',
}

/** То же по-английски; обязательно — см. `STATE_LABEL_EN`. */
export const STATE_HINT_EN: Record<ComplianceState, string> = {
  done: 'Done, and backed by a run or a page',
  partial: 'The main part is done; what exactly is missing is stated in the entry',
  planned: 'Not started. The work is known, no date is set',
  blocked: 'Not up to us: membership, a sanctions check, a decision of another body',
  out: 'Not our area: hardware, laboratories, tasks of the state',
}

/** Порядок состояний в сводке — от сделанного к недоступному. */
export const STATE_ORDER: ComplianceState[] = ['done', 'partial', 'planned', 'blocked', 'out']

export type EvidenceKind = 'check' | 'page' | 'code' | 'doc'

export type Evidence = {
  kind: EvidenceKind
  /**
   * Для `check` — имя команды из `package.json` без `npm run`.
   * Для `page` — адрес внутри системы. Для `code` и `doc` — путь от корня.
   */
  value: string
}

export type ComplianceArea =
  | 'identification'
  | 'exchange'
  | 'breeding'
  | 'intergov'
  | 'software'
  | 'russia'

export const AREA_TITLE: Record<ComplianceArea, string> = {
  identification: 'Идентификация животных',
  exchange: 'Обмен данными',
  breeding: 'Племенное дело и оценка',
  intergov: 'Межправительственные своды',
  software: 'Качество и доступность программы',
  russia: 'Российский обязательный контур',
}

/** То же по-английски; обязательно — см. `STATE_LABEL_EN`. */
export const AREA_TITLE_EN: Record<ComplianceArea, string> = {
  identification: 'Animal identification',
  exchange: 'Data exchange',
  breeding: 'Herd book keeping and evaluation',
  intergov: 'Intergovernmental codes',
  software: 'Software quality and accessibility',
  russia: 'Mandatory Russian requirements',
}

export const AREA_HINT: Record<ComplianceArea, string> = {
  identification: 'Как животное называется здесь и как его найдут снаружи',
  exchange: 'На каком языке книга разговаривает с чужими системами',
  breeding: 'Правила, по которым ведут книгу и считают племенную ценность',
  intergov: 'Требования ООН и межправительственных организаций',
  software: 'Свойства самой программы, а не данных в ней',
  russia: 'То, что обязательно по закону и без чего нельзя продавать',
}

/** То же по-английски; обязательно — см. `STATE_LABEL_EN`. */
export const AREA_HINT_EN: Record<ComplianceArea, string> = {
  identification: 'What the animal is called here and how it is found from outside',
  exchange: 'The language the book speaks to other systems in',
  breeding: 'The rules for keeping the book and computing breeding values',
  intergov: 'Requirements of the UN and of intergovernmental organisations',
  software: 'Properties of the program itself, not of the data in it',
  russia: 'What the law requires and what cannot be sold without',
}

export const AREA_ORDER: ComplianceArea[] = [
  'identification',
  'exchange',
  'breeding',
  'intergov',
  'software',
  'russia',
]

/**
 * «Что дальше» и его английский — либо оба, либо ни одного.
 *
 * Само поле необязательное: у выполненного и у чужой области следующего
 * шага нет. Но там, где оно есть, оно и есть самое ценное на странице —
 * именно в нём сказано, чего не хватает. Сделать английский просто
 * необязательным нельзя: забытое необязательное поле сборку не ломает,
 * и пробел, ради которого страница затевалась, оказался бы на английской
 * витрине по-русски.
 */
type NextPair = { next: string; nextEn: string } | { next?: undefined; nextEn?: undefined }

/**
 * Кто, кроме нас, должен действовать, чтобы позицию закрыть.
 *
 * ## Зачем это отдельным полем
 *
 * Состояние отвечает «как сейчас», но не отвечает на вопрос, который
 * задают первым: «а можно закрыть всё?». Разница между «не написано»
 * и «написать нельзя» здесь важнее самого состояния — первое зависит
 * от нас, второе не зависит вовсе.
 *
 * Без этого поля список читается как перечень недоделок, и владелец
 * системы разумно требует их доделать. Пять позиций доделать нельзя
 * ни за какие деньги на разработку: они упираются в членство,
 * в аккредитованного аудитора или в решение самой Ассоциации.
 *
 * Отсутствие поля означает «зависит только от нас» — и это утверждение,
 * а не умолчание: если позицию нельзя закрыть своими силами, здесь
 * обязана стоять строка. Английская — наравне с русской, по той же
 * причине, что и у `NextPair`.
 */
type ExternalPair =
  | { external: string; externalEn: string }
  | { external?: undefined; externalEn?: undefined }

export type ComplianceItem = {
  key: string
  title: string
  /** Название требования по-английски; обязательно — см. заголовок файла. */
  titleEn: string
  /** Кто держит стандарт: ICAR, WHFF, ISO, Минцифры. */
  org: string
  /**
   * Тот же держатель по-английски.
   *
   * Международные организации названы так, как называют себя сами,
   * а российские ведомства — по-английски и с пояснением, а не выдуманным
   * переводом названия: специалист ищет по этим именам, и второе имя
   * одному ведомству ему только мешает.
   */
  orgEn: string
  area: ComplianceArea
  state: ComplianceState
  /** Чего требует — коротко, своими словами. */
  what: string
  /** То же по-английски; обязательно. */
  whatEn: string
  /** Что сделано у нас. Для «в плане» — честное «ничего». */
  ours: string
  /** То же по-английски; обязательно, и «ничего» остаётся «ничего». */
  oursEn: string
  evidence: Evidence[]
  source?: { label: string; labelEn: string; href: string }
} & NextPair &
  ExternalPair

export const COMPLIANCE: ComplianceItem[] = [
  /* ------------------------- Идентификация ------------------------- */
  {
    key: 'aiid',
    title: 'Международный номер животного',
    titleEn: 'International animal identification number',
    org: 'ICAR / Interbull',
    orgEn: 'ICAR / Interbull',
    area: 'identification',
    state: 'partial',
    what:
      'Номер вида NLDM000574590532: страна по ISO 3166-1, пол, двенадцать цифр ' +
      'национального номера. С кодом породы впереди — девятнадцать символов.',
    whatEn:
      'An identifier of the form NLDM000574590532: country per ISO 3166-1, sex, twelve ' +
      'digits of the national number. With the breed code in front, nineteen characters.',
    ours:
      'Сборка и разбор в обеих формах записи страны, справочник тридцати двух стран, ' +
      'страна и номер в стране происхождения у животного. Импортное животное считается ' +
      'от страны происхождения, а не от нашей. Номер не выдумывается: нет данных — нет номера.',
    oursEn:
      'Assembly and parsing in both country notations, a reference list of thirty-two ' +
      'countries, the country and the number in the country of origin held on the animal. ' +
      'An imported animal counts from its country of origin, not from ours. The number is ' +
      'never invented: no data, no number.',
    evidence: [
      { kind: 'check', value: 'check:aiid' },
      { kind: 'check', value: 'check:breed-codes' },
      { kind: 'code', value: 'src/lib/aiid.ts' },
    ],
    next:
      'Поле кода породы в справочнике есть и связано с обменом; заполнено ли оно — ' +
      'показывает прогон check:breed-codes, и вписывает код человек, знающий породы. ' +
      'Отдельно нужно правило проверки «номер не сходится с частями»: расхождение ' +
      'между записанным номером и собранным из частей сейчас никто не заметит.',
    nextEn:
      'The breed code field exists in the reference list and is wired into the exchange; ' +
      'whether it is filled in is shown by the check:breed-codes run, and the code is put ' +
      'in by a person who knows the breeds. Separately, a validation rule for “the number ' +
      'does not match its parts” is needed: a discrepancy between the stored number and the ' +
      'one assembled from the parts would go unnoticed today.',
    source: {
      label: 'Коды пород ICAR',
      labelEn: 'ICAR breed codes',
      href: 'https://interbull.org/ib/icarbreedcodes',
    },
  },
  {
    key: 'iso11785',
    title: 'ISO 11784 / 11785 — радиочастотная метка',
    titleEn: 'ISO 11784 / 11785 — radio frequency identification',
    org: 'ISO',
    orgEn: 'ISO',
    area: 'identification',
    state: 'partial',
    what:
      'Пятнадцатизначное десятичное представление кода метки; первые три цифры — ' +
      'код страны по ISO 3166-1 либо код изготовителя.',
    whatEn:
      'The fifteen-digit decimal representation of the transponder code; the first three ' +
      'digits are the ISO 3166-1 country code or the manufacturer code.',
    ours:
      'Проверка формы: длина, цифры, правдоподобие первых трёх. Код изготовителя ' +
      'от 900 и выше опознаётся отдельно и не выдаётся за страну. В обмен метка ' +
      'уезжает только пройдя проверку.',
    oursEn:
      'A check of the form: length, digits, plausibility of the first three. A manufacturer ' +
      'code of 900 and above is recognised separately and not passed off as a country. ' +
      'A tag leaves for exchange only once it has passed the check.',
    evidence: [
      { kind: 'check', value: 'check:aiid' },
      { kind: 'code', value: 'src/lib/aiid.ts' },
    ],
    next:
      'Тексты стандартов не куплены — проверка написана по вторичным источникам. ' +
      'Порядка 100–150 CHF, единственные расходы всего международного плана.',
    nextEn:
      'The texts of the standards have not been bought — the check is written from ' +
      'secondary sources. Around 100–150 CHF, the only expense in the whole international plan.',
  },

  /* --------------------------- Обмен ------------------------------- */
  {
    key: 'fgias',
    title: 'ФГИАС ПР — государственный реестр',
    titleEn: 'FGIAS, the Russian state livestock register',
    org: 'Минсельхоз России',
    orgEn: 'Ministry of Agriculture of Russia',
    area: 'exchange',
    state: 'done',
    what:
      'Обязательная с 1 марта 2026 года передача сведений о племенных животных ' +
      'по формам реестра, с обратной загрузкой присвоенных идентификаторов.',
    whatEn:
      'From 1 March 2026, submitting information about breeding animals on the forms of the ' +
      'register is mandatory, with the assigned identifiers loaded back.',
    ours:
      'Все двадцать шаблонов реестра: выгрузка и обратная загрузка. Заголовки сверены ' +
      'построчно с настоящими файлами реестра. У каждого выгружаемого поля есть дорога ' +
      'ввода — руками или загрузкой.',
    oursEn:
      'All twenty templates of the register: export and reverse import. The headers are ' +
      'matched line by line against the real files of the register. Every exported field has ' +
      'a way in — by hand or by upload.',
    evidence: [
      { kind: 'check', value: 'check:fgias-export' },
      { kind: 'check', value: 'check:fgias-readiness' },
      { kind: 'page', value: '/evolution?tab=fgias' },
      { kind: 'doc', value: 'docs/fgias-karta.md' },
    ],
  },
  {
    key: 'ade',
    title: 'ICAR Animal Data Exchange 1.5',
    titleEn: 'ICAR ADE (Animal Data Exchange) 1.5',
    org: 'ICAR',
    orgEn: 'ICAR',
    area: 'exchange',
    state: 'partial',
    what:
      'Открытая спецификация обмена данными о животных: JSON-схемы, REST, общие ' +
      'словари. Лицензия Apache 2.0, формальной сертификации не существует.',
    whatEn:
      'An open specification for exchanging animal data: JSON schemas, REST, shared ' +
      'vocabularies. Apache 2.0 licence; no formal certification exists.',
    ours:
      `${ADE_COLLECTIONS.length} коллекций на отдачу по адресам спецификации: животные, ` +
      'контрольные доения, отёлы, осеменения, оценки экстерьера, взвешивания, ' +
      'племенная ценность, поступление, выбытие, падёж, проверка стельности. ' +
      `Приём POST по ${ADE_WRITABLE.length} из них с распознаванием повторной отправки ` +
      'по паре «источник + его номер записи» — иначе оборванная сеть удваивала бы ' +
      'запись. Отказы в виде icarErrorResource, пакет отвечает icarBatchResult ' +
      'построчно. Отдаваемое сверяется с настоящими JSON-схемами репозитория ' +
      'adewg/ICAR, а не с нашей копией перечислений. Описание обмена — в общем ' +
      'описании интерфейса, разделом «Обмен».',
    oursEn:
      `${ADE_COLLECTIONS.length} collections served at the addresses of the specification: ` +
      'animals, test-day milk recordings, calvings, inseminations, conformation scores, ' +
      'weights, breeding values, arrivals, departures, deaths, pregnancy checks. POST is ' +
      `accepted on ${ADE_WRITABLE.length} of them, with a repeated submission recognised by ` +
      'the pair “source + its record id” — otherwise a dropped connection would duplicate ' +
      'the record. Rejections come back as icarErrorResource; a batch answers with ' +
      'icarBatchResult line by line. What is served is validated against the real JSON ' +
      'schemas of the adewg/ICAR repository, not against our own copy of the enumerations. ' +
      'The exchange is documented in the general interface description, in the “Exchange” ' +
      'section.',
    evidence: [
      { kind: 'check', value: 'check:ade' },
      { kind: 'check', value: 'check:ade-accept' },
      { kind: 'check', value: 'check:ade-schema' },
      { kind: 'check', value: 'check:ade-generic' },
      { kind: 'check', value: 'check:ade-live' },
      { kind: 'page', value: '/ade' },
      { kind: 'page', value: '/api-docs' },
      { kind: 'doc', value: 'docs/ade-spec.md' },
    ],
    next:
      'Оба способа обмена стандарта работают: выборка по локациям и обмен наборами ' +
      'с лентой изменений, непрозрачной меткой продолжения и опознанием удалённого. ' +
      'Возится при этом одиннадцать ресурсов из полусотни — ровно то, что книга ' +
      'ведёт; здоровья, кормления и групповых событий в ней самой пока нет. ' +
      'Животные, оценка экстерьера, племенная ценность и перемещения на запись ' +
      'закрыты намеренно, а не по недоделке: запись животного и переход прав — ' +
      'утверждения, за которые Ассоциация отвечает перед заводчиком, и они идут ' +
      'заявкой с проверкой; каждой отвечается 405 с объяснением словами.',
    nextEn:
      'Both exchange styles of the standard work: selection by location, and set-based ' +
      'exchange with a change feed, an opaque continuation token and recognition of deleted ' +
      'records. Eleven resources out of some fifty are carried — exactly what the book ' +
      'keeps; health, feeding and group events are not in the book itself yet. Animals, ' +
      'conformation scoring, breeding values and movements are closed for writing ' +
      'deliberately, not by omission: registering an animal and transferring rights are ' +
      'statements the Association answers for before the breeder, and they go through an ' +
      'application with review; each of them is answered with 405 and an explanation in words.',
    source: {
      label: 'adewg/ICAR на GitHub',
      labelEn: 'adewg/ICAR on GitHub',
      href: 'https://github.com/adewg/ICAR',
    },
  },
  {
    key: 'own-api',
    title: 'Собственный REST-интерфейс',
    titleEn: 'Our own REST interface',
    org: 'OpenAPI',
    orgEn: 'OpenAPI',
    area: 'exchange',
    state: 'done',
    what: 'Описание интерфейса машиночитаемой спецификацией, а не только текстом.',
    whatEn: 'The interface described by a machine-readable specification, not by prose alone.',
    ours:
      'OpenAPI-описание, страница документации и прогон, сверяющий описание с кодом. ' +
      'Отдельным разделом описан и обмен по ICAR ADE: интегратор, открывший ' +
      'документацию, узнаёт про стандартный интерфейс, не изучая наш собственный.',
    oursEn:
      'An OpenAPI description, a documentation page and a run that checks the description ' +
      'against the code. The ICAR ADE exchange is described there as a section of its own: ' +
      'an integrator who opens the documentation learns about the standard interface without ' +
      'studying ours.',
    evidence: [
      { kind: 'check', value: 'check:openapi' },
      { kind: 'check', value: 'check:api-docs' },
      { kind: 'page', value: '/api-docs' },
    ],
  },
  {
    key: 'uncefact',
    title: 'UN/CEFACT: Animal Traceability и Cattle Registration BRS',
    titleEn: 'UN/CEFACT: Animal Traceability and Cattle Registration BRS',
    org: 'ООН',
    orgEn: 'United Nations',
    area: 'exchange',
    state: 'planned',
    what: 'Согласование модели обмена с бизнес-спецификациями ООН по прослеживаемости скота.',
    whatEn:
      'Aligning the exchange model with the UN business requirements specifications for ' +
      'livestock traceability.',
    ours: 'Ничего.',
    oursEn: 'Nothing.',
    evidence: [],
    next:
      'Начинать надо не с работы, а с поиска самих документов: в разборе открытых ' +
      'источников тексты BRS найти не удалось.',
    nextEn:
      'This starts not with the work but with finding the documents themselves: the BRS texts ' +
      'could not be located in the review of open sources.',
  },

  /* ------------------------ Племенное дело ------------------------- */
  {
    key: 'icar-guidelines',
    title: 'ICAR Guidelines — двадцать пять разделов',
    titleEn: 'ICAR Guidelines — twenty-five sections',
    org: 'ICAR',
    orgEn: 'ICAR',
    area: 'breeding',
    state: 'partial',
    what:
      'Правила учёта продуктивности, подтверждения происхождения, оценки экстерьера ' +
      'и генетической оценки, по которым ведут учёт службы пяти континентов.',
    whatEn:
      'The rules for recording production, verifying parentage, scoring conformation and ' +
      'computing genetic evaluations that recording organisations on five continents work by.',
    ours:
      'Разобрано по разделам: что требует каждый и как это сделано. Полностью учтённых ' +
      'разделов нет ни одного, и это состояние, а не осторожность формулировок.',
    oursEn:
      'Analysed section by section: what each one requires and how it is done. Not a single ' +
      'section is covered in full, and that is the state of things, not caution in wording.',
    evidence: [
      { kind: 'page', value: '/icar' },
      { kind: 'page', value: '/icar/gaps' },
      { kind: 'doc', value: 'docs/icar.md' },
    ],
    /*
     * Число берётся из самого разбора, а не пишется словом.
     *
     * Было написано «пятнадцать», а пробелов уже девятнадцать: разбор
     * пополняли, а фразу рядом — нет. Это ровно тот вид неправды,
     * от которого страница соответствия и заводилась: сама она честно
     * перечисляет всё, а подпись к ней занижает счёт, и читающий верит
     * подписи, потому что она короче.
     */
    next:
      `Пробелов ${ICAR_GAP_COUNT} по ${ICAR_WITH_GAPS.length} разделам — ` +
      'все выписаны на отдельной странице.',
    /* Английскому нужна одна развилка вместо трёх русских: `plural` тут не годится. */
    nextEn:
      `${ICAR_GAP_COUNT} ${ICAR_GAP_COUNT === 1 ? 'gap' : 'gaps'} across ` +
      `${ICAR_WITH_GAPS.length} ${ICAR_WITH_GAPS.length === 1 ? 'section' : 'sections'} — ` +
      'all of them written out on a separate page.',
    source: {
      label: 'wiki.icar.org',
      labelEn: 'wiki.icar.org',
      href: 'https://wiki.icar.org/index.php/Guidelines',
    },
  },
  {
    key: 'isag',
    title: 'Панели и номенклатура ISAG',
    titleEn: 'ISAG panels and nomenclature',
    org: 'ISAG',
    orgEn: 'ISAG',
    area: 'breeding',
    state: 'partial',
    what:
      'Двенадцать обязательных микросателлитных локусов, не менее двухсот SNP ' +
      'из набора ISAG, формат записи TOP/AB, расчёт вероятностей исключения.',
    whatEn:
      'Twelve mandatory microsatellite loci, at least two hundred SNPs from the ISAG set, ' +
      'the TOP/AB notation, computation of exclusion probabilities.',
    ours: 'Двенадцать обязательных локусов STR, методы подтверждения и вердикты.',
    oursEn: 'The twelve mandatory STR loci, the verification methods and the verdicts.',
    evidence: [{ kind: 'code', value: 'src/lib/isag.ts' }],
    next:
      'SNP-панели нет, формата TOP/AB нет, вероятности исключения не считаются. ' +
      'Хранится результат теста, а не генотип: перепроверить его самим нельзя ' +
      'и передать другой лаборатории тоже.',
    nextEn:
      'There is no SNP panel, no TOP/AB notation, and exclusion probabilities are not ' +
      'computed. What is stored is the result of the test, not the genotype: we cannot ' +
      're-check it ourselves, and cannot hand it to another laboratory either.',
  },
  {
    key: 'whff',
    title: 'WHFF Registration Guidelines',
    titleEn: 'WHFF Registration Guidelines',
    org: 'World Holstein Friesian Federation',
    orgEn: 'World Holstein Friesian Federation',
    area: 'breeding',
    state: 'planned',
    what:
      'Правила регистрации: пять поколений родословной с данными продуктивности, ' +
      'флаг не-голштинского предка, коды рецессивов Mulefoot, BLAD, CVM, DUMPS, ' +
      'коды мастей, документация по эмбрионам.',
    whatEn:
      'Registration rules: five generations of pedigree with production data, a flag for a ' +
      'non-Holstein ancestor, the recessive codes Mulefoot, BLAD, CVM and DUMPS, colour ' +
      'codes, embryo documentation.',
    ours: 'Ничего из перечисленного.',
    oursEn: 'None of the above.',
    evidence: [{ kind: 'page', value: '/icar/gaps' }],
    next:
      'Самая объёмная предметная работа плана и самая полезная: это то, чем племенная ' +
      'книга отличается от базы данных о коровах.',
    nextEn:
      'The largest piece of subject-matter work in the plan, and the most useful: this is ' +
      'what makes a herd book different from a database of cows.',
  },
  {
    key: 'interbull',
    title: 'Методология Interbull',
    titleEn: 'Interbull methodology',
    org: 'Interbull Centre',
    orgEn: 'Interbull Centre',
    area: 'breeding',
    state: 'planned',
    what:
      'Структура файлов 200/300/301, расчёт эффективного числа дочерей, валидационные ' +
      'тесты генетического тренда методами I–III.',
    whatEn:
      'The structure of the 200/300/301 files, computation of effective daughter ' +
      'contributions, validation tests of the genetic trend by methods I–III.',
    ours: 'Ничего.',
    oursEn: 'Nothing.',
    evidence: [],
    next:
      'Валидация тренда нужна независимо от участия в международной оценке: без неё ' +
      'медленный сдвиг базы выглядит как генетический прогресс, и заметить подмену нельзя.',
    nextEn:
      'Trend validation is needed regardless of taking part in international evaluation: ' +
      'without it a slow drift of the base looks like genetic progress, and the substitution ' +
      'cannot be spotted.',
  },
  {
    key: 'interbull-mace',
    external: 'ICAR и Interbull: членство и валидированная национальная оценка',
    externalEn: 'ICAR and Interbull: membership and a validated national evaluation',
    title: 'Участие в международной оценке MACE',
    titleEn: 'Taking part in the MACE international evaluation',
    org: 'Interbull Centre',
    orgEn: 'Interbull Centre',
    area: 'breeding',
    state: 'blocked',
    what: 'Приведение национальных оценок разных стран к общей шкале.',
    whatEn: 'Bringing the national evaluations of different countries onto a common scale.',
    ours:
      'Индекс книги — собственный расчёт по заимствованной базе сравнения, ' +
      'и подпись об этом говорит прямо.',
    oursEn:
      'The index of the book is our own computation on a borrowed comparison base, and the ' +
      'caption beside it says so directly.',
    evidence: [{ kind: 'page', value: '/account/indices' }],
    next:
      'Требует членства в ICAR и валидированной национальной оценки в единой страновой ' +
      'базе. Анкета членства содержит декларацию о соответствии правилам OFAC и FATF, ' +
      'и ICAR проверяет её до принятия.',
    nextEn:
      'Requires ICAR membership and a validated national evaluation in a single countrywide ' +
      'base. The membership form contains a declaration of compliance with OFAC and FATF ' +
      'rules, and ICAR checks it before admission.',
  },
  {
    key: 'icar-quality',
    external: 'ICAR: сертификация доступна только членам',
    externalEn: 'ICAR: certification is open to members only',
    title: 'ICAR Certificate of Quality',
    titleEn: 'ICAR Certificate of Quality',
    org: 'ICAR',
    orgEn: 'ICAR',
    area: 'breeding',
    state: 'blocked',
    what:
      'Единственная в мире отраслевая сертификация ведения племенной книги ' +
      'и обработки данных, с выездным аудитом.',
    whatEn:
      'The only industry certification of herd book keeping and data processing in the world, ' +
      'with an on-site audit.',
    ours: 'Нет и быть не может без членства.',
    oursEn: 'We do not have it, and cannot have it without membership.',
    evidence: [{ kind: 'doc', value: 'docs/icar.md' }],
    next: 'Доступна только членам ICAR. Разбор — в документе о марке и членстве.',
    nextEn:
      'Open to ICAR members only. The analysis is in the document on the mark and membership.',
  },
  {
    key: 'ehrc',
    external: 'EHRC и WHFF: приостановка снимается решением этих организаций',
    externalEn: 'EHRC and WHFF: the suspension is lifted by a decision of those organisations',
    title: 'Членство в EHRC и WHFF',
    titleEn: 'Membership of EHRC and WHFF',
    org: 'European Holstein and Red Holstein Confederation',
    orgEn: 'European Holstein and Red Holstein Confederation',
    area: 'breeding',
    state: 'blocked',
    what: 'Взаимное признание регистрации голштинского скота в Европе.',
    whatEn: 'Mutual recognition of Holstein cattle registration in Europe.',
    ours:
      'Российская голштинская ассоциация была членом EHRC и приостановлена ' +
      'решением от 12 июля 2022 года. Публичного сообщения о снятии приостановки ' +
      'за 2023–2026 годы не найдено.',
    oursEn:
      'The Russian Holstein association was a member of EHRC and was suspended by a decision ' +
      'of 12 July 2022. No public announcement of that suspension being lifted has been found ' +
      'for 2023–2026.',
    evidence: [{ kind: 'doc', value: 'docs/mezhdunarodnye-standarty.md' }],
    next:
      'Первый шаг стоит ноль рублей: письмо генеральному секретарю с вопросом ' +
      'о текущем статусе. Без ответа на него обсуждать международное признание бессмысленно.',
    nextEn:
      'The first step costs nothing: a letter to the secretary general asking about the ' +
      'current status. Until it is answered, discussing international recognition is pointless.',
  },

  /* --------------------- Межправительственные ---------------------- */
  {
    key: 'woah',
    title: 'Кодекс здоровья наземных животных, главы 4.2 и 4.3',
    titleEn: 'Terrestrial Animal Health Code, chapters 4.2 and 4.3',
    org: 'WOAH',
    orgEn: 'WOAH',
    area: 'intergov',
    state: 'planned',
    what:
      'Требования к прослеживаемости: предотвращение дублирования идентификаторов, ' +
      'перечень событий, связывание идентификаторов при импорте и экспорте, ' +
      'резервное копирование, конфиденциальность.',
    whatEn:
      'Traceability requirements: preventing duplicate identifiers, the list of events, ' +
      'linking identifiers on import and export, backup copies, confidentiality.',
    ours:
      'Часть требований выполняется по факту — журнал изменений, права доступа, ' +
      'события с датами, — но сопоставления с текстом кодекса не делалось.',
    oursEn:
      'Part of the requirements is met in fact — the change log, access rights, events with ' +
      'dates — but no mapping against the text of the code has been made.',
    evidence: [],
    next:
      'Работа преимущественно документальная: таблица «требование → реализация». ' +
      'Настоящей работы два пункта — проверки на дубли идентификаторов и связывание ' +
      'номеров при импорте.',
    nextEn:
      'The work is mostly documentary: a table of “requirement → implementation”. There are ' +
      'two items of real work — checks for duplicate identifiers, and the linking of numbers ' +
      'on import.',
  },
  {
    key: 'fao19',
    title: 'FAO Guidelines No. 19 и No. 3',
    titleEn: 'FAO Guidelines No. 19 and No. 3',
    org: 'ФАО ООН',
    orgEn: 'FAO of the United Nations',
    area: 'intergov',
    state: 'planned',
    what:
      'Интегрированные многоцелевые системы учёта животных и стратегии разведения — ' +
      'как архитектурный ориентир.',
    whatEn:
      'Integrated multi-purpose animal recording systems and breeding strategies — as an ' +
      'architectural reference.',
    ours: 'Ничего.',
    oursEn: 'Nothing.',
    evidence: [],
    next: 'Документ, а не код. День работы.',
    nextEn: 'A document, not code. A day of work.',
  },
  {
    key: 'dadis',
    external: 'государство: отчётность в DAD-IS ведёт страна, а не разработчик',
    externalEn: 'the state: reporting to DAD-IS is done by the country, not by the developer',
    title: 'Глобальный план действий и DAD-IS',
    titleEn: 'The Global Plan of Action and DAD-IS',
    org: 'ФАО ООН',
    orgEn: 'FAO of the United Nations',
    area: 'intergov',
    state: 'out',
    what: 'Национальная отчётность по генетическим ресурсам животных.',
    whatEn: 'National reporting on animal genetic resources.',
    ours:
      'Не наша область: отчитывается государство, а не разработчик системы. ' +
      'Россия эту отчётность не ведёт и DAD-IS не наполняет.',
    oursEn:
      'Not our area: it is the state that reports, not the developer of the system. Russia ' +
      'does not keep this reporting and does not populate DAD-IS.',
    evidence: [],
  },

  /* ------------------------ Качество программы --------------------- */
  {
    key: 'wcag',
    title: 'WCAG 2.2 уровень AA',
    titleEn: 'WCAG 2.2 level AA',
    org: 'W3C / ISO 40500 / ГОСТ Р 52872',
    /* Российский стандарт назван номером и пояснением, а не переводом названия. */
    orgEn: 'W3C / ISO 40500 / GOST R 52872 (the Russian accessibility standard)',
    area: 'software',
    state: 'partial',
    what: 'Доступность интерфейса для людей с ограничениями зрения, слуха и моторики.',
    whatEn:
      'Accessibility of the interface for people with limited sight, hearing and motor control.',
    ours:
      'Частности: язык размечен на страницах и на кнопках переключателя, у знака ' +
      'и навигаций есть подписи, ссылки различимы не только цветом. Системного ' +
      'прогона по критериям не делалось.',
    oursEn:
      'Particulars: the language is marked up on the pages and on the switcher buttons, the ' +
      'logo and the navigations have labels, links are distinguishable by more than colour. ' +
      'No systematic run against the criteria has been made.',
    evidence: [{ kind: 'check', value: 'check:links' }],
    next:
      'Прогон по критериям, заявление о доступности с честным перечислением ' +
      'ограничений — большие таблицы и графические родословные заведомо проблемные, — ' +
      'и автоматическая проверка того, что поддаётся автоматизации.',
    nextEn:
      'A run against the criteria, an accessibility statement with an honest list of the ' +
      'limitations — large tables and graphical pedigrees are problematic by nature — and ' +
      'automatic checking of whatever can be automated.',
  },
  {
    key: 'iso25010',
    title: 'ISO/IEC 25010:2023 и 25040',
    titleEn: 'ISO/IEC 25010:2023 and 25040',
    org: 'ISO/IEC',
    orgEn: 'ISO/IEC',
    area: 'software',
    state: 'planned',
    what: 'Модель качества программного обеспечения как язык технического задания и приёмки.',
    whatEn:
      'The software quality model as the language of technical specifications and acceptance.',
    ours:
      'Реестр прогонов ложится на модель почти целиком, но сопоставления ' +
      'не написано. Сертификации по 25010 по существу не существует.',
    oursEn:
      'The register of runs maps onto the model almost entirely, but the mapping has not been ' +
      'written down. Certification against 25010 essentially does not exist.',
    evidence: [{ kind: 'page', value: '/evolution?tab=status' }],
    next: 'Документ, сопоставляющий восемь характеристик качества с тем, что у нас есть.',
    nextEn: 'A document mapping the eight quality characteristics onto what we have.',
  },
  {
    key: 'open-data',
    external: 'решение Ассоциации о том, какие справочники открывать',
    externalEn: 'a decision of the Association on which reference lists to open',
    title: 'Открытые справочники под CC0 1.0',
    titleEn: 'Open reference data under CC0 1.0',
    org: 'Creative Commons',
    orgEn: 'Creative Commons',
    area: 'software',
    state: 'planned',
    what:
      'Справочники, коды и схемы обмена под CC0 1.0; агрегированная статистика ' +
      'и метаданные каталога под CC BY 4.0. Архитектура по принципам FAIR.',
    whatEn:
      'Reference lists, codes and exchange schemas under CC0 1.0; aggregated statistics and ' +
      'catalogue metadata under CC BY 4.0. Architecture following the FAIR principles.',
    ours: 'Ничего.',
    oursEn: 'Nothing.',
    evidence: [],
    next:
      'Страница открытых данных со справочниками в JSON и CSV, файл лицензии рядом ' +
      'с каждым, отметка о лицензии в ответе интерфейса. Зависит от решения Ассоциации ' +
      'о том, что открывать.',
    nextEn:
      'An open data page with the reference lists in JSON and CSV, a licence file beside each ' +
      'of them, and a licence note in the interface response. It depends on the decision of ' +
      'the Association on what to open.',
  },
  {
    key: 'iso27001',
    external: 'аккредитованный аудитор: сертификацию выдаёт орган по сертификации, а не разработчик',
    externalEn:
      'an accredited auditor: certification is issued by a certification body, not by the ' +
      'developer',
    title: 'ISO/IEC 27001 — управление информационной безопасностью',
    titleEn: 'ISO/IEC 27001 — information security management',
    org: 'ISO/IEC',
    orgEn: 'ISO/IEC',
    area: 'software',
    state: 'planned',
    what: 'Система менеджмента информационной безопасности с внешним аудитом.',
    whatEn: 'An information security management system with an external audit.',
    ours: 'Ничего формального.',
    oursEn: 'Nothing formal.',
    evidence: [],
    next:
      'Внедрение по ГОСТ Р ИСО/МЭК 27001-2021 с аудитом российской компанией. ' +
      'Международно признанная сертификация напрямую недоступна: Росаккредитация ' +
      'не подписант соглашения о взаимном признании в области систем менеджмента.',
    nextEn:
      'Implementation under GOST R ISO/IEC 27001-2021, the Russian adoption of the standard, ' +
      'with an audit by a Russian company. Internationally recognised certification is not ' +
      'available directly: Rosaccreditation, the Russian national accreditation service, is ' +
      'not a signatory to the mutual recognition arrangement for management systems.',
  },

  /* -------------------- Российский обязательный контур ------------- */
  {
    key: 'reestr-po',
    external: 'Минцифры: включение в реестр — решение ведомства по заявке правообладателя',
    externalEn:
      'the Ministry of Digital Development: inclusion in the register is a decision of the ' +
      'ministry on the application of the rights holder',
    title: 'Реестр отечественного ПО, класс 12.03',
    titleEn: 'The Russian register of domestic software, class 12.03',
    org: 'Минцифры России',
    orgEn: 'Ministry of Digital Development of Russia',
    area: 'russia',
    state: 'planned',
    what:
      'Включение в реестр по классу «Программное обеспечение для решения отраслевых ' +
      'задач в области сельского хозяйства». Даёт доступ к госзакупкам и освобождение ' +
      'от НДС.',
    whatEn:
      'Inclusion in the register under the class “software for sector-specific tasks in ' +
      'agriculture”. It opens access to state procurement and exempts the product from VAT.',
    ours: 'Заявка не подавалась.',
    oursEn: 'No application has been filed.',
    evidence: [{ kind: 'doc', value: 'docs/produkt-dlya-otrasli.md' }],
    next:
      'Готовиться заранее с учётом правила двух операционных систем: для отраслевого ' +
      'прикладного ПО оно применяется с 1 июня 2027 года.',
    nextEn:
      'Preparation has to start early because of the two-operating-systems rule: for ' +
      'sector-specific application software it applies from 1 June 2027.',
  },
  {
    key: 'gost-rbpo',
    external: 'орган по оценке соответствия: практики можно выполнять, соответствие — только подтвердить извне',
    externalEn:
      'a conformity assessment body: the practices can be followed, but conformity can only ' +
      'be confirmed from outside',
    title: 'ГОСТ Р 56939-2024 — разработка безопасного ПО',
    titleEn: 'GOST R 56939-2024 — the Russian standard for secure software development',
    org: 'Росстандарт / ФСТЭК',
    orgEn: 'Rosstandart / FSTEC of Russia',
    area: 'russia',
    state: 'planned',
    what: 'Требования к процессу разработки: анализ кода, управление уязвимостями, испытания.',
    whatEn:
      'Requirements for the development process: code analysis, vulnerability management, ' +
      'testing.',
    ours: 'Часть практик выполняется по факту, оценки соответствия не проводилось.',
    oursEn:
      'Part of the practices is followed in fact; no conformity assessment has been carried out.',
    evidence: [{ kind: 'page', value: '/evolution?tab=status' }],
    next: 'Это язык ФСТЭК и Минцифры и фундамент статуса доверенного ПО.',
    nextEn:
      'This is the language of FSTEC and of the Ministry of Digital Development, and the ' +
      'foundation of trusted software status.',
  },
  {
    key: 'devices',
    external: 'органы по сертификации приборов и аккредитации лабораторий',
    externalEn: 'certification bodies for devices and accreditation bodies for laboratories',
    title: 'Сертификация приборов и лабораторий',
    titleEn: 'Certification of devices and laboratories',
    org: 'ICAR',
    orgEn: 'ICAR',
    area: 'russia',
    state: 'out',
    what:
      'Испытания молокомеров и пробоотборников, сертификация средств идентификации, ' +
      'аккредитация лабораторий анализа молока и ДНК.',
    whatEn:
      'Testing of milk meters and samplers, certification of identification devices, ' +
      'accreditation of milk and DNA analysis laboratories.',
    ours:
      'Не наша область. Книга принимает результаты таких приборов и лабораторий, ' +
      'но не сертифицирует их и не претендует.',
    oursEn:
      'Not our area. The book accepts the results of such devices and laboratories, but does ' +
      'not certify them and makes no claim to.',
    evidence: [],
  },
]

export const byArea = (area: ComplianceArea) => COMPLIANCE.filter((i) => i.area === area)

export const countByState = (): Record<ComplianceState, number> => {
  const out = { done: 0, partial: 0, planned: 0, blocked: 0, out: 0 }
  for (const i of COMPLIANCE) out[i.state]++
  return out
}

/**
 * Сколько позиций зависят не только от нас.
 *
 * Считается по полю, а не по состоянию: «закрыто извне» и «вне области»
 * очевидны, но среди «в плане» есть три, которые тоже своими силами
 * не закрываются — их закрывает аудитор, ведомство или сама Ассоциация,
 * а мы можем только подготовить. Сваливать их в общий счёт недоделок
 * значило бы обещать работу, которой нет.
 */
export const EXTERNAL = COMPLIANCE.filter((c) => c.external)

/** Позиции, закрывающиеся нашей работой, — и сколько из них закрыто. */
export const OURS = COMPLIANCE.filter((c) => !c.external)
export const OURS_DONE = OURS.filter((c) => c.state === 'done')
