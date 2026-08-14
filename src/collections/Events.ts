import type { CollectionConfig } from 'payload'
import { EVENT_TYPES, toOptions } from '@/lib/dictionaries'
import { isAdmin, isAuthenticated } from '@/access'

export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Событие', plural: 'События' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['date', 'type', 'animal', 'author'],
    group: 'Племенная книга',
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Тип события',
          required: true,
          options: toOptions(EVENT_TYPES),
        },
        { name: 'date', type: 'date', label: 'Дата', required: true },
      ],
    },
    {
      name: 'animal',
      type: 'relationship',
      relationTo: 'animals',
      label: 'Животное',
      required: true,
      index: true,
    },
    { name: 'title', type: 'text', label: 'Краткое описание' },
    { name: 'value', type: 'number', label: 'Числовое значение' },
    { name: 'comment', type: 'textarea', label: 'Комментарий' },
    {
      name: 'status',
      type: 'select',
      label: 'Статус обработки',
      defaultValue: 'accepted',
      options: [
        { value: 'draft', label: 'Черновик' },
        { value: 'sent', label: 'Отправлено' },
        { value: 'accepted', label: 'Принято' },
        { value: 'rejected', label: 'Отклонено' },
      ],
    },
    { name: 'author', type: 'relationship', relationTo: 'users', label: 'Автор' },
  ],
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user && !data.author) data.author = req.user.id
        return data
      },
    ],
  },
}
