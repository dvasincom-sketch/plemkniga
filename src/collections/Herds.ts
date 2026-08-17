import type { CollectionConfig } from 'payload'
import { anyone, herdMutate, isAdmin, isAuthenticated } from '@/access'
import { requireOwnOrganization } from '@/access/guards'

export const Herds: CollectionConfig = {
  slug: 'herds',
  labels: { singular: 'Стадо', plural: 'Стада' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'code', 'organization'],
    group: 'Справочники',
  },
  access: {
    /*
     * Названия стад стоят в публичной таблице книги, поэтому читают их все.
     * Правит — только хозяйство: раньше здесь стояло `isAuthenticated`,
     * и любой вошедший мог переименовать чужое стадо через API.
     */
    read: anyone,
    create: isAuthenticated,
    update: herdMutate,
    delete: isAdmin,
  },
  hooks: { beforeChange: [requireOwnOrganization] },
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
