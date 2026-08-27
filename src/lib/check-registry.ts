/**
 * Реестр прогонов: какие проверки у системы есть и что каждая может.
 *
 * ## Зачем перечень, а не просто список запусков
 *
 * Страница «Статус» показывает результаты прогонов. Если строить её только
 * из них, она покажет ровно то, что успели прогнать, — и умолчит о том,
 * чего не гоняли. А именно это и есть главный вопрос: не «что зелено»,
 * а «что вообще проверялось».
 *
 * Поэтому источник правды здесь — перечень всех проверок, а результаты
 * прогона на него накладываются. Проверка без результата показывается
 * как «не гонялась», и это честное состояние, а не пробел.
 *
 * ## Не путать с реестром зоотехнических проверок
 *
 * `checks-registry.ts` — про данные о животных: кровность вне диапазона,
 * отец моложе потомка. Здесь — про сами прогоны кода. Слово «проверка»
 * занято дважды, и развести их можно только именами файлов; поэтому
 * тут `check-registry`, а там `checks-registry` — разница в одной букве,
 * и она недостаточна. При случае стоит переименовать этот в `run-registry`.
 *
 * ## Три признака, которые всё решают
 *
 * **`writes`** — проверка создаёт записи в базе и потом удаляет. На боевой
 * книге такое гонять нельзя: обрыв посреди прогона оставит мусор,
 * неотличимый от настоящих данных.
 *
 * **`needsServer`** — проверке нужен живой HTTP-сервер, она ходит
 * по страницам снаружи. Внутри самого сервера ей не место: проверяющий,
 * живущий внутри проверяемого, не заметит, что проверяемый не отвечает.
 *
 * **`probe`** — проверку умеет прогнать само приложение, значит она
 * попадает в ночной прогон и на страницу. Остальные остаются ручными,
 * и страница про них так и говорит.
 */

export type CheckArea = 'db' | 'data' | 'code' | 'access' | 'exchange' | 'ui'

export const AREA_LABEL: Record<CheckArea, string> = {
  db: 'База и выкладка',
  data: 'Данные книги',
  code: 'Код и форматы',
  access: 'Доступ и роли',
  exchange: 'Обмен и файлы',
  ui: 'Страницы и ссылки',
}

/** Порядок разделов на странице: от того, что валит систему, к частностям. */
export const AREA_ORDER: CheckArea[] = ['db', 'data', 'access', 'exchange', 'ui', 'code']

export type CheckSpec = {
  /** Совпадает с именем команды: по нему проверку и запускают руками. */
  code: string
  title: string
  /** Что проверяется — одной фразой, без терминов. */
  what: string
  area: CheckArea
  /** Создаёт и удаляет записи в базе. */
  writes: boolean
  /** Нужен поднятый HTTP-сервер. */
  needsServer: boolean
  /** Умеет прогоняться самим приложением — попадает в ночной прогон. */
  probe: boolean
  /**
   * Проверка смотрит на процесс, в котором запущена, а не на базу.
   *
   * Такая есть одна — присмотр за пулом соединений. Запущенная с боевой
   * строкой подключения, она посчитает слушателей у **своего** пула,
   * а не у боевого сервера, и ответит зелёным, ничего про прод не узнав.
   * Ложная удача хуже пропуска: пропуск виден, а зелёное — нет.
   */
  aboutThisProcess?: boolean
  /**
   * Где разбирать находку внутри системы.
   *
   * Не у всякой проверки такое место есть, и придумывать его нельзя:
   * ссылка, ведущая «примерно туда», хуже её отсутствия — по ней идут
   * и не находят того, о чём была находка. Здесь только те адреса,
   * которые показывают ровно предмет проверки.
   */
  where?: { href: string; label: string }
}

export const CHECKS: CheckSpec[] = [
  /* --------------------------- База и выкладка --------------------------- */
  {
    code: 'doctor',
    title: 'Осмотр перед запуском',
    what:
      'Отвечает ли база, сходится ли журнал миграций со схемой, нет ли отметки dev, ' +
      'долгих транзакций, раздутых таблиц и непроверенных ограничений',
    area: 'db',
    writes: false,
    needsServer: false,
    probe: true,
  },
  {
    code: 'check:pool',
    title: 'Присмотр за пулом соединений',
    what:
      'У обрыва соединения ровно один слушатель: без него обрыв убивает процесс, ' +
      'а лишние пишут в лог по копии на каждый',
    area: 'db',
    writes: false,
    needsServer: false,
    probe: true,
    aboutThisProcess: true,
  },
  {
    code: 'audit:indexes',
    title: 'Индексы против запросов',
    what: 'Какие индексы не используются и каких не хватает под настоящую нагрузку',
    area: 'db',
    writes: false,
    needsServer: false,
    probe: false,
  },

  /* ----------------------------- Данные книги ---------------------------- */
  {
    code: 'check:herd',
    title: 'Отчёты по стаду считаются',
    what: 'Семь запросов выполняются на живой базе и возвращают то, что обещает тип',
    area: 'data',
    writes: false,
    needsServer: false,
    probe: true,
    where: { href: '/account?tab=herd&sub=reports', label: 'Отчёты по стаду' },
  },
  {
    code: 'check:drilldown',
    title: 'Списки сходятся с числами',
    what:
      'Число в отчёте равно длине списка за ним: несходящееся число хуже ошибки — ' +
      'оно правдоподобно с обеих сторон',
    area: 'data',
    writes: false,
    needsServer: false,
    probe: true,
    where: { href: '/account?tab=herd&sub=reports', label: 'Отчёты по стаду' },
  },
  {
    code: 'audit:checks',
    title: 'Ревизия зоотехнических правил',
    what: 'Все правила реестра прогоняются по настоящим данным: какие срабатывают, какие молчат',
    area: 'data',
    writes: false,
    needsServer: false,
    probe: false,
    where: { href: '/association/quality', label: 'Качество книги' },
  },
  {
    code: 'audit:pedigree',
    title: 'Родословная без противоречий',
    what: 'Циклы в родословной, родители моложе потомков, животное само себе родитель',
    area: 'data',
    writes: false,
    needsServer: false,
    probe: false,
    where: { href: '/association/quality', label: 'Качество книги' },
  },
  {
    code: 'check:mating',
    title: 'Подбор пар считается верно',
    what: 'Инбридинг сверяется на случаях с известным ответом: полусибсы, полные сибсы, отец с дочерью',
    area: 'data',
    writes: true,
    needsServer: false,
    probe: false,
    where: { href: '/account/reports/mating', label: 'Подбор быков' },
  },
  {
    code: 'check:bulls',
    title: 'Сравнение быков со сверстницами',
    what: 'Разница по дочерям считается на построенном контрольном стаде',
    area: 'data',
    writes: true,
    needsServer: false,
    probe: false,
  },

  /* --------------------------- Доступ и роли ----------------------------- */
  {
    code: 'check:security',
    title: 'Чужое закрыто',
    what: 'Попытки поднять себе роль и прочитать чужие записи отклоняются',
    area: 'access',
    writes: true,
    needsServer: false,
    probe: false,
  },
  {
    code: 'check:trust',
    title: 'Уровень достоверности выводится, а не ставится',
    what:
      'Протокол лаборатории поднимает вторую ступень, отзыв её снимает, ' +
      'а подпись Ассоциации ни то ни другое не трогает',
    area: 'access',
    writes: true,
    needsServer: false,
    probe: false,
    where: { href: '/association/documents', label: 'Документы Ассоциации' },
  },
  {
    code: 'check:team',
    title: 'Роли, приглашения, блокировка',
    what: 'Сотрудник видит своё, приглашение работает один раз, заблокированный не входит',
    area: 'access',
    writes: true,
    needsServer: false,
    probe: false,
  },
  {
    code: 'audit:tenancy',
    title: 'Границы хозяйств',
    what: 'От лица настоящего пользователя: не видно и не правится ничего чужого',
    area: 'access',
    writes: true,
    needsServer: false,
    probe: false,
  },
  {
    code: 'audit:grants',
    title: 'Точечные доступы',
    what: 'Выданный доступ открывает ровно одну запись и отзывается',
    area: 'access',
    writes: true,
    needsServer: false,
    probe: false,
  },
  {
    code: 'audit:gate',
    title: 'Заслон подтверждения',
    what: 'Нельзя подтвердить запись поверх неразобранной находки',
    area: 'access',
    writes: false,
    needsServer: false,
    probe: false,
  },
  {
    code: 'check:journal',
    title: 'Журнал переживает предмет',
    what: 'Запись об операции остаётся после удаления того, о чём она',
    area: 'access',
    writes: true,
    needsServer: false,
    probe: false,
  },

  /* --------------------------- Обмен и файлы ----------------------------- */
  {
    code: 'check:xlsx',
    title: 'Выгрузка и загрузка книги Excel',
    what: 'Настоящее стадо выгружается, читается обратно и сходится с исходным',
    area: 'exchange',
    writes: true,
    needsServer: false,
    probe: false,
  },
  {
    code: 'check:csv',
    title: 'Кодировки и разделители CSV',
    what: 'windows-1251 и UTF-8, точка с запятой и запятая, круговой прогон разбора и сборки',
    area: 'exchange',
    writes: false,
    needsServer: false,
    probe: false,
  },
  {
    code: 'check:movements',
    title: 'Смена владельца',
    what: 'Животное переходит с историей, прежний владелец теряет доступ',
    area: 'exchange',
    writes: true,
    needsServer: false,
    probe: false,
  },
  {
    code: 'check:openapi',
    title: 'Описание API полное',
    what: 'Все ручки попадают в OpenAPI: описание, разошедшееся с кодом, хуже отсутствующего',
    area: 'exchange',
    writes: false,
    needsServer: false,
    probe: false,
    where: { href: '/api-docs', label: 'Описание API' },
  },

  /* -------------------------- Страницы и ссылки -------------------------- */
  {
    code: 'smoke',
    title: 'Обход всех страниц',
    what: 'Каждая страница живого сервера отвечает, битых ссылок и переадресаций нет',
    area: 'ui',
    writes: false,
    needsServer: true,
    probe: false,
  },
  {
    code: 'check:nav',
    title: 'Ссылки навигации ведут куда обещают',
    what: 'Все пункты меню кабинета открываются на живом сервере с живой базой',
    area: 'ui',
    writes: false,
    needsServer: true,
    probe: false,
  },
  {
    code: 'check:api-docs',
    title: 'Страница API открывается',
    what: 'Документация отдаётся и её обвязка лежит на месте',
    area: 'ui',
    writes: false,
    needsServer: true,
    probe: false,
  },

  /* --------------------------- Код и форматы ----------------------------- */
  {
    code: 'check:layout',
    title: 'Порядок частей страницы',
    what: 'Меню кабинета стоит выше заголовка на каждой странице',
    area: 'code',
    writes: false,
    needsServer: false,
    probe: false,
  },
  {
    code: 'check:time',
    title: 'Даты в четырёх часовых поясах',
    what: 'Показ дат не съезжает на сутки при смене пояса читателя',
    area: 'code',
    writes: false,
    needsServer: false,
    probe: false,
  },
  {
    code: 'check:searches',
    title: 'Сохраняемые отборы',
    what: 'Отбор сохраняется, открывается и удаляется, чужой не виден',
    area: 'access',
    writes: true,
    needsServer: false,
    probe: false,
  },
]

export const checkSpec = (code: string): CheckSpec | undefined => CHECKS.find((c) => c.code === code)

/** Сколько проверок умеет прогнать само приложение — против общего числа. */
export const PROBE_COUNT = CHECKS.filter((c) => c.probe).length
