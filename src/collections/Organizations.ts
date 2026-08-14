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
      name: 'membership',
      type: 'select',
      label: 'Членство в Ассоциации',
      defaultValue: 'none',
      options: [
        { value: 'none', label: 'Не является членом' },
        { value: 'pending', label: 'Заявка на рассмотрении' },
        { value: 'member', label: 'Действующий член' },
      ],
    },
  ],
}
