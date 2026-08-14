import type { CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'
import { anyone, isAdmin, isAuthenticated } from '@/access'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Файл', plural: 'Медиа' },
  admin: { group: 'Справочники' },
  access: {
    read: anyone,
    create: isAuthenticated,
    update: isAuthenticated,
    delete: isAdmin,
  },
  upload: {
    // В контейнере каталог монтируется как volume — см. docker-compose.yml
    staticDir: process.env.MEDIA_DIR || path.resolve(dirname, '../../media'),
    mimeTypes: ['image/*', 'application/pdf'],
    imageSizes: [
      { name: 'thumbnail', width: 320, height: 320, position: 'centre' },
      { name: 'card', width: 768, height: 512, position: 'centre' },
    ],
  },
  fields: [{ name: 'alt', type: 'text', label: 'Альтернативный текст' }],
}
