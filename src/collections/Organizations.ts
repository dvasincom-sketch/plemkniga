import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isAuthenticated, ownOrganization } from '@/access'
import { REGIONS } from '@/lib/dictionaries'
import { orgNameKey } from '@/lib/movements'

export const Organizations: CollectionConfig = {
  slug: 'organizations',
  labels: { singular: 'Организация', plural: 'Организации' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'inn', 'region', 'type'],
    group: 'Справочники',
  },
  access: {
    // Названия хозяйств показываются в публичной таблице «Владелец».
    read: anyone,
    /*
     * Заводит вошедший, а не кто угодно. Регистрация создаёт организацию
     * с `overrideAccess` (`actions/auth.ts`), контрагентов — действия
     * и импорт; ни одному из этих путей `anyone` не нужен. А нужен он
     * был только тому, кто без входа завёл бы «Действующего члена»
     * с готовым решением: поля членства закрыты на `update`, но не
     * на `create`, и правило `create: anyone` открывало их всем.
     */
    create: isAuthenticated,
    update: ownOrganization,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [
      /*
       * Ключ названия считается здесь, а не в форме.
       *
       * Карточки контрагентов заводят из формы перемещения, из импорта
       * и из скриптов переноса — и поиск дублей обязан работать одинаково
       * на всех трёх путях. Ключ, посчитанный в одной форме, защищал бы
       * только её.
       */
      ({ data }) => {
        if (data && typeof data.name === 'string') data.nameKey = orgNameKey(data.name)
        return data
      },
    ],
    /*
     * Организацию со стадом удалить нельзя, и сказать об этом надо словами.
     *
     * У животного владелец обязателен, поэтому колонка `owner_id` объявлена
     * `NOT NULL`, а внешний ключ — `ON DELETE SET NULL`. Попытка удалить
     * организацию упирается в это противоречие и заканчивается ошибкой
     * PostgreSQL про NULL в колонке `owner_id` — по ней невозможно понять,
     * что произошло на самом деле.
     *
     * Каскадное удаление здесь было бы куда хуже отказа: вместе с записью
     * о хозяйстве исчезли бы карточки животных, их родословные и оценки —
     * то есть содержимое племенной книги. Поэтому отказ, но внятный.
     */
    beforeDelete: [
      async ({ req, id }) => {
        const animals = await req.payload.count({
          collection: 'animals',
          where: { owner: { equals: id } },
          overrideAccess: true,
          req,
        })

        if (animals.totalDocs > 0) {
          throw new Error(
            `Организацию нельзя удалить: за ней числится записей животных — ${animals.totalDocs}. ` +
              'Передайте их другому владельцу или отправьте в архив.',
          )
        }

        // Стада без животных осиротеют, но сами по себе они и не нужны
        await req.payload.delete({
          collection: 'herds',
          where: { organization: { equals: id } },
          overrideAccess: true,
          req,
        })
      },
    ],
  },

  fields: [
    { name: 'name', type: 'text', label: 'Наименование', required: true },
    { name: 'shortName', type: 'text', label: 'Краткое наименование' },
    {
      /*
       * Название, приведённое к сравнимому виду: без кавычек, регистра
       * и организационной формы. Нужно ровно для одного — не заводить
       * третью карточку «Заря» там, где уже есть две.
       */
      name: 'nameKey',
      type: 'text',
      label: 'Ключ названия',
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Считается автоматически, служит для поиска дублей',
      },
    },
    {
      /**
       * Ведёт ли хозяйство свои записи в системе.
       *
       * У книги два разных «не члена». Первое — хозяйство, которое
       * зарегистрировалось само, ведёт своё стадо и не вступило
       * в Ассоциацию: у него есть люди, кабинет и данные. Второе —
       * покупатель, которого назвал продавец, оформляя продажу: у него
       * нет ни учётной записи, ни намерения что-то вести, и существует
       * он в книге только затем, чтобы было к чему привязать перемещение.
       *
       * Различать их обязательно. Второму нельзя войти, за него нельзя
       * подать заявку, его нельзя показывать в списке хозяйств рядом
       * с настоящими — и при этом животное, ушедшее к нему, для книги
       * выбыло: никаких записей о нём больше не придёт.
       */
      name: 'presence',
      type: 'select',
      label: 'Присутствие в системе',
      defaultValue: 'registered',
      index: true,
      options: [
        { value: 'registered', label: 'Ведёт свои записи' },
        { value: 'referenced', label: 'Только упомянуто (карточку завёл контрагент)' },
      ],
      access: {
        /*
         * Признак меняет Ассоциация, разбирая очередь новых карточек.
         * Открыть его хозяйству значило бы позволить объявить себя
         * ведущим книгу — или, наоборот, пометить так конкурента.
         * На создании закрыто по той же причине: единственный путь,
         * ставящий «только упомянуто», идёт с `overrideAccess`.
         */
        create: () => false,
        update: () => false,
      },
    },
    {
      name: 'referencedBy',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Кто завёл карточку',
      admin: {
        readOnly: true,
        description: 'Хозяйство, оформлявшее перемещение, — к нему вопросы при разборе дублей',
      },
      access: { update: () => false },
    },
    {
      /*
       * Куда слили дубль. Карточка остаётся: на неё уже могут ссылаться
       * выданные документы и чужие выгрузки, а удаление превратило бы
       * их в ссылки в никуда. Из списков она уходит, перемещения
       * переписываются на основную.
       */
      name: 'mergedInto',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Слито с',
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: () => false },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Тип',
          defaultValue: 'farm',
          options: [
            { value: 'farm', label: 'Хозяйство / племрепродуктор' },
            { value: 'service', label: 'Сервисная организация' },
            { value: 'individual', label: 'Физическое лицо (ЛПХ)' },
          ],
        },
        { name: 'inn', type: 'text', label: 'ИНН' },
        { name: 'kpp', type: 'text', label: 'КПП' },
        { name: 'ogrn', type: 'text', label: 'ОГРН' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'region',
          type: 'select',
          label: 'Регион',
          options: REGIONS.map((r) => ({ value: r, label: r })),
        },
        { name: 'phone', type: 'text', label: 'Телефон' },
        { name: 'email', type: 'email', label: 'E-mail' },
      ],
    },
    { name: 'address', type: 'textarea', label: 'Адрес' },
    {
      /*
       * Членство — не справочная отметка, а состояние отношений
       * с Ассоциацией, у которого есть последствия. Подтверждённое
       * хозяйство может показывать животных в общей книге и подавать
       * заявки на верификацию; неподтверждённое ведёт свои данные как
       * прежде, но Ассоциация за них не ручается.
       *
       * Разбор — docs/kabinet-associacii.md, раздел 4.3.
       */
      name: 'membership',
      type: 'select',
      label: 'Членство в Ассоциации',
      defaultValue: 'none',
      index: true,
      options: [
        { value: 'none', label: 'Не является членом' },
        { value: 'pending', label: 'Заявка на рассмотрении' },
        { value: 'member', label: 'Действующий член' },
        { value: 'suspended', label: 'Членство приостановлено' },
      ],
      access: {
        /*
         * Менять членство себе нельзя. Поле лежит в записи организации,
         * а её правит само хозяйство — без этого ограничения подтверждение
         * Ассоциации ставилось бы одним запросом из браузера.
         *
         * Закрыто и создание: правило `update` не действует на `POST`,
         * и организация заводилась сразу «Действующим членом».
         */
        create: () => false,
        update: () => false,
      },
    },
    {
      name: 'membershipReview',
      type: 'group',
      label: 'Решение по членству',
      admin: { description: 'Заполняется кабинетом Ассоциации' },
      /*
       * Решение о членстве принимает Ассоциация, а запись организации правит
       * само хозяйство — значит поля решения должны быть закрыты, как и само
       * `membership` рядом.
       *
       * Без этого хозяйство могло записать себе «Член с 2020 года» и любое
       * основание в комментарий одним запросом к API. Само членство при этом
       * не изменилось бы — оно закрыто, — но дата вступления и основание
       * говорят о решении Ассоциации, и писать их за неё нельзя.
       *
       * Настоящее решение проходит `decideMembershipAction`
       * (`src/actions/membership.ts`) с `overrideAccess: true` — правилами
       * полей оно не ограничено.
       */
      access: { create: () => false, update: () => false },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'decidedBy',
              type: 'relationship',
              relationTo: 'users',
              label: 'Кто решил',
            },
            { name: 'decidedAt', type: 'date', label: 'Когда' },
            { name: 'since', type: 'date', label: 'Член с' },
          ],
        },
        { name: 'comment', type: 'textarea', label: 'Основание или причина отказа' },
      ],
    },
  ],
}
