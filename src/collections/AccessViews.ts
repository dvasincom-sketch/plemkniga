import type { CollectionConfig } from 'payload'
import { ACCESS_SCOPES, toOptions } from '@/lib/dictionaries'
import { accessViewRead, isAdmin } from '@/access'

/**
 * Журнал просмотров: кто и когда смотрел открытое грантом.
 *
 * Без журнала точечный доступ не заработает социально. Хозяйство должно
 * видеть, что выданным доступом пользуются по назначению, — иначе оно
 * перестанет его выдавать, и весь механизм останется незаселённым.
 * Это не контроль ради контроля: это то, что делает возможной вторую выдачу.
 *
 * **Пишется только то, что открыл грант.** Обращение попадает сюда, если
 * человек увидел то, что без гранта было бы закрыто. Просмотры публичных
 * карточек не пишутся: там нечего контролировать, а таблица на 280 тысяч
 * животных и всех посетителей книги стала бы самой большой в системе
 * и самой бесполезной.
 *
 * **Записи не создаются через API.** Их пишет серверный код после отдачи
 * страницы, в обход правил доступа. Журнал, который можно пополнить или
 * поправить снаружи, ничего не доказывает — тот же довод, что у журнала
 * правок (`animal-revisions`).
 */
export const AccessViews: CollectionConfig = {
  slug: 'access-views',
  labels: { singular: 'Просмотр по доступу', plural: 'Журнал просмотров' },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['at', 'animal', 'viewerOrg', 'viewer', 'scopes'],
    group: 'Племенная книга',
  },
  access: {
    read: accessViewRead,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  defaultSort: '-at',
  indexes: [
    // Журнал хозяйства: «кто смотрел мои данные», сверху свежее
    { fields: ['owner', 'at'] },
    // Врезка на странице конкретного гранта
    { fields: ['grant', 'at'] },
    // Гашение дребезга: было ли это же обращение только что
    { fields: ['grant', 'animal', 'viewer', 'at'] },
  ],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'grant',
          type: 'relationship',
          relationTo: 'access-grants',
          label: 'По какому доступу',
          required: true,
          index: true,
        },
        {
          name: 'animal',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Животное',
          required: true,
          index: true,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'viewer',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто смотрел',
        },
        {
          name: 'viewerOrg',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Организация смотревшего',
          index: true,
        },
        {
          /*
           * Владелец данных — копия ради чтения журнала без join.
           *
           * Хозяйство открывает свой журнал условием `owner = моя организация`.
           * Без копии это условие пришлось бы ставить на связь через грант
           * (`grant.owner`), а Payload превращает такое в `left join` — то,
           * от чего весь механизм грантов и уходит. Тот же приём, что у копий
           * полей животного в строке значения индекса (решение №22).
           */
          name: 'owner',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Чьи данные (копия)',
          required: true,
          index: true,
          admin: { readOnly: true },
        },
      ],
    },
    {
      name: 'scopes',
      type: 'select',
      hasMany: true,
      label: 'Что было показано',
      options: toOptions(ACCESS_SCOPES),
    },
    {
      /*
       * Своё время, а не `createdAt`.
       *
       * Строка обновляется при повторном заходе в пределах окна гашения:
       * переключение вкладок карточки — это один взгляд на одно животное,
       * а не четыре обращения. `createdAt` при этом остался бы временем
       * первого захода, и «последний просмотр» врал бы.
       */
      name: 'at',
      type: 'date',
      label: 'Когда',
      required: true,
      index: true,
    },
  ],
}
