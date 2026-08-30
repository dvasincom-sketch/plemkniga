/**
 * Признаки взвешивания — справочник ФГИАС ПР `sp_weighing_sign2_binds`.
 *
 * ## Почему список здесь, а не в базе
 *
 * Он закрытый и короткий: реестр держит его сам, а хозяйство пополнить
 * не может. Справочник в базе имел бы смысл, если бы значения заводили
 * люди, — а тут их заводит государство, и наша задача не потерять
 * соответствие, а не хранить копию.
 *
 * Ключи прочитаны из открытого реестра 30 августа 2026 года. Сверка
 * `sync:fgias-nsi` их не проверяет: она ходит по справочникам, у которых
 * есть пара в наших коллекциях, а у этого пары нет и не будет.
 *
 * ## Почему не весь справочник
 *
 * В реестре 232 строки: те же признаки, размноженные по видам животных,
 * направлениям продуктивности и полу. Для молочного КРС остаётся семь,
 * и они здесь.
 *
 * «При отъеме» и «На 205 день жизни» не взяты намеренно — реестр даёт их
 * только мясному направлению. Записать их в молочное значило бы завести
 * зоотехнику выбор, который реестр отвергнет.
 *
 * ## «При первом осеменении» только у самок
 *
 * Так в реестре, и это не наша строгость. Проверка на уровне формы
 * не поставлена: бык с таким признаком — ошибка ввода, которую видно
 * глазами, а не молчаливая порча. Если начнёт встречаться, ей место
 * в проверках данных, а не в выпадающем списке.
 */

export type WeighingSign = {
  /** Наш код — он и лежит в базе. */
  value: string
  label: string
  /** Ключ реестра: уезжает в колонку «Привязка». */
  uuid: string
  /** Только для самок — так в справочнике реестра. */
  femaleOnly?: boolean
}

export const WEIGHING_SIGNS: readonly WeighingSign[] = [
  { value: 'birth', label: 'При рождении', uuid: '0e02446c-f349-44ea-ae99-f124e4ecf57f' },
  { value: 'age', label: 'На возраст', uuid: 'f4647383-eb34-4dea-8d13-1e1146faf271' },
  {
    value: 'firstInsemination',
    label: 'При первом осеменении',
    uuid: 'b5784f67-9edc-4e04-a28b-8097f0e02ba8',
    femaleOnly: true,
  },
  {
    value: 'averageLactation',
    label: 'Средняя лактация',
    uuid: 'd8b9d014-a6a3-4d1e-b5ce-2734487d61f5',
  },
  {
    value: 'highestLactation',
    label: 'Наивысшая лактация',
    uuid: '7feb1028-aaec-4e52-8585-6f4ff7bf9953',
  },
  { value: 'sale', label: 'При продаже', uuid: '579e08b2-286e-4512-84e4-0fbdbe2388df' },
  { value: 'disposal', label: 'При выбытии', uuid: '250588ff-bc85-4d11-adc5-0a9707608720' },
]

export const weighingSignUuid = (value?: string | null): string | undefined =>
  WEIGHING_SIGNS.find((s) => s.value === value)?.uuid

export const weighingSignLabel = (value?: string | null): string =>
  WEIGHING_SIGNS.find((s) => s.value === value)?.label ?? ''

/** Значение по названию или по коду — для загрузки из файла. */
export const weighingSignOf = (raw?: string | null): string | undefined => {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
  if (!v) return undefined
  return WEIGHING_SIGNS.find(
    (s) => s.value.toLowerCase() === v || s.label.toLowerCase().replace(/ё/g, 'е') === v,
  )?.value
}
