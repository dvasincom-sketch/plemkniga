import type { CollectionConfig, CollectionAfterChangeHook } from 'payload'
import { isAdmin, isAuthenticated, animalScopedReadFor, animalScopedMutate } from '@/access'
import { requireOwnAnimal, stampOwnerOrg } from '@/access/guards'
import { ownerOrgField } from '@/collections/shared'
import { raiseAgeGroup } from '@/lib/age-group'
import type { AgeGroup } from '@/lib/dictionaries'

/**
 * Отёл поднимает возрастную группу животного.
 *
 * ## Почему это хук, а не пересчёт при чтении
 *
 * Группа хранится в карточке и уезжает во ФГИАС вместе с датой своего
 * определения — вычислять её на лету значило бы не иметь такой даты вовсе.
 * А раз хранится, то кто-то обязан её поддерживать; до сих пор не поддерживал
 * никто, и на живой базе нашлись три тёлки с записанными отёлами,
 * пять первотёлок с двумя отёлами и тридцать пять «коров 3+ лактации»,
 * у которых отёлов меньше трёх.
 *
 * ## Только вверх
 *
 * Функция `raiseAgeGroup` физически не умеет понизить группу, и удаления
 * отёла этот хук намеренно не слушает. Разбор — в `lib/age-group.ts`:
 * запись отёла доказывает, что животное телилось, а отсутствие записи
 * не доказывает обратного.
 *
 * ## Отказ не роняет сохранение отёла
 *
 * Сам отёл к этому моменту уже записан, и он важнее заметки о возрасте.
 * Уронить его из-за того, что не удалось обновить соседнюю карточку,
 * значило бы потерять событие ради его последствия. Отказ уходит в лог —
 * тот же порядок, что у карантина колонок в решении №159.
 */
const raiseAnimalAgeGroup: CollectionAfterChangeHook = async ({ doc, req }) => {
  const animalId = typeof doc.animal === 'object' ? doc.animal?.id : doc.animal
  if (!animalId) return doc

  try {
    const animal = await req.payload.findByID({
      collection: 'animals',
      id: animalId,
      depth: 0,
      overrideAccess: true,
    })

    /*
     * Считаются все отёлы животного, а не номер этого. Номер приходит
     * из файла и бывает любым: при переносе истории из прежней системы
     * учёта нумерация своя, и «отёл №7» может оказаться единственным
     * записанным. Группу определяет сколько их есть, а не как назван
     * последний.
     */
    const { totalDocs } = await req.payload.count({
      collection: 'calvings',
      where: { animal: { equals: animalId } },
      overrideAccess: true,
    })

    const next = raiseAgeGroup(animal.ageGroup as AgeGroup | null, totalDocs)
    if (!next) return doc

    await req.payload.update({
      collection: 'animals',
      id: animalId,
      data: {
        ageGroup: next,
        /*
         * Дата определения — дата отёла, а не сегодняшняя. Отёл мог быть
         * загружен файлом за прошлый год, и записать «определено сегодня»
         * значило бы соврать реестру о дне, когда животное стало коровой.
         */
        ageGroupDate: doc.date ?? new Date().toISOString(),
      } as never,
      overrideAccess: true,
      context: { skipJournal: true },
    })
  } catch (e) {
    console.error('[calvings] возрастная группа не обновилась:', e)
  }

  return doc
}

/** Результат отёла — колонка «Результат» в таблице межотельного цикла. */
export const CALVING_RESULTS = [
  { value: 'heifer', label: 'Тёлка' },
  { value: 'bull', label: 'Бычок' },
  { value: 'twins', label: 'Двойня' },
  { value: 'stillborn', label: 'Мертворождение' },
  { value: 'abortion', label: 'Аборт' },
] as const

/**
 * Лёгкость отёла.
 *
 * Вынесено из поля наружу по той же причине, что и результат: этот список
 * читает не только форма, но и разбор загружаемого файла. Пока он лежал
 * внутри поля, описание допустимых кодов в формате импорта было переписано
 * от руки — и разошлось со справочником в первый же раз.
 */
export const CALVING_EASE = [
  { value: 'easy', label: 'Лёгкий' },
  { value: 'assisted', label: 'С помощью' },
  { value: 'hard', label: 'Тяжёлый' },
] as const

/**
 * Отёлы — «Таблица межотельного цикла».
 *
 * ТЗ, п. 5.2: каждое событие воспроизводства привязано к уникальному номеру
 * отёла (`ld_cow_n_otel`), что даёт непрерывную хронологию: осеменение →
 * стельность → отёл → лактация → запуск.
 */
export const Calvings: CollectionConfig = {
  slug: 'calvings',
  labels: { singular: 'Отёл', plural: 'Отёлы' },
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'animal', 'number', 'result'],
    group: 'Воспроизводство',
  },
  access: {
    /*
     * Видимость наследуется от животного, а не «любой вошедший».
     * Надой, отёл и лечение чужой закрытой коровы — такие же её данные,
     * как и карточка: показывать их соседям система не должна.
     * Разбор — docs/dostup-i-vidimost.md.
     */
    read: animalScopedReadFor('production'),
    create: isAuthenticated,
    update: animalScopedMutate,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [requireOwnAnimal, stampOwnerOrg],
    afterChange: [raiseAnimalAgeGroup],
  },
  indexes: [{ fields: ['animal', 'number'] }],
  defaultSort: 'number',
  fields: [
    ownerOrgField,
    {
      type: 'row',
      fields: [
        {
          name: 'animal',
          type: 'relationship',
          relationTo: 'animals',
          label: 'Корова',
          required: true,
          index: true,
          filterOptions: { sex: { equals: 'female' } },
        },
        { name: 'number', type: 'number', label: 'Номер отёла', required: true },
        { name: 'date', type: 'date', label: 'Дата отёла', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'result',
          type: 'select',
          label: 'Результат',
          options: [...CALVING_RESULTS],
        },
        { name: 'milkingDays', type: 'number', label: 'Количество дойных дней' },
        { name: 'dryOffDate', type: 'date', label: 'Дата запуска' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'ease',
          type: 'select',
          label: 'Лёгкость отёла',
          options: [...CALVING_EASE],
        },
        { name: 'calfWeight', type: 'number', label: 'Вес телёнка, кг' },
      ],
    },
    {
      name: 'calves',
      type: 'relationship',
      relationTo: 'animals',
      hasMany: true,
      label: 'Полученный приплод',
    },
    { name: 'comment', type: 'textarea', label: 'Комментарий' },
  ],
}
