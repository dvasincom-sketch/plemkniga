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
          label: 'Код породы (WHFF / ICAR)',
          admin: {
            description:
              'Трёхбуквенный код: HOL — голштинская, JER — джерсейская. Справочник ведёт ' +
              'Interbull, один и тот же код у WHFF и ICAR. Уезжает в обмен по ADE ' +
              'и входит в международный номер животного; без него порода наружу не идёт',
          },
        },
        {
          name: 'isImprover',
          type: 'checkbox',
          label: 'Может использоваться как порода-улучшатель',
          defaultValue: false,
        },
      ],
    },
    {
      /*
       * Направление продуктивности — из реестра, а не на глаз.
       *
       * Оно уже приходило из ФГИАС ПР полем `direction_name`, но нигде
       * не сохранялось: скрипт синхронизации отбирал по нему молочные
       * и универсальные и выбрасывал. Пока никто не спрашивал «какие
       * породы книга ведёт», это сходило с рук; каталог пород задаёт
       * ровно этот вопрос, а ответить на него по названию нельзя —
       * «симментальская» универсальная, «герефордская» мясная, и знать
       * это должен справочник, а не человек, набирающий страницу.
       */
      name: 'direction',
      type: 'select',
      label: 'Направление продуктивности',
      options: [
        { value: 'dairy', label: 'Молочное' },
        { value: 'dual', label: 'Универсальное' },
        { value: 'beef', label: 'Мясное' },
        { value: 'other', label: 'Прочее' },
      ],
      admin: {
        description:
          'Берётся из реестра ФГИАС ПР при синхронизации. Каталог пород на витрине ' +
          'показывает молочные и универсальные: только их книга умеет вести целиком',
      },
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
/**
 * Территория рождения — три справочника из реестра ФГИАС ПР.
 *
 * ## Зачем они в книге, если это чужие списки
 *
 * Шаблон «Основные сведения» требует страну, регион и район рождения
 * ключами реестра, и без них строка не полна. Взять ключ на лету нельзя:
 * выгрузка обязана работать там, где стоит компьютер, а не там, где есть
 * интернет.
 *
 * Поэтому списки загружаются один раз (`npm run sync:fgias-geo`) и живут
 * у нас — как порода и линия, с той же колонкой `fgiasUuid`.
 *
 * ## Почему справочниками, а не полями
 *
 * Районов в реестре тысячи. Выпадающий список из констант тут не годится
 * ни по размеру, ни по сути: список меняет государство, а не мы,
 * и хранить его копию в коде значило бы обновлять код при каждом
 * переименовании района.
 *
 * ## Регион у организации остаётся своим
 *
 * У хозяйства уже есть поле `region` — выбор из наших констант, по нему
 * ищут и отчитываются. Здесь другой вопрос: где **родилось животное**,
 * и ответ на него нужен ключом реестра. Свести их в одно поле значило бы
 * привязать поиск по книге к чужому справочнику ради одной колонки
 * выгрузки.
 */
export const Countries = dictionary({
  slug: 'countries',
  singular: 'Страна',
  plural: 'Страны',
})

export const Regions = dictionary({
  slug: 'regions',
  singular: 'Регион',
  plural: 'Регионы',
})

export const Districts = dictionary({
  slug: 'districts',
  singular: 'Район',
  plural: 'Районы',
})

/**
 * Тип породы — отдельный справочник реестра, а не свойство породы.
 *
 * У нас породы и их типы лежали в одном списке: «Голштинская» рядом
 * с «Чёрно-пёстрой голштинской». Реестр их разделяет и спрашивает
 * отдельными колонками, и это разделение по существу верное: тип —
 * подразделение внутри породы, и складывать их в один справочник значит
 * терять способность посчитать поголовье по породе.
 */
export const BreedTypes = dictionary({
  slug: 'breed-types',
  singular: 'Тип породы',
  plural: 'Типы пород',
})

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
  Countries,
  Regions,
  Districts,
  BreedTypes,
  Technicians,
]
