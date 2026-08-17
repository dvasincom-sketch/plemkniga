import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, ownOrganization } from '@/access'
import { REGIONS } from '@/lib/dictionaries'

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
    create: anyone,
    update: ownOrganization,
    delete: isAdmin,
  },
  hooks: {
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
         */
        update: () => false,
      },
    },
    {
      name: 'membershipReview',
      type: 'group',
      label: 'Решение по членству',
      admin: { description: 'Заполняется кабинетом Ассоциации' },
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
