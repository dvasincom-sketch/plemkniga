import type { CollectionConfig } from 'payload'
import { isAdmin, isAssociationAccess, isAuthenticated, organizationScopedRead } from '@/access'
import { requireOwnOrganization } from '@/access/guards'

export const SUBMISSION_STATUSES = [
  { value: 'uploaded', label: 'Загружено' },
  { value: 'checking', label: 'На проверке' },
  { value: 'checked', label: 'Проверено сотрудниками Ассоциации' },
  { value: 'accepted', label: 'Данные приняты и опубликованы' },
  { value: 'rejected', label: 'Отклонено' },
] as const

export const SUBMISSION_KINDS = [
  { value: 'events', label: 'Обновление событий животных' },
  { value: 'animals', label: 'Добавление животных' },
  { value: 'productivity', label: 'Загрузка контрольных доек' },
  { value: 'genomics', label: 'Загрузка результатов генотипирования' },
] as const

/**
 * Пакет загрузки данных — единица работы раздела «События» в личном кабинете.
 *
 * ТЗ, п. 1.6 «Система обновления данных»: по каждому импорту формируется
 * протокол (сколько записей принято, сколько с ошибками, ссылка на файл
 * ошибок), а смена статуса достоверности фиксируется в журнале с указанием,
 * кто и когда утвердил.
 */
export const DataSubmissions: CollectionConfig = {
  slug: 'data-submissions',
  labels: { singular: 'Пакет данных', plural: 'Пакеты загрузки данных' },
  admin: {
    useAsTitle: 'number',
    defaultColumns: ['number', 'kind', 'status', 'organization', 'submittedAt'],
    group: 'Племенная книга',
  },
  access: {
    /*
     * Пакет загрузки — внутренняя кухня хозяйства: кто когда что загрузил
     * и сколько строк не прошло проверку. Соседям не показывается никогда.
     */
    read: organizationScopedRead,
    create: isAuthenticated,
    /*
     * Статус пакета меняет Ассоциация, и только она.
     *
     * Здесь стояло `isAuthenticated` — тот же изъян, что был у заявок
     * на верификацию и описан там же. Через `PATCH /api/data-submissions`
     * хозяйство само ставило себе «Проверено сотрудниками Ассоциации»,
     * после чего кнопка публикации честно пускала: она смотрит только
     * на статус. Все переходы, которые делает хозяйство (публикация,
     * согласие), идут через серверные действия с `overrideAccess`,
     * и им это правило не мешает.
     */
    update: isAssociationAccess,
    delete: isAdmin,
  },
  defaultSort: '-submittedAt',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'number',
          type: 'text',
          label: 'Номер пакета',
          unique: true,
          index: true,
          admin: { readOnly: true, description: 'Присваивается автоматически' },
        },
        {
          name: 'kind',
          type: 'select',
          label: 'Тип загрузки',
          required: true,
          defaultValue: 'events',
          options: [...SUBMISSION_KINDS],
        },
        {
          name: 'status',
          type: 'select',
          label: 'Статус',
          required: true,
          defaultValue: 'uploaded',
          options: [...SUBMISSION_STATUSES],
          index: true,
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
          label: 'Организация',
          index: true,
        },
        {
          name: 'submittedBy',
          type: 'relationship',
          relationTo: 'users',
          label: 'Кто загрузил',
        },
        { name: 'submittedAt', type: 'date', label: 'Дата загрузки' },
      ],
    },
    {
      name: 'sourceFile',
      type: 'upload',
      relationTo: 'media',
      label: 'Исходный файл',
    },

    {
      /*
       * Записи, которых коснулся пакет.
       *
       * Без этой связи «данные приняты» было пустым словом: публикация
       * поднимала уровень достоверности всему стаду, включая животных,
       * которых в файле не было и никто не проверял. Теперь пакет знает
       * свои строки, и проверка касается только их.
       */
      name: 'animals',
      type: 'relationship',
      relationTo: 'animals',
      hasMany: true,
      label: 'Записи пакета',
      index: true,
      admin: { description: 'Заполняется импортом; вручную менять не нужно' },
    },
    {
      /*
       * Итоги приёмки — то, что сделал импорт, а не то, что нашла проверка.
       * Разные вещи и разные ответственные: здесь машина разбирала файл,
       * в `review` человек смотрел содержание.
       */
      name: 'intake',
      type: 'group',
      label: 'Итоги приёмки файла',
      admin: { description: 'Заполняется импортом' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'rows', type: 'number', label: 'Строк в файле' },
            { name: 'created', type: 'number', label: 'Создано записей' },
            { name: 'updated', type: 'number', label: 'Обновлено записей' },
            { name: 'skipped', type: 'number', label: 'Пропущено строк' },
          ],
        },
        /*
         * Почему строка не принята.
         *
         * Без этого списка импорт отвечает «пропущено 4» и умолкает: человек
         * видит, что часть файла не прошла, но не знает — из-за формата
         * номера, чужой записи или опечатки в дате. Причина известна ровно
         * в момент разбора строки, дальше она теряется навсегда, поэтому
         * пишется сразу в пакет.
         */
        {
          name: 'issues',
          type: 'array',
          label: 'Непринятые строки',
          admin: { description: 'Заполняется импортом, до 50 первых' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'row', type: 'number', label: 'Строка файла' },
                { name: 'ident', type: 'text', label: 'Индивидуальный номер' },
              ],
            },
            { name: 'reason', type: 'text', label: 'Причина' },
          ],
        },
        /*
         * Ячейки, которые не разобрались, — отдельно от непринятых строк.
         *
         * Строка тут принята: девятнадцать колонок записаны, двадцатая
         * пуста, потому что в ней стояло «3,85 %» или «март 2026».
         * В `issues` этому места нет — там строки, которых в книге нет
         * вовсе, — а пропасть бесследно эта потеря не должна: она
         * не видна ни по сводке, ни по карточке, и обнаруживается только
         * сверкой с файлом через месяц.
         *
         * Пишется в пакет, а не только на экран, по той же причине,
         * что и `issues`: экран человек закроет, а пакет останется, и
         * Ассоциация при разборе увидит, что часть данных не доехала.
         */
        {
          name: 'valueIssues',
          type: 'array',
          label: 'Ячейки, которые не разобрались',
          admin: { description: 'Заполняется импортом, до 50 первых. Строка при этом принята' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'row', type: 'number', label: 'Строка файла' },
                { name: 'ident', type: 'text', label: 'Индивидуальный номер' },
                { name: 'columnTitle', type: 'text', label: 'Колонка' },
              ],
            },
            { name: 'reason', type: 'text', label: 'Что не так' },
          ],
        },
      ],
    },
    {
      name: 'review',
      type: 'group',
      label: 'Результат проверки',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'checkedBy',
              type: 'relationship',
              relationTo: 'users',
              label: 'Проверил',
            },
            { name: 'checkedAt', type: 'date', label: 'Дата и время проверки' },
            {
              /*
               * Кто взял пакет в работу.
               *
               * Не то же, что «проверил»: тот заполняется в момент решения,
               * а этот — когда эксперт открыл пакет и начал разбираться.
               * Два эксперта, разбирающие один пакет, — потерянное время
               * обоих, и узнать об этом они должны из очереди, а не потом.
               */
              name: 'assignee',
              type: 'relationship',
              relationTo: 'users',
              label: 'Взял в работу',
              index: true,
            },
          ],
        },
        {
          /*
           * Находки эксперта — то, что нашёл человек, а не машина.
           *
           * Машинные причины пропуска лежат в `intake.issues`: там «неверный
           * формат номера», и заполняет их импорт. Здесь другое и по сути,
           * и по автору: «мать моложе дочери», «удой 14 000 кг при трёх
           * дойках — проверьте единицы измерения». Смешивать нельзя —
           * разные авторы и разная цена ошибки.
           *
           * Без этого списка проверка бинарна: хозяйство получает «часть
           * данных не прошла проверку» и ищет, какая именно. Это не результат
           * проверки, а способ переложить работу обратно.
           */
          name: 'findings',
          type: 'array',
          label: 'Находки проверки',
          admin: { description: 'Заполняется экспертом при разборе пакета' },
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
                    { value: 'fix', label: 'Требует исправления' },
                    { value: 'note', label: 'На усмотрение хозяйства' },
                  ],
                },
              ],
            },
            { name: 'text', type: 'textarea', label: 'Что не так', required: true },
          ],
        },
        {
          name: 'comment',
          type: 'textarea',
          label: 'Комментарий',
          admin: {
            description:
              'Например: «Все данные прошли успешную проверку» или «Часть данных не прошла проверку»',
          },
        },
        {
          type: 'row',
          fields: [
            { name: 'totalRows', type: 'number', label: 'Всего записей' },
            { name: 'acceptedRows', type: 'number', label: 'Принято' },
            { name: 'rejectedRows', type: 'number', label: 'С ошибками' },
          ],
        },
        {
          name: 'errorProtocol',
          type: 'upload',
          relationTo: 'media',
          label: 'Протокол ошибок',
          admin: { description: 'XLSX-файл со списком строк, не прошедших проверку' },
        },
      ],
    },

    {
      name: 'consent',
      type: 'group',
      label: 'Согласие владельца',
      fields: [
        {
          name: 'agreed',
          type: 'checkbox',
          label: 'Владелец согласен с результатом и разрешает публикацию данных',
          defaultValue: false,
        },
        { name: 'agreedAt', type: 'date', label: 'Дата согласия' },
        { name: 'publishedAt', type: 'date', label: 'Дата публикации данных' },
      ],
    },

    {
      name: 'history',
      type: 'array',
      label: 'История статусов',
      labels: { singular: 'Запись', plural: 'История' },
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'at', type: 'date', label: 'Когда' },
            {
              name: 'status',
              type: 'select',
              label: 'Статус',
              options: [...SUBMISSION_STATUSES],
            },
            { name: 'actor', type: 'relationship', relationTo: 'users', label: 'Кто' },
          ],
        },
        { name: 'note', type: 'text', label: 'Примечание' },
      ],
    },
  ],

  hooks: {
    beforeChange: [
      // Пакет заводится только от имени своей организации: прямой запрос
      // мог завести пакет «от чужого имени» с готовым списком животных.
      requireOwnOrganization,
      ({ data, req, operation, originalDoc }) => {
        if (operation === 'create') {
          if (!data.number) {
            data.number = String(100000 + Math.floor(Math.random() * 899999))
          }
          if (!data.submittedAt) data.submittedAt = new Date().toISOString()
          if (req.user && !data.submittedBy) data.submittedBy = req.user.id
        }

        // Журнал статусов: фиксируем каждый переход (ТЗ, п. 1.6).
        // При создании историю можно передать явно — тогда не перетираем её.
        const prev = originalDoc?.status
        const historyProvided = Array.isArray(data.history) && data.history.length > 0
        if (data.status && data.status !== prev && !(operation === 'create' && historyProvided)) {
          data.history = [
            ...(originalDoc?.history ?? []),
            {
              at: new Date().toISOString(),
              status: data.status,
              actor: req.user?.id ?? null,
            },
          ]
        }
        return data
      },
    ],
  },
}
