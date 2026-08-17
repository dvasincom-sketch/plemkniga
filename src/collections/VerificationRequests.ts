import type { CollectionConfig } from 'payload'
import { isAdmin, isAuthenticated, organizationScopedRead } from '@/access'

export const VERIFICATION_STATUSES = [
  { value: 'new', label: 'Подано' },
  { value: 'checking', label: 'На проверке' },
  { value: 'approved', label: 'Подтверждено' },
  { value: 'rejected', label: 'Отклонено' },
] as const

export const VERIFICATION_PURPOSES = [
  { value: 'trust', label: 'Повысить достоверность записей' },
  { value: 'certificate', label: 'Подготовить к выпуску свидетельства' },
  { value: 'membership', label: 'Подтвердить племенной статус хозяйства' },
] as const

/**
 * Заявка хозяйства на верификацию своих животных.
 *
 * Чем отличается от пакета загрузки. Пакет — про файл: хозяйство прислало
 * данные, Ассоциация смотрит, что прислали. Заявка — про животных: данные
 * давно в системе, хозяйство просит подтвердить именно эти записи. Разные
 * поводы, разные единицы работы, разные очереди.
 *
 * Зачем это нужно было завести. До сих пор уровень «Верифицировано
 * ассоциацией» поднимался единственным способом — публикацией проверенного
 * пакета, то есть только тем животным, которых недавно грузили файлом.
 * Хозяйство, у которого данные лежат в системе полгода и не менялись,
 * не имело способа попросить их подтвердить. А именно это и требуется перед
 * выпуском свидетельства: подтверждают животное, а не последнюю загрузку.
 *
 * Как решается. Решение выносится по заявке целиком — так же, как по пакету.
 * Но подтверждение получают не все её животные: те, по которым эксперт
 * оставил замечание «требует исправления», остаются с прежним уровнем.
 * Замечание работает и объяснением, и исключением: хозяйство видит ровно те
 * записи, которые не прошли, и причину по каждой.
 */
export const VerificationRequests: CollectionConfig = {
  slug: 'verification-requests',
  labels: { singular: 'Заявка на верификацию', plural: 'Заявки на верификацию' },
  admin: {
    useAsTitle: 'number',
    defaultColumns: ['number', 'organization', 'status', 'requestedAt'],
    group: 'Племенная книга',
  },
  access: {
    // Заявка — дело хозяйства и Ассоциации; соседям не показывается
    read: organizationScopedRead,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  defaultSort: '-requestedAt',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'number',
          type: 'text',
          label: 'Номер заявки',
          unique: true,
          index: true,
          admin: { readOnly: true, description: 'Присваивается автоматически' },
        },
        {
          name: 'status',
          type: 'select',
          label: 'Состояние',
          required: true,
          defaultValue: 'new',
          options: [...VERIFICATION_STATUSES],
          index: true,
        },
        {
          name: 'purpose',
          type: 'select',
          label: 'Зачем',
          defaultValue: 'trust',
          options: [...VERIFICATION_PURPOSES],
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
          label: 'Хозяйство',
          index: true,
        },
        {
          name: 'requestedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто подал',
        },
        { name: 'requestedAt', type: 'date', label: 'Когда подана', index: true },
      ],
    },
    {
      name: 'animals',
      type: 'relationship',
      relationTo: 'animals',
      hasMany: true,
      label: 'Животные заявки',
      required: true,
      index: true,
    },
    {
      name: 'comment',
      type: 'textarea',
      label: 'Сообщение Ассоциации',
      admin: { description: 'Что хозяйство хочет пояснить о поданных записях' },
    },
    {
      name: 'review',
      type: 'group',
      label: 'Разбор',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'assignee',
              type: 'relationship',
              relationTo: 'users',
              label: 'Взял в работу',
              index: true,
            },
            {
              name: 'decidedBy',
              type: 'relationship',
              relationTo: 'users',
              label: 'Решение принял',
            },
            { name: 'decidedAt', type: 'date', label: 'Когда' },
          ],
        },
        { name: 'comment', type: 'textarea', label: 'Заключение' },
        {
          type: 'row',
          fields: [
            { name: 'approvedCount', type: 'number', label: 'Подтверждено записей' },
            { name: 'heldCount', type: 'number', label: 'Не подтверждено' },
          ],
        },
        {
          /*
           * Замечания эксперта. Тот же смысл, что и в пакете загрузки,
           * плюс одно дополнительное действие: замечание «требует
           * исправления» исключает своё животное из подтверждения.
           * Так список причин и список исключений — это один список,
           * а не два, которые однажды разойдутся.
           */
          name: 'findings',
          type: 'array',
          label: 'Замечания',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'animal',
                  type: 'relationship',
                  relationTo: 'animals',
                  label: 'Животное',
                },
                { name: 'field', type: 'text', label: 'Поле или показатель' },
                {
                  name: 'severity',
                  type: 'select',
                  label: 'Насколько существенно',
                  defaultValue: 'fix',
                  options: [
                    { value: 'fix', label: 'Требует исправления — запись не подтверждается' },
                    { value: 'note', label: 'На усмотрение хозяйства' },
                  ],
                },
              ],
            },
            { name: 'text', type: 'textarea', label: 'Что не так', required: true },
          ],
        },
      ],
    },
  ],

  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation !== 'create') return data

        if (req.user && !data.requestedBy) data.requestedBy = req.user.id
        if (!data.requestedAt) data.requestedAt = new Date().toISOString()

        /*
         * Номер заявки: год и порядковый номер внутри года. Человеку с ним
         * разговаривать по телефону, поэтому не UUID и не идентификатор
         * строки — «В-2026-014» произносится вслух.
         */
        if (!data.number) {
          const year = new Date().getFullYear()
          const { totalDocs } = await req.payload.count({
            collection: 'verification-requests',
            where: { number: { like: `В-${year}-` } },
            overrideAccess: true,
          })
          data.number = `В-${year}-${String(totalDocs + 1).padStart(3, '0')}`
        }

        return data
      },
    ],
  },
}
