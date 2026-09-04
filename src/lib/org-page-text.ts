import type { Translated } from '@/lib/i18n/translated'

/**
 * Слова страницы об организации.
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) требуют все шесть
 * языков разом, и для подписей навигации это правильно. Здесь другое:
 * три довода о форме организации и два абзаца о том, чьи в системе
 * данные. Это тот же плотный текст, что и разборы соседних страниц, —
 * требование «шесть языков сразу» дало бы либо русскую страницу
 * на всех шести, либо четыре машинных перевода юридических
 * формулировок, которые выглядят достоверно для того, кто языка
 * не знает (`docs/lokalizatsiya.md`).
 *
 * Поэтому `Translated` с явным откатом на русский — как у
 * `economics-page-text.ts`.
 *
 * ## Почему доводы о форме переехали сюда из `platform.ts`
 *
 * Соседний файл отвечает на вопрос «кто содержит платформу» фактами:
 * имя, реквизиты, год. Факты одни на все языки. А три карточки о том,
 * почему форма именно такая, — текст страницы, и переводится он вместе
 * с остальным её текстом. Пока они лежали среди фактов, английская
 * страница показывала переведённую рамку и три русские карточки
 * посередине.
 *
 * ## Чего здесь нарочно нет
 *
 * Юридической формы, переведённой дословно. «Autonomous non-profit
 * organisation» — не английская организационно-правовая форма, и назвать
 * себя так значило бы назвать лицо, которого нет ни в одном реестре.
 * Английский текст называет имя, а форму объясняет с указанием права,
 * по которому она заведена (`PLATFORM.fullEn`).
 */

export type OrgPageText = {
  formTitle: string
  /**
   * Почему автономная некоммерческая организация, а не что-то другое.
   *
   * Вопрос задают, и не из любопытства: форма организации говорит
   * о её обязательствах больше, чем любое заявление о намерениях.
   * Ассоциация с членством означала бы, что решения о платформе
   * принимают её члены — то есть одни хозяйства решают за другие;
   * коммерческое общество означало бы, что у платформы есть владельцы,
   * которым она приносит прибыль, и что книгу можно продать вместе
   * с долей. Ни то ни другое не годится системе, которая держит записи
   * нескольких независимых организаций.
   *
   * Порядок доводов не случаен: сначала о чём мы, потом как устроено
   * управление, и только третьим — про деньги. Обратный порядок читался бы
   * как объяснение, зачем некоммерческой организации доход, — а это
   * не главное, что о ней нужно знать.
   */
  form: { title: string; body: string }[]

  ownTitle: string
  ownBody: string
  /** Подводка к ссылке на обмен; заканчивается перед самой ссылкой. */
  dataLead: string
  dataLink: string
  /** Продолжение фразы после ссылки. */
  dataTail: string

  detailsTitle: string
  /*
   * `Record` по имени реквизита, а не список пар: новый реквизит
   * в `platform.ts` не соберётся без подписи, и строки без названия
   * на странице не появится.
   */
  details: { name: string; inn: string; ogrn: string; mail: string }
  /** Подводка к адресу действующей книги; заканчивается перед ссылкой. */
  bookLead: string
  /** Продолжение после адреса; начинается с новой фразы. */
  bookTail: string
}

const RU: OrgPageText = {
  formTitle: 'Почему именно такая форма',
  form: [
    {
      title: 'Цель названа прямо',
      body: 'Уставная цель — оказание услуг в области животноводства и селекции. Не «развитие технологий» и не «содействие отрасли»: расплывчатая цель ничего не обещает и ни к чему не обязывает, а по названной можно спросить, делаем ли мы то, ради чего заведены.',
    },
    {
      title: 'Управление без членства',
      body: 'У организации нет членов, и это осознанно. Членство означало бы, что судьбу платформы решают те, кто в неё вступил, — то есть одни хозяйства и объединения решают за другие. Книга обслуживает организации, которые друг другу не подчиняются, и ни одна из них не должна получать через платформу власть над остальными.',
    },
    {
      title: 'Доход допустим, но подчинён цели',
      body: 'Форма позволяет вести деятельность, приносящую доход, — в рамках уставных целей и ради них. Платформа стоит денег: серверы, поддержка, сверка со стандартами, которые обновляются без нашего участия. Утверждать, что она держится на энтузиазме, значило бы обещать то, что однажды придётся нарушить.',
    },
  ],

  ownTitle: 'Организация содержит систему, но не владеет книгами',
  ownBody:
    'Книгу ведёт объединение, и записи в ней принадлежат ему, а не нам. Мы содержим ' +
    'систему: обновляем её вслед за стандартами, отвечаем за сохранность и за то, что ' +
    'выданный документ нельзя переписать задним числом. Роли разные, и разделены они ' +
    'не обещанием, а устройством — у каждой книги свой домен, свои реквизиты на бланке ' +
    'и свои права доступа.',
  dataLead:
    'Из этого следует и обратное обязательство: данные книги должны уходить из системы ' +
    'целиком и в читаемом виде, когда объединение этого захочет. Для того и сделан',
  dataLink: 'обмен по международному стандарту',
  dataTail: '— он нужен не только партнёрам, но и на случай расставания с нами.',

  detailsTitle: 'Реквизиты',
  details: {
    name: 'Полное наименование',
    inn: 'ИНН',
    ogrn: 'ОГРН',
    mail: 'Почта',
  },
  bookLead: 'Действующая книга, ведущаяся на платформе, —',
  bookTail:
    'Её адрес, телефон и правовые документы принадлежат Ассоциации и стоят в подвале ' +
    'самой книги: показывать их здесь значило бы выдавать одно лицо за другое.',
}

const EN: OrgPageText = {
  formTitle: 'Why this legal form',
  form: [
    {
      title: 'The purpose is stated plainly',
      body: 'The charter names one purpose: services in livestock breeding and selection. Not “advancing technology” and not “supporting the industry” — a vague purpose promises nothing and binds no one, while a stated one can be held against us: we can be asked whether we do what we were set up to do.',
    },
    {
      title: 'Governance without membership',
      body: 'The organisation has no members, and that is deliberate. Membership would mean that the platform is decided by those who joined it — that is, some farms and associations deciding for others. The system serves organisations that are not subordinate to one another, and none of them should gain power over the rest through it.',
    },
    {
      title: 'Income is allowed, but subordinate to the purpose',
      body: 'The form permits activity that earns income, within the charter purposes and for their sake. The platform costs money: servers, support, checking against standards that are updated without us. Claiming that it runs on enthusiasm would be promising something that would have to be broken later.',
    },
  ],

  ownTitle: 'The organisation runs the system but does not own the books',
  ownBody:
    'A book is kept by an association, and the records in it belong to that association, ' +
    'not to us. We run the system: we keep it up with the standards, we answer for ' +
    'preservation and for the fact that an issued document cannot be rewritten after the ' +
    'fact. The roles are different, and they are separated by design rather than by ' +
    'promise — each book has its own domain, its own details on the letterhead and its ' +
    'own access rights.',
  dataLead:
    'The reverse obligation follows from this: the data of a book must be able to leave ' +
    'the system in full and in readable form whenever the association wants it to. That ' +
    'is what',
  /*
   * Разбор обмена переведён на английский, и ссылка ведёт на английскую
   * страницу: оговорки «in Russian», как у разбора базы сравнения,
   * здесь не нужно.
   */
  dataLink: 'exchange by the international standard',
  dataTail: 'is for: it serves partners, and it also serves the day someone parts with us.',

  detailsTitle: 'Registration details',
  details: {
    name: 'Full legal name',
    /*
     * Номера названы своими сокращениями с расшифровкой: ИНН и ОГРН —
     * это то, что написано в выписке, и читатель, сверяющий страницу
     * с реестром, ищет именно эти буквы.
     */
    inn: 'Taxpayer number (INN)',
    ogrn: 'Registration number (OGRN)',
    mail: 'Email',
  },
  bookLead: 'The working book kept on the platform is',
  bookTail:
    'Its postal address, telephone number and legal documents belong to the Association ' +
    'and stand in the footer of the book itself: showing them here would be presenting ' +
    'one legal entity as another.',
}

export const ORG_PAGE_TEXT: Translated<OrgPageText> = { ru: RU, en: EN }
