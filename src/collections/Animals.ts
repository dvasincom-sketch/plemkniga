import type { CollectionConfig } from 'payload'
import {
  AGE_GROUPS,
  ANIMAL_KINDS,
  EXTERIOR_COMPOSITES,
  EXTERIOR_TRAITS,
  HEALTH_TRAITS,
  ID_FORMATS,
  PRODUCTION_TRAITS,
  SEXES,
  STATES,
  toOptions,
} from '@/lib/dictionaries'
import { animalMutate, animalRead, isAdmin } from '@/access'

/** Поле «Прогноз / R,%» — повторяется во всех блоках оценки. */
const forecastFields = (opts: { unit?: string } = {}) =>
  [
    { name: 'forecast', type: 'number' as const, label: `Прогноз${opts.unit ? `, ${opts.unit}` : ''}` },
    { name: 'r', type: 'number' as const, label: 'R, %', min: 0, max: 100 },
  ] as const

export const Animals: CollectionConfig = {
  slug: 'animals',
  labels: { singular: 'Животное', plural: 'Животные' },
  admin: {
    useAsTitle: 'identNumber',
    defaultColumns: ['identNumber', 'name', 'sex', 'ageGroup', 'owner', 'ipc'],
    group: 'Племенная книга',
  },
  access: {
    read: animalRead,
    create: animalMutate,
    update: animalMutate,
    delete: isAdmin,
  },
  indexes: [{ fields: ['identNumber'] }, { fields: ['owner', 'state'] }],
  fields: [
    // ------------------------------------------------------------------ //
    {
      type: 'tabs',
      tabs: [
        // ============================ ОБЩИЕ ДАННЫЕ ======================= //
        {
          label: 'Общие данные',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'identNumber',
                  type: 'text',
                  label: 'Индивидуальный №',
                  required: true,
                  unique: true,
                  index: true,
                },
                {
                  name: 'idFormat',
                  type: 'select',
                  label: 'Формат ID',
                  defaultValue: 'rf',
                  options: toOptions(ID_FORMATS),
                },
                { name: 'name', type: 'text', label: 'Кличка' },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'kind',
                  type: 'select',
                  label: 'Тип животного',
                  defaultValue: 'cow',
                  options: toOptions(ANIMAL_KINDS),
                },
                {
                  name: 'sex',
                  type: 'select',
                  label: 'Пол',
                  required: true,
                  defaultValue: 'female',
                  options: SEXES.map((s) => ({ value: s.value, label: s.full })),
                },
                {
                  name: 'state',
                  type: 'select',
                  label: 'Состояние',
                  defaultValue: 'alive',
                  options: STATES.map((s) => ({ value: s.value, label: s.full })),
                },
                {
                  name: 'ageGroup',
                  type: 'select',
                  label: 'Возрастная группа',
                  defaultValue: 'firstCalf',
                  options: toOptions(AGE_GROUPS),
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'birthDate', type: 'date', label: 'Дата рождения' },
                { name: 'breed', type: 'text', label: 'Порода', defaultValue: 'Голштинская' },
                {
                  name: 'bloodPercent',
                  type: 'number',
                  label: 'Кровность по голштину, %',
                  min: 0,
                  max: 100,
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'owner',
                  type: 'relationship',
                  relationTo: 'organizations',
                  label: 'Владелец',
                  required: true,
                  index: true,
                },
                { name: 'herd', type: 'relationship', relationTo: 'herds', label: 'Стадо' },
                {
                  name: 'author',
                  type: 'relationship',
                  relationTo: 'users',
                  label: 'Автор записи',
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'publicVisible',
                  type: 'checkbox',
                  label: 'Показывать в публичном списке',
                  defaultValue: false,
                  index: true,
                },
                {
                  name: 'publicDetails',
                  type: 'checkbox',
                  label: 'Открыть полную карточку анонимным пользователям',
                  defaultValue: false,
                },
              ],
            },
            { name: 'photo', type: 'upload', relationTo: 'media', label: 'Фото' },
            { name: 'notes', type: 'textarea', label: 'Примечание' },
          ],
        },

        // ============================== ОЦЕНКА =========================== //
        {
          label: 'Оценка',
          fields: [
            {
              name: 'ipc',
              type: 'number',
              label: 'ИПЦ (индекс племенной ценности)',
              index: true,
              admin: { description: 'Итоговое значение, выводится в таблице поиска' },
            },
            {
              name: 'ipcDetails',
              type: 'group',
              label: 'Общий индекс племенной ценности',
              fields: [
                { name: 'forecast', type: 'number', label: 'Прогноз' },
                { name: 'r', type: 'number', label: 'R, %' },
                { name: 'percentile', type: 'number', label: 'Процентиль' },
              ],
            },
            {
              name: 'evaluationDate',
              type: 'date',
              label: 'Дата последней оценки',
            },
            {
              name: 'production',
              type: 'group',
              label: 'Продуктивные признаки',
              fields: [
                {
                  name: 'reliabilityLevel',
                  type: 'number',
                  label: 'Уровень достоверности',
                  defaultValue: 3,
                  min: 1,
                  max: 5,
                },
                ...PRODUCTION_TRAITS.map((t) => ({
                  name: t.key,
                  type: 'group' as const,
                  label: `${t.label}${t.unit ? `, ${t.unit}` : ''}`,
                  fields: [...forecastFields({ unit: t.unit })],
                })),
              ],
            },
            {
              name: 'reproduction',
              type: 'group',
              label: 'Воспроизводительные качества',
              fields: [
                {
                  name: 'fertility',
                  type: 'group',
                  label: 'Фертильность, балл',
                  fields: [...forecastFields()],
                },
              ],
            },
            {
              name: 'health',
              type: 'group',
              label: 'Признаки здоровья животного',
              fields: [
                {
                  name: 'reliabilityLevel',
                  type: 'number',
                  label: 'Уровень достоверности',
                  defaultValue: 3,
                  min: 1,
                  max: 5,
                },
                ...HEALTH_TRAITS.map((t) => ({
                  name: t.key,
                  type: 'group' as const,
                  label: `${t.label}${t.unit ? `, ${t.unit}` : ''}`,
                  fields: [...forecastFields({ unit: t.unit })],
                })),
              ],
            },
            {
              name: 'exterior',
              type: 'group',
              label: 'Экстерьер (линейная оценка, шкала −2…+2)',
              fields: [
                ...EXTERIOR_TRAITS.map((t) => ({
                  name: t.key,
                  type: 'number' as const,
                  label: t.label,
                  min: -3,
                  max: 3,
                })),
                ...EXTERIOR_COMPOSITES.map((t) => ({
                  name: t.key,
                  type: 'number' as const,
                  label: t.label,
                  min: -3,
                  max: 3,
                })),
              ],
            },
          ],
        },

        // ============================ ФЕНОТИП ============================ //
        {
          label: 'Фенотип',
          fields: [
            {
              name: 'summary',
              type: 'group',
              label: 'Показатели для таблицы поиска',
              admin: { description: 'Значения последней завершённой лактации' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'milkYield', type: 'number', label: 'Удой, л' },
                    { name: 'fatPercent', type: 'number', label: 'Жир, %' },
                    { name: 'proteinPercent', type: 'number', label: 'Белок, %' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'fatKg', type: 'number', label: 'Жир, кг' },
                    { name: 'proteinKg', type: 'number', label: 'Белок, кг' },
                    { name: 'fatProteinSum', type: 'number', label: 'СБП, кг' },
                  ],
                },
              ],
            },
            {
              name: 'lactations',
              type: 'array',
              label: 'Лактации',
              labels: { singular: 'Лактация', plural: 'Лактации' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'number', type: 'number', label: '№ л' },
                    { name: 'calvingDate', type: 'date', label: 'Дата отёла' },
                    { name: 'inseminationDate', type: 'date', label: 'Дата осем.' },
                    { name: 'serviceBull', type: 'text', label: 'Серв-бык' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'dd', type: 'number', label: 'ДД' },
                    { name: 'milkYield', type: 'number', label: 'У л' },
                    { name: 'milk305', type: 'number', label: 'У_305' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'fat305', type: 'number', label: 'Ж 305, %' },
                    { name: 'protein305', type: 'number', label: 'Б 305, %' },
                    { name: 'scc', type: 'number', label: 'КСК' },
                    { name: 'dryOffDate', type: 'date', label: 'Запуск' },
                  ],
                },
              ],
            },
          ],
        },

        // ========================== ПРОИСХОЖДЕНИЕ ======================== //
        {
          label: 'Происхождение',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'father',
                  type: 'relationship',
                  relationTo: 'animals',
                  label: 'Отец',
                  filterOptions: { sex: { equals: 'male' } },
                },
                {
                  name: 'mother',
                  type: 'relationship',
                  relationTo: 'animals',
                  label: 'Мать',
                  filterOptions: { sex: { equals: 'female' } },
                },
              ],
            },
            {
              name: 'pedigreeText',
              type: 'group',
              label: 'Предки (если нет карточек в системе)',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'fatherId', type: 'text', label: 'Отец, инд. №' },
                    { name: 'fatherName', type: 'text', label: 'Отец, кличка' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'motherId', type: 'text', label: 'Мать, инд. №' },
                    { name: 'motherName', type: 'text', label: 'Мать, кличка' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'fatherFatherId', type: 'text', label: 'ОО, инд. №' },
                    { name: 'motherFatherId', type: 'text', label: 'ОМ, инд. №' },
                  ],
                },
              ],
            },
            {
              name: 'inbreeding',
              type: 'number',
              label: 'Коэффициент инбридинга, %',
            },
          ],
        },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user && !data.author) {
          data.author = req.user.id
        }
        // СБП = жир, кг + белок, кг
        const s = data?.summary
        if (s && typeof s.fatKg === 'number' && typeof s.proteinKg === 'number') {
          s.fatProteinSum = Math.round((s.fatKg + s.proteinKg) * 10) / 10
        }
        return data
      },
    ],
  },
}
