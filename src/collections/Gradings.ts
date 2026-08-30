import type { CollectionConfig, CollectionAfterChangeHook } from 'payload'
import { isAdmin, isAuthenticated, animalScopedReadFor, animalScopedMutate } from '@/access'
import { requireOwnAnimal, stampOwnerOrg } from '@/access/guards'
import { ownerOrgField } from '@/collections/shared'
import { COMPLEX_GRADES } from '@/lib/dictionaries'
import { relId } from '@/lib/visibility'

/**
 * Свежий класс — в карточку животного.
 *
 * ## Зачем снимок, если есть история
 *
 * Тот же приём, что у возрастной группы и у экстерьера: главная запись
 * здесь, а в `animals.grade` лежит копия последней. Без неё поиск
 * «покажи всех элита-рекорд» превратился бы в обход всех бонитировок
 * стада, а класс спрашивают в каждом списке и в каждом свидетельстве.
 *
 * ## Почему последняя по дате, а не лучшая
 *
 * Возрастную группу отёл только поднимает (`raiseAgeGroup`), и это
 * верно: запись об отёле доказывает, что животное телилось, а её
 * отсутствие ничего не опровергает. С классом наоборот — он и падает.
 * Корова, у которой в этом году «первый класс» вместо прошлогодней
 * «элиты», именно первого класса и есть, и держать в карточке лучшее
 * из достигнутого значило бы приукрашивать стадо.
 *
 * ## Отказ не роняет сохранение бонитировки
 *
 * Сама запись к этому моменту уже сохранена, и она важнее копии.
 * Уронить её из-за того, что не удалось обновить соседнюю карточку,
 * значило бы потерять событие ради его последствия — тот же порядок,
 * что у отёла.
 */
const applyGradeSnapshot: CollectionAfterChangeHook = async ({ doc, req }) => {
  const animalId = relId(doc.animal)
  if (!animalId) return doc

  try {
    const { docs } = await req.payload.find({
      collection: 'gradings',
      where: { animal: { equals: animalId } },
      sort: '-date',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const latest = docs[0]
    if (!latest) return doc

    await req.payload.update({
      collection: 'animals',
      id: animalId,
      data: { grade: latest.grade ?? null, gradeDate: latest.date ?? null } as never,
      overrideAccess: true,
      context: { skipJournal: true },
    })
  } catch (e) {
    console.error('[gradings] класс в карточке не обновился:', e)
  }

  return doc
}

/**
 * Комплексный класс — бонитировка как повторяемое событие.
 *
 * ## Чего не было
 *
 * Класс лежал в карточке одним полем: `grade`, без даты, без балла
 * и без оценщика. Переприсвоение затирало прошлое молча, и на вопрос
 * «когда присвоили и кто» ответить было нечем — а бонитируют ежегодно,
 * и «элита» без года не говорит, элита ли животное сейчас.
 *
 * Реестр спрашивает все четыре: класс, балл, дату оценки и организацию
 * с ИНН и КПП. Ни одного из трёх последних в книге не было.
 *
 * ## Почему коллекция, а не поля в карточке
 *
 * Полей хватило бы на «когда и кто», но не хватило бы на историю,
 * а именно история здесь и есть содержание: класс животного меняется,
 * и ряд изменений — это то, что читают, решая о племенной продаже.
 * Устройство повторяет взвешивания: та же видимость по животному,
 * тот же индекс, та же связь с хозяйством.
 *
 * ## Старый класс остаётся на месте
 *
 * У полутора тысяч животных класс проставлен без даты, и перенести его
 * сюда нельзя: запись о бонитировке без даты — не запись. Он остаётся
 * в карточке как есть, то есть как свойство неизвестного возраста,
 * и постепенно вытесняется настоящими бонитировками. В выгрузку
 * во ФГИАС он не попадает — разбор в `lib/fgias-export.ts`.
 */
export const Gradings: CollectionConfig = {
  slug: 'gradings',
  labels: { singular: 'Бонитировка', plural: 'Бонитировки' },
  admin: {
    useAsTitle: 'date',
    defaultColumns: ['date', 'animal', 'grade', 'score', 'assessorOrg'],
    group: 'Племенная книга',
  },
  access: {
    /*
     * Область `evaluation`, а не `production`: комплексный класс —
     * вывод о племенной ценности, и открывается он тем же точечным
     * доступом, что линейная оценка и индекс, а не тем, что удои.
     */
    read: animalScopedReadFor('evaluation'),
    create: isAuthenticated,
    update: animalScopedMutate,
    delete: isAdmin,
  },
  indexes: [{ fields: ['animal', 'date'] }],
  defaultSort: '-date',
  fields: [
    ownerOrgField,
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
        { name: 'date', type: 'date', label: 'Дата оценки', required: true, index: true },
        {
          name: 'grade',
          type: 'select',
          label: 'Комплексный класс',
          options: [...COMPLEX_GRADES],
          required: true,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          /*
           * Балл необязателен: инструкция по бонитировке считает его
           * по трём группам признаков, но в племенных свидетельствах
           * печатают его не всегда, а класс печатают всегда. Требовать
           * балл значило бы запретить внести то, что написано в бумаге.
           */
          name: 'score',
          type: 'number',
          label: 'Балл',
          min: 0,
          admin: { description: 'Сумма баллов по инструкции; в свидетельстве бывает не всегда' },
        },
        {
          /*
           * Организация-оценщик связью, а не текстом: реестр требует
           * её наименование, ИНН и КПП, и копия реквизитов в каждой
           * бонитировке однажды уехала бы со старым ИНН.
           */
          name: 'assessorOrg',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Организация-оценщик',
          index: true,
          admin: { description: 'Кто провёл бонитировку. ФГИАС ПР требует ИНН и КПП' },
        },
      ],
    },
    { name: 'note', type: 'textarea', label: 'Примечание' },
  ],
  hooks: {
    beforeChange: [requireOwnAnimal, stampOwnerOrg],
    afterChange: [applyGradeSnapshot],
  },
}
