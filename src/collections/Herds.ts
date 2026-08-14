import type { CollectionConfig } from 'payload'
import { anyone, isAdmin, isAuthenticated } from '@/access'

export const Herds: CollectionConfig = {
  slug: 'herds',
  labels: { singular: 'Стадо', plural: 'Стада' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'code', 'organization'],
    group: 'Справочники',
  },
  access: {
    read: anyone,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  fields: [
    { name: 'name', type: 'text', label: 'Название стада', required: true },
    { name: 'code', type: 'text', label: 'Код стада' },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Организация',
      required: true,
    },
    { name: 'address', type: 'text', label: 'Площадка / адрес' },
  ],
}
