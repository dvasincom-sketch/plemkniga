import type { CollectionConfig } from 'payload'
import { ACCESS_SCOPES, toOptions } from '@/lib/dictionaries'
import { accessGrantIssue, accessGrantRead, isAdmin } from '@/access'
import { forgetGrants } from '@/lib/grants'
import { relId } from '@/lib/visibility'

/**
 * Точечный доступ: кому, к чему, какие области, до какого срока.
 *
 * До этой коллекции у видимости была одна степень свободы — два флажка
 * на самом животном, — и одобрение запроса открывало карточку целиком,
 * навсегда и всем. Владельцу предлагалось опубликовать всё стадо ради одного
 * разговора о покупке, и он отказывал. Отказ был не осторожностью:
 * это единственная кнопка, которая не делала лишнего.
 *
 * Грант — средний вариант. Разбор целиком — `docs/tochechnyy-dostup.md`.
 *
 * **Выдаётся организации, а не пользователю.** Просит хозяйство, а смотрит
 * зоотехник; завтра зоотехник уволится, и грант, выданный на его учётную
 * запись, умрёт вместе с ней — хозяйству придётся просить заново, и оно
 * решит, что система сломалась. В журнале просмотров при этом пишется
 * конкретный человек: право у хозяйства, ответственность у того, кто открыл
 * карточку.
 *
 * **Пустое поле `animal` — это «всё стадо».** Отдельная сущность «грант
 * на хозяйство» имела бы почти те же поля и со временем разошлась бы
 * в поведении; разница между двумя случаями выражается одним NULL.
 */
export const AccessGrants: CollectionConfig = {
  slug: 'access-grants',
  labels: { singular: 'Точечный доступ', plural: 'Точечные доступы' },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['owner', 'grantee', 'animal', 'scopes', 'expiresAt', 'revokedAt'],
    group: 'Племенная книга',
  },
  access: {
    read: accessGrantRead,
    create: accessGrantIssue,
    update: accessGrantIssue,
    delete: isAdmin,
  },
  defaultSort: '-createdAt',
  indexes: [
    // Единственный горячий запрос: что открыто этому получателю
    { fields: ['grantee', 'revokedAt'] },
    // Список выданного в кабинете владельца
    { fields: ['owner', 'revokedAt'] },
    // «Этому хозяйству уже открыто это животное?» — перед выдачей второго
    { fields: ['grantee', 'animal'] },
  ],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'owner',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Чьи данные',
          required: true,
          index: true,
          admin: { readOnly: true, description: 'Подставляется по животному или по сессии' },
        },
        {
          name: 'grantee',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Кому открыто',
          required: true,
          index: true,
        },
      ],
    },
    {
      /*
       * Пусто — открыто всё стадо владельца, включая животных, которые
       * появятся позже: условие проверяется по владельцу текущей записи,
       * а не по списку, зафиксированному в момент выдачи. Сервисная
       * организация, которой при появлении новой коровы перестаёт быть видно
       * стадо, бесполезна. В форме выдачи это сказано прямо.
       */
      name: 'animal',
      type: 'relationship',
      relationTo: 'animals',
      label: 'Животное',
      index: true,
      admin: { description: 'Пусто — открыто всё стадо владельца' },
    },
    {
      name: 'scopes',
      type: 'select',
      hasMany: true,
      required: true,
      label: 'Что открыто',
      options: toOptions(ACCESS_SCOPES),
    },
    {
      type: 'row',
      fields: [
        {
          /*
           * Пусто — бессрочно.
           *
           * «До конца сделки» отдельным состоянием не заводим: система
           * не может узнать, что сделка закончилась. Такое состояние было бы
           * видом, будто обязанность отозвать выполняется сама. Вместо него —
           * бессрочный грант плюс напоминание в кабинете, если им давно
           * не пользовались.
           */
          name: 'expiresAt',
          type: 'date',
          label: 'Действует до',
          admin: { description: 'Пусто — бессрочно' },
        },
        {
          name: 'issuedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто выдал',
          admin: { readOnly: true },
        },
      ],
    },
    {
      /*
       * Отзыв — отметка, а не удаление.
       *
       * Через год хозяйство спросит «кому я это открывал», и на удалённый
       * грант будут ссылаться записи журнала просмотров, которые нечем
       * объяснить. Тот же довод, что у отзыва документа (решение №37).
       */
      type: 'row',
      fields: [
        { name: 'revokedAt', type: 'date', label: 'Отозван', index: true },
        {
          name: 'revokedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто отозвал',
          admin: { readOnly: true },
        },
      ],
    },
    {
      name: 'request',
      type: 'relationship',
      relationTo: 'access-requests',
      label: 'Из какого запроса',
      admin: { readOnly: true, description: 'Пусто — выдан по своей воле, без запроса' },
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Заметка для себя',
      admin: { description: 'Зачем выдан — вспомнить через полгода' },
    },
    {
      /*
       * Когда грантом пользовались в последний раз. Копия из журнала
       * просмотров: список выданного показывает её в каждой строке, и ходить
       * за ней в журнал на каждую строку значило бы делать запрос на запрос.
       *
       * Пусто — доступ выдан, но им ни разу не воспользовались. Это тоже
       * сведение, и владельцу оно полезнее прочерка.
       */
      name: 'lastSeenAt',
      type: 'date',
      label: 'Последний просмотр',
      admin: { readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (operation === 'create') {
          const user = req.user as { id: number | string; role?: string; organization?: unknown } | null
          const myOrg = relId(user?.organization)

          /*
           * Владелец подставляется системой и из формы не берётся никогда.
           *
           * Если бы `owner` приходил из запроса, любой вошедший мог бы выдать
           * доступ к чужому стаду от чужого имени — правило `accessGrantIssue`
           * на создании возвращает булево и содержимое полей не проверяет.
           * Здесь единственное место, где это можно поймать.
           */
          const animalId = relId(data.animal)
          let owner: number | null = null

          if (animalId !== null) {
            const animal = await req.payload.findByID({
              collection: 'animals',
              id: animalId,
              depth: 0,
              overrideAccess: true,
              req,
            })
            owner = relId((animal as { owner?: unknown })?.owner)
          } else {
            owner = myOrg
          }

          if (owner === null) {
            throw new Error('Не удалось определить владельца данных: грант не выдан')
          }

          if (user?.role !== 'admin' && owner !== myOrg) {
            throw new Error('Открыть можно только свои данные')
          }

          if (owner === relId(data.grantee)) {
            throw new Error('Выдавать доступ самому себе незачем — свои данные и так видны')
          }

          data.owner = owner
          if (user) data.issuedBy = user.id
          data.revokedAt = null
          data.revokedBy = null
          data.lastSeenAt = null
        }

        /*
         * Область, получатель и охват после создания не меняются — расширение
         * доступа делается новым грантом.
         *
         * Иначе просмотры за прошлый месяц начнут объясняться областями,
         * которых тогда не существовало, и журнал перестанет что-либо
         * доказывать. Тот же довод, что у снимка весов рядом со значением
         * индекса: число, которое нечем объяснить, ничего не стоит.
         */
        if (operation === 'update' && originalDoc) {
          data.owner = originalDoc.owner
          data.grantee = originalDoc.grantee
          data.animal = originalDoc.animal
          data.scopes = originalDoc.scopes
          data.issuedBy = originalDoc.issuedBy
          data.request = originalDoc.request

          if (data.revokedAt && !originalDoc.revokedAt && req.user) {
            data.revokedBy = req.user.id
          }
        }

        return data
      },
    ],
    afterChange: [
      ({ doc }) => {
        // Отзыв должен действовать сразу, а не через срок кэша
        forgetGrants(relId((doc as { grantee?: unknown })?.grantee))
      },
    ],
    afterDelete: [
      ({ doc }) => {
        forgetGrants(relId((doc as { grantee?: unknown })?.grantee))
      },
    ],
  },
}
