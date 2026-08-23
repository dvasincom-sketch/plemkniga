import type { Access, CollectionConfig, Where } from 'payload'
import { isAdmin, isAssociation } from '@/access'
import { ORG_ROLES } from '@/lib/roles'
import { relId } from '@/lib/visibility'

type U = { id: number | string; role?: string; organization?: number | string | { id: number } }

/**
 * Приглашение сотрудника в хозяйство.
 *
 * ## Почему приглашение, а не «заведите ему учётную запись»
 *
 * Завести запись за человека — значит придумать за него пароль
 * и передать его голосом или в переписке. Пароль, который знают двое,
 * не пароль; а тот, кто его придумал, остаётся способен войти под чужим
 * именем и подписать чужим именем любую запись. Приглашение переворачивает
 * порядок: хозяйство называет почту и роль, человек сам заводит пароль.
 *
 * ## Почему приглашённый считается подтверждённым
 *
 * Подтверждение Ассоциации отвечает на вопрос «тот ли он, за кого себя
 * выдаёт». Когда за человека ручается руководитель уже подтверждённого
 * хозяйства, ответ получен: Ассоциация проверяет хозяйства, хозяйство
 * отвечает за своих людей. Требовать двойного подтверждения значило бы
 * заставить эксперта разбирать, кто у кого работает зоотехником.
 *
 * ## Почему у приглашения есть срок
 *
 * Ссылка уходит в переписку и живёт там годами. Приглашение годичной
 * давности, найденное в старом письме, — это вход в стадо для того,
 * кто давно уволился.
 */

const invitationRead: Access = ({ req: { user } }) => {
  if (isAssociation(user)) return true
  const org = relId((user as U | null)?.organization)
  if (!org) return false
  const where: Where = { organization: { equals: org } }
  return where
}

export const Invitations: CollectionConfig = {
  slug: 'invitations',
  labels: { singular: 'Приглашение', plural: 'Приглашения' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'organization', 'orgRole', 'expiresAt', 'acceptedAt'],
    group: 'Доступ',
  },
  access: {
    read: invitationRead,
    /*
     * Создаются и отзываются только действиями (`src/actions/team.ts`)
     * с `overrideAccess`. Прямая запись через API закрыта: приглашение —
     * это будущий вход в чужое стадо, и путей к нему должно быть ровно
     * столько, сколько проверок мы написали.
     */
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'email', type: 'email', label: 'Кому', required: true, index: true },
        {
          name: 'orgRole',
          type: 'select',
          label: 'Роль',
          required: true,
          defaultValue: 'operator',
          options: ORG_ROLES.map((r) => ({ value: r.value, label: r.label })),
        },
      ],
    },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Хозяйство',
      required: true,
      index: true,
    },
    {
      /*
       * Токен, а не идентификатор в адресе: по последовательному номеру
       * приглашения перебираются, и посторонний вошёл бы в чужое хозяйство,
       * подобрав число. Тот же довод, что у ссылок на просмотр.
       */
      name: 'token',
      type: 'text',
      label: 'Токен',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        { name: 'expiresAt', type: 'date', label: 'Действует до', required: true, index: true },
        { name: 'acceptedAt', type: 'date', label: 'Принято', admin: { readOnly: true } },
        { name: 'revokedAt', type: 'date', label: 'Отозвано', admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'invitedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто пригласил',
          admin: { readOnly: true },
        },
        {
          name: 'acceptedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто принял',
          admin: { readOnly: true },
        },
      ],
    },
    { name: 'note', type: 'text', label: 'Для кого', admin: { description: 'Видно только вам' } },
  ],
}
