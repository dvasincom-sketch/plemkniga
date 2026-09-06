import type { CollectionConfig } from 'payload'
import { stampOwnerOrg } from '@/access/guards'
import { ownerOrgField } from '@/collections/shared'
import { HEALTH_TRAITS, PRODUCTION_TRAITS } from '@/lib/dictionaries'
import { animalScopedReadFor, isAdmin } from '@/access'
import { applyEvaluationSnapshot } from '@/lib/evaluation-snapshot'
import { relId } from '@/lib/visibility'
import { afterCommit } from '@/lib/after-commit'

/**
 * История племенной оценки: строка на каждую переоценку.
 *
 * Зачем отдельная таблица. В карточке животного оценка лежала прямо в
 * `animals` — сорок с лишним колонок с одной общей датой `evaluationDate`.
 * Пока оценка приходит раз и навсегда, разницы нет. Но племенную ценность
 * пересчитывают несколько раз в год, и каждый новый прогон затирал прежний:
 * ответить на вопрос «а год назад этот бык как оценивался» было нечем.
 * Для племенной книги это не мелочь — динамика оценки быка и есть рабочий
 * инструмент селекционера, по ней видно, подтверждается ли ранняя геномная
 * оценка по мере накопления дочерей.
 *
 * Разделение труда с `animals`. Здесь — вся история, там — снимок последней
 * записи. Снимок нужен для чтения: карточка, таблица книги, сертификаты
 * и расчёт индекса обращаются к оценке на каждой странице, и джойн истории
 * ради «самой свежей строки» стоил бы дороже дублирования. Это осознанная
 * денормализация, и направление у неё одно: **главная — строка здесь**,
 * снимок обновляется хуком после записи. Обратно снимок не читается никогда.
 *
 * Экстерьер сюда не входит. Он живёт в `animal-exteriors`: это измерение
 * живого животного бонитёром, а не прогноз модели, у него своя частота
 * и свой автор. Складывать их в одну строку значило бы копировать
 * 21 колонку неизменившегося экстерьера при каждой переоценке EBV.
 */

/**
 * Пара «прогноз / надёжность» — как в карточке животного.
 *
 * Подпись R приведена к той, что стоит в `animals`: одно и то же число,
 * записанное здесь и скопированное туда снимком, под разными словами
 * означало бы для читателя две разные величины.
 */
const forecast = (key: string, label: string, unit?: string) => ({
  type: 'row' as const,
  fields: [
    {
      name: `${key}Forecast`,
      type: 'number' as const,
      label: `${label}${unit ? `, ${unit}` : ''}`,
    },
    { name: `${key}R`, type: 'number' as const, label: 'Надёжность, R %', min: 0, max: 100 },
  ],
})

export const AnimalEvaluations: CollectionConfig = {
  slug: 'animal-evaluations',
  labels: { singular: 'Оценка животного', plural: 'История оценок' },
  admin: {
    useAsTitle: 'evaluatedAt',
    defaultColumns: ['animal', 'evaluatedAt', 'source', 'ipc', 'isCurrent'],
    group: 'Племенная книга',
  },
  access: {
    // Видимость повторяет видимость самого животного: оценка — часть карточки
    read: animalScopedReadFor('evaluation'),
    create: isAdmin,
    update: isAdmin,
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
          name: 'evaluatedAt',
          type: 'date',
          label: 'Дата оценки',
          required: true,
          index: true,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'source',
          type: 'select',
          label: 'Источник',
          required: true,
          defaultValue: 'center',
          options: [
            { value: 'center', label: 'Расчётный центр' },
            { value: 'association', label: 'Ассоциация' },
            { value: 'import', label: 'Загружено из файла' },
            { value: 'foreign', label: 'Зарубежная оценка' },
          ],
          admin: {
            description:
              'Кто посчитал. Оценки из разных источников нельзя сравнивать напрямую: у них разные модели и разные базы',
          },
        },
        {
          name: 'baseVersion',
          type: 'text',
          label: 'Версия базы сравнения',
          admin: { description: 'Относительно чего считались отклонения; см. index-bases' },
        },
        {
          /*
           * Признак действующей оценки. Хранится, а не вычисляется по максимуму
           * даты: даты бывают одинаковыми, а «действующая» должна быть одна,
           * и решает это тот, кто записывает, а не сортировка.
           */
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
      label: 'Индекс племенной ценности',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'ipc', type: 'number', label: 'ИПЦ' },
            { name: 'ipcR', type: 'number', label: 'Надёжность, R %', min: 0, max: 100 },
            { name: 'ipcPercentile', type: 'number', label: 'Процентиль', min: 0, max: 100 },
          ],
        },
      ],
    },

    {
      type: 'collapsible',
      label: 'Продуктивность',
      fields: [
        {
          /*
           * Ступень из документа расчётного центра, а не наш расчёт.
           * Подпись та же, что у снимка в `animals`: величина одна.
           */
          name: 'productionReliabilityLevel',
          type: 'number',
          label: 'Уровень оценки по документу, 1…5',
          min: 1,
          max: 5,
        },
        ...PRODUCTION_TRAITS.map((t) => forecast(t.key, t.label, t.unit)),
        {
          type: 'row',
          fields: [
            /*
             * Подпись приведена к карточке: снимок этой строки ложится
             * в `animals.reproduction.fertility`, и «воспроизводительная
             * способность» здесь против «фертильности дочерей» там читалась
             * как два разных признака у одного числа.
             */
            { name: 'fertilityForecast', type: 'number', label: 'Фертильность дочерей, балл' },
            { name: 'fertilityR', type: 'number', label: 'Надёжность, R %', min: 0, max: 100 },
          ],
        },
      ],
    },

    {
      type: 'collapsible',
      label: 'Здоровье и долголетие',
      fields: [
        {
          name: 'healthReliabilityLevel',
          type: 'number',
          label: 'Уровень оценки по документу, 1…5',
          min: 1,
          max: 5,
        },
        ...HEALTH_TRAITS.map((t) => forecast(t.key, t.label, t.unit)),
      ],
    },

    { name: 'note', type: 'textarea', label: 'Примечание' },
  ],

  hooks: {
    beforeChange: [
      stampOwnerOrg,
      async ({ data, req, operation, originalDoc }) => {
        if (!data) return data

        /*
         * Действующая оценка ровно одна. Признак снимается со всех остальных
         * записей животного до того, как запишется эта: иначе карточка
         * показывала бы то одну, то другую в зависимости от порядка строк.
         */
        if (data.isCurrent) {
          const animal =
            typeof data.animal === 'object' && data.animal ? data.animal.id : data.animal
          const id = operation === 'update' ? originalDoc?.id : undefined

          if (animal) {
            await req.payload.update({
              collection: 'animal-evaluations',
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
          }
        }

        return data
      },
    ],

    /*
     * Снимок в карточку. Только для действующей строки: запись задним числом
     * («вот как оценивали в позапрошлом году») историю пополняет, но текущее
     * состояние карточки менять не должна.
     */
    afterChange: [
      async ({ doc, req }) => {
        if (!doc.isCurrent) return doc
        const animal = relId(doc.animal)
        if (!animal) return doc

        /*
         * Снимок переносится после коммита записи оценки.
         *
         * Прежде он шёл с `req`, то есть внутри той же транзакции,
         * и перехват ошибки ничего не спасал: испорченная транзакция
         * не коммитится, и вместе со снимком отменялась сама оценка.
         * Лог при этом сообщал «не удалось перенести оценку в карточку» —
         * то есть утверждал, что оценка сохранена. Разбор —
         * в `src/lib/after-commit.ts`.
         */
        await afterCommit(req, `оценка ${doc.id} в карточку животного ${animal}`, (payload) =>
          applyEvaluationSnapshot({ payload }, animal, doc),
        )
        return doc
      },
    ],

    /*
     * Удалили действующую оценку — карточка не должна остаться с числом,
     * которого больше нет в истории. Действующей становится предыдущая
     * по дате, и снимок переписывается с неё. Если истории не осталось
     * вовсе, карточка сохраняет последнее известное значение: обнулять
     * оценку животного из-за удаления одной строки — лекарство хуже болезни.
     */
    afterDelete: [
      async ({ doc, req }) => {
        if (!doc.isCurrent) return doc
        const animal = relId(doc.animal)
        if (!animal) return doc

        const rest = await req.payload.find({
          collection: 'animal-evaluations',
          where: { animal: { equals: animal } },
          sort: '-evaluatedAt',
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req,
        })

        const previous = rest.docs[0]
        if (!previous) return doc

        await req.payload.update({
          collection: 'animal-evaluations',
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
