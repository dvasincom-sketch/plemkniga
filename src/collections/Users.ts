import type { CollectionConfig } from 'payload'
import { ROLES, toOptions } from '@/lib/dictionaries'
import { ORG_ROLES } from '@/lib/roles'
import { anyone, isAdmin, isAdminField, selfOrAdmin, selfOrAssociation } from '@/access'

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
    // Читать — Ассоциации (кто подал заявку от хозяйства), править — только себя
    read: selfOrAssociation,
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
      /**
       * Роль внутри хозяйства.
       *
       * Отдельно от `role` намеренно: `role` отвечает на вопрос «кто это
       * в системе» (фермер, эксперт Ассоциации, администратор), а эта —
       * «что ему можно в его собственном хозяйстве». Смешать их значило бы
       * заводить «фермер-руководитель» и «фермер-зоотехник» отдельными
       * значениями, и каждая новая роль системы умножалась бы на три.
       *
       * Разбор возможностей — `src/lib/roles.ts`.
       */
      name: 'orgRole',
      type: 'select',
      label: 'Роль в хозяйстве',
      defaultValue: 'head',
      index: true,
      options: ORG_ROLES.map((r) => ({ value: r.value, label: r.label })),
      access: {
        /*
         * Роль себе не меняют. Поле лежит в записи пользователя, а её
         * правит он сам (`selfOrAdmin`) — без ограничения зоотехник
         * назначал бы себя руководителем одним запросом к API.
         * Настоящая смена идёт через `changeOrgRoleAction`.
         */
        update: () => false,
      },
    },
    {
      /**
       * Блокировка человека.
       *
       * Не удаление: за учётной записью стоит авторство записей, решений
       * и заявок, и стереть её значило бы стереть ответ на вопрос «кто
       * это внёс». Заблокированный не входит и ничего не меняет,
       * а всё, что он сделал, остаётся подписанным его именем.
       *
       * Причина обязательна и видна самому заблокированному: человек,
       * который не может войти и не знает почему, идёт звонить —
       * и тратит чужое время вместо того, чтобы исправить то, из-за чего
       * его заблокировали.
       */
      type: 'row',
      admin: { position: 'sidebar' },
      fields: [
        {
          name: 'blockedAt',
          type: 'date',
          label: 'Заблокирован',
          index: true,
          admin: { readOnly: true },
          access: { update: () => false },
        },
        {
          name: 'blockedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кем',
          admin: { readOnly: true },
          access: { update: () => false },
        },
      ],
    },
    {
      name: 'blockReason',
      type: 'text',
      label: 'Причина блокировки',
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: () => false },
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
    {
      /*
       * Когда пользователь последний раз открывал ленту уведомлений.
       *
       * Лента собирается из настоящих записей — пакетов данных, запросов
       * доступа, смен уровня достоверности, — и отдельного признака
       * «прочитано» у них нет и быть не должно: одно и то же событие
       * прочитано одним сотрудником и не прочитано другим. Поэтому
       * непрочитанное считается по времени, а хранится одна отметка.
       */
      name: 'notifySeenAt',
      type: 'date',
      label: 'Уведомления просмотрены',
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
}
