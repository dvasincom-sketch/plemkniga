import type { CollectionConfig } from 'payload'
import {
  RECORDING_PROTOCOL,
  RECORDING_SCHEME,
  SAMPLING_MOMENT,
  SAMPLING_SCHEME,
} from '@/lib/milk-recording'
import { isAdmin, isAuthenticated, animalScopedReadFor, animalScopedMutate } from '@/access'
import { requireOwnAnimal, stampOwnerOrg } from '@/access/guards'
import { ownerOrgField, adeOriginField } from '@/collections/shared'

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
    update: animalScopedMutate,
    delete: isAdmin,
  },
  indexes: [{ fields: ['animal', 'date'] }],
  fields: [
    ownerOrgField,
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
    {
      /*
       * Метод контроля продуктивности — по перечислениям ICAR.
       *
       * Разбор, зачем это и почему не одно поле «A4», — в
       * `lib/milk-recording.ts`. Коротко: буква и цифра стоят за тремя
       * независимыми обстоятельствами, и склеенные в строку они
       * не проверяются и не уезжают в обмен.
       *
       * Все поля необязательны, и это осознанно. Записи, внесённые
       * до появления полей, останутся без метода — подставить им
       * «официальный контроль» задним числом значило бы объявить
       * подтверждённым то, чего никто не подтверждал.
       */
      type: 'collapsible',
      label: 'Метод контроля продуктивности',
      admin: {
        initCollapsed: true,
        description:
          'Определяет сопоставимость лактаций: контроль службы учёта и контроль хозяина — ' +
          'числа разной ценности, и складывать их в один рейтинг нельзя',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'recordingProtocol',
              type: 'select',
              label: 'Кто снимал показания',
              options: Object.entries(RECORDING_PROTOCOL).map(([value, v]) => ({
                value,
                label: `${v.letter} — ${v.label}`,
              })),
              admin: { description: 'Буква привычного обозначения: A4, B4' },
            },
            {
              name: 'recordingPerYear',
              type: 'number',
              label: 'Контролей в год',
              min: 1,
              max: 24,
              admin: {
                /*
                 * Не путать с цифрой в обозначении. В «A4» стоит интервал
                 * между контролями в неделях, а здесь — число контролей
                 * в год, из которого этот интервал считается
                 * (`lib/milk-recording.ts`). Двенадцать контролей в год
                 * дают «A4», шесть — «A9».
                 */
                description: 'Число контролей в год: 12 — ежемесячно, 4 — раз в квартал',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'recordingScheme',
              type: 'select',
              label: 'Какие доения вошли',
              options: Object.entries(RECORDING_SCHEME).map(([value, v]) => ({
                value,
                label: v.label,
              })),
            },
            {
              name: 'samplingMoment',
              type: 'select',
              label: 'Момент отбора пробы',
              options: Object.entries(SAMPLING_MOMENT).map(([value, v]) => ({
                value,
                label: v.label,
              })),
            },
          ],
        },
        {
          name: 'samplingScheme',
          type: 'select',
          label: 'Схема отбора пробы',
          options: Object.entries(SAMPLING_SCHEME).map(([value, v]) => ({
            value,
            label: v.label,
          })),
        },
      ],
    },
    adeOriginField,
  ],
  hooks: {
    beforeChange: [requireOwnAnimal, stampOwnerOrg],
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
