import type { CollectionConfig } from 'payload'
import { isAssociation } from '@/access'
import { THRESHOLDS } from '@/lib/check-thresholds'

/**
 * Пороги проверок, изменённые Ассоциацией.
 *
 * ## Хранятся отклонения, а не список порогов
 *
 * Строка появляется только там, где число поменяли. Полная копия реестра
 * в базе означала бы, что новый порог не действует до тех пор, пока
 * кто-нибудь не заведёт ему строку, — то есть что появление правила
 * зависит от похода в базу.
 *
 * То же решение, что в `check-settings`: там хранятся отклонения
 * от существенности, здесь — от числа.
 *
 * ## `key` — varchar, а не перечисление
 *
 * `select` в Payload разворачивается в тип-перечисление PostgreSQL, и тогда
 * каждый новый порог требовал бы миграции. Пороги заводятся кодом вместе
 * с проверками; привязывать их появление к схеме нельзя. От опечатки
 * защищает хук ниже, сверяющий имя с реестром.
 *
 * ## Границы проверяются на записи, а не только в форме
 *
 * Форма — не единственная дорога сюда: есть админка Payload и есть API.
 * Порог за границей ломает проверку тише всего: она остаётся включённой
 * и перестаёт находить. Поэтому границы стоят и в хуке, и при чтении
 * (`resolveThresholds`).
 */

const SPECS = new Map(THRESHOLDS.map((t) => [t.key as string, t]))

export const CheckThresholds: CollectionConfig = {
  slug: 'check-thresholds',
  labels: { singular: 'Порог проверки', plural: 'Пороги проверок' },
  admin: {
    group: 'Ассоциация',
    useAsTitle: 'key',
    defaultColumns: ['key', 'value', 'updatedBy', 'updatedAt'],
    description:
      'Числа, по которым срабатывают автоматические проверки. Строка нужна только там, где значение отличается от заложенного.',
  },
  access: {
    read: () => true,
    create: isAssociation,
    update: isAssociation,
    delete: isAssociation,
  },
  defaultSort: 'key',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'key',
          type: 'text',
          label: 'Имя порога',
          required: true,
          unique: true,
          index: true,
          admin: { description: 'Совпадает с именем в реестре порогов' },
        },
        {
          name: 'value',
          type: 'number',
          label: 'Значение',
          required: true,
        },
      ],
    },
    {
      name: 'note',
      type: 'textarea',
      label: 'Чем объясняется правка',
      admin: {
        description:
          'Через год объяснять, почему порог не такой, как в реестре, будет другой человек',
      },
    },
    {
      name: 'updatedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Кто изменил',
      admin: { readOnly: true },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        const spec = data.key ? SPECS.get(String(data.key)) : undefined
        if (data.key && !spec) {
          throw new Error(
            `Порога с именем «${data.key}» не существует. ` +
              `Известные: ${[...SPECS.keys()].join(', ')}`,
          )
        }

        if (spec && typeof data.value === 'number') {
          if (data.value < spec.min || data.value > spec.max) {
            throw new Error(
              `«${spec.label}»: допустимо от ${spec.min} до ${spec.max} ${spec.unit}. ` +
                'Порог за этими границами не выключает проверку, а делает её бесполезной — ' +
                'она остаётся в списке действующих и перестаёт находить.',
            )
          }
        }

        return data
      },
    ],
    beforeChange: [
      ({ data, req }) => {
        if (req.user) data.updatedBy = req.user.id
        return data
      },
    ],
  },
}
