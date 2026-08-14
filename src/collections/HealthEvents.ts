import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated } from '@/access'

/**
 * События здоровья.
 *
 * ТЗ, п. 1.6: «В "Селэкс" аналога нет — расширение схемы».
 * Нужны, чтобы отличать низкую продуктивность из-за болезни от генетически
 * низкой продуктивности (ТЗ, п. 5.6, требование №3).
 */
export const HealthEvents: CollectionConfig = {
  slug: 'health-events',
  labels: { singular: 'Событие здоровья', plural: 'События здоровья' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['date', 'animal', 'type', 'severity'],
    group: 'Воспроизводство',
  },
  access: {
    read: isAuthenticated,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  indexes: [{ fields: ['animal', 'date'] }],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'animal',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Животное',
          required: true,
          index: true,
        },
        {
          name: 'type',
          type: 'relationship',
          relationTo: 'health-event-types',
          label: 'Тип события',
          required: true,
        },
        { name: 'date', type: 'date', label: 'Дата', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'title', type: 'text', label: 'Краткое описание' },
        {
          name: 'severity',
          type: 'select',
          label: 'Степень тяжести',
          defaultValue: 'moderate',
          options: [
            { value: 'mild', label: 'Лёгкая' },
            { value: 'moderate', label: 'Средняя' },
            { value: 'severe', label: 'Тяжёлая' },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'startDate', type: 'date', label: 'Начало периода' },
        { name: 'endDate', type: 'date', label: 'Окончание периода' },
      ],
    },
    {
      name: 'excludeFromAnalytics',
      type: 'checkbox',
      label: 'Исключать период из расчёта продуктивности',
      defaultValue: false,
    },
    { name: 'description', type: 'textarea', label: 'Описание' },
    {
      name: 'reportedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Кто зарегистрировал',
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user && !data.reportedBy) data.reportedBy = req.user.id
        return data
      },
    ],
  },
}
