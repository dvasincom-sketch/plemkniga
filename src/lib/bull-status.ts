/**
 * Статус оценки быка: можно ли верить числу.
 *
 * ## Откуда берутся пороги
 *
 * Не из соглашения, а из формулы надёжности оценки по потомству:
 *
 *     R = n / (n + k),   где k = (4 − h²) / h²
 *
 * Чем ниже наследуемость признака, тем больше дочерей нужно, чтобы
 * отделить генетику от условий содержания. На наших коэффициентах
 * по удою (h² = 0,30) это даёт: десять дочерей — 45 %, пятнадцать —
 * 55 %, сорок пять — 78 %, шестьдесят — 83 %.
 *
 * **Отсюда видно, откуда взялось правило CDCB.** Их 60–75 дочерей —
 * это надёжность 83–86 %; правило не произвольное, за ним та же
 * арифметика, и ссылаться на него уместно.
 *
 * **Нижняя граница — надёжность 50 %, то есть тринадцать дочерей
 * по удою.** Ниже половина изменчивости прогноза ничем не объяснена,
 * и число перестаёт быть оценкой: оно ошибается чаще, чем угадывает.
 * Это не наш выбор строгости, а свойство формулы.
 *
 * ## Почему стада считаются отдельно от дочерей
 *
 * Если все дочери в одном хозяйстве, эффект стада неотделим от эффекта
 * быка: кормили лучше — значит бык лучше. Это смешивание факторов,
 * и никаким числом дочерей оно не лечится. Поэтому у стад свой порог,
 * и он не заменяется большим числом дочерей.
 *
 * CDCB требует 40–50 стад, но это порог окончательной оценки в стране
 * с тысячами хозяйств. При нескольких десятках хозяйств в книге такое
 * требование означало бы не выдать ни одной официальной оценки —
 * то есть отказаться от статуса вовсе, а не поднять планку.
 *
 * ## Почему порог живёт в коде, а не в настройках
 *
 * Он выведен из наследуемости, а наследуемость — свойство признака,
 * а не решение Ассоциации. Настраиваемым его стоит делать тогда, когда
 * Ассоциация захочет быть строже математики; пока такого требования нет,
 * настройка была бы приглашением поставить порог ниже осмысленного.
 */

/** Наследуемость удоя — по ней считается основной порог. */
const MILK_HERITABILITY = 0.3

/** Множитель формулы надёжности: k = (4 − h²) / h². */
export const reliabilityK = (heritability: number): number =>
  (4 - heritability) / heritability

/** Надёжность оценки по числу дочерей, доля от нуля до единицы. */
export const reliabilityOf = (daughters: number, heritability = MILK_HERITABILITY): number =>
  daughters <= 0 ? 0 : daughters / (daughters + reliabilityK(heritability))

/** Сколько дочерей нужно для заданной надёжности. */
export const daughtersFor = (r: number, heritability = MILK_HERITABILITY): number =>
  Math.ceil((r * reliabilityK(heritability)) / (1 - r))

export type BullStatusKey = 'insufficient' | 'preliminary' | 'official'

export type BullStatus = {
  key: BullStatusKey
  label: string
  /** Что этот статус означает для того, кто собирается покупать семя. */
  what: string
  /** Чего не хватает до следующей ступени. Пусто у официальной. */
  missing: string | null
  /** Надёжность по удою на этом числе дочерей, проценты. */
  reliability: number
}

/**
 * Три ступени: недостаточно данных, предварительная, официальная.
 *
 * Нижняя выведена из математики, верхняя — из практики CDCB,
 * приведённой к нашему масштабу.
 */
export const THRESHOLDS = {
  preliminary: { reliability: 0.5, herds: 3 },
  official: { reliability: 0.75, daughters: 45, herds: 10 },
} as const

export function bullStatus(daughters: number, herds: number): BullStatus {
  const r = reliabilityOf(daughters)
  const reliability = Math.round(r * 100)

  if (r < THRESHOLDS.preliminary.reliability || herds < THRESHOLDS.preliminary.herds) {
    /*
     * Чего не хватает — называется числом, а не словом «мало».
     * Человек, который смотрит на карточку молодого быка, должен
     * понимать, сколько ещё ждать; «данных недостаточно» на этот
     * вопрос не отвечает и читается как отказ системы.
     */
    const needDaughters = daughtersFor(THRESHOLDS.preliminary.reliability)
    const gaps: string[] = []
    if (daughters < needDaughters) gaps.push(`дочерей ${daughters} из ${needDaughters}`)
    if (herds < THRESHOLDS.preliminary.herds)
      gaps.push(`хозяйств ${herds} из ${THRESHOLDS.preliminary.herds}`)

    return {
      key: 'insufficient',
      label: 'Данных недостаточно',
      what:
        'Надёжность ниже половины: прогноз ошибается чаще, чем угадывает. ' +
        'Числа ниже показаны как есть, но опираться на них при выборе быка рано.',
      missing: gaps.join(', '),
      reliability,
    }
  }

  if (
    r < THRESHOLDS.official.reliability ||
    daughters < THRESHOLDS.official.daughters ||
    herds < THRESHOLDS.official.herds
  ) {
    const gaps: string[] = []
    if (daughters < THRESHOLDS.official.daughters)
      gaps.push(`дочерей ${daughters} из ${THRESHOLDS.official.daughters}`)
    if (herds < THRESHOLDS.official.herds)
      gaps.push(`хозяйств ${herds} из ${THRESHOLDS.official.herds}`)

    return {
      key: 'preliminary',
      label: 'Предварительная оценка',
      what:
        'Оценка есть, но будет заметно меняться с новыми дочерями: ' +
        'по мере их появления число сдвигается, иногда на заметную величину.',
      missing: gaps.join(', '),
      reliability,
    }
  }

  return {
    key: 'official',
    label: 'Официальная оценка',
    what: 'Оценка устоялась: новые дочери сдвигают её незначительно.',
    missing: null,
    reliability,
  }
}

/**
 * Надёжность по конкретному признаку — она разная и это главное.
 *
 * У быка с двадцатью дочерями удой оценён на 62 %, а фертильность
 * (h² = 0,04) — на 17 %. Показывать оба числа одинаково значит
 * утверждать о втором то, чего данные не говорят.
 *
 * Возвращает `null`, если дочерей нет вовсе: ноль процентов и
 * «не считали» — разные вещи, и рисовать первое вместо второго
 * значит выдавать пропуск за результат.
 */
export const traitReliabilityByDaughters = (
  daughters: number,
  heritability: number,
): number | null => (daughters > 0 ? Math.round(reliabilityOf(daughters, heritability) * 100) : null)
