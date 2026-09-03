/**
 * Метод контроля продуктивности — по правилам ICAR, а не по привычке.
 *
 * ## Зачем это вообще
 *
 * «A4» и «B4» — не подробность и не бюрократия. Это то, чем определяется
 * **сопоставимость лактаций**. Лактация по A4 — контроль ведёт работник
 * службы учёта раз в месяц; по B4 — то же самое делает сам хозяин.
 * Числа получаются разной ценности, и складывать их в один рейтинг
 * нельзя: у второго нет независимого свидетеля.
 *
 * Пока метод не записан, книга складывает их молча. Ошибка не видна
 * никому: числа правдоподобны, ряд полон, лактация посчитана верно —
 * и только сравнение между хозяйствами оказывается ни о чём.
 *
 * ## Почему это не одно поле «A4»
 *
 * Потому что за буквой и цифрой стоят три независимых обстоятельства,
 * и ICAR разводит их по трём перечислениям. Кто снимал показания
 * (`icarMilkRecordingProtocolType`: работник службы, хозяин или оба),
 * какие доения вошли в контроль (`icarMilkRecordingSchemeType`) и как
 * брали пробу (`icarMilkSamplingSchemeType`). Плюс момент отбора:
 * утро, вечер или объединённая проба.
 *
 * Сложив это в одну строку, мы получили бы поле, которое нельзя
 * ни проверить, ни отдать в обмен: «A4» — обозначение из руководства,
 * а не значение стандарта.
 *
 * Привычная запись при этом никуда не девается: она собирается
 * из полей обратно (`recordingLabel`) и показывается человеку, который
 * ждёт увидеть «A4», а не три строки перечислений.
 *
 * ## Откуда значения
 *
 * Из копии стандарта в дереве: `vendor/icar-ade/enums/`. Ни одно
 * значение здесь не придумано — их пишет ICAR, и `check:ade-schema`
 * следит, чтобы наши не разошлись с их.
 */

/** Кто снимал показания. Буква в привычном обозначении. */
export const RECORDING_PROTOCOL = {
  'A-OfficialMRORepresentative': {
    letter: 'A',
    label: 'Работник службы учёта',
    hint: 'Контроль ведёт независимый представитель организации учёта — самая высокая ценность записи.',
  },
  'B-HerdOwnerOrNominee': {
    letter: 'B',
    label: 'Хозяин или его работник',
    hint: 'Контроль ведёт само хозяйство. Данные принимаются, но сравнивать их с A напрямую нельзя.',
  },
  'C-Both': {
    letter: 'C',
    label: 'Оба поочерёдно',
    hint: 'Часть контролей ведёт служба, часть — хозяйство.',
  },
} as const

export type RecordingProtocol = keyof typeof RECORDING_PROTOCOL

/** Какие доения вошли в контроль. */
export const RECORDING_SCHEME = {
  AllMilkingsAtTestday: {
    label: 'Все доения контрольного дня',
    hint: 'Учтены все доения за сутки контроля.',
  },
  AllMilkingsInPeriod: {
    label: 'Все доения за период',
    hint: 'Обычно так работают доильные роботы: считается весь период, а не сутки.',
  },
  OneMilkingAtTestday: {
    label: 'Одно доение контрольного дня',
    hint: 'Суточный удой досчитывается по правилу; точность ниже, и это учитывается достоверностью.',
  },
} as const

export type RecordingScheme = keyof typeof RECORDING_SCHEME

/** Как брали пробу молока на анализ. */
export const SAMPLING_SCHEME = {
  ProportionalSizeSamplingOfAllMilkings: { label: 'Пропорционально всем доениям' },
  ConstantSizeSamplingOfAllMilkings: { label: 'Равными объёмами со всех доений' },
  AlternateSampling: { label: 'Через раз (утро/вечер поочерёдно)' },
  CorrectedSampling: { label: 'С поправкой' },
  OneMilkingSampleInAMS: { label: 'Одно доение робота' },
  MulitpleMilkingSampleInAMS: { label: 'Несколько доений робота' },
} as const

export type SamplingScheme = keyof typeof SAMPLING_SCHEME

/** Момент отбора пробы. */
export const SAMPLING_MOMENT = {
  Composite: { label: 'Объединённая проба' },
  Morning: { label: 'Утро' },
  Evening: { label: 'Вечер' },
} as const

export type SamplingMoment = keyof typeof SAMPLING_MOMENT

export type RecordingInput = {
  protocol?: RecordingProtocol | null
  scheme?: RecordingScheme | null
  /** Сколько контролей в год — цифра в привычном обозначении. */
  perYear?: number | null
}

/**
 * Привычное обозначение из полей: «A4», «B6», «C4».
 *
 * Буква — кто снимал, цифра — сколько контролей в год. Собирается,
 * а не хранится: хранимая копия вычислимого расходится с источником
 * в первый же день правки — и расходится молча, потому что выглядит
 * так же убедительно.
 *
 * `null` означает «метод не записан», и это честное состояние:
 * подставить сюда «A4» по умолчанию значило бы объявить контроль
 * официальным, не спросив никого.
 */
export function recordingLabel(input: RecordingInput): string | null {
  const letter = input.protocol ? RECORDING_PROTOCOL[input.protocol].letter : null
  if (!letter) return null

  const n = input.perYear
  return n && Number.isFinite(n) ? `${letter}${n}` : letter
}

/**
 * Сопоставимы ли между собой два ряда доений.
 *
 * Правило простое и грубое: сравнивать можно записи, снятые одинаковым
 * протоколом. Хозяйская запись (B) не хуже — она просто не подтверждена
 * посторонним, и рейтинг, смешавший A и B, вводит в заблуждение обоих
 * участников.
 *
 * Неизвестный метод сопоставим только с неизвестным: пока не сказано,
 * кто снимал показания, ставить запись рядом с официальной нельзя.
 */
export const comparableRecording = (
  a: RecordingProtocol | null | undefined,
  b: RecordingProtocol | null | undefined,
): boolean => (a ?? null) === (b ?? null)
