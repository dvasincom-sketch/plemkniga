import type { CollectionConfig } from 'payload'
import { indexProfileMutate, indexProfileRead } from '@/access'
import { TRAIT_BASE } from '@/lib/breeding-index'

/**
 * Профиль весов индекса племенной ценности.
 *
 * Национальные индексы построены на средней экономике отрасли. У конкретного
 * хозяйства экономика другая: где-то молоко идёт на сыр и белок дороже жира,
 * где-то узкое место — выбытие первотёлок, где-то переполненный роддом делает
 * лёгкость отёла критичной. Профиль позволяет назвать это своё узкое место
 * числами и получить рейтинг животных под него.
 *
 * Профиль принадлежит организации, а не человеку: его настраивает главный
 * генетик холдинга, а зоотехники отделений работают с готовым. Профиль
 * без владельца — стандартный, его заводит Ассоциация.
 */

export const WEIGHT_KINDS = [
  { value: 'selection', label: 'Селекционные — проценты влияния' },
  { value: 'economic', label: 'Экономические — рублей на единицу признака' },
] as const

export const IndexProfiles: CollectionConfig = {
  slug: 'index-profiles',
  labels: { singular: 'Профиль индекса', plural: 'Профили индекса' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'organization', 'kind', 'isDefault'],
    group: 'Племенная книга',
  },
  access: {
    read: indexProfileRead,
    create: indexProfileMutate,
    update: indexProfileMutate,
    delete: indexProfileMutate,
  },
  defaultSort: 'name',
  indexes: [{ fields: ['organization', 'isDefault'] }],
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', label: 'Название', required: true },
        {
          name: 'kind',
          type: 'select',
          label: 'Вид весов',
          required: true,
          defaultValue: 'selection',
          options: [...WEIGHT_KINDS],
        },
      ],
    },
    {
      name: 'hint',
      type: 'text',
      label: 'Для чего профиль',
      admin: { description: 'Одна фраза: какое узкое место хозяйства он закрывает' },
    },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Хозяйство',
      index: true,
      admin: {
        readOnly: true,
        description: 'Пусто — стандартный профиль Ассоциации, виден всем',
      },
    },
    {
      /*
       * Профиль по умолчанию — тот, по которому считается индекс в карточках
       * и в списке. Он один на организацию: хук снимает признак с остальных,
       * иначе «по умолчанию» перестало бы что-либо значить.
       */
      name: 'isDefault',
      type: 'checkbox',
      label: 'Использовать по умолчанию',
      defaultValue: false,
    },
    {
      name: 'weights',
      type: 'array',
      label: 'Веса признаков',
      labels: { singular: 'Признак', plural: 'Веса' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'trait',
              type: 'select',
              label: 'Признак',
              required: true,
              options: TRAIT_BASE.map((t) => ({ value: t.key, label: `${t.label}, ${t.unit}` })),
            },
            {
              name: 'weight',
              type: 'number',
              label: 'Вес',
              required: true,
              admin: {
                description:
                  'Для селекционных — проценты влияния (отрицательные допустимы), для экономических — рублей на единицу',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      label: 'Кто создал',
      admin: { readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (operation === 'create' && req.user) {
          data.author = req.user.id
          // Организация берётся из сессии, а не из формы: иначе профиль можно
          // было бы создать в чужом хозяйстве
          const org = (req.user as { organization?: unknown }).organization
          data.organization = typeof org === 'object' && org ? (org as { id: number }).id : org
        }

        // Признак «по умолчанию» — ровно один на организацию
        if (data.isDefault) {
          const orgId = data.organization ?? originalDoc?.organization
          if (orgId) {
            await req.payload.update({
              collection: 'index-profiles',
              where: {
                and: [
                  { organization: { equals: orgId } },
                  { isDefault: { equals: true } },
                  ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
                ],
              },
              data: { isDefault: false },
              overrideAccess: true,
            })
          }
        }

        return data
      },
    ],

    /*
     * Веса изменились — значит изменился порядок животных по этому профилю.
     * Пересчёт трогает всю книгу и потому не мгновенный: правка весов
     * перестаёт быть бесплатной.
     *
     * Это осознанный размен. Профиль настраивают редко и обдуманно, а платят
     * пересчётом один раз; списки же открывают каждый день, и там нужен
     * готовый порядок. Обратный размен — считать при каждом показе — упирался
     * в потолок ранжирования, из-за которого широкий отбор показывал неполный
     * список.
     */
    afterChange: [
      async ({ doc, req }) => {
        const { skipRecompute, recomputeProfile } = await import('@/lib/index-values')
        const { profileOfDoc } = await import('@/lib/index-profiles')
        if (skipRecompute()) return doc
        try {
          await recomputeProfile(req.payload, profileOfDoc(doc))
        } catch (e) {
          req.payload.logger.error(
            `Не удалось пересчитать индекс по профилю «${doc.name}»: ${
              e instanceof Error ? e.message : e
            }`,
          )
        }
        return doc
      },
    ],

    afterDelete: [
      async ({ doc, req }) => {
        const { dropProfileValues } = await import('@/lib/index-values')
        const { ownKey } = await import('@/lib/index-profiles')
        try {
          await dropProfileValues(req.payload, ownKey(doc.id))
        } catch {
          // Осиротевшие значения уберёт полный пересчёт
        }
        return doc
      },
    ],
  },
}
