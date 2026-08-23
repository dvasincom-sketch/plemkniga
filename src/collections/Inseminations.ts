import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, animalScopedReadFor, animalScopedMutate } from '@/access'
import { requireOwnAnimal, stampOwnerOrg } from '@/access/guards'
import { ownerOrgField } from '@/collections/shared'

/**
 * Осеменения — отдельная сущность.
 *
 * ТЗ, п. 5.2 «Учет воспроизводственного цикла» и Приложение №1 п. 1.1.3:
 * запись создаётся на каждый факт случки/ИО, привязывается к номеру отёла
 * (составной ключ id_cow + ld_cow_n_otel), что позволяет строить непрерывную
 * хронологию воспроизводства: осеменение → тест на стельность → запуск →
 * отёл (или аборт) → лактация.
 */
export const Inseminations: CollectionConfig = {
  slug: 'inseminations',
  labels: { singular: 'Осеменение', plural: 'Осеменения' },
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'animal', 'bull', 'result'],
    group: 'Воспроизводство',
  },
  access: {
    /*
     * Видимость наследуется от животного, а не «любой вошедший».
     * Надой, отёл и лечение чужой закрытой коровы — такие же её данные,
     * как и карточка: показывать их соседям система не должна.
     * Разбор — docs/dostup-i-vidimost.md.
     */
    read: animalScopedReadFor('production'),
    create: isAuthenticated,
    update: animalScopedMutate,
    delete: isAdmin,
  },
  indexes: [{ fields: ['animal', 'lactationNumber'] }],
  fields: [
    ownerOrgField,
    {
      type: 'row',
      fields: [
        {
          name: 'animal',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Корова / тёлка',
          required: true,
          index: true,
          filterOptions: { sex: { equals: 'female' } },
        },
        {
          name: 'lactationNumber',
          type: 'number',
          label: 'Номер отёла (ld_cow_n_otel)',
          admin: { description: 'К какому отёлу относится осеменение' },
        },
        { name: 'date', type: 'date', label: 'Дата осеменения', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'bull',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Бык-производитель',
          filterOptions: { sex: { equals: 'male' } },
        },
        {
          name: 'semenType',
          type: 'relationship',
          relationTo: 'semen-types',
          label: 'Тип биоматериала',
        },
        {
          name: 'method',
          type: 'relationship',
          relationTo: 'reproduction-methods',
          label: 'Метод воспроизводства',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'doses', type: 'number', label: 'Доз семени', defaultValue: 1 },
        { name: 'attemptNumber', type: 'number', label: 'Кратность осеменения' },
        {
          name: 'technician',
          type: 'relationship',
          relationTo: 'technicians',
          label: 'Техник-осеменатор',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'result',
          type: 'relationship',
          relationTo: 'insemination-results',
          label: 'Результат',
        },
        { name: 'pregnancyCheckDate', type: 'date', label: 'Дата теста на стельность' },
      ],
    },
    { name: 'comment', type: 'textarea', label: 'Комментарий' },
    {
      name: 'source',
      type: 'select',
      label: 'Источник данных',
      defaultValue: 'manual',
      options: [
        { value: 'manual', label: 'Ручной ввод' },
        { value: 'import', label: 'Импорт файла' },
        { value: 'api', label: 'API / вебхук' },
      ],
    },
  ],
  hooks: {
    beforeChange: [requireOwnAnimal, stampOwnerOrg],
    beforeValidate: [
      ({ data }) => {
        // Логическая проверка: дата осеменения не может быть в будущем (ТЗ, п. 1.6)
        if (data?.date && new Date(data.date).getTime() > Date.now()) {
          throw new Error('Дата осеменения не может быть в будущем')
        }
        return data
      },
    ],
  },
}
