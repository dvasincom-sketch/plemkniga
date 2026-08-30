import type { CollectionConfig, Field } from 'payload'
import { anyone, isAdmin } from '@/access'

/**
 * Справочники системы (НСИ).
 *
 * ТЗ, Приложение №1 п. 1.2: обязательный минимум полей любого справочника —
 * ID (PK), код, наименование, описание. Управление — через админ-интерфейс
 * (Таблица №3, требование №20), поэтому справочники живут в БД, а не в коде.
 */

const baseFields: Field[] = [
  {
    type: 'row',
    fields: [
      {
        name: 'code',
        type: 'text',
        label: 'Код',
        required: true,
        unique: true,
        index: true,
        admin: { description: 'Короткое обозначение или числовой код из «Селэкс»' },
      },
      { name: 'name', type: 'text', label: 'Наименование', required: true },
      {
        name: 'sortOrder',
        type: 'number',
        label: 'Порядок',
        defaultValue: 100,
        admin: { description: 'Чем меньше, тем выше в списках' },
      },
    ],
  },
  { name: 'description', type: 'textarea', label: 'Описание' },
  {
    /*
     * Ключ той же записи в реестре ФГИАС ПР.
     *
     * Двадцать шаблонов ФГИАС заполняются не словами, а ключами: порода
     * это `1bd6b3f1-648a-…`, а не «Голштинская». Без этого поля выгрузка
     * безадресна — реестр примет только ключ.
     *
     * Проставляется сверкой `sync:fgias-nsi` по наименованию и правится
     * руками там, где названия разошлись. Руками — потому что сверка
     * по названию иногда не находит пару, а иногда находит не ту, и оба
     * случая должен закрывать человек, а не второй круг угадывания.
     */
    name: 'fgiasUuid',
    type: 'text',
    label: 'Ключ ФГИАС ПР',
    index: true,
    admin: {
      description: 'UUID той же записи в государственном реестре. Заполняется сверкой',
    },
  },
  {
    name: 'isActive',
    type: 'checkbox',
    label: 'Используется',
    defaultValue: true,
    admin: { description: 'Снимите галочку, чтобы скрыть из выпадающих списков' },
  },
]

type DictArgs = {
  slug: string
  singular: string
  plural: string
  /** Описание в админке — какому полю «Селэкс» соответствует. */
  legacyField?: string
  extraFields?: Field[]
}

export const dictionary = ({
  slug,
  singular,
  plural,
  legacyField,
  extraFields = [],
}: DictArgs): CollectionConfig => ({
  slug,
  labels: { singular, plural },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['code', 'name', 'isActive'],
    group: 'Справочники',
    description: legacyField ? `Соответствует полю «${legacyField}» в ИАС «Селэкс»` : undefined,
  },
  access: {
    read: anyone,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  defaultSort: 'sortOrder',
  fields: [...baseFields, ...extraFields],
})

/* ------------------------------------------------------------------ */
/*                          Конкретные справочники                      */
/* ------------------------------------------------------------------ */

export const Breeds = dictionary({
  slug: 'breeds',
  singular: 'Порода',
  plural: 'Породы',
  legacyField: 'NPOR',
  extraFields: [
    {
      type: 'row',
      fields: [
        {
          name: 'whffCode',
          type: 'text',
          label: 'Код WHFF',
          admin: { description: 'Трёхбуквенный код: HOL — голштинская, JER — джерсейская' },
        },
        {
          name: 'isImprover',
          type: 'checkbox',
          label: 'Может использоваться как порода-улучшатель',
          defaultValue: false,
        },
      ],
    },
  ],
})

export const Lines = dictionary({
  slug: 'lines',
  singular: 'Линия / семейство',
  plural: 'Линии и семейства',
  legacyField: 'NLIN / NVETKA / FAMILY',
  extraFields: [
    {
      name: 'kind',
      type: 'select',
      label: 'Тип',
      defaultValue: 'line',
      options: [
        { value: 'line', label: 'Линия' },
        { value: 'branch', label: 'Ветвь' },
        { value: 'family', label: 'Маточное семейство' },
      ],
    },
    {
      name: 'parentLine',
      type: 'relationship',
      relationTo: 'lines',
      label: 'Родительская линия',
    },
  ],
})

export const BreedingCategories = dictionary({
  slug: 'breeding-categories',
  singular: 'Категория племучёта',
  plural: 'Категории племучёта',
  legacyField: 'NKAT',
  extraFields: [
    {
      name: 'allowsIncompletePedigree',
      type: 'checkbox',
      label: 'Допускает неполную родословную',
      defaultValue: false,
      admin: {
        description:
          'Отмечается для категории II — животное внесено по продуктивности (ТЗ, п. 1.5)',
      },
    },
  ],
})

export const BreedingClasses = dictionary({
  slug: 'breeding-classes',
  singular: 'Класс племенной ценности',
  plural: 'Классы племенной ценности',
  legacyField: 'NKKLASS',
})

export const AnimalPurposes = dictionary({
  slug: 'animal-purposes',
  singular: 'Назначение животного',
  plural: 'Назначения животного',
  legacyField: 'NNAZNACH',
})

export const DisposalReasons = dictionary({
  slug: 'disposal-reasons',
  singular: 'Причина выбытия',
  plural: 'Причины выбытия',
  legacyField: 'NPV',
})

export const CoatColors = dictionary({
  slug: 'coat-colors',
  singular: 'Масть',
  plural: 'Масти',
  legacyField: 'NMAST',
})

export const BloodGroups = dictionary({
  slug: 'blood-groups',
  singular: 'Группа крови',
  plural: 'Группы крови',
  legacyField: 'GRUPPA_KRO',
})

export const ReproductionMethods = dictionary({
  slug: 'reproduction-methods',
  singular: 'Метод воспроизводства',
  plural: 'Методы воспроизводства',
  legacyField: 'NRIP',
})

export const SemenTypes = dictionary({
  slug: 'semen-types',
  singular: 'Тип биоматериала',
  plural: 'Типы биоматериала',
  legacyField: 'NTIP_SPERM',
})

export const InseminationResults = dictionary({
  slug: 'insemination-results',
  singular: 'Результат осеменения',
  plural: 'Результаты осеменения',
  legacyField: 'NREZOT',
})

export const DnaTestTypes = dictionary({
  slug: 'dna-test-types',
  singular: 'Тип ДНК-теста',
  plural: 'Типы ДНК-тестов',
  extraFields: [
    {
      name: 'markerKind',
      type: 'select',
      label: 'Вид маркера',
      defaultValue: 'genetic-defect',
      options: [
        { value: 'genetic-defect', label: 'Генетический дефект' },
        { value: 'protein', label: 'Генотип молочного белка' },
        { value: 'parentage', label: 'Подтверждение происхождения' },
        { value: 'genomic-evaluation', label: 'Геномная оценка' },
      ],
    },
  ],
})

export const HaplotypeTypes = dictionary({
  slug: 'haplotype-types',
  singular: 'Тип гаплотипа',
  plural: 'Типы гаплотипов',
})

export const HealthEventTypes = dictionary({
  slug: 'health-event-types',
  singular: 'Тип события здоровья',
  plural: 'Типы событий здоровья',
  extraFields: [
    {
      name: 'affectsProductivity',
      type: 'checkbox',
      label: 'Влияет на оценку продуктивности',
      defaultValue: false,
      admin: {
        description:
          'Периоды таких событий могут исключаться из расчётов (ТЗ, п. 5.6, требование №4)',
      },
    },
  ],
})

/** Специалисты по осеменению — справочник с расширенным составом полей. */
export const Technicians: CollectionConfig = {
  slug: 'technicians',
  labels: { singular: 'Специалист ИО', plural: 'Специалисты по осеменению' },
  admin: {
    useAsTitle: 'fullName',
    defaultColumns: ['fullName', 'certificateNumber', 'organization'],
    group: 'Справочники',
    description: 'Соответствует полю «NTEXN» в ИАС «Селэкс»',
  },
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'fullName', type: 'text', label: 'ФИО', required: true },
        { name: 'certificateNumber', type: 'text', label: 'Номер удостоверения' },
      ],
    },
    {
      name: 'organization',
      type: 'relationship',
      relationTo: 'organizations',
      label: 'Организация',
    },
    { name: 'isActive', type: 'checkbox', label: 'Работает', defaultValue: true },
  ],
}

export const DICTIONARY_COLLECTIONS: CollectionConfig[] = [
  Breeds,
  Lines,
  BreedingCategories,
  BreedingClasses,
  AnimalPurposes,
  DisposalReasons,
  CoatColors,
  BloodGroups,
  ReproductionMethods,
  SemenTypes,
  InseminationResults,
  DnaTestTypes,
  HaplotypeTypes,
  HealthEventTypes,
  Technicians,
]
