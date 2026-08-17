import type { CollectionConfig } from 'payload'
import { DOCUMENT_TYPES, toOptions } from '@/lib/dictionaries'
import { isAdmin, isAuthenticated, documentRead } from '@/access'

export const Documents: CollectionConfig = {
  slug: 'documents',
  labels: { singular: 'Документ', plural: 'Документы' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'animal', 'issuedAt'],
    group: 'Племенная книга',
  },
  access: {
    read: documentRead,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  fields: [
    { name: 'title', type: 'text', label: 'Название', required: true },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Тип документа',
          options: toOptions(DOCUMENT_TYPES),
          defaultValue: 'pedigreeCertificate',
        },
        { name: 'number', type: 'text', label: 'Номер' },
        { name: 'issuedAt', type: 'date', label: 'Дата выдачи' },
      ],
    },
    { name: 'animal', type: 'relationship', relationTo: 'animals', label: 'Животное' },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Организация',
    },
    { name: 'file', type: 'upload', relationTo: 'media', label: 'Файл' },
    {
      /*
       * Кто выдал документ.
       *
       * Пустое поле — не пробел, а осмысленное состояние: так выглядят
       * бумаги, которые хозяйство загрузило само (ветеринарная справка,
       * договор). Заполненное означает, что документ выпустила Ассоциация,
       * и вот тогда вопрос «кто именно» рано или поздно задают — свидетельство
       * юридически значимо.
       */
      name: 'issuedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Кто выдал',
      index: true,
    },
    {
      /*
       * Отзыв документа.
       *
       * Выданное свидетельство не удаляют: оно существовало, на него
       * ссылались, по нему продавали. Удалить строку — переписать прошлое;
       * отозвать — сказать правду о настоящем. Поэтому отзыв это отметка,
       * а не удаление, и он требует причины.
       */
      name: 'revoked',
      type: 'group',
      label: 'Отзыв',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'at', type: 'date', label: 'Когда отозван', index: true },
            { name: 'by', type: 'relationship', relationTo: 'users', label: 'Кто отозвал' },
          ],
        },
        { name: 'reason', type: 'textarea', label: 'Причина отзыва' },
      ],
    },
  ],
}
