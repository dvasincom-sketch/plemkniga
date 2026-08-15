import type { CollectionConfig } from 'payload'
import { randomUUID } from 'crypto'
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
import { validateIdentNumber, type IdFormat } from '@/lib/animal-id'
import { animalMutate, animalRead, isAdmin } from '@/access'

/** Поле «Прогноз / R,%» — повторяется во всех блоках оценки. */
const forecastFields = (opts: { unit?: string } = {}) =>
  [
    { name: 'forecast', type: 'number' as const, label: `Прогноз${opts.unit ? `, ${opts.unit}` : ''}` },
    { name: 'r', type: 'number' as const, label: 'R, %', min: 0, max: 100 },
  ] as const

/** Носительство генетического дефекта. */
const CARRIER_OPTIONS = [
  { value: 'unknown', label: 'Не тестировано' },
  { value: 'free', label: 'Свободен (не носитель)' },
  { value: 'carrier', label: 'Носитель' },
]

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
    /**
     * Глобальный идентификатор для ФГИАС ПР (ТЗ, п. 7.3):
     * GUID/UUID на каждое животное, глобально уникальный, независимый от
     * регистрационного номера внутри хозяйства, сохраняется во всех выгрузках.
     */
    {
      name: 'uuid',
      type: 'text',
      label: 'GUID (ФГИАС ПР)',
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Присваивается автоматически при создании и никогда не меняется',
      },
    },
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
                {
                  name: 'nameLatin',
                  type: 'text',
                  label: 'Кличка латиницей',
                  admin: {
                    readOnly: true,
                    description: 'Транслитерация по ГОСТ 7.79-2000 (ISO-9), заполняется автоматически',
                  },
                },
              ],
            },
            {
              name: 'altIds',
              type: 'group',
              label: 'Дополнительные идентификаторы',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'isoId', type: 'text', label: 'ISO-ID (NIDENT)' },
                    { name: 'internationalId', type: 'text', label: 'Международный ID (Interbull)' },
                    { name: 'earTag', type: 'text', label: 'Номер ушной бирки' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'inventoryNumber', type: 'text', label: 'Инвентарный № (NINV)' },
                    { name: 'chipNumber', type: 'text', label: 'Номер чипа RFID (NINV1)' },
                    { name: 'chipDate', type: 'date', label: 'Дата чипирования' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'gpkMark', type: 'text', label: 'Марка ГПК' },
                    { name: 'gpkNumber', type: 'text', label: 'Номер в ГПК' },
                  ],
                },
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
                {
                  name: 'breed',
                  type: 'relationship',
                  relationTo: 'breeds',
                  label: 'Порода',
                },
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
              name: 'improvers',
              type: 'group',
              label: 'Породы-улучшатели (NPOR_UL1 / NKROVN1)',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'breed1',
                      type: 'relationship',
                      relationTo: 'breeds',
                      label: 'Улучшающая порода 1',
                    },
                    { name: 'share1', type: 'number', label: 'Доля крови 1, %', min: 0, max: 100 },
                    {
                      name: 'breed2',
                      type: 'relationship',
                      relationTo: 'breeds',
                      label: 'Улучшающая порода 2',
                    },
                    { name: 'share2', type: 'number', label: 'Доля крови 2, %', min: 0, max: 100 },
                  ],
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'coatColor',
                  type: 'relationship',
                  relationTo: 'coat-colors',
                  label: 'Масть',
                },
                {
                  name: 'bloodGroup',
                  type: 'relationship',
                  relationTo: 'blood-groups',
                  label: 'Группа крови',
                },
                {
                  name: 'purpose',
                  type: 'relationship',
                  relationTo: 'animal-purposes',
                  label: 'Назначение',
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
                  name: 'trustLevel',
                  type: 'number',
                  label: 'Уровень достоверности данных',
                  defaultValue: 0,
                  min: -1,
                  max: 3,
                  index: true,
                  admin: {
                    description:
                      'ТЗ, Таблица №4: −1 отклонено, 0 черновик, 1 проверено собственником, 2 подтверждено лабораторией, 3 верифицировано ассоциацией',
                  },
                },
                {
                  name: 'trustCheckedAt',
                  type: 'date',
                  label: 'Дата подтверждения',
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
        {
          // Витрина продаж: по нему работает быстрый отбор «Выставлены
          // на продажу» и, позже, раздел аукционов
          name: 'forSale',
          type: 'checkbox',
          label: 'Выставлено на продажу',
          defaultValue: false,
          index: true,
        },
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
              // Служебное поле сортировки. PostgreSQL при `ORDER BY ipc DESC`
              // ставит NULL первыми, поэтому животные без оценки вытесняли
              // из начала списка тех, у кого оценка есть. Здесь пустой ИПЦ
              // превращается в заведомо низкое число.
              name: 'ipcRank',
              type: 'number',
              label: 'Ранг по ИПЦ (служебное)',
              index: true,
              defaultValue: -1_000_000,
              admin: { hidden: true },
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
            { name: 'evaluationDate', type: 'date', label: 'Дата последней оценки' },
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
                    {
                      // Пара к summary.milkYield для сортировки по убыванию:
                      // пустое значение уходит в конец списка, а не в начало.
                      name: 'milkRank',
                      type: 'number',
                      label: 'Ранг по удою (служебное)',
                      index: true,
                      defaultValue: -1_000_000,
                      admin: { hidden: true },
                    },
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
                {
                  type: 'row',
                  fields: [
                    { name: 'fatKg', type: 'number', label: 'Жир, кг' },
                    { name: 'proteinKg', type: 'number', label: 'Белок, кг' },
                    { name: 'endDate', type: 'date', label: 'Дата окончания лактации' },
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
                  name: 'category',
                  type: 'relationship',
                  relationTo: 'breeding-categories',
                  label: 'Категория племучёта (NKAT)',
                },
                {
                  name: 'registrationBasis',
                  type: 'select',
                  label: 'Основание регистрации',
                  defaultValue: 'origin',
                  options: [
                    { value: 'origin', label: 'По происхождению (категория I)' },
                    { value: 'productivity', label: 'По продуктивности (категория II)' },
                  ],
                  admin: {
                    description:
                      'ТЗ, п. 1.5. Печатается в свидетельстве: «Племенная книга, категория II: внесено по продуктивности»',
                  },
                },
                {
                  name: 'breedingClass',
                  type: 'relationship',
                  relationTo: 'breeding-classes',
                  label: 'Класс (NKKLASS)',
                },
              ],
            },
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
              type: 'row',
              fields: [
                { name: 'line', type: 'relationship', relationTo: 'lines', label: 'Линия' },
                { name: 'family', type: 'relationship', relationTo: 'lines', label: 'Семейство' },
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
              type: 'row',
              fields: [
                { name: 'inbreeding', type: 'number', label: 'Коэффициент инбридинга, %' },
                {
                  name: 'inbreedingNeedsApproval',
                  type: 'checkbox',
                  label: 'Требует ручного подтверждения (инбридинг > 25%)',
                  defaultValue: false,
                  admin: { readOnly: true },
                },
              ],
            },
          ],
        },

        // ============================= ГЕНЕТИКА ========================== //
        {
          label: 'Генетика',
          fields: [
            {
              name: 'genetics',
              type: 'group',
              label: 'Генетические дефекты',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'cvm',
                      type: 'select',
                      label: 'CVM',
                      defaultValue: 'unknown',
                      options: CARRIER_OPTIONS,
                      admin: { description: 'Комплексная вертебральная малформация' },
                    },
                    {
                      name: 'blad',
                      type: 'select',
                      label: 'BLAD',
                      defaultValue: 'unknown',
                      options: CARRIER_OPTIONS,
                      admin: { description: 'Наследственный иммунодефицит' },
                    },
                    {
                      name: 'dumps',
                      type: 'select',
                      label: 'DUMPS',
                      defaultValue: 'unknown',
                      options: CARRIER_OPTIONS,
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'kappaCasein', type: 'text', label: 'Каппа-казеин (K_CAS)' },
                    { name: 'betaCasein', type: 'text', label: 'Бета-казеин (K_BCAS)' },
                    {
                      name: 'betaLactoglobulin',
                      type: 'text',
                      label: 'Бета-лактоглобулин (K_BLGLOB)',
                    },
                  ],
                },
              ],
            },
            {
              name: 'haplotypes',
              type: 'array',
              label: 'Гаплотипы',
              labels: { singular: 'Гаплотип', plural: 'Гаплотипы' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'type',
                      type: 'relationship',
                      relationTo: 'haplotype-types',
                      label: 'Тип',
                    },
                    {
                      name: 'status',
                      type: 'select',
                      label: 'Статус',
                      defaultValue: 'unknown',
                      options: CARRIER_OPTIONS,
                    },
                    { name: 'date', type: 'date', label: 'Дата определения' },
                  ],
                },
              ],
            },
            {
              name: 'dnaTests',
              type: 'array',
              label: 'ДНК-тесты',
              labels: { singular: 'ДНК-тест', plural: 'ДНК-тесты' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'type',
                      type: 'relationship',
                      relationTo: 'dna-test-types',
                      label: 'Тип теста',
                    },
                    { name: 'date', type: 'date', label: 'Дата' },
                    {
                      name: 'laboratory',
                      type: 'relationship',
                      relationTo: 'organizations',
                      label: 'Лаборатория',
                    },
                  ],
                },
                { name: 'result', type: 'text', label: 'Результат' },
                { name: 'file', type: 'upload', relationTo: 'media', label: 'Протокол' },
              ],
            },
          ],
        },

        // ======================== ДВИЖЕНИЕ И ВЫБЫТИЕ ===================== //
        {
          label: 'Движение',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'arrivalDate', type: 'date', label: 'Дата поступления (DATE_POSTU)' },
                {
                  name: 'previousOrganization',
                  type: 'relationship',
                  relationTo: 'organizations',
                  label: 'Предыдущее хозяйство (NHOZ_PRINA)',
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'disposalDate', type: 'date', label: 'Дата выбытия (DATE_V)' },
                {
                  name: 'disposalReason',
                  type: 'relationship',
                  relationTo: 'disposal-reasons',
                  label: 'Причина выбытия (NPV)',
                },
                {
                  name: 'disposalOrganization',
                  type: 'relationship',
                  relationTo: 'organizations',
                  label: 'Хозяйство выбытия (NHOZ_VYBPO)',
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'archived',
                  type: 'checkbox',
                  label: 'В архиве (ARXIV)',
                  defaultValue: false,
                  index: true,
                  admin: {
                    description:
                      'ТЗ, стр. 43: данные животных никогда не удаляются — только перевод в архив',
                  },
                },
                { name: 'archiveReason', type: 'text', label: 'Причина архивации' },
              ],
            },
          ],
        },
      ],
    },

    // ------------------------ Служебные поля аудита ---------------------- //
    {
      name: 'lastEditUser',
      type: 'relationship',
      relationTo: 'users',
      label: 'Кто изменил последним',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'lastEditTime',
      type: 'date',
      label: 'Когда изменено',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],

  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (!data) return data

        // Проверка формата индивидуального номера (ТЗ, UC-01 п. 6.1.2)
        if (data.identNumber) {
          const check = validateIdentNumber(data.identNumber, (data.idFormat ?? 'rf') as IdFormat)
          if (!check.ok) throw new Error(check.message)
        }

        // Родители не могут быть одним и тем же животным (запрет самозачатия)
        if (data.father && data.mother && String(data.father) === String(data.mother)) {
          throw new Error('Отец и мать не могут быть одним и тем же животным')
        }

        // Дата рождения не может быть в будущем
        if (data.birthDate && new Date(data.birthDate).getTime() > Date.now()) {
          throw new Error('Дата рождения не может быть в будущем')
        }

        if (operation === 'create' && !data.uuid) data.uuid = randomUUID()
        return data
      },
    ],

    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (operation === 'create' && req.user && !data.author) data.author = req.user.id

        // Аудит: кто и когда изменил (ТЗ, п. 1.6 — для MVP достаточно этих полей)
        if (req.user) data.lastEditUser = req.user.id
        data.lastEditTime = new Date().toISOString()

        // Ранги сортировки: пустые значения уходят в конец списка, а не в начало
        const ipcValue = data.ipc ?? originalDoc?.ipc
        data.ipcRank = typeof ipcValue === 'number' ? ipcValue : -1_000_000

        const milkValue = data.summary?.milkYield ?? originalDoc?.summary?.milkYield
        if (!data.summary || typeof data.summary !== 'object') data.summary = {}
        data.summary.milkRank = typeof milkValue === 'number' ? milkValue : -1_000_000

        // СБП = жир, кг + белок, кг
        const s = data?.summary
        if (s && typeof s.fatKg === 'number' && typeof s.proteinKg === 'number') {
          s.fatProteinSum = Math.round((s.fatKg + s.proteinKg) * 10) / 10
        }

        // Инбридинг выше 25% — запись сохраняется, но требует ручного утверждения
        const f = typeof data.inbreeding === 'number' ? data.inbreeding : originalDoc?.inbreeding
        data.inbreedingNeedsApproval = typeof f === 'number' && f > 25

        // Транслитерация клички по ISO-9 для международного обмена
        if (data.name) {
          const { transliterate } = await import('@/lib/animal-id')
          data.nameLatin = transliterate(data.name)
        }

        /*
         * Проверка родословной: потомок не может родиться раньше родителей.
         *
         * Проверяем только когда меняются сами даты или связи с родителями.
         * Иначе запись с уже накопленным противоречием становится нередактируемой
         * целиком: нельзя поправить даже кличку, пока не исправлены даты предка,
         * — а исправить их через ту же карточку тоже не выходит.
         */
        const pedigreeTouched =
          operation === 'create' ||
          (data.birthDate !== undefined && data.birthDate !== originalDoc?.birthDate) ||
          (data.father !== undefined && data.father !== originalDoc?.father) ||
          (data.mother !== undefined && data.mother !== originalDoc?.mother)

        if (pedigreeTouched && data.birthDate && (data.father || data.mother)) {
          const parentIds = [data.father, data.mother].filter(Boolean)
          for (const pid of parentIds) {
            try {
              const parent = await req.payload.findByID({
                collection: 'animals',
                id: pid as number,
                depth: 0,
                overrideAccess: true,
              })
              if (
                parent?.birthDate &&
                new Date(parent.birthDate).getTime() >= new Date(data.birthDate).getTime()
              ) {
                throw new Error(
                  `Дата рождения потомка не может быть раньше даты рождения родителя (${parent.identNumber})`,
                )
              }
            } catch (e) {
              if (e instanceof Error && e.message.startsWith('Дата рождения потомка')) throw e
              // родитель не найден — проверка пропускается
            }
          }
        }

        return data
      },
    ],
  },
}
