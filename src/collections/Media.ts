import type { Access, CollectionConfig, Where } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'
import { isAdmin, isAssociation, isAuthenticated } from '@/access'
import { relId } from '@/lib/visibility'

const dirname = path.dirname(fileURLToPath(import.meta.url))

type U = { organization?: unknown }

/**
 * Файлы.
 *
 * ## Что здесь на самом деле лежит
 *
 * Слово «медиа» вводило в заблуждение и стоило дорого. Сюда попадают
 * не только фотографии животных: исходники загрузок (CSV и XLSX
 * со всем стадом — номера, удои, родословные), протоколы ДНК-тестов,
 * протоколы ошибок проверки, файлы выданных документов. То есть
 * почти всё, что хозяйство считает своими данными, в какой-то момент
 * лежит здесь отдельным файлом.
 *
 * ## Почему `read: anyone` был дырой, а не упрощением
 *
 * Payload отдаёт файлы по адресу `/api/media/file/<имя>` и применяет
 * к этому адресу правило чтения коллекции — это видно в `checkFileAccess`
 * в самом Payload. При `read: anyone` правило не ограничивало ничего:
 * достаточно было угадать или подсмотреть имя файла, чтобы получить
 * чужую выгрузку целиком, минуя всю видимость книги. Мы годами
 * затягивали доступ к карточке, дойкам и отёлам — и оставили открытой
 * дверь, за которой те же данные лежат одним файлом.
 *
 * ## Почему видимость — поле, а не вывод из связей
 *
 * На файл ссылаются пять разных таблиц, и «кому его видно» у каждой
 * своё. Вывести правило из связей нельзя: правило чтения отдаёт одно
 * условие на всю выборку и переходов по чужим таблицам не делает.
 * Поэтому у файла есть собственный признак, а связь с публичностью
 * животного поддерживает хук карточки: закрыли карточку — закрылась
 * и фотография.
 */

const mediaRead: Access = ({ req: { user } }) => {
  if (isAssociation(user)) return true

  const org = relId((user as U | null)?.organization)
  const variants: Where[] = [{ visibility: { equals: 'public' } }]
  if (org) variants.push({ owner: { equals: org } })

  return variants.length === 1 ? variants[0]! : { or: variants }
}

/**
 * Править файл может его хозяйство и Ассоциация.
 *
 * Здесь стояло `isAuthenticated`, и это была вторая половина той же дыры:
 * любой участник системы мог не только прочитать чужой файл, но и заменить
 * его — например, подменить файл выданного свидетельства.
 */
const mediaMutate: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isAssociation(user)) return true
  const org = relId((user as U | null)?.organization)
  if (!org) return false
  return { owner: { equals: org } }
}

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Файл', plural: 'Медиа' },
  admin: { group: 'Справочники', defaultColumns: ['filename', 'owner', 'visibility'] },
  access: {
    read: mediaRead,
    create: isAuthenticated,
    update: mediaMutate,
    delete: isAdmin,
  },
  upload: {
    // В контейнере каталог монтируется как volume — см. docker-compose.yml
    staticDir: process.env.MEDIA_DIR || path.resolve(dirname, '../../media'),
    mimeTypes: [
      'image/*',
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    imageSizes: [
      { name: 'thumbnail', width: 320, height: 320, position: 'centre' },
      { name: 'card', width: 768, height: 512, position: 'centre' },
    ],
  },
  hooks: {
    beforeChange: [
      /*
       * Владелец проставляется сам, если его не назвали.
       *
       * Файлы приходят тремя путями: серверными действиями (там владелец
       * известен и передаётся явно), из админки Payload и из скриптов.
       * Незаполненный владелец означает файл, который не увидит никто,
       * кроме Ассоциации, — состояние безопасное, но обычно ненужное,
       * поэтому и подставляем.
       */
      ({ data, req, operation }) => {
        if (operation !== 'create' || !data) return data
        if (!data.owner) {
          const org = relId((req.user as U | null)?.organization)
          if (org) data.owner = org
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'alt', type: 'text', label: 'Альтернативный текст' },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Чей файл',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Хозяйство, которому файл принадлежит. Пусто — виден только Ассоциации',
      },
    },
    {
      /**
       * Кому файл виден.
       *
       * Умолчание — «закрыт», и это не осторожность ради осторожности:
       * из пяти видов файлов здесь четыре закрытые, а открывать
       * приходится ровно один — фотографию животного, которое хозяйство
       * само показало в книге. Умолчание должно совпадать с частым
       * случаем, а не с редким.
       */
      name: 'visibility',
      type: 'select',
      label: 'Видимость',
      defaultValue: 'private',
      index: true,
      options: [
        { value: 'private', label: 'Только хозяйству и Ассоциации' },
        { value: 'public', label: 'Открыт всем' },
      ],
      admin: { position: 'sidebar' },
    },
  ],
}
