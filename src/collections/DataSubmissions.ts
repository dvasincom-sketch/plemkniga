import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated } from '@/access'

export const SUBMISSION_STATUSES = [
  { value: 'uploaded', label: 'Загружено' },
  { value: 'checking', label: 'На проверке' },
  { value: 'checked', label: 'Проверено сотрудниками Ассоциации' },
  { value: 'accepted', label: 'Данные приняты и опубликованы' },
  { value: 'rejected', label: 'Отклонено' },
] as const

export const SUBMISSION_KINDS = [
  { value: 'events', label: 'Обновление событий животных' },
  { value: 'animals', label: 'Добавление животных' },
  { value: 'productivity', label: 'Загрузка контрольных доек' },
  { value: 'genomics', label: 'Загрузка результатов генотипирования' },
] as const

/**
 * Пакет загрузки данных — единица работы раздела «События» в личном кабинете.
 *
 * ТЗ, п. 1.6 «Система обновления данных»: по каждому импорту формируется
 * протокол (сколько записей принято, сколько с ошибками, ссылка на файл
 * ошибок), а смена статуса достоверности фиксируется в журнале с указанием,
 * кто и когда утвердил.
 */
export const DataSubmissions: CollectionConfig = {
  slug: 'data-submissions',
  labels: { singular: 'Пакет данных', plural: 'Пакеты загрузки данных' },
  admin: {
    useAsTitle: 'number',
    defaultColumns: ['number', 'kind', 'status', 'organization', 'submittedAt'],
    group: 'Племенная книга',
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  defaultSort: '-submittedAt',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'number',
          type: 'text',
          label: 'Номер пакета',
          unique: true,
          index: true,
          admin: { readOnly: true, description: 'Присваивается автоматически' },
        },
        {
          name: 'kind',
          type: 'select',
          label: 'Тип загрузки',
          required: true,
          defaultValue: 'events',
          options: [...SUBMISSION_KINDS],
        },
        {
          name: 'status',
          type: 'select',
          label: 'Статус',
          required: true,
          defaultValue: 'uploaded',
          options: [...SUBMISSION_STATUSES],
          index: true,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'organization',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Организация',
          index: true,
        },
        {
          name: 'submittedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто загрузил',
        },
        { name: 'submittedAt', type: 'date', label: 'Дата загрузки' },
      ],
    },
    {
      name: 'sourceFile',
      type: 'upload',
      relationTo: 'media',
      label: 'Исходный файл',
    },

    {
      name: 'review',
      type: 'group',
      label: 'Результат проверки',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'checkedBy',
              type: 'relationship',
              relationTo: 'users',
              label: 'Проверил',
            },
            { name: 'checkedAt', type: 'date', label: 'Дата и время проверки' },
          ],
        },
        {
          name: 'comment',
          type: 'textarea',
          label: 'Комментарий',
          admin: {
            description:
              'Например: «Все данные прошли успешную проверку» или «Часть данных не прошла проверку»',
          },
        },
        {
          type: 'row',
          fields: [
            { name: 'totalRows', type: 'number', label: 'Всего записей' },
            { name: 'acceptedRows', type: 'number', label: 'Принято' },
            { name: 'rejectedRows', type: 'number', label: 'С ошибками' },
          ],
        },
        {
          name: 'errorProtocol',
          type: 'upload',
          relationTo: 'media',
          label: 'Протокол ошибок',
          admin: { description: 'XLSX-файл со списком строк, не прошедших проверку' },
        },
      ],
    },

    {
      name: 'consent',
      type: 'group',
      label: 'Согласие владельца',
      fields: [
        {
          name: 'agreed',
          type: 'checkbox',
          label: 'Владелец согласен с результатом и разрешает публикацию данных',
          defaultValue: false,
        },
        { name: 'agreedAt', type: 'date', label: 'Дата согласия' },
        { name: 'publishedAt', type: 'date', label: 'Дата публикации данных' },
      ],
    },

    {
      name: 'history',
      type: 'array',
      label: 'История статусов',
      labels: { singular: 'Запись', plural: 'История' },
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'at', type: 'date', label: 'Когда' },
            {
              name: 'status',
              type: 'select',
              label: 'Статус',
              options: [...SUBMISSION_STATUSES],
            },
            { name: 'actor', type: 'relationship', relationTo: 'users', label: 'Кто' },
          ],
        },
        { name: 'note', type: 'text', label: 'Примечание' },
      ],
    },
  ],

  hooks: {
    beforeChange: [
      ({ data, req, operation, originalDoc }) => {
        if (operation === 'create') {
          if (!data.number) {
            data.number = String(100000 + Math.floor(Math.random() * 899999))
          }
          if (!data.submittedAt) data.submittedAt = new Date().toISOString()
          if (req.user && !data.submittedBy) data.submittedBy = req.user.id
        }

        // Журнал статусов: фиксируем каждый переход (ТЗ, п. 1.6).
        // При создании историю можно передать явно — тогда не перетираем её.
        const prev = originalDoc?.status
        const historyProvided = Array.isArray(data.history) && data.history.length > 0
        if (data.status && data.status !== prev && !(operation === 'create' && historyProvided)) {
          data.history = [
            ...(originalDoc?.history ?? []),
            {
              at: new Date().toISOString(),
              status: data.status,
              actor: req.user?.id ?? null,
            },
          ]
        }
        return data
      },
    ],
  },
}
