import type { CollectionConfig } from 'payload'
import { EVENT_TYPES, RETIRED_EVENT_TYPES, toOptions } from '@/lib/dictionaries'
import { isAdmin, isAuthenticated, animalScopedReadFor, animalScopedMutate } from '@/access'
import { requireOwnAnimal, stampOwnerOrg } from '@/access/guards'
import { ownerOrgField } from '@/collections/shared'

export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Событие', plural: 'События' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['date', 'type', 'animal', 'author'],
    group: 'Племенная книга',
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
  fields: [
    ownerOrgField,
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Тип события',
          required: true,
          /*
             Выведенные типы остаются в списке значений — иначе PostgreSQL
             не примет сужение enum, пока в таблице есть старые строки,
             а стирать их миграцией нельзя. В интерфейсе они подписаны так,
             чтобы выбирать их не хотелось, а хук ниже и не даст.
          */
          options: [
            ...toOptions(EVENT_TYPES),
            ...RETIRED_EVENT_TYPES.map((t) => ({
              value: t.value,
              label: `${t.label} — записывать в «${t.instead}»`,
            })),
          ],
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
    beforeValidate: [
      ({ data }) => {
        if (!data?.type) return data

        /*
         * Запрет на типы, у которых есть своя таблица.
         *
         * Список вариантов поля их уже не содержит, но через API и скрипты
         * тип приходит строкой, а не выбором из списка. Без этой проверки
         * дубли вернулись бы тем же путём, каким появились в первый раз, —
         * и снова стало бы неясно, где правда об отёле: в `calvings`
         * или в ленте.
         */
        const retired = RETIRED_EVENT_TYPES.find((t) => t.value === data.type)
        if (retired) {
          throw new Error(
            `«${retired.label}» больше не записывается в ленту событий: ` +
              `для этого есть раздел «${retired.instead}». ` +
              'Лента собирается из специализированных таблиц при показе карточки.',
          )
        }
        return data
      },
    ],
    beforeChange: [
      requireOwnAnimal,
      stampOwnerOrg,
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user && !data.author) data.author = req.user.id
        return data
      },
    ],
  },
}
