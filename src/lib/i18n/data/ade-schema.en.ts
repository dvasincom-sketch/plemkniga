import type {
  AdeResourceName,
  AdeResourceText,
  AdeSchemaDir,
  AdeThemeKey,
  AdeThemeText,
} from '@/lib/ade-schema-map'
import type { TextTable } from '@/lib/i18n/data-text'

/**
 * Подписи карты схем ICAR по-английски: наши ресурсы, темы стандарта
 * за пределами книги и заголовки групп схем.
 *
 * Словарь вычитан и до переезда сюда жил парными полями `titleEn`,
 * `whatEn`, `whyEn` рядом с русскими; формулировки перенесены дословно.
 * Имена самих схем (`icarAnimalCoreResource` и прочие) переводу
 * не подлежат ни здесь, ни в остальных языках: это идентификаторы
 * стандарта, по которым ищут в его репозитории.
 *
 * Имена ресурсов взяты из самого стандарта, а не переведены с русского:
 * `parturition`, `type classification`, `test-day result` — это слова
 * ADE, и партнёр ищет по ним, а не по нашему пересказу. Каталоги названы
 * так, как они и лежат у ICAR.
 */
export const ADE_RESOURCES_EN: TextTable<AdeResourceName, AdeResourceText> = {
  icarAnimalCoreResource: {
    title: 'Animal',
    what: 'The record: identifiers, sex, date of birth, breed, parents.',
  },
  icarTestDayResultEventResource: {
    title: 'Test-day result',
    what: 'Daily yield, fat, protein and somatic cells on a date.',
  },
  icarReproParturitionEventResource: {
    title: 'Parturition',
    what: 'Date, parity, calving ease, the list of calves with sex and status.',
  },
  icarReproInseminationEventResource: {
    title: 'Insemination',
    what: 'Date, service number, sire, method of reproduction.',
  },
  icarWeightEventResource: {
    title: 'Weight',
    what: 'Live weight on a date, in kilograms.',
  },
  icarReproPregnancyCheckEventResource: {
    title: 'Pregnancy check',
    what: 'The result of the test; it lives on the insemination and has no record of its own.',
  },
  icarTypeClassificationEventResource: {
    title: 'Type classification',
    what: 'Linear traits and composite scores, with the classifier named.',
  },
  icarBreedingValueResource: {
    title: 'Breeding value',
    what: 'Index value, reliability, weight profile, comparison base.',
  },
  icarMovementArrivalEventResource: {
    title: 'Arrival',
    what: 'The animal came to the holding: purchase, import, transfer.',
  },
  icarMovementDepartureEventResource: {
    title: 'Departure',
    what: 'The animal left: sale, transfer, culling for slaughter.',
  },
  icarMovementDeathEventResource: {
    title: 'Death',
    what: 'Death on the farm — a separate resource with fields of its own.',
  },
}

export const ADE_THEMES_EN: TextTable<AdeThemeKey, AdeThemeText> = {
  feed: {
    title: 'Feed and rations',
    why:
      'Feeding is kept in the herd management system; the book needs the result, not the ration.',
  },
  health: {
    title: 'Health and treatment',
    why: 'The veterinary side is separate both in law and in responsibility.',
  },
  slaughter: {
    title: 'Slaughter and carcasses',
    why: 'Meat recording: another industry, other measurements, another consumer.',
  },
  groups: {
    title: 'Animal groups',
    why: 'Group events and sorting are needed by robots on the farm, not by the book.',
  },
  devices: {
    title: 'Devices and sensors',
    why:
      'Readings from the milking parlour and from sensors are raw material for the farm; ' +
      'the book takes the result.',
  },
  inventory: {
    title: 'Inventory and turnover',
    why: 'Stock and the movement of goods are the holding’s task, not that of breed recording.',
  },
  repro: {
    title: 'Reproduction beyond ours',
    why: 'Heats, abortions, embryo transfer — the next step, named in the ICAR section map.',
  },
  milk: {
    title: 'Milk beyond ours',
    why: 'Milking detail by quarter and by visit; the book keeps test-day recordings.',
  },
  other: {
    title: 'The rest of the standard core',
    why: 'Common ancestors, references to resources, service wrappers for collections.',
  },
}

export const ADE_DIRS_EN: TextTable<AdeSchemaDir, string> = {
  resources: 'Resources',
  types: 'Types',
  enums: 'Enumerations',
  collections: 'Collections',
}
