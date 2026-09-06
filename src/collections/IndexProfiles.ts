import type { CollectionConfig } from 'payload'
import { indexProfileMutate, indexProfileRead } from '@/access'
import { TRAIT_BASE } from '@/lib/breeding-index'
import { afterCommit } from '@/lib/after-commit'

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

        /*
         * Профиль, где все веса нулевые, сохранять нельзя.
         *
         * Формально такой профиль допустим: числа в границах, поля
         * заполнены. Считается он тоже без ошибки — и в этом вся беда.
         * Селекционные веса перед расчётом приводятся к сумме модулей 100,
         * а нули делить не на что; расчёт пропускает каждый признак
         * и выдаёт ровно ноль. Ноль этот выглядит как посчитанный ответ:
         * все животные книги встают на одно место, список сортируется
         * ничем, и человек ищет поломку в данных, а не в профиле.
         *
         * Поэтому отказ ставится здесь, при сохранении, а не заплатка
         * в математике. Профиль без единого ненулевого веса — не редкий
         * случай, который надо обработать, а незаданный вопрос: он
         * не говорит, что важнее чего, а именно этим профиль и является.
         *
         * Проверка идёт по сумме модулей, а не по сумме: веса бывают
         * отрицательными (композит тела в NM$ стоит со знаком минус),
         * и профиль «+10 и −10» — осмысленный, хотя сумма его нулевая.
         */
        const weights = (data.weights ?? []) as { weight?: number | null }[]
        const force = weights.reduce((sum, w) => sum + Math.abs(Number(w?.weight) || 0), 0)
        if (weights.length > 0 && force === 0) {
          throw new Error(
            'У профиля все веса нулевые: по такому профилю индекс у всех животных выйдет нулём. ' +
              'Задайте вес хотя бы одному признаку.',
          )
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
              /* Внутри транзакции записи — решение №20. */
              req,
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
        /*
         * Пересчёт откладывается до коммита профиля. Он и раньше шёл
         * по отдельному подключению, поэтому транзакцию не портил, —
         * но значения по профилю писались до того, как сам профиль был
         * принят, и откат сохранения оставлял книгу пересчитанной
         * по настройке, которой нет.
         */
        await afterCommit(req, `индекс по профилю «${doc.name}»`, (payload) =>
          recomputeProfile(payload, profileOfDoc(doc)).then(() => undefined),
        )
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
