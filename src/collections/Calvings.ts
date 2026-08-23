import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, animalScopedReadFor, animalScopedMutate } from '@/access'
import { requireOwnAnimal } from '@/access/guards'

/** Результат отёла — колонка «Результат» в таблице межотельного цикла. */
export const CALVING_RESULTS = [
  { value: 'heifer', label: 'Тёлка' },
  { value: 'bull', label: 'Бычок' },
  { value: 'twins', label: 'Двойня' },
  { value: 'stillborn', label: 'Мертворождение' },
  { value: 'abortion', label: 'Аборт' },
] as const

/**
 * Лёгкость отёла.
 *
 * Вынесено из поля наружу по той же причине, что и результат: этот список
 * читает не только форма, но и разбор загружаемого файла. Пока он лежал
 * внутри поля, описание допустимых кодов в формате импорта было переписано
 * от руки — и разошлось со справочником в первый же раз.
 */
export const CALVING_EASE = [
  { value: 'easy', label: 'Лёгкий' },
  { value: 'assisted', label: 'С помощью' },
  { value: 'hard', label: 'Тяжёлый' },
] as const

/**
 * Отёлы — «Таблица межотельного цикла».
 *
 * ТЗ, п. 5.2: каждое событие воспроизводства привязано к уникальному номеру
 * отёла (`ld_cow_n_otel`), что даёт непрерывную хронологию: осеменение →
 * стельность → отёл → лактация → запуск.
 */
export const Calvings: CollectionConfig = {
  slug: 'calvings',
  labels: { singular: 'Отёл', plural: 'Отёлы' },
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'animal', 'number', 'result'],
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
  hooks: { beforeChange: [requireOwnAnimal] },
  indexes: [{ fields: ['animal', 'number'] }],
  defaultSort: 'number',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'animal',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Корова',
          required: true,
          index: true,
          filterOptions: { sex: { equals: 'female' } },
        },
        { name: 'number', type: 'number', label: 'Номер отёла', required: true },
        { name: 'date', type: 'date', label: 'Дата отёла', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'result',
          type: 'select',
          label: 'Результат',
          options: [...CALVING_RESULTS],
        },
        { name: 'milkingDays', type: 'number', label: 'Количество дойных дней' },
        { name: 'dryOffDate', type: 'date', label: 'Дата запуска' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'ease',
          type: 'select',
          label: 'Лёгкость отёла',
          options: [...CALVING_EASE],
        },
        { name: 'calfWeight', type: 'number', label: 'Вес телёнка, кг' },
      ],
    },
    {
      name: 'calves',
      type: 'relationship',
      relationTo: 'animals',
      hasMany: true,
      label: 'Полученный приплод',
    },
    { name: 'comment', type: 'textarea', label: 'Комментарий' },
  ],
}
