import type { CollectionConfig } from 'payload'
import { ROLES, toOptions } from '@/lib/dictionaries'
import { anyone, isAdmin, isAdminField, selfOrAdmin } from '@/access'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Пользователь', plural: 'Пользователи' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'lastName', 'role', 'organization'],
    group: 'Доступ',
  },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 7,
    cookies: {
      sameSite: 'Lax',
    },
  },
  access: {
    // Регистрация открыта — форма на /register создаёт пользователя.
    create: anyone,
    read: selfOrAdmin,
    update: selfOrAdmin,
    delete: isAdmin,
    admin: ({ req: { user } }) => (user as { role?: string } | null)?.role === 'admin',
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'lastName', type: 'text', label: 'Фамилия', required: true },
        { name: 'firstName', type: 'text', label: 'Имя', required: true },
        { name: 'middleName', type: 'text', label: 'Отчество' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'role',
          type: 'select',
          label: 'Роль',
          required: true,
          defaultValue: 'farmer',
          options: toOptions(ROLES),
          access: { update: isAdminField },
        },
        { name: 'phone', type: 'text', label: 'Телефон' },
      ],
    },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Организация',
      admin: {
        description: 'Хозяйство или сервисная организация, к которой привязан пользователь',
      },
    },
    {
      name: 'position',
      type: 'text',
      label: 'Должность',
    },
    {
      name: 'confirmed',
      type: 'checkbox',
      label: 'Заявка подтверждена Ассоциацией',
      defaultValue: false,
      access: { update: isAdminField },
    },
    {
      name: 'acceptedPolicy',
      type: 'checkbox',
      label: 'Согласие на обработку персональных данных',
      defaultValue: false,
    },
    {
      /*
       * Что присылать на почту.
       *
       * Сама рассылка появится вместе с почтовым адаптером, но выбор
       * пользователя хранится с самого начала: иначе при включении рассылки
       * придётся спрашивать согласие задним числом у всех сразу.
       */
      type: 'row',
      fields: [
        {
          name: 'notifySubmissions',
          type: 'checkbox',
          label: 'Проверка пакетов данных',
          defaultValue: true,
        },
        {
          name: 'notifyTrust',
          type: 'checkbox',
          label: 'Изменение уровня достоверности',
          defaultValue: true,
        },
        {
          name: 'notifyNews',
          type: 'checkbox',
          label: 'Сообщения Ассоциации',
          defaultValue: false,
        },
      ],
    },
  ],
}
