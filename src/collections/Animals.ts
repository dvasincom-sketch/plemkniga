import type { CollectionConfig } from 'payload'
import { randomUUID } from 'crypto'
import {
  AGE_GROUPS,
  ANIMAL_KINDS,
  COMPLEX_GRADES,
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
  /*
   * Отдельного индекса по `identNumber` здесь нет намеренно: поле объявлено
   * `unique`, а уникальность в PostgreSQL и есть индекс. Пара одинаковых
   * индексов на одной колонке — восемь мегабайт и лишняя работа при каждой
   * записи; второй из них аудит не застал в деле ни разу.
   */
  indexes: [{ fields: ['owner', 'state'] }],
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
                {
                  /*
                   * Комплексный класс по бонитировке — российская практика,
                   * которой нет ни в одном мировом каталоге. Он стоит
                   * рядом с породой и кровностью, а не в оценках: это
                   * не прогноз и не расчёт, а присвоенная категория,
                   * записанная в племенных документах хозяйства.
                   */
                  name: 'grade',
                  type: 'select',
                  label: 'Комплексный класс',
                  options: [...COMPLEX_GRADES],
                  admin: { description: 'По инструкции бонитировки, из племенных документов' },
                },
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
              /**
               * Хозяйства, которым запись принадлежала раньше.
               *
               * Заполняется хуком перемещения и нужен ровно для видимости:
               * хозяйство, которое внесло корову и вело её отёлы пять лет,
               * не должно потерять эти данные в день продажи. Правки ему
               * закрыты — карточку ведёт нынешний владелец, — но прошлое
               * остаётся видимым тому, кто его собрал.
               *
               * Список денормализован намеренно. Считать его на лету значило
               * бы на каждом показе книги искать по всей таблице перемещений
               * те, где хозяйство было отправителем, — а книга на горячем
               * пути, и таких животных у старого хозяйства тысячи.
               */
              name: 'pastOwners',
              type: 'relationship',
              relationTo: 'organizations',
              hasMany: true,
              label: 'Прежние владельцы',
              admin: { readOnly: true, description: 'Заполняется записью о перемещении' },
              access: { update: () => false },
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
              /*
                 Индекса здесь нет: сортируют не по этой колонке, а по служебной
                 `ipcRank` — она заполнена всегда и не пускает записи без оценки
                 в начало списка. Аудит подтвердил: по `ipc` не искали ни разу,
                 по `ipcRank` — постоянно.
              */
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
              /**
               * Оценка, привезённая вместе с животным.
               *
               * ## Почему у неё появилось имя
               *
               * Карточка показывала её безымянно: «ИПЦ, прогноз, R,
               * процентиль». На живой записи это дало вот что: наш расчёт
               * ставит корову в 99-й процентиль, привезённая оценка —
               * в 13-й. Одно и то же животное лучшее в стране и хуже
               * среднего одновременно. Подпись «разные оценки на разных
               * базах» такое не объясняет — она объясняет расхождение
               * в сотню очков, а не в восемьдесят шесть процентилей.
               *
               * Объяснить может только источник: чей центр считал, по какой
               * базе, на какую дату. Индекс TPI из американского каталога
               * и индекс расчётного центра области — разные величины,
               * и знать, какая перед тобой, обязан читатель, а не автор
               * импорта.
               *
               * Поля текстовые, а не перечисление. Центров и баз много,
               * список их меняется, и закрытый перечень означал бы, что
               * привезённую оценку из нового источника некуда положить, —
               * то есть отказ от данных ради опрятности справочника.
               */
              name: 'ipcDetails',
              type: 'group',
              label: 'Общий индекс племенной ценности',
              fields: [
                { name: 'forecast', type: 'number', label: 'Прогноз' },
                { name: 'r', type: 'number', label: 'R, %' },
                { name: 'percentile', type: 'number', label: 'Процентиль' },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'center',
                      type: 'text',
                      label: 'Кто оценивал',
                      admin: {
                        description:
                          'Расчётный центр или организация: CDCB, Lactanet, региональный центр, сама Ассоциация',
                      },
                    },
                    {
                      name: 'base',
                      type: 'text',
                      label: 'База сравнения',
                      admin: {
                        description:
                          'Как названа база у источника: CDCB-2025, Interbull-2024, «база 2020 года по области»',
                      },
                    },
                  ],
                },
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
                  label: 'Фертильность дочерей, балл',
                  admin: {
                    description:
                      'У быка это способность его дочерей приходить в охоту и оплодотворяться — ' +
                      'не его собственная. Собственная лежит в группе «Семя»',
                  },
                  fields: [...forecastFields()],
                },
              ],
            },
            {
              /*
               * Оплодотворяющая способность семени — единственный признак,
               * который у быка свой собственный.
               *
               * Всё остальное в карточке быка — прогноз по дочерям: ни удоя,
               * ни вымени, ни лактаций у него не бывает. Здесь наоборот:
               * измеряется он сам, а дочери ни при чём. Держать это в общей
               * группе «Воспроизводительные качества» рядом с фертильностью
               * дочерей значило бы поставить рядом две разные величины
               * под одним заголовком — их и так путают, о чём разбор
               * в `docs/karta-byka.md`.
               *
               * В США публикуется как SCR (Sire Conception Rate).
               */
              name: 'semen',
              type: 'group',
              label: 'Семя (только у быков)',
              admin: {
                description: 'Собственный признак быка, а не прогноз по дочерям',
              },
              fields: [
                {
                  name: 'conception',
                  type: 'group',
                  label: 'Оплодотворяющая способность, п.п.',
                  admin: {
                    description:
                      'Отклонение стельности от среднего по породе в процентных пунктах: ' +
                      '+2 означает, что в стаде со средней стельностью 30 % это семя даёт 32 %',
                  },
                  fields: [...forecastFields()],
                },
                {
                  /*
                   * Число осеменений — не украшение: достоверность этого
                   * признака зависит от него так же, как достоверность
                   * оценки по дочерям зависит от их числа. Без него
                   * «+2,1 п.п.» не отличить от вымысла.
                   */
                  name: 'inseminations',
                  type: 'number',
                  label: 'Осеменений в расчёте',
                  min: 0,
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
                    { name: 'milkYield', type: 'number', label: 'Удой, кг' },
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
                    { name: 'milkYield', type: 'number', label: 'У кг' },
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
                {
                  /*
                   * Вердикт списком, а не текстом в «Результате».
                   *
                   * Свидетельство требует «проведён тест на достоверность
                   * происхождения», и проверка выполнялась наличием любой
                   * записи о тесте. Тест, который отцовство **исключил**,
                   * требование удовлетворял, и свидетельство выпускалось.
                   *
                   * Починить это, читая свободный текст, нельзя: там лежит
                   * и «подтверждено», и «excluded», и «см. протокол»,
                   * и пустота. Система обязана знать вывод теста, а не
                   * пересказывать его строкой.
                   *
                   * Поле необязательное намеренно: у тестов, заведённых
                   * до этой правки, вердикта нет и взяться ему неоткуда.
                   * Сочинять его задним числом значило бы выдать догадку
                   * за результат лаборатории — свидетельство по таким
                   * записям просто не выпустится, пока вердикт не проставят.
                   */
                  name: 'verdict',
                  type: 'select',
                  label: 'Вывод теста',
                  options: [
                    { value: 'confirmed', label: 'Происхождение подтверждено' },
                    { value: 'excluded', label: 'Происхождение исключено' },
                    { value: 'inconclusive', label: 'Не определено' },
                  ],
                  admin: {
                    description:
                      'Свидетельство выпускается только при подтверждённом происхождении',
                  },
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
                      'Архив — не «удалено»: карточка уходит из книги и из кабинета, но след о ней остаётся в реестре удалённых записей навсегда',
                  },
                },
                { name: 'archiveReason', type: 'text', label: 'Причина архивации' },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  /*
                   * Дата архивации — не украшение журнала, а точка отсчёта.
                   *
                   * Архив перестал быть вечным: через тридцать дней карточку
                   * убирает `npm run archive:purge`. Считать этот срок больше
                   * не от чего — `updatedAt` меняется от любой правки, а
                   * `disposalDate` относится к животному, а не к записи о нём.
                   *
                   * Пустое значение у записи, лежащей в архиве, читается как
                   * «срок не начинался»: миграция проставила его всем прежним
                   * архивным записям датой самой миграции, чтобы включение
                   * правила не удалило их в тот же день.
                   */
                  name: 'archivedAt',
                  type: 'date',
                  label: 'Когда отправлено в архив',
                  index: true,
                  admin: { readOnly: true },
                },
                {
                  name: 'archivedBy',
                  type: 'relationship',
                  relationTo: 'users',
                  label: 'Кто отправил в архив',
                  admin: { readOnly: true },
                },
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
    /*
     * Зависимые записи удаляются вместе с животным.
     *
     * Почему это делает приложение, а не база. Payload строит внешние ключи
     * для обязательных связей одинаково: колонка `NOT NULL`, а ключ —
     * `ON DELETE SET NULL`. Комбинация внутренне противоречива: PostgreSQL
     * при удалении родителя пытается записать NULL и упирается в `NOT NULL`.
     * Фактическое поведение получается как у `ON DELETE RESTRICT`, только
     * сообщает о себе оно невнятно: «null value in column "animal_id"
     * violates not-null constraint» — про NULL, которого никто не просил.
     * Правило зашито в адаптере (`@payloadcms/drizzle`, `traverseFields`),
     * настройкой поля его не поменять, и подменять ключ руками в миграции
     * бессмысленно: `drizzle push` в разработке вернёт всё обратно.
     *
     * Поэтому вопрос решается там, где на него вообще есть ответ, —
     * в предметной области. Он звучит так: имеет ли запись смысл без
     * животного? Отёл, дойка, осеменение, случай болезни, запись в ленте,
     * значение индекса — не имеют: это факты о конкретном животном,
     * без него они не наблюдение, а мусор. Запрос доступа — тоже: он
     * существует только как разговор об этой карточке.
     *
     * Порядок перечисления не важен: всё уходит в одной транзакции `req`.
     */
    beforeDelete: [
      async ({ req, id }) => {
        const dependents = [
          'access-requests',
          'calvings',
          'milk-tests',
          'inseminations',
          'health-events',
          'events',
          'index-values',
          /*
           * Журнал правок тоже уходит вместе с животным. Спорно — история
           * изменений выглядит как то, что стоило бы пережить запись, —
           * но `animal_revisions.animal_id` объявлена `NOT NULL`, а внешний
           * ключ Payload делает `ON DELETE SET NULL`: оставленный журнал
           * не даст удалить животное вовсе. И держать правки животного,
           * которого нет, незачем: без карточки они не восстановимы
           * и ничего не значат.
           */
          'animal-revisions',
          /*
           * Точечные доступы к этому животному — и здесь не «за компанию»,
           * а обязательно.
           *
           * У гранта поле `animal` необязательное, и пустота означает
           * «открыто всё стадо владельца». Внешний ключ Payload делает
           * `ON DELETE SET NULL` — то есть удаление животного превратило бы
           * грант на одну корову в грант на всё хозяйство, молча и задним
           * числом. Не потеря данных, а выдача прав, которых никто не давал.
           *
           * Журнал просмотров уходит следом по обычному доводу: обращения
           * к карточке, которой нет, ничего не доказывают.
           */
          'access-grants',
          'access-views',
        ] as const

        for (const collection of dependents) {
          await req.payload.delete({
            collection,
            where: { animal: { equals: id } },
            overrideAccess: true,
            req,
          })
        }

        /*
         * Осеменения ссылаются на животное дважды: как на осеменённую корову
         * и как на быка-производителя. Удаление быка не должно стирать
         * осеменения чужих коров — там теряется вся запись о событии.
         * Поэтому ссылка на быка просто снимается: поле необязательное,
         * а «осеменение быком, которого больше нет в книге» — состояние
         * вполне описуемое.
         */
        await req.payload.update({
          collection: 'inseminations',
          where: { bull: { equals: id } },
          overrideAccess: true,
          data: { bull: null },
          req,
        })

        /*
         * Потомки: ссылка на родителя необязательна, поэтому база сама
         * поставит NULL и ничего не заметит. А заметить есть что — из
         * родословной пропадёт ряд предков, причём молча.
         *
         * Перед удалением номер и кличка переезжают в `pedigreeText`
         * потомка — тот самый слой «родословная по бумаге, а не по книге»,
         * которым карточка уже умеет пользоваться (`src/lib/pedigree.ts`).
         * Так связь превращается из ссылки в запись со слов документа,
         * а не исчезает. Заполняем только пустые слоты: если бумажные
         * данные там уже есть, они старше и достовернее наших.
         */
        const doomed = await req.payload.findByID({
          collection: 'animals',
          id,
          depth: 0,
          overrideAccess: true,
          req,
        })

        if (doomed) {
          const snapshot = { id: doomed.identNumber ?? null, name: doomed.name ?? null }

          for (const side of ['father', 'mother'] as const) {
            const children = await req.payload.find({
              collection: 'animals',
              where: { [side]: { equals: id } },
              limit: 0,
              depth: 0,
              overrideAccess: true,
              req,
            })

            for (const child of children.docs) {
              const text = child.pedigreeText ?? {}
              if (text[`${side}Id`] || text[`${side}Name`]) continue
              await req.payload.update({
                collection: 'animals',
                id: child.id,
                overrideAccess: true,
                data: {
                  pedigreeText: {
                    ...text,
                    [`${side}Id`]: snapshot.id,
                    [`${side}Name`]: snapshot.name,
                  },
                },
                req,
              })
            }
          }
        }
      },
    ],
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

        /*
         * Дата рождения не может быть в будущем — но «будущее» приходится
         * считать с запасом на часовые пояса, и это не послабление.
         *
         * Дата рождения — календарный день, и хранится он полуночью UTC:
         * «26 августа» ложится в базу как `2026-08-26T00:00:00Z`. Сервер
         * же сравнивал это с текущим моментом. Для зоотехника восточнее
         * Гринвича сегодняшний день наступает раньше, чем эта полночь:
         * во Владивостоке в девять утра по UTC ещё вчерашний вечер,
         * и запись о телёнке, который стоит перед человеком, отвергалась
         * со словами «дата рождения не может быть в будущем».
         *
         * Россия — девять часовых поясов до UTC+12, и для большей их части
         * это происходило бы каждый день до самого вечера. То есть проверка
         * ловила не ошибку ввода, а географию пользователя.
         *
         * Запас в сутки закрывает весь диапазон и почти ничего не пропускает:
         * настоящая опечатка в дате — это год или месяц, промах на день
         * вперёд не отличим от «родился сегодня» ни одним правилом.
         * Строгое сравнение осталось бы точнее ровно на один день
         * и неверным для половины страны.
         */
        const DAY_MS = 24 * 60 * 60 * 1000
        if (data.birthDate && new Date(data.birthDate).getTime() > Date.now() + DAY_MS) {
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

              /*
               * Отказ поиска родителя пропускает проверку — но не молча.
               *
               * Здесь стояло `catch` с примечанием «родитель не найден».
               * Отсутствие записи — действительно не повод отклонять
               * правку: связь могла указывать на животное, удалённое
               * из книги, и запереть карточку из-за этого нельзя.
               *
               * Беда в том, что тот же `catch` глотал всё остальное:
               * обрыв соединения, отказ доступа, ошибку схемы. Проверка
               * родословной при этом не выполнялась, а выглядело так,
               * будто она выполнилась и возражений не нашла. Наше
               * правило про `.catch(() => [])` ровно об этом: поломка,
               * превращённая в тишину, становится ложью — и обнаружится
               * она уже в виде потомка, родившегося раньше отца.
               *
               * Теперь пропуск остаётся, а запись в лог появляется.
               * Ошибку в лог кладём целиком: без неё «проверка
               * пропущена» тоже ничего не объясняет.
               */
              req.payload.logger.warn(
                { err: e, animal: data.identNumber, parent: pid },
                'Проверка родословной пропущена: не удалось прочитать родителя',
              )
            }
          }
        }

        return data
      },
    ],

    /*
     * Индекс племенной ценности хранится рассчитанным — по строке на пару
     * «животное + профиль». Оценки изменились, значит изменился и индекс:
     * пересчитываем это животное по всем профилям.
     *
     * Ошибка пересчёта не отменяет сохранение животного. Данные о животном
     * первичны, индекс — производная от них; уронить сохранение из-за
     * производной значило бы поменять их местами. Расхождение потом видно
     * в списке и чинится `npm run backfill:index`.
     */
    afterChange: [
      /*
       * Фотография открыта ровно настолько, насколько открыта карточка.
       *
       * Файлы по умолчанию закрыты (`src/collections/Media.ts`), а фото
       * публичного животного — часть книги, и посетитель обязан его видеть.
       * Вывести это из связей правило чтения не может: оно отдаёт одно
       * условие на выборку и в чужие таблицы не ходит. Поэтому признак
       * держится в самом файле, а согласованность — здесь.
       *
       * Момент важен: без этого хука хозяйство, закрывшее карточку,
       * оставляло бы фотографию открытой навсегда — и «закрыл» означало бы
       * «закрыл почти всё».
       */
      async ({ doc, previousDoc, req, operation }) => {
        const photo = doc?.photo
        const photoId = typeof photo === 'object' && photo ? photo.id : photo
        if (typeof photoId !== 'number') return doc

        const nowPublic = Boolean(doc?.publicVisible)
        const wasPublic = Boolean(previousDoc?.publicVisible)
        const prevPhoto = previousDoc?.photo
        const prevPhotoId = typeof prevPhoto === 'object' && prevPhoto ? prevPhoto.id : prevPhoto

        const changed = operation === 'create' || nowPublic !== wasPublic || photoId !== prevPhotoId
        if (!changed) return doc

        try {
          await req.payload.update({
            collection: 'media',
            id: photoId,
            overrideAccess: true,
            req,
            data: {
              visibility: nowPublic ? 'public' : 'private',
              ...(doc.owner ? { owner: doc.owner } : {}),
            },
          })
        } catch {
          /*
           * Молча: несогласованная видимость файла — беда, но меньшая,
           * чем отменённая правка карточки. Пересчитать её можно
           * скриптом, потерянную правку — ничем.
           */
        }
        return doc
      },
      /*
       * Журнал правок (ТЗ, п. 1.6).
       *
       * Пишется после сохранения и намеренно не в транзакции карточки:
       * упавшая запись в журнал не должна отменять принятую правку. Обратное
       * — правка принята, а следа нет — тоже плохо, но чинится пересчётом
       * из истории, тогда как потерянная правка не чинится ничем.
       *
       * Что не журналится:
       *  • создание — правок ещё не было, вся карточка и есть первая версия;
       *  • загрузка файлом — у неё свой след, пакет данных с исходником;
       *    построчное дублирование дало бы сорок тысяч записей на импорт
       *    и утопило бы в них те несколько, что ввели руками;
       *  • пересчёт индекса и снимки оценок — это следствия, а не правки.
       *
       * Различает их `req.context`: тот, кто правит не от имени человека,
       * ставит флаг сам. Полагаться на «есть ли req.user» нельзя — импорт
       * идёт как раз от имени приславшего файл.
       */
      async ({ doc, req, previousDoc, operation, context }) => {
        if (operation === 'update' && !context?.skipJournal) {
          try {
            const { diffAnimal } = await import('@/lib/animal-journal')
            const changes = await diffAnimal(req, previousDoc, doc)

            for (const change of changes) {
              await req.payload.create({
                collection: 'animal-revisions',
                overrideAccess: true,
                req,
                data: {
                  animal: doc.id,
                  at: new Date().toISOString(),
                  user: req.user?.id ?? null,
                  path: change.path,
                  label: change.label,
                  before: change.before,
                  after: change.after,
                  source: context?.journalSource === 'admin' ? 'admin' : 'manual',
                },
              })
            }
          } catch (e) {
            req.payload.logger.error(
              `Не удалось записать правки животного ${doc.identNumber}: ${
                e instanceof Error ? e.message : e
              }`,
            )
          }
        }

        const { skipRecompute, recomputeAnimal } = await import('@/lib/index-values')
        if (skipRecompute()) return doc
        try {
          await recomputeAnimal(req.payload, doc, { req })
        } catch (e) {
          req.payload.logger.error(
            `Не удалось пересчитать индекс животного ${doc.identNumber}: ${
              e instanceof Error ? e.message : e
            }`,
          )
        }
        return doc
      },
    ],

    /*
     * Здесь был `afterDelete`, убиравший значения индекса. Он не работал
     * и не мог: `index_values.animal_id` объявлена `NOT NULL`, поэтому
     * удаление животного падало ещё до «после удаления». Хуже того, вызов
     * шёл без `req` — то есть по отдельному подключению, мимо открытой
     * транзакции удаления, — и вместо ошибки получалось ожидание блокировки
     * до таймаута. Молчаливый `catch` довершал картину: снаружи операция
     * выглядела просто зависшей.
     *
     * Значения индекса теперь убираются в `beforeDelete` вместе с прочими
     * зависимыми записями и внутри той же транзакции.
     */
  },
}
