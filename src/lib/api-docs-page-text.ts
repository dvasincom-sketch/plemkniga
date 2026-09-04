import type { Translated } from '@/lib/i18n/translated'

/**
 * Слова страницы с документацией API — всё, что стоит вокруг справочника.
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) требуют все шесть
 * языков разом, и для подписей навигации это верно. Здесь другое:
 * три карточки о входе, правах и отборе, три сценария с примерами
 * команд и пояснения к ним. Текста на страницу, и переводится он
 * целиком, а не по строке. Поэтому `Translated` с явным откатом
 * на русский — как у `economics-page-text.ts`.
 *
 * ## Чего здесь нет
 *
 * Слов самого описания OpenAPI. Оно собирается из коллекций
 * (`lib/openapi.ts` и подписи полей в `collections/`), написано
 * по-русски и переводится отдельной работой: там разделы, названия
 * ручек и пояснения к каждому полю книги. Смешать их с текстом
 * страницы значило бы завести перевод, который наполовину делается
 * здесь, а наполовину в конфигурации коллекций.
 *
 * ## Почему примеры команд не переводятся
 *
 * `curl`, имена ручек и параметры одинаковы на любом языке, и подменять
 * их значило бы выдать за пример то, что не выполнится. Переводится
 * в примерах ровно одно место — заполнитель «токен» в заголовке
 * запроса: он не команда, а слово, которое читатель заменяет своим.
 */

/**
 * Подпись, в которой часть слов набрана шрифтом кода.
 *
 * Чётные куски — обычный текст, нечётные — код: `['В ответе поле ',
 * 'token', ', срок жизни — в поле ', 'exp', '.']`. Разбивка нужна
 * потому, что имена полей внутри фразы не переводятся, а фраза вокруг
 * них у каждого языка своя, и порядок слов у неё свой тоже.
 */
export type CodeParts = string[]

export type ApiDocsPageText = {
  /** Подводка к адресу машинного описания; заканчивается перед ссылкой. */
  introLead: string
  /** Продолжение фразы после адреса. */
  introTail: string

  auth: {
    title: string
    /** Идёт после `POST /api/users/login`, набранного в разметке кодом. */
    body: string
    /** Заголовок запроса целиком: переводится в нём только слово «токен». */
    snippet: string
    note: string
  }
  access: { title: string; body: string; note: string }
  filter: { title: string; body: string; note: string }

  start: { title: string; lead: string }
  steps: { title: string; body: string; note: string | CodeParts }[]
  /** Что подставлять в примерах и чего не надо подставлять в справочнике. */
  substitutions: CodeParts

  /** Подводка к адресу GraphQL; заканчивается перед ссылкой. */
  graphqlLead: string
  /** Продолжение после адреса и точки. */
  graphqlTail: string
}

const RU: ApiDocsPageText = {
  introLead:
    'У книги два интерфейса поверх одной модели: REST и GraphQL. Описание ниже собрано ' +
    'из тех же коллекций, из которых построен сам API, и обновляется вместе с ними — ' +
    'расходиться им негде. Машинное описание лежит по адресу',
  introTail: 'в формате OpenAPI 3.1: его принимают Postman, Insomnia и генераторы клиентов.',

  auth: {
    title: 'Как войти',
    body: 'с почтой и паролем возвращает токен. Дальше его передают заголовком:',
    snippet: 'Authorization: JWT <токен>',
    note: 'Браузеру проще: та же ручка ставит cookie, и дальше он ходит с ней сам.',
  },
  access: {
    title: 'Почему ответы разные',
    body:
      'Одна и та же ручка отдаёт разное разным: хозяйство видит свои записи и публичные, ' +
      'Ассоциация — все, аноним — только публичные. Это правила доступа, а не схема ' +
      'ответа, и в описании их не выразить.',
    note: 'Пустая выдача чаще означает «вам это не видно», чем «этого нет».',
  },
  filter: {
    title: 'Отбор',
    body: 'Условия передаются вложенными параметрами:',
    note:
      'Стандартными средствами OpenAPI этот язык не описывается — в спецификации ' +
      'он объявлен строкой, чтобы не выглядеть точнее, чем есть.',
  },

  start: {
    title: 'С чего начать',
    lead:
      'Три задачи, с которыми к нам приходят чаще всего. Дальше справочник: в нём ' +
      'девяносто ручек, и он отвечает тому, кто уже знает, что ищет.',
  },
  steps: [
    {
      title: '1. Войти и получить токен',
      body: 'С него начинается всё остальное: без токена ручки отдают только публичное.',
      note: [
        'В ',
        'BASE',
        ' — адрес этой системы. В ответе поле ',
        'token',
        ', срок жизни — в поле ',
        'exp',
        '.',
      ],
    },
    {
      title: '2. Выгрузить своё стадо',
      body:
        'Владельца в условии называть не нужно: выдача и так ограничена вашим ' +
        'хозяйством — правилами доступа, а не параметром запроса.',
      note: [
        '',
        'depth=0',
        ' отдаёт связи идентификаторами — быстрее и предсказуемее, если сами связанные ' +
          'записи не нужны.',
      ],
    },
    {
      title: '3. Записать контрольную дойку',
      body:
        'То, ради чего API чаще всего и подключают: дойки приходят каждый месяц ' +
        'и тысячами строк.',
      note:
        'Записать можно только животное своего хозяйства — это проверяется на сервере, ' +
        'а не в форме.',
    },
  ],
  substitutions: [
    'В примерах два подставляемых значения: ',
    '$BASE',
    ' — адрес, по которому открыта эта страница, и ',
    '$TOKEN',
    ' — то, что вернул вход. В справочнике ниже подставлять не нужно ничего: адрес там ' +
      'уже наш, а токен вводится один раз кнопкой авторизации.',
  ],

  graphqlLead: 'Рядом с REST работает GraphQL —',
  graphqlTail:
    'Это та же модель и те же правила доступа, другой способ спрашивать: за один запрос ' +
    'можно взять животное вместе с отёлами и родословной, не собирая его из трёх обращений.',
}

const EN: ApiDocsPageText = {
  introLead:
    'The book has two interfaces over one model: REST and GraphQL. The description below ' +
    'is assembled from the same collections the API itself is built from and is updated ' +
    'together with them — there is nowhere for the two to diverge. The machine-readable ' +
    'description is at',
  introTail: 'in OpenAPI 3.1: Postman, Insomnia and client generators take it as it is.',

  auth: {
    title: 'How to sign in',
    body: 'with an email and a password returns a token. It is then passed in a header:',
    snippet: 'Authorization: JWT <token>',
    note: 'A browser has it easier: the same endpoint sets a cookie and carries it from then on.',
  },
  access: {
    title: 'Why the answers differ',
    body:
      'The same endpoint returns different things to different callers: a farm sees its ' +
      'own records and the public ones, the Association sees all of them, an anonymous ' +
      'caller only the public ones. These are access rules rather than the shape of the ' +
      'response, and the description cannot express them.',
    note: 'An empty result more often means “not visible to you” than “not there”.',
  },
  filter: {
    title: 'Filtering',
    body: 'Conditions are passed as nested parameters:',
    note:
      'Standard OpenAPI has no way to describe this language — in the specification it is ' +
      'declared a plain string, so that it does not look more precise than it is.',
  },

  start: {
    title: 'Where to start',
    /*
     * «Девяносто ручек» по-английски числом словами же: точное число
     * меняется с каждой новой коллекцией, и обещать его цифрой значило бы
     * заводить на витрине число, которое никто не пересчитывает.
     */
    lead:
      'The three tasks people come to us with most often. After them comes the reference: ' +
      'it holds some ninety endpoints and answers whoever already knows what to look for.',
  },
  steps: [
    {
      title: '1. Sign in and get a token',
      body: 'Everything else starts here: without a token the endpoints return only public data.',
      note: [
        '',
        'BASE',
        ' is the address of this system. The response carries a ',
        'token',
        ' field, and its lifetime is in ',
        'exp',
        '.',
      ],
    },
    {
      title: '2. Export your own herd',
      body:
        'There is no need to name the owner in the condition: the result is limited to ' +
        'your farm anyway — by access rules, not by a query parameter.',
      note: [
        '',
        'depth=0',
        ' returns relations as identifiers — faster and more predictable when the related ' +
          'records themselves are not needed.',
      ],
    },
    {
      title: '3. Record a test-day milking',
      body:
        'What the API is most often connected for: milk recordings arrive every month and ' +
        'in thousands of rows.',
      note:
        'A record can only be written for an animal of your own farm — that is checked on ' +
        'the server, not in the form.',
    },
  ],
  substitutions: [
    'The examples have two values to substitute: ',
    '$BASE',
    ' is the address this page is open at, and ',
    '$TOKEN',
    ' is what the sign-in returned. Nothing has to be substituted in the reference below: ' +
      'the address there is already ours, and the token is entered once with the ' +
      'authorisation button.',
  ],

  graphqlLead: 'GraphQL runs alongside REST —',
  graphqlTail:
    'The same model and the same access rules, a different way of asking: one request can ' +
    'take an animal together with its calvings and its pedigree instead of assembling it ' +
    'from three calls.',
}

export const API_DOCS_PAGE_TEXT: Translated<ApiDocsPageText> = { ru: RU, en: EN }
