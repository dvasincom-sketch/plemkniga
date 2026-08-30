import type { CollectionConfig } from 'payload'
import { requireOwnAnimal, stampOwnerOrg } from '@/access/guards'
import { ownerOrgField } from '@/collections/shared'
import { EXTERIOR_COMPOSITES, EXTERIOR_TRAITS } from '@/lib/dictionaries'
import { animalScopedMutate, animalScopedReadFor, isAdmin, isAuthenticated } from '@/access'
import { applyExteriorSnapshot } from '@/lib/evaluation-snapshot'
import { relId } from '@/lib/visibility'

/**
 * Линейная оценка экстерьера — история измерений.
 *
 * Почему отдельно от `animal-evaluations`. Экстерьер — это не прогноз модели,
 * а результат осмотра живого животного человеком: бонитёр приходит,
 * оценивает восемнадцать статей по девятибалльной шкале и ставит подпись. У этого
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

/**
 * Шкала линейной оценки: 1–9, пятёрка — среднее по породе.
 *
 * Прежде здесь стояло −2…+2, заимствованное у шкалы отклонений,
 * и это путало два разных измерения уже видом числа. Бонитёр меряет тело
 * конкретного животного, а не то, что оно передаёт потомству; во всём мире
 * такой промер записывают девятью баллами. Перевод старых значений сделан
 * миграцией `20260828_140000_linear_score`.
 */
const linear = (key: string, label: string) => ({
  name: key,
  type: 'number' as const,
  label,
  min: 1,
  max: 9,
})

export const AnimalExteriors: CollectionConfig = {
  slug: 'animal-exteriors',
  labels: { singular: 'Оценка экстерьера', plural: 'Оценки экстерьера' },
  admin: {
    useAsTitle: 'assessedAt',
    defaultColumns: ['animal', 'assessedAt', 'assessor', 'udderComposite', 'isCurrent'],
    group: 'Племенная книга',
  },
  /**
   * ## Осмотр записывает хозяйство, а не только Ассоциация
   *
   * Стояло `create: isAdmin` — писать вправе была одна Ассоциация.
   * Для этой коллекции это неверно с самого начала и стало заметно,
   * когда под три шаблона реестра сюда добавились девять полей:
   * заполнить их оказалось некому, и четыре кнопки выгрузки из двадцати
   * обещали файлы, которые всегда будут пустыми.
   *
   * Ошибка шла от соседней таблицы. В `animal-evaluations` лежит оценка
   * племенной ценности — расчёт по модели, и делает его расчётный центр;
   * туда хозяйству писать действительно нечего. Здесь наоборот: это
   * промер живого животного, который делает приезжий бонитёр,
   * а записывает зоотехник со своей ведомости. Правило скопировали,
   * не заметив, что предмет другой.
   *
   * Порядок теперь тот же, что у взвешиваний и бонитировок: заводит
   * любой вошедший, но хук пускает только к своим животным, а роль
   * «наблюдатель» не пускает вовсе.
   */
  access: {
    read: animalScopedReadFor('evaluation'),
    create: isAuthenticated,
    update: animalScopedMutate,
    delete: isAdmin,
  },

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
          /**
           * Организация-оценщик — рядом с бонитёром, а не вместо него.
           *
           * Пять шаблонов ФГИАС из двадцати требуют наименование, ИНН
           * и КПП организации-оценщика. Бонитёр из справочника техников
           * на этот вопрос не отвечает: он человек, а реестр спрашивает,
           * кто отвечает за оценку юридически.
           *
           * Хозяйству нужны оба и по разным поводам. Расхождение между
           * оценщиками — известная величина, и меряется она по людям;
           * ответственность за оценку — по организациям.
           *
           * Связью, а не текстом: ИНН и КПП берутся из организации
           * и не устаревают. Копия реквизитов в каждой оценке однажды
           * уехала бы в реестр со старым ИНН.
           */
          name: 'assessorOrg',
          type: 'relationship',
          relationTo: 'organizations',
          label: 'Организация-оценщик',
          index: true,
          admin: {
            description: 'Кто отвечает за оценку. ФГИАС ПР требует её наименование, ИНН и КПП',
          },
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
      label: 'Линейные признаки (шкала 1–9, 5 — среднее по породе)',
      fields: [...EXTERIOR_TRAITS.map((t) => linear(t.key, t.label))],
    },
    {
      /*
       * Композиты остаются на прежней шкале отклонений: их бонитёр
       * не ставит. Это сводные величины, которые считают из линейных
       * признаков по формуле оценки, и в карточку они идут не отсюда.
       * Оставлены в истории затем, что расчётный центр иногда присылает
       * их вместе с осмотром.
       */
      type: 'collapsible',
      label: 'Композиты (отклонение, −2…+2)',
      fields: [
        ...EXTERIOR_COMPOSITES.map((t) => ({
          name: t.key,
          type: 'number' as const,
          label: t.label,
          min: -3,
          max: 3,
        })),
      ],
    },

    {
      /*
       * Сводная оценка по стобалльной шкале — третье измерение в этой
       * же записи, а не третья коллекция.
       *
       * ## Почему не пересчёт из линейных признаков
       *
       * Соблазн велик: и то и другое ставит один бонитёр за один
       * осмотр. Но шкала 50–100 — не другое представление шкалы 1–9,
       * а другая система измерения. Линейный признак говорит, **какое**
       * животное («таз приподнят» или «свислый»), и середина шкалы
       * у половины признаков и есть оптимум. Сводная оценка говорит,
       * **насколько хорошо**, и сотня всегда лучше пятидесяти.
       *
       * Из «таз в середине» нельзя вывести «зад на 82 балла»:
       * во второе входит и то, чего в линейных признаках нет вовсе.
       * Пересчёт дал бы правдоподобное число, которое ничего не меряет.
       *
       * ## Почему в одной записи с линейными признаками
       *
       * Осмотр один. Бонитёр приезжает, меряет статьи и ставит сводные
       * оценки в один день и одной подписью. Развести их по двум
       * коллекциям значило бы завести две даты и двух оценщиков там,
       * где в жизни один.
       *
       * ## Наборы у коровы и быка разные
       *
       * У коровы реестр спрашивает качество вымени, у быка — заднюю
       * часть туловища: вымени у него нет, и оценивают то, что он
       * передаёт дочерям. Остальные четыре — пара к паре, хотя названы
       * по-разному: «выраженность молочного типа» у коровы
       * и «молочные признаки» у быка это одно и то же.
       */
      type: 'collapsible',
      label: 'Сводная оценка (шкала 50–100)',
      admin: {
        description:
          'Отдельное измерение, а не пересчёт линейных признаков: там «какое животное», ' +
          'здесь «насколько хорошо»',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'generalView', type: 'number', label: 'Общий вид и развитие', min: 50, max: 100 },
            { name: 'bodyVolume', type: 'number', label: 'Объём туловища', min: 50, max: 100 },
            {
              name: 'dairyCharacter',
              type: 'number',
              label: 'Выраженность молочного типа',
              min: 50,
              max: 100,
              admin: { description: 'У быка реестр зовёт это «молочными признаками»' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'legQuality', type: 'number', label: 'Качество ног', min: 50, max: 100 },
            {
              name: 'udderQuality',
              type: 'number',
              label: 'Качество вымени',
              min: 50,
              max: 100,
              admin: { description: 'Только у коровы' },
            },
            {
              name: 'rearBody',
              type: 'number',
              label: 'Задняя часть туловища',
              min: 50,
              max: 100,
              admin: { description: 'Только у быка — вместо вымени, которого у него нет' },
            },
          ],
        },
      ],
    },
    {
      /*
       * Экстерьер молодняка — третья шкала и третий повод.
       *
       * Тёлку до первого отёла не меряют ни линейно, ни по сотне:
       * вымени ещё нет, тело не сформировано. Реестр спрашивает три
       * сводные оценки по коротким шкалам — 1–3 и 1–4, — и это опять
       * не другое представление, а третья система измерения.
       *
       * Лежит здесь же: осмотр молодняка — такой же осмотр с датой
       * и оценщиком, и заводить под него четвёртую коллекцию значило
       * бы разложить одно понятие по возрастам.
       */
      type: 'collapsible',
      label: 'Экстерьер молодняка (шкалы 1–3 и 1–4)',
      admin: { description: 'Для тёлок до первого отёла' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'youngGeneral', type: 'number', label: 'Общий вид', min: 1, max: 3 },
            {
              name: 'youngBody',
              type: 'number',
              label: 'Голова и шея, грудь, холка, спина, поясница, туловище, зад',
              min: 1,
              max: 4,
            },
            { name: 'youngLegs', type: 'number', label: 'Конечности и копыта', min: 1, max: 3 },
          ],
        },
      ],
    },

    { name: 'note', type: 'textarea', label: 'Примечание' },
  ],

  hooks: {
    beforeChange: [
      /*
       * Проверка «животное своё» стоит первой и до всего прочего:
       * правило `create` у Payload видит только пользователя, а не
       * содержимое будущей записи, и без хука любой вошедший завёл бы
       * оценку чужой корове через API. Тот же порядок, что у отёлов,
       * доек и взвешиваний — правило пускает к операции, хук решает,
       * что именно записать.
       */
      requireOwnAnimal,
      stampOwnerOrg,
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
        const animal = relId(doc.animal)
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
        const animal = relId(doc.animal)
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
