import type { Payload } from 'payload'
import { ADE_COLLECTIONS } from '@/lib/ade/core'
import { ADE_WRITABLE } from '@/lib/ade/parse'

/**
 * Описание REST API в формате OpenAPI (ТЗ, требование №16).
 *
 * ## Почему описание собирается из конфигурации, а не написано руками
 *
 * Рукописная спецификация — это обещание, которое стареет. Поле добавили,
 * поле переименовали, коллекцию завели — описание про это не узнает,
 * и через полгода оно начинает врать: сначала в мелочах, потом целиком.
 * Проверить его нечем, потому что оно и есть тот документ, по которому
 * проверяют.
 *
 * Здесь описание строится из тех же коллекций, из которых Payload строит
 * сам API. Разойтись им негде: новое поле появляется в описании в тот же
 * день, что и в базе, а удалённое исчезает.
 *
 * ## Чего OpenAPI про этот API сказать не может, и об этом сказано прямо
 *
 * **Язык фильтра.** Payload принимает `where` — вложенную структуру
 * с операторами (`equals`, `in`, `greater_than`, `like`, `and`, `or`),
 * которую передают как `where[поле][оператор]=значение`. В OpenAPI
 * такого параметра не выразить: он не описывается ни enum, ни схемой.
 * Поэтому здесь он объявлен строкой с объяснением и примером, а не
 * подделан под что-то стандартное. Подделка выглядела бы точнее
 * и вводила бы в заблуждение.
 *
 * **Права доступа.** Одна и та же ручка отдаёт разное разным: хозяйству —
 * его записи, Ассоциации — все, анониму — только публичные. Это свойство
 * не схемы ответа, а правил доступа, и описать его полями нельзя.
 * Сказано словами в описании каждой коллекции — иначе документация
 * обещает больше, чем API делает.
 *
 * ## Почему служебные коллекции скрыты
 *
 * `payload-*` — внутренняя кухня: блокировки документов, настройки
 * интерфейса, журнал миграций. Они существуют, они доступны по тем же
 * адресам, и описывать их значит предлагать ими пользоваться.
 */

type FieldLike = {
  name?: string
  type: string
  label?: unknown
  required?: boolean
  hasMany?: boolean
  relationTo?: string | string[]
  options?: unknown
  fields?: FieldLike[]
  tabs?: { name?: string; label?: unknown; fields: FieldLike[] }[]
  admin?: { description?: unknown; readOnly?: boolean }
}

type CollectionLike = {
  slug: string
  labels?: { singular?: unknown; plural?: unknown }
  fields: FieldLike[]
  auth?: unknown
  upload?: unknown
  admin?: { description?: unknown; group?: unknown }
}

type Schema = Record<string, unknown>

/** Служебные коллекции Payload — в описание не попадают. */
const isInternal = (slug: string): boolean => slug.startsWith('payload-')

const text = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object') {
    const ru = (v as Record<string, unknown>).ru
    if (typeof ru === 'string') return ru
  }
  return undefined
}

const optionValues = (options: unknown): string[] | undefined => {
  if (!Array.isArray(options)) return undefined
  const values = options
    .map((o) => (typeof o === 'string' ? o : ((o as { value?: unknown })?.value ?? null)))
    .filter((v): v is string => typeof v === 'string')
  return values.length ? values : undefined
}

/**
 * Поле коллекции → схема JSON.
 *
 * Связи описаны как «число или вложенный объект» намеренно: что придёт,
 * зависит от параметра `depth` в запросе, и притвориться, что придёт
 * что-то одно, значило бы описать половину случаев. Тот же приём
 * у загруженных файлов.
 */
function fieldSchema(field: FieldLike): Schema | null {
  const description = text(field.admin?.description) ?? text(field.label)
  const base = description ? { description } : {}

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'code':
    case 'email':
      return { type: 'string', ...base }

    case 'number':
      return { type: 'number', ...base }

    case 'checkbox':
      return { type: 'boolean', ...base }

    case 'date':
      return { type: 'string', format: 'date-time', ...base }

    case 'select': {
      const values = optionValues(field.options)
      const one = { type: 'string', ...(values ? { enum: values } : {}), ...base }
      return field.hasMany ? { type: 'array', items: one, ...base } : one
    }

    case 'relationship':
    case 'upload': {
      const to = Array.isArray(field.relationTo) ? field.relationTo.join(', ') : field.relationTo
      const one = {
        oneOf: [{ type: 'integer' }, { type: 'object' }],
        description:
          `${description ? `${description}. ` : ''}Ссылка на «${to}». ` +
          'При depth=0 приходит идентификатор, при depth>0 — вложенная запись.',
      }
      return field.hasMany ? { type: 'array', items: one } : one
    }

    case 'array':
      return {
        type: 'array',
        items: { type: 'object', properties: propertiesOf(field.fields ?? []) },
        ...base,
      }

    case 'group':
      return { type: 'object', properties: propertiesOf(field.fields ?? []), ...base }

    case 'json':
    case 'richText':
      return { ...base }

    case 'point':
      return { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, ...base }

    default:
      return { ...base }
  }
}

/**
 * Поля → свойства схемы.
 *
 * `row`, `collapsible` и `tabs` без имени — это разметка формы, а не
 * данные: в базе они ничего не создают, и в описании их быть не должно.
 * Их содержимое поднимается на уровень выше, ровно как это делает сам
 * Payload.
 */
function propertiesOf(fields: FieldLike[]): Record<string, Schema> {
  const props: Record<string, Schema> = {}

  for (const field of fields) {
    if (field.type === 'row' || field.type === 'collapsible') {
      Object.assign(props, propertiesOf(field.fields ?? []))
      continue
    }

    if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) {
        if (tab.name) {
          props[tab.name] = { type: 'object', properties: propertiesOf(tab.fields) }
        } else {
          Object.assign(props, propertiesOf(tab.fields))
        }
      }
      continue
    }

    if (!field.name) continue
    const schema = fieldSchema(field)
    if (schema) props[field.name] = schema
  }

  return props
}

const requiredOf = (fields: FieldLike[]): string[] => {
  const out: string[] = []
  for (const field of fields) {
    if (field.type === 'row' || field.type === 'collapsible') {
      out.push(...requiredOf(field.fields ?? []))
      continue
    }
    if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) if (!tab.name) out.push(...requiredOf(tab.fields))
      continue
    }
    if (field.name && field.required) out.push(field.name)
  }
  return out
}

/** Общие параметры выборки — одни и те же у каждой коллекции. */
const LIST_PARAMS = [
  {
    name: 'where',
    in: 'query',
    required: false,
    schema: { type: 'string' },
    description:
      'Условие отбора в формате Payload: where[поле][оператор]=значение. ' +
      'Операторы: equals, not_equals, greater_than, greater_than_equal, less_than, ' +
      'less_than_equal, like, in, not_in, exists. Условия объединяются through and/or: ' +
      'where[or][0][state][equals]=alive. ' +
      'Стандартными средствами OpenAPI этот язык не описывается — здесь он объявлен ' +
      'строкой намеренно, чтобы не выглядеть точнее, чем есть.',
    example: 'where[state][equals]=alive',
  },
  {
    name: 'limit',
    in: 'query',
    required: false,
    schema: { type: 'integer', default: 10 },
    description: 'Сколько записей на странице. 0 — без ограничения (осторожно на книге).',
  },
  { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
  {
    name: 'sort',
    in: 'query',
    required: false,
    schema: { type: 'string' },
    description: 'Поле сортировки; минус впереди — по убыванию: sort=-createdAt',
  },
  {
    name: 'depth',
    in: 'query',
    required: false,
    schema: { type: 'integer', default: 1 },
    description:
      'На сколько уровней разворачивать связи. 0 — только идентификаторы: ' +
      'быстрее и предсказуемее, если связанные записи не нужны.',
  },
] as const

const listResponse = (ref: string): Schema => ({
  type: 'object',
  properties: {
    docs: { type: 'array', items: { $ref: ref } },
    totalDocs: { type: 'integer' },
    limit: { type: 'integer' },
    totalPages: { type: 'integer' },
    page: { type: 'integer' },
    hasPrevPage: { type: 'boolean' },
    hasNextPage: { type: 'boolean' },
  },
})

/**
 * Разделы описания.
 *
 * ## Зачем
 *
 * Ручек девяносто, коллекций сорок с лишним, и в Swagger UI они шли одним
 * списком в том порядке, в каком лежат в конфигурации Payload: «Пользователи,
 * Организации, Стада, Животные, Перемещения…» и через тридцать строк
 * «Масти, Группы крови, Методы воспроизводства». Найти в таком списке нужное
 * можно только поиском по странице — то есть заранее зная, как оно называется.
 * А приходят сюда с обратным вопросом: что вообще есть про животное.
 *
 * ## Почему приставка к имени, а не группы
 *
 * У OpenAPI нет разделов. Есть расширение `x-tagGroups`, но понимает его
 * Redoc, а не Swagger UI, и в нашем случае оно означало бы разметку, которую
 * никто не отобразит. Приставка работает везде: раздел виден в самом имени
 * («Стадо · Животные»), а порядок задаётся списком `tags` в корне документа —
 * Swagger UI выводит разделы именно в нём, а не по алфавиту.
 *
 * ## Про «Прочее»
 *
 * Раздел есть, и он обязан оставаться пустым. Новая коллекция, о которой
 * здесь не сказано, попадёт в него — и это заметит `check:openapi`. Молча
 * приписать её к соседнему разделу значило бы решить за того, кто её завёл;
 * промолчать вовсе — потерять её в списке из сорока имён.
 */
const SECTIONS = [
  {
    key: 'Стадо',
    description: 'Животные, их площадки, смена владельца и сохранённые способы смотреть на них.',
    /*
     * Сохранённый отбор стоит здесь, а не среди личного. Это именованный
     * способ смотреть на стадо, и ищут его там же, где животных:
     * человек, пришедший за «как выбрать первотёлок с высоким удоем»,
     * идёт в раздел про животных, а не в раздел про себя.
     */
    slugs: ['animals', 'herds', 'movements', 'saved-searches'],
  },
  {
    key: 'События',
    description:
      'Что происходило с животным во времени. Отёлы, осеменения и дойки — ' +
      'отдельными коллекциями: их пишут тысячами строк, и у каждой свои поля.',
    /*
     * Взвешивания стоят среди событий, а не среди оценки. Живая масса —
     * измерение в конкретный день, как и удой; в оценку она входит
     * материалом, но сама оценкой не является.
     */
    slugs: ['calvings', 'inseminations', 'milk-tests', 'weighings', 'health-events', 'events'],
  },
  {
    key: 'Оценка',
    description:
      'Племенная ценность и то, из чего она считается: признаки, экстерьер, ' +
      'профили весов и базы сравнения.',
    slugs: [
      'animal-evaluations',
      'animal-exteriors',
      /*
       * Бонитировка — сводная оценка животного по комплексу признаков,
       * и место ей здесь, рядом с экстерьером и племенной ценностью,
       * а не среди событий: она не измерение, а вывод из измерений.
       */
      'gradings',
      'index-profiles',
      'index-values',
      'index-bases',
    ],
  },
  {
    key: 'Проверка',
    description:
      'Путь данных от загрузки до подписи Ассоциации: пакеты, заявки ' +
      'и правила, по которым записи сверяют.',
    slugs: [
      'data-submissions',
      'verification-requests',
      'check-settings',
      'check-thresholds',
      /*
       * Карантин неопознанных колонок — часть того же пути: заголовок,
       * которого книга не знает, приезжает загрузкой и ждёт решения
       * Ассоциации. Место ему рядом с пакетами, а не в служебных.
       */
      'pending-columns',
    ],
  },
  {
    key: 'Документы',
    description: 'Свидетельства, протоколы и файлы, которыми они подтверждены.',
    slugs: ['documents', 'media'],
  },
  {
    key: 'Люди',
    description: 'Учётные записи, хозяйства и приглашения сотрудников.',
    slugs: ['users', 'organizations', 'invitations'],
  },
  {
    key: 'Доступ',
    description:
      'Вход в систему и то, кому открыты ваши записи: точечный доступ ' +
      'хозяйствам и ссылки на просмотр для тех, у кого учётной записи нет.',
    slugs: ['access-requests', 'access-grants', 'share-links'],
  },
  {
    key: 'Журналы',
    description:
      'Что происходило с данными и кто это сделал. Журналы не пишутся ' +
      'через API: записать в них можно только служебным вызовом.',
    slugs: ['animal-revisions', 'operations', 'access-views', 'animal-removals'],
  },
  {
    key: 'Справочники',
    description:
      'Ведутся Ассоциацией и одни на всю книгу: своя порода или своя причина ' +
      'выбытия у каждого хозяйства сделала бы записи несравнимыми.',
    slugs: [
      'breeds',
      'lines',
      'breeding-categories',
      'breeding-classes',
      'animal-purposes',
      'disposal-reasons',
      'coat-colors',
      'blood-groups',
      'reproduction-methods',
      'semen-types',
      'insemination-results',
      'dna-test-types',
      'haplotype-types',
      'health-event-types',
      'technicians',
      'breed-types',
      /*
       * География — тоже справочник, и ведёт её не Ассоциация, а
       * государственный реестр: страны, регионы и районы приезжают
       * из ФГИАС ПР со своими ключами. Хранятся отдельно от прочих
       * справочников по происхождению, но для читателя описания это
       * такой же список значений, и разводить их по разделам значило бы
       * заставить искать «район» в двух местах.
       */
      'countries',
      'regions',
      'districts',
    ],
  },
  {
    /*
     * Факты о самой платформе, а не о животных. Замер отвечает
     * «насколько быстро», прогон проверок — «сходится ли». Обе пишутся
     * только служебными вызовами и читаются страницей «Эволюция
     * продукта»; приписывать их к предметным разделам значило бы
     * смешать книгу с рассказом о книге.
     */
    key: 'Платформа',
    description:
      'Замеры производительности и прогоны проверок: факты о самой системе. ' +
      'Через API не пишутся — их кладут служебные маршруты.',
    slugs: ['bench-runs', 'check-runs'],
  },
  {
    /*
     * У обмена нет коллекций Payload — только свои адреса, поэтому
     * `slugs` пуст. Раздел всё равно объявлен здесь, а не приписан
     * в конец: порядок разделов — это порядок чтения, и обмен читают
     * после того, как разобрались, что в книге лежит.
     */
    key: 'Обмен',
    description:
      'Стандартный интерфейс ICAR ADE: то же содержимое книги, но именами ' +
      'и адресами, которые чужая система понимает без чтения нашей документации.',
    slugs: [],
  },
  {
    key: 'Прочее',
    description:
      'Сюда попадает коллекция, для которой раздел не назван. Раздел обязан ' +
      'оставаться пустым — это проверяет `npm run check:openapi`.',
    slugs: [],
  },
] as const

/** Разделитель раздела и имени. Точка на середине, а не дефис: дефис есть в самих именах. */
const SECTION_SEP = ' · '

const sectionOf = (slug: string): string =>
  SECTIONS.find((s) => (s.slugs as readonly string[]).includes(slug))?.key ?? 'Прочее'

/** Имя раздела в описании: «Стадо · Животные». */
export const taggedName = (slug: string, name: string): string =>
  `${sectionOf(slug)}${SECTION_SEP}${name}`

export type OpenApiDocument = Record<string, unknown>

export function buildOpenApi(payload: Payload, serverUrl: string): OpenApiDocument {
  const collections = (payload.config.collections as unknown as CollectionLike[]).filter(
    (c) => !isInternal(c.slug),
  )

  const schemas: Record<string, Schema> = {}
  const paths: Record<string, Schema> = {}

  /*
   * Список разделов собирается по ходу и кладётся в корень документа.
   *
   * Без него Swagger UI выводит разделы в том порядке, в каком они впервые
   * встретились среди ручек, то есть в порядке коллекций из конфигурации
   * Payload. Приставка раздела там же и теряет смысл: «Стадо · Животные»
   * и «Стадо · Перемещения» оказываются в разных концах списка,
   * а справочники — вперемешку с журналами.
   */
  const tags: { slug: string; name: string; description?: string }[] = []

  for (const collection of collections) {
    const plural = text(collection.labels?.plural) ?? collection.slug
    // Имя раздела приклеивается к имени коллекции: разделов в OpenAPI нет
    const name = taggedName(collection.slug, plural)
    const singular = text(collection.labels?.singular) ?? collection.slug
    const schemaName = collection.slug
    const ref = `#/components/schemas/${schemaName}`

    tags.push({
      slug: collection.slug,
      name,
      description: text(collection.admin?.description),
    })

    const properties = propertiesOf(collection.fields)
    properties.id = { type: 'integer', description: 'Идентификатор записи' }
    properties.createdAt = { type: 'string', format: 'date-time' }
    properties.updatedAt = { type: 'string', format: 'date-time' }

    if (collection.upload) {
      properties.filename = { type: 'string' }
      properties.mimeType = { type: 'string' }
      properties.filesize = { type: 'integer' }
      properties.url = { type: 'string', description: 'Адрес файла; доступ к нему — по тем же правилам чтения, что и к записи' }
    }

    schemas[schemaName] = {
      type: 'object',
      description: text(collection.admin?.description) ?? singular,
      properties,
      ...(requiredOf(collection.fields).length
        ? { required: requiredOf(collection.fields) }
        : {}),
    }

    /*
     * Оговорка про доступ повторяется у каждой коллекции, и это не
     * многословие: человек читает описание одной ручки, а не документ
     * целиком, и общее предупреждение во введении до него не дойдёт.
     */
    const accessNote =
      'Выдача зависит от того, кто спрашивает: хозяйство видит свои записи ' +
      'и публичные, Ассоциация — все, аноним — только публичные. Это правила ' +
      'доступа, а не схема ответа, и в схеме они не выражены.'

    paths[`/api/${collection.slug}`] = {
      get: {
        tags: [name],
        summary: `Список: ${plural}`,
        description: accessNote,
        parameters: LIST_PARAMS,
        responses: {
          '200': {
            description: 'Страница выдачи',
            content: { 'application/json': { schema: listResponse(ref) } },
          },
        },
      },
      post: {
        tags: [name],
        summary: `Создать: ${singular}`,
        description: accessNote,
        requestBody: { content: { 'application/json': { schema: { $ref: ref } } } },
        responses: {
          '201': { description: 'Запись создана' },
          '403': { description: 'Недостаточно прав' },
        },
      },
    }

    paths[`/api/${collection.slug}/{id}`] = {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        {
          name: 'depth',
          in: 'query',
          required: false,
          schema: { type: 'integer', default: 1 },
        },
      ],
      get: {
        tags: [name],
        summary: `Запись: ${singular}`,
        description: accessNote,
        responses: {
          '200': { description: 'Запись', content: { 'application/json': { schema: { $ref: ref } } } },
          '403': { description: 'Недостаточно прав' },
          '404': { description: 'Не найдено' },
        },
      },
      patch: {
        tags: [name],
        summary: `Изменить: ${singular}`,
        requestBody: { content: { 'application/json': { schema: { $ref: ref } } } },
        responses: { '200': { description: 'Изменено' }, '403': { description: 'Недостаточно прав' } },
      },
      delete: {
        tags: [name],
        summary: `Удалить: ${singular}`,
        responses: { '200': { description: 'Удалено' }, '403': { description: 'Недостаточно прав' } },
      },
    }
  }

  /*
   * Вход описан отдельно: без него спецификация показывает двери,
   * но не говорит, где взять ключ. Именно на этом обычно и застревают,
   * пробуя API впервые.
   */
  paths['/api/users/login'] = {
    post: {
      tags: [`Доступ${SECTION_SEP}Вход`],
      summary: 'Войти и получить токен',
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: { email: { type: 'string' }, password: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Токен и данные пользователя',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  token: { type: 'string' },
                  exp: { type: 'integer' },
                  user: { $ref: '#/components/schemas/users' },
                },
              },
            },
          },
        },
        '401': { description: 'Неверная пара e-mail и пароль' },
      },
    },
  }

  paths['/api/users/me'] = {
    get: {
      tags: [`Доступ${SECTION_SEP}Вход`],
      summary: 'Кто я',
      responses: { '200': { description: 'Текущий пользователь или null' } },
    },
  }


  /* ---------------------------------------------------------------- *
   *  Обмен по стандарту ICAR ADE                                     *
   * ---------------------------------------------------------------- */

  /*
   * Описание интерфейса обмена стояло в стороне от описания API,
   * и это было не разделением, а пропажей: интегратор, открывший
   * `/api-docs`, узнавал про наши собственные ручки и не узнавал,
   * что есть стандартный интерфейс, ради которого ему не пришлось бы
   * изучать наши.
   *
   * Пути описаны шаблоном, а не по одному на коллекцию: их одиннадцать,
   * и одиннадцать почти одинаковых страниц в описании читаются хуже,
   * чем одна с перечнем имён. Это же и честнее по сути — в спецификации
   * ADE адрес именно шаблонный.
   */
  const adeTag = `Обмен${SECTION_SEP}ICAR ADE`

  paths['/ade/v1/locations'] = {
    get: {
      tags: [adeTag],
      summary: 'Локации, доступные вошедшему',
      description:
        'Локация в ADE — это хозяйство. Список зависит от того, кто спрашивает: ' +
        'хозяйство видит своё, сотрудник Ассоциации — все.',
      responses: { '200': { description: 'Коллекция icarLocationResource' } },
    },
  }

  paths['/ade/v1/locations/{scheme}/{id}/{collection}'] = {
    get: {
      tags: [adeTag],
      summary: 'Отдать коллекцию ADE',
      description:
        'Адрес задан спецификацией: локация парой «схема + идентификатор», ' +
        'дальше имя коллекции. Отдаются: ' +
        ADE_COLLECTIONS.join(', ') +
        '. Ответ — icarResourceCollection с `view` и `member`. ' +
        'Локация в адресе говорит, о каком хозяйстве спрашивают; право ответить ' +
        'берётся из того, кто спрашивает, — свести эти два вопроса в один значило ' +
        'бы открыть чужое стадо подстановкой номера.',
      parameters: [
        {
          name: 'scheme',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Схема идентификатора локации.',
        },
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Идентификатор локации в этой схеме.',
        },
        {
          name: 'collection',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: [...ADE_COLLECTIONS] },
          description: 'Имя коллекции ADE.',
        },
        {
          name: 'meta-modified-from',
          in: 'query',
          required: false,
          schema: { type: 'string', format: 'date-time' },
          description: 'Отдать только изменённое с этого момента.',
        },
      ],
      responses: {
        '200': { description: 'Коллекция ресурсов ADE' },
        '401': { description: 'icarErrorResource: нужна авторизация' },
        '404': { description: 'icarErrorResource: локация не найдена или недоступна' },
      },
    },
    post: {
      tags: [adeTag],
      summary: 'Принять события',
      description:
        'Принимаются: ' +
        ADE_WRITABLE.join(', ') +
        '. Тело — один ресурс или массив ресурсов. ' +
        '`meta.source` и `meta.sourceId` обязательны: по этой паре повторная ' +
        'отправка узнаётся как та же запись, а не создаёт вторую. ' +
        'Остальные коллекции отвечают 405 с объяснением: запись животного ' +
        'и переход прав — утверждения, за которые отвечает Ассоциация, ' +
        'и они идут заявкой с проверкой.',
      requestBody: {
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      responses: {
        '200': { description: 'Обновлено, либо icarBatchResult для пакета' },
        '201': { description: 'Создано' },
        '400': { description: 'icarErrorResource: тело не разобралось' },
        '405': { description: 'icarErrorResource: коллекция только на чтение' },
        '422': { description: 'icarErrorResource: животное не найдено в этой локации' },
      },
    },
  }

  paths['/ade/v1/batches/locations/{scheme}/{id}/{collection}'] = {
    post: {
      tags: [adeTag],
      summary: 'Принять пакет событий',
      description:
        'Пакетный адрес стандарта. Тело обязано быть массивом ресурсов; одиночная ' +
        'запись отправляется на /ade/v1/locations/{scheme}/{id}/{collection}. ' +
        'Ответ — icarBatchResult с разбором по элементам, и всегда 200: код ответа ' +
        'относится к обработке пакета, а не к его содержимому. ' +
        'Принимаются: ' +
        ADE_WRITABLE.join(', ') +
        '.',
      parameters: [
        { name: 'scheme', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        {
          name: 'collection',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: [...ADE_WRITABLE] },
        },
      ],
      requestBody: {
        content: {
          'application/json': { schema: { type: 'array', items: { type: 'object' } } },
        },
      },
      responses: {
        '200': { description: 'icarBatchResult: построчный разбор пакета' },
        '400': { description: 'icarErrorResource: тело не массив или пакет пуст' },
        '405': { description: 'icarErrorResource: коллекция только на чтение' },
      },
    },
  }

  /*
   * Разделы идут в объявленном порядке, коллекции внутри раздела — в том,
   * в каком они перечислены у него: это порядок по существу, а не
   * по алфавиту. У «Стада» первыми стоят животные, а не стада, потому что
   * приходят за животными.
   *
   * Ручки входа приписаны к «Доступу» и стоят в его начале: с них
   * начинается работа с API, и искать их в конце списка из сорока имён —
   * ровно та беда, ради которой заводились разделы.
   */
  /**
   * Вход стоит внутри своего раздела, а не в конце списка.
   *
   * Он приписывался последним — и «Доступ» встречался в порядке дважды:
   * в середине, среди своих коллекций, и снова в самом хвосте. Swagger UI
   * рисует разделы в порядке этого списка, так что раздел разрывался
   * пополам, а между половинами лежали журналы и справочники.
   *
   * Нашла это `check:openapi` правилом «ручки одного раздела идут
   * подряд». Заметить глазами было почти нечем: список из сорока имён,
   * и разрыв виден только если помнить, что «Доступ» уже был.
   */
  const orderedTags = [
    ...SECTIONS.flatMap((section) => [
      ...(section.slugs as readonly string[])
        .map((slug) => tags.find((t) => t.slug === slug))
        .filter((t): t is (typeof tags)[number] => Boolean(t))
        .map((t) => ({ name: t.name, ...(t.description ? { description: t.description } : {}) })),
      ...(section.key === 'Доступ'
        ? [{ name: `Доступ${SECTION_SEP}Вход`, description: 'Получить токен и узнать, кто вы.' }]
        : []),
      /*
       * У обмена нет коллекций Payload, и объявить его тег больше негде:
       * `orderedTags` собирается из `slugs`, а их у раздела нет. Без этой
       * строки тег встречался бы у ручек, но не был бы объявлен — Swagger
       * UI вывел бы его в конец, ниже всех объявленных, и «Обмен» оказался
       * бы не на своём месте. Ловит это `check:openapi`.
       */
      ...(section.key === 'Обмен'
        ? [
            {
              name: `Обмен${SECTION_SEP}ICAR ADE`,
              description:
                'Location-centric API стандарта ICAR ADE 1.5. Отдача — все коллекции, ' +
                'приём — события у уже записанных животных.',
            },
          ]
        : []),
    ]),
    /*
     * Коллекции, для которых раздел не назван. В исправном описании этого
     * списка нет вовсе; если он появился, значит завели коллекцию и забыли
     * про `SECTIONS` — об этом скажет `check:openapi`.
     */
    ...tags
      .filter((t) => sectionOf(t.slug) === 'Прочее')
      .map((t) => ({ name: t.name, ...(t.description ? { description: t.description } : {}) })),
  ]

  const sectionList = SECTIONS.filter((s) => s.key !== 'Прочее')
    .map((s) => `- **${s.key}** — ${s.description}`)
    .join('\n')

  return {
    openapi: '3.1.0',
    info: {
      title: 'Племенная книга — REST API',
      version: '1.0.0',
      description:
        'Описание собрано из тех же коллекций, из которых построен сам API, ' +
        'и обновляется вместе с ними — расходиться им негде.\n\n' +
        '**Как войти.** POST /api/users/login возвращает токен. Дальше его передают ' +
        'заголовком `Authorization: JWT <токен>`. Браузер может пользоваться cookie ' +
        '`payload-token`, которую ставит та же ручка.\n\n' +
        '**Чего здесь нет.** Прав доступа: одна и та же ручка отдаёт разное разным, ' +
        'и это свойство правил, а не схемы. Рядом с REST работает GraphQL ' +
        'на /api/graphql — та же модель, другой способ спрашивать.\n\n' +
        '**Разделы.** Имя каждой группы ручек начинается с раздела — ' +
        '«Стадо · Животные». Разделов в самом формате OpenAPI нет, поэтому ' +
        'они приклеены к именам; порядок ниже — тот же, что на странице.\n\n' +
        sectionList,
    },
    servers: [{ url: serverUrl || '/' }],
    tags: orderedTags,
    paths,
    components: {
      schemas,
      securitySchemes: {
        jwt: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Значение вида «JWT <токен>». Токен выдаёт POST /api/users/login.',
        },
        cookie: { type: 'apiKey', in: 'cookie', name: 'payload-token' },
      },
    },
    security: [{ jwt: [] }, { cookie: [] }],
  }
}
