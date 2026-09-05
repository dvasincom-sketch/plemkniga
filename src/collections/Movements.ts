import type { Access, CollectionConfig, Where } from 'payload'
import { isAdmin, isAssociation, isAssociationAccess, isAuthenticated } from '@/access'
import { MOVEMENT_KINDS, movementEffect, type MovementKind } from '@/lib/movements'
import { relId } from '@/lib/visibility'
import { can } from '@/lib/roles'

type U = { id: number | string; role?: string; organization?: number | string | { id: number } }

const orgOf = (user: unknown): number | null => relId((user as U | null)?.organization)

/**
 * Перемещение видно сторонам сделки и Ассоциации — и больше никому.
 *
 * Соблазн показывать перемещения всем, кому видно животное, велик:
 * «эта корова была у соседа» выглядит частью родословной. Но пара
 * «кто продал — кто купил» вместе с датой это коммерческая переписка
 * хозяйства, а не характеристика животного. Публичная карточка и так
 * говорит, за кем животное числится сейчас; кто его продал и почём —
 * дело двоих.
 */
const movementRead: Access = ({ req: { user } }) => {
  if (isAssociation(user)) return true
  const org = orgOf(user)
  if (!org) return false
  const or: Where[] = [{ from: { equals: org } }, { to: { equals: org } }]
  return { or }
}

export const Movements: CollectionConfig = {
  slug: 'movements',
  labels: { singular: 'Перемещение', plural: 'Перемещения' },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['date', 'kind', 'animal', 'from', 'to'],
    group: 'Племенная книга',
  },
  access: {
    read: movementRead,
    create: isAuthenticated,
    /*
     * Правит и удаляет только Ассоциация.
     *
     * Перемещение — не заметка о животном, а утверждение о том, чьё оно.
     * Разрешить хозяйству переписывать свои перемещения значит разрешить
     * ему задним числом отменить продажу: владелец пересчитается, животное
     * вернётся в стадо, и у покупателя оно исчезнет без единого следа.
     * Ошибку исправляет Ассоциация — та же сторона, что разбирает споры
     * о принадлежности.
     */
    update: isAssociationAccess,
    delete: isAdmin,
  },
  indexes: [{ fields: ['animal', 'date'] }],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'animal',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Животное',
          required: true,
          index: true,
        },
        { name: 'date', type: 'date', label: 'Дата', required: true, index: true },
        {
          name: 'kind',
          type: 'select',
          label: 'Вид',
          required: true,
          options: MOVEMENT_KINDS.map((k) => ({ value: k.value, label: k.label })),
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'from',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'От кого',
          index: true,
          admin: { description: 'Пусто — животное поступило извне книги' },
        },
        {
          name: 'to',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Кому',
          index: true,
          admin: { description: 'Пусто — выбраковка или падёж' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'fromHerd', type: 'relationship', relationTo: 'herds', label: 'Из стада' },
        { name: 'toHerd', type: 'relationship', relationTo: 'herds', label: 'В стадо' },
      ],
    },
    {
      name: 'basis',
      type: 'text',
      label: 'Основание',
      admin: { description: 'Номер накладной, договора или ветеринарного свидетельства' },
    },
    { name: 'note', type: 'textarea', label: 'Примечание' },
    {
      /*
       * Отметка о том, что запись не изменила карточку.
       *
       * Ставится, когда перемещение внесли задним числом и после него
       * уже есть более свежее. Без такой отметки хозяйство видит запись
       * о продаже, а владелец в карточке прежний, и это выглядит поломкой.
       */
      name: 'applied',
      type: 'checkbox',
      label: 'Отражено в карточке',
      defaultValue: true,
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'recordedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Кто записал',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, req, operation }) => {
        if (!data) return data
        if (operation === 'create' && req.user && !data.recordedBy) data.recordedBy = req.user.id

        const kind = data.kind as MovementKind | undefined
        if (kind === 'sale' && !data.to) {
          throw new Error('У продажи должен быть покупатель — укажите хозяйство или заведите его')
        }
        if ((kind === 'cull' || kind === 'death') && data.to) {
          throw new Error('У выбраковки и падежа получателя нет')
        }
        if (kind === 'transfer' && relId(data.from) !== relId(data.to)) {
          throw new Error(
            'Перевод — это движение внутри одного хозяйства. ' +
              'Смена владельца записывается продажей.',
          )
        }

        if (data.date && new Date(data.date).getTime() > Date.now()) {
          throw new Error('Перемещение нельзя записать будущей датой')
        }
        return data
      },
    ],
    beforeChange: [
      /*
       * Записать перемещение может только его сторона.
       *
       * Проверка живёт в хуке, а не в правиле доступа: на создании Payload
       * ждёт от правила булево и содержимого будущей записи не видит,
       * поэтому «свой ли это документ» там выяснить нечем. Тот же приём
       * применён в `requireOwnAnimal` (`src/access/guards.ts`).
       */
      async ({ data, req, operation }) => {
        if (operation !== 'create') return data
        // Серверный скрипт: пользователя нет, проверять не от чьего лица.
        // То же соглашение, что в `requireOwnAnimal` (`src/access/guards.ts`).
        if (!req.user) return data
        if (isAssociation(req.user)) return data
        /*
         * Роль проверяется и здесь, хотя действие её уже проверило:
         * действие защищает форму, хук — прямое обращение к `/api/movements`.
         * Продажа отдаёт карточку чужим рукам, и путей к ней должно быть
         * ровно столько, сколько проверок написано.
         */
        if (!can(req.user as never, 'move')) {
          throw new Error('Оформлять перемещения может руководитель хозяйства')
        }
        const org = orgOf(req.user)
        if (!org) throw new Error('Записать перемещение может только хозяйство')
        /*
         * Проверяется не «моя ли это сторона», а «моё ли животное».
         *
         * Прежде хук довольствовался тем, что `from` или `to` — моя
         * организация. Этого мало: получатель тоже сторона, и любой
         * руководитель хозяйства мог одним запросом к `/api/movements`
         * записать продажу чужой коровы самому себе — `afterChange` честно
         * переписал бы владельца. Действие (`src/actions/movements.ts`)
         * с самого начала спрашивало владельца животного; хук отставал
         * от него, а прямой запрос идёт мимо действия.
         *
         * Правило то же, что в действии: поступление извне записывает
         * получатель (у животного владельца ещё нет или это он сам),
         * всё остальное — владелец, и он же обязан стоять в `from`.
         */
        const animalId = relId(data?.animal)
        if (!animalId) throw new Error('Не указано животное')
        const animal = await req.payload.findByID({
          collection: 'animals',
          id: animalId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const owner = relId(animal?.owner)
        if (data?.kind === 'import') {
          if (owner !== null && owner !== org) {
            throw new Error('Поступление записывает то хозяйство, к которому животное поступило')
          }
          if (relId(data?.to) !== org) {
            throw new Error('Поступление извне записывается на своё хозяйство')
          }
        } else {
          if (owner !== org) {
            throw new Error('Записать перемещение может только хозяйство-владелец')
          }
          if (relId(data?.from) !== org) {
            throw new Error('Отправитель перемещения — хозяйство-владелец')
          }
        }
        return data
      },
    ],
    afterChange: [
      /*
       * Последствия перемещения для карточки.
       *
       * Хук, а не действие сервера: перемещения приходят и импортом,
       * и через API, и из скриптов переноса. Пусть последствия наступают
       * там же, где появляется запись, — иначе окажется, что владелец
       * меняется только при вводе через форму.
       */
      async ({ doc, req, operation }) => {
        if (operation !== 'create') return doc

        const payload = req.payload
        const animalId = relId(doc.animal)
        if (!animalId) return doc

        /*
         * Применяем, только если это перемещение — последнее по дате.
         * Накладную находят через месяц, и мартовская продажа, внесённая
         * в августе, не должна возвращать животное мартовскому покупателю.
         */
        const later = await payload.count({
          collection: 'movements',
          overrideAccess: true,
          req,
          where: {
            and: [
              { animal: { equals: animalId } },
              { date: { greater_than: doc.date } },
              { id: { not_equals: doc.id } },
            ],
          },
        })

        if (later.totalDocs > 0) {
          await payload.update({
            collection: 'movements',
            id: doc.id,
            overrideAccess: true,
            req,
            data: { applied: false },
          })
          return doc
        }

        const animal = await payload.findByID({
          collection: 'animals',
          id: animalId,
          depth: 0,
          overrideAccess: true,
          req,
        })
        if (!animal) return doc

        const to = relId(doc.to)
        let receiverKeepsBook = false
        if (to !== null) {
          const org = await payload.findByID({
            collection: 'organizations',
            id: to,
            depth: 0,
            overrideAccess: true,
            req,
          })
          receiverKeepsBook = org?.presence !== 'referenced'
        }

        const patch = movementEffect({
          kind: doc.kind as MovementKind,
          animal,
          to,
          toHerd: relId(doc.toHerd),
          date: typeof doc.date === 'string' ? doc.date : null,
          receiverKeepsBook,
        })

        if (!Object.keys(patch).length) return doc

        /*
         * Прежний владелец остаётся в `pastOwners` навсегда.
         *
         * Хозяйство внесло эту корову, вело её отёлы и дойки годами —
         * и, продав, теряет к ним доступ целиком, если владелец единственный
         * признак «своего». Собственные данные должны остаться видимыми
         * тому, кто их собрал; править их он больше не может, и это правильно.
         */
        const previousOwner = relId(animal.owner)
        const past = (animal.pastOwners ?? []).map(relId).filter((v): v is number => v !== null)
        const pastOwners =
          patch.owner !== undefined && previousOwner !== null && !past.includes(previousOwner)
            ? [...past, previousOwner]
            : undefined

        await payload.update({
          collection: 'animals',
          id: animalId,
          overrideAccess: true,
          req,
          data: { ...patch, ...(pastOwners ? { pastOwners } : {}) },
        })

        return doc
      },
    ],
  },
}
