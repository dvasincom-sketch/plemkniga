import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, animalScopedReadFor } from '@/access'

/**
 * Контрольные дойки.
 *
 * ТЗ, п. 1.6: рассматриваются два варианта хранения — агрегация в поля лактации
 * (как в «Селэкс») либо отдельная таблица. ТЗ явно выбирает второй вариант —
 * «для точности и прослеживаемости». Состав полей — Таблица №6 (п. 7.1).
 */
export const MilkTests: CollectionConfig = {
  slug: 'milk-tests',
  labels: { singular: 'Контрольная дойка', plural: 'Контрольные дойки' },
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'animal', 'dailyYield', 'fatPercent', 'proteinPercent'],
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
        { name: 'date', type: 'date', label: 'Дата замера', required: true },
        {
          name: 'lactationNumber',
          type: 'number',
          label: 'Номер лактации',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'dailyYield', type: 'number', label: 'Удой за день, кг', required: true },
        { name: 'fatPercent', type: 'number', label: 'Жир, %' },
        { name: 'proteinPercent', type: 'number', label: 'Белок, %' },
        { name: 'somaticCells', type: 'number', label: 'Соматические клетки, тыс./мл' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'laboratory',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Лаборатория',
        },
        {
          name: 'source',
          type: 'select',
          label: 'Источник данных',
          defaultValue: 'lab',
          options: [
            { value: 'lab', label: 'Лаборатория' },
            { value: 'owner', label: 'Собственник' },
            { value: 'import', label: 'Импорт файла' },
            { value: 'api', label: 'API' },
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        // ТЗ, Таблица №6: test_date не может быть будущей датой
        if (data?.date && new Date(data.date).getTime() > Date.now()) {
          throw new Error('Дата контрольной дойки не может быть в будущем')
        }
        return data
      },
    ],
  },
}
