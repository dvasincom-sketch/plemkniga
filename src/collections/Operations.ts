import type { Access, CollectionConfig, Where } from 'payload'
import { isAdmin, isAssociation } from '@/access'
import { OPERATIONS } from '@/lib/operations'
import { relId } from '@/lib/visibility'

type U = { id: number | string; organization?: unknown }

/**
 * Сводный журнал операций.
 *
 * ## Почему записать в него нельзя ничем, кроме служебного вызова
 *
 * Журнал, в который можно вписаться снаружи, ничего не свидетельствует.
 * Тот же довод уже стоял за журналом правок и журналом просмотров;
 * здесь он весомее всего, потому что именно сюда придут смотреть,
 * когда что-то пойдёт не так. Поэтому `create`, `update` и `delete`
 * закрыты для всех, включая Ассоциацию: строки появляются только
 * через `recordOperation` с `overrideAccess`.
 *
 * ## Что видит хозяйство
 *
 * Свои операции — то есть те, что касаются его данных, и те, что
 * совершили его люди. Второе не то же самое, что первое: сотрудник,
 * открывший чужую карточку по выданному ему доступу, действовал
 * не над данными своего хозяйства, но отвечает за это его хозяйство.
 */

const operationsRead: Access = ({ req: { user } }) => {
  if (isAssociation(user)) return true
  const u = user as U | null
  if (!u) return false

  const org = relId(u.organization)
  const variants: Where[] = [{ actor: { equals: u.id } }]
  if (org) variants.push({ organization: { equals: org } })

  return variants.length === 1 ? variants[0]! : { or: variants }
}

export const Operations: CollectionConfig = {
  slug: 'operations',
  labels: { singular: 'Операция', plural: 'Журнал операций' },
  admin: {
    useAsTitle: 'summary',
    defaultColumns: ['at', 'action', 'actorName', 'organization', 'subject'],
    group: 'Доступ',
  },
  access: {
    read: operationsRead,
    create: () => false,
    update: () => false,
    /*
     * Удаление оставлено администратору и только ему — не ради удобства,
     * а ради обязанности удалять персональные данные по требованию.
     * Обычной работы с журналом это не касается: строки не «убирают
     * лишнее», их не убирают вовсе.
     */
    delete: isAdmin,
  },
  defaultSort: '-at',
  indexes: [{ fields: ['organization', 'at'] }, { fields: ['action', 'at'] }],
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'at', type: 'date', label: 'Когда', required: true, index: true },
        {
          name: 'action',
          type: 'select',
          label: 'Действие',
          required: true,
          index: true,
          options: OPERATIONS.map((o) => ({ value: o.value, label: o.label })),
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'actor',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто',
          index: true,
          admin: { description: 'Пусто — действие системы: срок хранения, пересчёт' },
        },
        {
          /*
           * Снимок имени рядом со связью. Через год человек уволится,
           * а прочитать журнал всё равно должно быть можно: связь отвечает
           * на вопрос «кто это в системе сейчас», снимок — «как его звали
           * тогда».
           */
          name: 'actorName',
          type: 'text',
          label: 'Кто (на тот момент)',
        },
      ],
    },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Чьи данные',
      index: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'subjectType',
          type: 'select',
          label: 'Предмет',
          defaultValue: 'none',
          options: [
            { value: 'animal', label: 'Животное' },
            { value: 'user', label: 'Пользователь' },
            { value: 'organization', label: 'Хозяйство' },
            { value: 'document', label: 'Документ' },
            { value: 'share', label: 'Ссылка' },
            { value: 'submission', label: 'Пакет данных' },
            { value: 'verification', label: 'Заявка на верификацию' },
            { value: 'movement', label: 'Перемещение' },
            { value: 'none', label: '—' },
          ],
        },
        {
          /*
           * Идентификатор предмета — числом, а не связью.
           *
           * Связь пришлось бы объявлять сразу к девяти коллекциям,
           * и Payload завёл бы под неё отдельную таблицу с девятью
           * колонками — на журнале, который растёт быстрее всех
           * остальных таблиц вместе взятых. Дороже всего же другое:
           * внешний ключ означает `ON DELETE`, и удаление животного
           * тянуло бы за собой строки журнала о нём. Журнал обязан
           * пережить предмет — иначе он не ответит на вопрос
           * «а что было с этой записью».
           */
          name: 'subjectId',
          type: 'number',
          label: 'Идентификатор предмета',
        },
        { name: 'subject', type: 'text', label: 'Предмет (как читается)' },
      ],
    },
    { name: 'summary', type: 'text', label: 'Что произошло' },
    {
      name: 'ip',
      type: 'text',
      label: 'Адрес запроса',
      admin: {
        position: 'sidebar',
        description: 'Заголовок прокси. Подсказка при разборе, а не доказательство',
      },
    },
  ],
}
