/**
 * Наполнение справочников (НСИ) значениями из ТЗ, Приложение №1 п. 1.2.
 * Коды сохраняют нумерацию ИАС «Селэкс», чтобы упростить будущую миграцию.
 */

type Row = { code: string; name: string; description?: string; sortOrder?: number } & Record<
  string,
  unknown
>

export const BREEDS: Row[] = [
  { code: '1', name: 'Голштинская', whffCode: 'HOL', sortOrder: 10 },
  /*
   * У чёрно-пёстрой кода Interbull нет, и стоявший здесь `BLW` был
   * выдуман: в списке такого кода не существует вовсе. Порода
   * отечественная и в международной торговле семенем не участвует,
   * а `RU_TO_ICAR` её намеренно ни с чем не сопоставляет — переводчик
   * уверенно поставил бы `HOL`, и это объявило бы чужой стране чужую
   * породу. Пусто здесь — не пробел, а факт.
   */
  { code: '2', name: 'Чёрно-пёстрая', sortOrder: 20 },
  { code: '3', name: 'Симментальская', whffCode: 'SIM', isImprover: true, sortOrder: 30 },
  { code: '4', name: 'Джерсейская', whffCode: 'JER', isImprover: true, sortOrder: 40 },
  /* Айрширская у Interbull входит в европейскую красную молочную, `RDC`;
     кода `AYR` в списке нет, хотя выглядит он убедительнее верного. */
  { code: '5', name: 'Айрширская', whffCode: 'RDC', isImprover: true, sortOrder: 50 },
  { code: '6', name: 'Красно-пёстрая', whffCode: 'RED', sortOrder: 60 },
  { code: '7', name: 'Бурая швицкая', whffCode: 'BSW', isImprover: true, sortOrder: 70 },
]

export const LINES: Row[] = [
  { code: 'L-198998', name: 'Рефлекшн Соверинг 198998', kind: 'line', sortOrder: 10 },
  { code: 'L-1013415', name: 'Вис Бэк Айдиал 1013415', kind: 'line', sortOrder: 20 },
  { code: 'L-95679', name: 'Монтвик Чифтейн 95679', kind: 'line', sortOrder: 30 },
  { code: 'L-252803', name: 'Силинг Трайджун Рокит 252803', kind: 'line', sortOrder: 40 },
  { code: 'F-01', name: 'Семейство Ромашки', kind: 'family', sortOrder: 50 },
  { code: 'F-02', name: 'Семейство Зорьки', kind: 'family', sortOrder: 60 },
  { code: 'F-03', name: 'Семейство Берёзки', kind: 'family', sortOrder: 70 },
]

export const BREEDING_CATEGORIES: Row[] = [
  {
    code: '0',
    name: 'Нефондовое (неплеменное)',
    description: 'Товарное животное, в племенную книгу не внесено',
    sortOrder: 10,
  },
  {
    code: 'I',
    name: 'Категория I — по происхождению',
    description: 'Полная родословная, оба родителя племенные',
    sortOrder: 20,
  },
  {
    code: 'II',
    name: 'Категория II — по продуктивности',
    description:
      'Внесено по результатам продуктивности при неполной родословной. Дочери такого животного получают категорию I',
    allowsIncompletePedigree: true,
    sortOrder: 30,
  },
]

export const BREEDING_CLASSES: Row[] = [
  { code: '0', name: 'Нет оценки', sortOrder: 10 },
  { code: '1', name: 'Элита-рекорд', sortOrder: 20 },
  { code: '2', name: 'Элита', sortOrder: 30 },
  { code: '3', name: 'I класс', sortOrder: 40 },
  { code: '4', name: 'II класс', sortOrder: 50 },
]

export const ANIMAL_PURPOSES: Row[] = [
  { code: '1', name: 'Племенное ядро', sortOrder: 10 },
  { code: '2', name: 'Товарное молочное стадо', sortOrder: 20 },
  { code: '3', name: 'Откорм / мясо', sortOrder: 30 },
]

export const DISPOSAL_REASONS: Row[] = [
  { code: '1', name: 'Убой', sortOrder: 10 },
  { code: '2', name: 'Падёж', sortOrder: 20 },
  { code: '3', name: 'Продажа в племенное хозяйство', sortOrder: 30 },
  { code: '4', name: 'Выбраковка по здоровью', sortOrder: 40 },
  { code: '5', name: 'Выбраковка по продуктивности', sortOrder: 50 },
  { code: '6', name: 'Проблемы воспроизводства', sortOrder: 60 },
]

export const COAT_COLORS: Row[] = [
  { code: '1', name: 'Чёрно-пёстрая', sortOrder: 10 },
  { code: '2', name: 'Красно-пёстрая', sortOrder: 20 },
  { code: '3', name: 'Красная', sortOrder: 30 },
  { code: '4', name: 'Пёстрая', sortOrder: 40 },
]

export const BLOOD_GROUPS: Row[] = [
  'A', 'B', 'C', 'F-V', 'J', 'L', 'M', 'N', 'S', 'Z', 'R-S', 'T',
].map((g, i) => ({ code: g, name: `Группа ${g}`, sortOrder: (i + 1) * 10 }))

export const REPRODUCTION_METHODS: Row[] = [
  { code: '1', name: 'Искусственное осеменение', sortOrder: 10 },
  { code: '2', name: 'Естественная случка', sortOrder: 20 },
  { code: '3', name: 'Эмбриотрансфер', sortOrder: 30 },
]

export const SEMEN_TYPES: Row[] = [
  { code: '1', name: 'Обычная (несексированная)', sortOrder: 10 },
  { code: '2', name: 'Сексированная (X-семя)', sortOrder: 20 },
  { code: '3', name: 'Эмбрион', sortOrder: 30 },
]

export const INSEMINATION_RESULTS: Row[] = [
  { code: '1', name: 'Стельная', sortOrder: 10 },
  { code: '2', name: 'Яловая', sortOrder: 20 },
  { code: '3', name: 'Выкидыш', sortOrder: 30 },
  { code: '4', name: 'Ожидает проверки', sortOrder: 40 },
]

export const DNA_TEST_TYPES: Row[] = [
  { code: 'CVM', name: 'CVM — комплексная вертебральная малформация', markerKind: 'genetic-defect', sortOrder: 10 },
  { code: 'BLAD', name: 'BLAD — наследственный иммунодефицит', markerKind: 'genetic-defect', sortOrder: 20 },
  { code: 'DUMPS', name: 'DUMPS — дефицит уридинмонофосфатсинтазы', markerKind: 'genetic-defect', sortOrder: 30 },
  { code: 'K-CAS', name: 'Каппа-казеин', markerKind: 'protein', sortOrder: 40 },
  { code: 'B-CAS', name: 'Бета-казеин', markerKind: 'protein', sortOrder: 50 },
  { code: 'PARENT', name: 'Подтверждение происхождения', markerKind: 'parentage', sortOrder: 60 },
  { code: 'SNP60K', name: 'Геномная оценка (SNP-чип 60K)', markerKind: 'genomic-evaluation', sortOrder: 70 },
]

export const HAPLOTYPE_TYPES: Row[] = [
  { code: 'HH1', name: 'HH1 — гаплотип фертильности 1', sortOrder: 10 },
  { code: 'HH2', name: 'HH2 — гаплотип фертильности 2', sortOrder: 20 },
  { code: 'HH3', name: 'HH3 — гаплотип фертильности 3', sortOrder: 30 },
  { code: 'HH4', name: 'HH4 — гаплотип фертильности 4', sortOrder: 40 },
  { code: 'HH5', name: 'HH5 — гаплотип фертильности 5', sortOrder: 50 },
  { code: 'HCD', name: 'HCD — холестериновая недостаточность', sortOrder: 60 },
]

export const HEALTH_EVENT_TYPES: Row[] = [
  { code: 'MAST', name: 'Мастит', affectsProductivity: true, sortOrder: 10 },
  { code: 'LAME', name: 'Хромота', affectsProductivity: true, sortOrder: 20 },
  { code: 'KETO', name: 'Кетоз', affectsProductivity: true, sortOrder: 30 },
  { code: 'RETP', name: 'Задержание последа', affectsProductivity: true, sortOrder: 40 },
  { code: 'VACC', name: 'Вакцинация', sortOrder: 50 },
  { code: 'HOOF', name: 'Обработка копыт', sortOrder: 60 },
  { code: 'MOVE', name: 'Перемещение', sortOrder: 70 },
]

export const DICTIONARY_SEED: { slug: string; rows: Row[] }[] = [
  { slug: 'breeds', rows: BREEDS },
  { slug: 'lines', rows: LINES },
  { slug: 'breeding-categories', rows: BREEDING_CATEGORIES },
  { slug: 'breeding-classes', rows: BREEDING_CLASSES },
  { slug: 'animal-purposes', rows: ANIMAL_PURPOSES },
  { slug: 'disposal-reasons', rows: DISPOSAL_REASONS },
  { slug: 'coat-colors', rows: COAT_COLORS },
  { slug: 'blood-groups', rows: BLOOD_GROUPS },
  { slug: 'reproduction-methods', rows: REPRODUCTION_METHODS },
  { slug: 'semen-types', rows: SEMEN_TYPES },
  { slug: 'insemination-results', rows: INSEMINATION_RESULTS },
  { slug: 'dna-test-types', rows: DNA_TEST_TYPES },
  { slug: 'haplotype-types', rows: HAPLOTYPE_TYPES },
  { slug: 'health-event-types', rows: HEALTH_EVENT_TYPES },
]
