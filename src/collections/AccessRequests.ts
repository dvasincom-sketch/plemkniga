import type { CollectionConfig } from 'payload'
import { accessRequestDecide, accessRequestRead, isAdmin, isAuthenticated } from '@/access'

/**
 * Запрос доступа к закрытой карточке животного.
 *
 * Хозяйство вправе не показывать подробности своих животных — в книге такая
 * запись остаётся видимой (номер, кличка, владелец, основные показатели),
 * но карточка закрыта. Тупик здесь был бы вреден обеим сторонам: покупатель
 * не может оценить животное, продавец не узнаёт, что им интересовались.
 * Запрос превращает замок в начало разговора.
 *
 * Решение принимает владелец, а не Ассоциация: это его данные. Ассоциация
 * видит переписку, чтобы разбирать спорные случаи.
 */

export const ACCESS_REQUEST_PURPOSES = [
  { value: 'purchase', label: 'Покупка животного или эмбрионов' },
  { value: 'semen', label: 'Приобретение семени быка' },
  { value: 'mating', label: 'Подбор пар и оценка сочетаемости' },
  { value: 'verification', label: 'Проверка происхождения родственных животных' },
  { value: 'research', label: 'Научная работа, селекционный анализ' },
  { value: 'other', label: 'Другое' },
] as const

export const ACCESS_REQUEST_STATUSES = [
  { value: 'new', label: 'Ожидает решения хозяйства' },
  { value: 'approved', label: 'Доступ открыт' },
  { value: 'declined', label: 'Отказано' },
] as const

export const AccessRequests: CollectionConfig = {
  slug: 'access-requests',
  labels: { singular: 'Запрос доступа', plural: 'Запросы доступа' },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['animal', 'requesterOrg', 'owner', 'status', 'createdAt'],
    group: 'Племенная книга',
  },
  access: {
    create: isAuthenticated,
    read: accessRequestRead,
    update: accessRequestDecide,
    delete: isAdmin,
  },
  defaultSort: '-createdAt',
  indexes: [{ fields: ['owner', 'status'] }, { fields: ['requester', 'animal'] }],
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
      type: 'row',
      fields: [
        {
          name: 'owner',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Владелец животного',
          index: true,
          admin: { readOnly: true, description: 'Заполняется по животному' },
        },
        {
          name: 'requester',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто запросил',
          index: true,
          admin: { readOnly: true },
        },
        {
          name: 'requesterOrg',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Организация заявителя',
          admin: { readOnly: true },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'purpose',
          type: 'select',
          label: 'Цель запроса',
          required: true,
          defaultValue: 'purchase',
          options: [...ACCESS_REQUEST_PURPOSES],
        },
        {
          name: 'status',
          type: 'select',
          label: 'Состояние',
          required: true,
          defaultValue: 'new',
          options: [...ACCESS_REQUEST_STATUSES],
          index: true,
        },
      ],
    },
    {
      name: 'comment',
      type: 'textarea',
      label: 'Сообщение хозяйству',
      admin: { description: 'Что именно нужно посмотреть и зачем' },
    },
    {
      name: 'response',
      type: 'textarea',
      label: 'Ответ хозяйства',
    },
    {
      type: 'row',
      fields: [
        { name: 'decidedAt', type: 'date', label: 'Дата решения' },
        {
          name: 'decidedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто принял решение',
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (operation === 'create') {
          // Заявитель и его организация берутся из сессии, а владелец —
          // из самого животного. Ничего из этого нельзя принимать из формы:
          // иначе запрос можно отправить от чужого имени.
          if (req.user) {
            data.requester = req.user.id
            const org = (req.user as { organization?: unknown }).organization
            data.requesterOrg = typeof org === 'object' && org ? (org as { id: number }).id : org
          }
          data.status = 'new'

          const animalId = typeof data.animal === 'object' ? data.animal?.id : data.animal
          if (animalId) {
            const animal = await req.payload.findByID({
              collection: 'animals',
              id: animalId,
              depth: 0,
              overrideAccess: true,
            })
            data.owner = (animal as { owner?: number | { id: number } })?.owner ?? null
          }
        }

        // Решение фиксируется вместе со сменой состояния: иначе в журнале
        // останется «отказано» без даты и без имени.
        if (operation === 'update' && originalDoc && data.status && data.status !== originalDoc.status) {
          data.decidedAt = new Date().toISOString()
          if (req.user) data.decidedBy = req.user.id
        }

        return data
      },
    ],
  },
}
