import type { CollectionConfig } from 'payload'
import { EXTERIOR_COMPOSITES, EXTERIOR_TRAITS } from '@/lib/dictionaries'
import { animalScopedRead, isAdmin } from '@/access'
import { applyExteriorSnapshot, idOf } from '@/lib/evaluation-snapshot'

/**
 * Линейная оценка экстерьера — история измерений.
 *
 * Почему отдельно от `animal-evaluations`. Экстерьер — это не прогноз модели,
 * а результат осмотра живого животного человеком: бонитёр приходит,
 * оценивает восемнадцать статей по шкале −2…+2 и ставит подпись. У этого
 * своя частота (обычно раз за лактацию, а не при каждом прогоне BLUP),
 * свой автор и своя дата. Сложи их в одну строку — и каждая переоценка
 * племенной ценности тащила бы за собой копию двадцати одной колонки
 * экстерьера, который с прошлого раза не менялся.
 *
 * В ленте событий этот факт уже отмечался типом `exteriorScore` — записью
 * с датой, но без единой цифры. Теперь у отметки есть содержание.
 *
 * Как и с оценкой: здесь история, в `animals` — снимок последнего измерения
 * для карточки и сертификатов. Главная — строка здесь.
 */

/** Шкала линейной оценки: −2…+2, в базе допускается −3…3 как в карточке. */
const linear = (key: string, label: string) => ({
  name: key,
  type: 'number' as const,
  label,
  min: -3,
  max: 3,
})

export const AnimalExteriors: CollectionConfig = {
  slug: 'animal-exteriors',
  labels: { singular: 'Оценка экстерьера', plural: 'Оценки экстерьера' },
  admin: {
    useAsTitle: 'assessedAt',
    defaultColumns: ['animal', 'assessedAt', 'assessor', 'udderComposite', 'isCurrent'],
    group: 'Племенная книга',
  },
  access: {
    read: animalScopedRead,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },

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
        {
          name: 'assessedAt',
          type: 'date',
          label: 'Дата оценки',
          required: true,
          index: true,
        },
        {
          name: 'lactation',
          type: 'number',
          label: 'Лактация',
          min: 0,
          admin: { description: 'По какой лактации оценивали; 0 — до первого отёла' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          /*
           * Бонитёр — из справочника техников: оценка экстерьера субъективна,
           * и расхождение между оценщиками — известная величина, которую
           * без имени оценщика не измерить.
           */
          name: 'assessor',
          type: 'relationship',
          relationTo: 'technicians',
          label: 'Бонитёр',
        },
        {
          name: 'isCurrent',
          type: 'checkbox',
          label: 'Действующая',
          defaultValue: true,
          index: true,
        },
      ],
    },

    {
      type: 'collapsible',
      label: 'Линейные признаки (шкала −2…+2)',
      fields: [...EXTERIOR_TRAITS.map((t) => linear(t.key, t.label))],
    },
    {
      type: 'collapsible',
      label: 'Композиты',
      fields: [...EXTERIOR_COMPOSITES.map((t) => linear(t.key, t.label))],
    },

    { name: 'note', type: 'textarea', label: 'Примечание' },
  ],

  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (!data?.isCurrent) return data

        const animal = typeof data.animal === 'object' && data.animal ? data.animal.id : data.animal
        const id = operation === 'update' ? originalDoc?.id : undefined
        if (!animal) return data

        await req.payload.update({
          collection: 'animal-exteriors',
          where: {
            and: [
              { animal: { equals: animal } },
              { isCurrent: { equals: true } },
              ...(id ? [{ id: { not_equals: id } }] : []),
            ],
          },
          data: { isCurrent: false },
          overrideAccess: true,
          req,
        })

        return data
      },
    ],

    // Снимок в карточку — как и у оценки, только для действующей строки
    afterChange: [
      async ({ doc, req }) => {
        if (!doc.isCurrent) return doc
        const animal = idOf(doc.animal)
        if (!animal) return doc

        try {
          await applyExteriorSnapshot({ payload: req.payload, req }, animal, doc)
        } catch (e) {
          req.payload.logger.error(
            `Не удалось перенести экстерьер ${doc.id} в карточку животного ${animal}: ` +
              (e instanceof Error ? e.message : String(e)),
          )
        }
        return doc
      },
    ],

    // Как и у оценки: действующей становится предыдущая по дате
    afterDelete: [
      async ({ doc, req }) => {
        if (!doc.isCurrent) return doc
        const animal = idOf(doc.animal)
        if (!animal) return doc

        const rest = await req.payload.find({
          collection: 'animal-exteriors',
          where: { animal: { equals: animal } },
          sort: '-assessedAt',
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })

        const previous = rest.docs[0]
        if (!previous) return doc

        await req.payload.update({
          collection: 'animal-exteriors',
          id: previous.id,
          data: { isCurrent: true },
          overrideAccess: true,
          req,
        })
        return doc
      },
    ],
  },
}
