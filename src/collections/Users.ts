import type { CollectionConfig } from 'payload'
import { ROLES, toOptions } from '@/lib/dictionaries'
import { ORG_ROLES } from '@/lib/roles'
import { isAdmin, isAdminField, selfOrAdmin, selfOrAssociation } from '@/access'

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
    /*
     * Прямое создание пользователя через API закрыто.
     *
     * Здесь стояло `anyone` с пояснением «регистрация открыта — форма
     * на /register создаёт пользователя». Пояснение было неверным: форма
     * идёт через `registerAction` с `overrideAccess: true`, и правило
     * ей не нужно вовсе. Зато нужно было тому, кто отправляет
     * `POST /api/users` руками, — а там принималось всё: `role: 'admin'`,
     * `confirmed: true` и, что хуже всего, `organization` чужого
     * хозяйства. Последнее давало не «повышение роли», а прямой доступ
     * к чужому стаду: правила видимости строятся от организации.
     *
     * Поля ниже закрыты отдельно — на случай, если создание когда-нибудь
     * снова откроют. Одной защиты здесь мало: она снимается одной
     * строкой, а поля переживут это.
     */
    create: isAdmin,
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
          /*
           * `update` тут стоял с самого начала, `create` не стоял —
           * и это была дыра, а не оплошность вида «забыли симметрию»:
           * роль назначается ровно один раз, при заведении записи,
           * и именно на создании её и подставляли.
           */
          access: { create: isAdminField, update: isAdminField },
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
      /*
       * Самое опасное поле в этой коллекции.
       *
       * Вся видимость книги строится от организации пользователя.
       * Пока поле было открыто, любой участник мог одним запросом
       * `PATCH /api/users/<свой id>` переписать себе организацию
       * на чужую — и получить чужое стадо целиком: карточки, дойки,
       * отёлы, документы. Не «повышение роли», а смена хозяйства.
       *
       * Законные пути смены — регистрация и принятие приглашения —
       * идут с `overrideAccess: true` и правилами полей не ограничены.
       */
      access: { create: isAdminField, update: isAdminField },
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
         * Создание закрыто по той же причине: роль подставили бы
         * прямо в запросе на заведение записи.
         */
        create: () => false,
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
          access: { create: () => false, update: () => false },
        },
        {
          name: 'blockedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кем',
          admin: { readOnly: true },
          access: { create: () => false, update: () => false },
        },
      ],
    },
    {
      name: 'blockReason',
      type: 'text',
      label: 'Причина блокировки',
      admin: { readOnly: true, position: 'sidebar' },
      access: { create: () => false, update: () => false },
    },
    {
      name: 'confirmed',
      type: 'checkbox',
      label: 'Заявка подтверждена Ассоциацией',
      defaultValue: false,
      // Подтверждает Ассоциация — и на создании тоже, иначе им подтверждали себя сами
      access: { create: isAdminField, update: isAdminField },
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
