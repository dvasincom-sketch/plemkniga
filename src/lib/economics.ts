import type { TraitKey } from '@/lib/breeding-index'

/**
 * Экономика: во что обходятся и что приносят признаки.
 *
 * Отсюда берутся веса экономического профиля — рубли на единицу признака.
 * Все допущения собраны в одном месте намеренно: экономический индекс
 * ровно настолько же верен, насколько верны цены под ним, и когда они
 * меняются, менять нужно одно место, а не двенадцать.
 *
 * Цены — российские, лето 2026 года, и это именно допущения, а не истина:
 * у каждого хозяйства они свои. Хозяйство, которому цифры не подходят,
 * заводит свой профиль и ставит собственные веса — интерфейс для этого есть.
 *
 * Источники:
 *  — молоко: средняя закупочная цена апреля 2026 — 37,2 ₽/кг без НДС
 *    при 3,4 % жира и 3,0 % белка (milknews.ru);
 *  — нетель: 150–260 тыс. ₽ за голову по объявлениям племпродажи, взято 200;
 *  — остальное: инженерные допущения, каждое подписано ниже.
 */

/** Базовая цена молока, ₽/кг, без НДС, при 3,4 % жира и 3,0 % белка. */
export const MILK_BASE_PRICE = 37.2

/**
 * Как цена молока делится между составляющими.
 *
 * Прямых данных о надбавках нет — переработчики публикуют цену за килограмм
 * базисного молока. Разделение на доли — допущение, близкое к практике
 * компонентной оплаты: жир и белок несут основную ценность, объём —
 * остаток (лактоза, транспорт, постоянная часть договора).
 *
 * Именно это разделение делает возможным экономический индекс: в нём
 * удой, жир и белок — отдельные признаки, и каждому нужна своя цена.
 */
export const MILK_VALUE_SHARES = { fat: 0.45, protein: 0.35, volume: 0.2 }

export const BASE_FAT = 0.034
export const BASE_PROTEIN = 0.03

/** ₽ за килограмм жира: доля цены, отнесённая на жир, делённая на его массу. */
export const FAT_PRICE = Math.round((MILK_BASE_PRICE * MILK_VALUE_SHARES.fat) / BASE_FAT / 5) * 5

/** ₽ за килограмм белка. */
export const PROTEIN_PRICE =
  Math.round((MILK_BASE_PRICE * MILK_VALUE_SHARES.protein) / BASE_PROTEIN / 5) * 5

/** ₽ за килограмм молока сверх стоимости жира и белка. */
export const MILK_VOLUME_PRICE =
  Math.round(MILK_BASE_PRICE * MILK_VALUE_SHARES.volume * 10) / 10

/* ------------------------------------------------------------------ *
 *                        Стоимость событий                            *
 * ------------------------------------------------------------------ */

export const COSTS = {
  /** Нетель на замену выбывшей коровы, ₽/голову. */
  heifer: 200_000,
  /** Выручка за выбракованную корову: 600 кг × 175 ₽/кг живого веса. */
  cullRevenue: 105_000,
  /** Средняя продуктивная жизнь, месяцев — на неё раскладывается замена. */
  productiveLifeMonths: 30,

  /** Случай клинического мастита: лечение, выброшенное молоко, потеря удоя. */
  mastitisCase: 20_000,
  /** Трудный отёл: ветпомощь, лишние дни в родильном отделении, потеря продуктивности. */
  hardCalving: 12_000,
  /** Телёнок при рождении, усреднённо по полу. */
  calfValue: 18_000,
  /** День сервис-периода: недополученное молоко, корма, доза семени. */
  openDay: 350,

  /**
   * Содержание более крупной коровы, ₽ на балл композита тела за лактацию.
   * Крупнее — больше сухого вещества на поддержание при той же продуктивности.
   */
  bodySizeUpkeep: 2_000,
} as const

/** Сколько лактаций в среднем живёт корова — горизонт «за жизнь». */
export const LIFETIME_LACTATIONS = 2.7

/* ------------------------------------------------------------------ *
 *                    Перевод событий в единицы признаков              *
 * ------------------------------------------------------------------ */

/**
 * Оценки по здоровью и воспроизводству выражены в баллах и процентах,
 * а деньги привязаны к событиям. Коэффициенты ниже — мост между ними,
 * и это самое слабое место расчёта: они взяты из практики, а не измерены
 * на нашей популяции.
 */
export const CONVERSIONS = {
  /** Балл здоровья вымени → изменение числа случаев мастита за лактацию. */
  mastitisCasesPerUdderPoint: 0.1,
  /** Балл лёгкости отёла → изменение доли трудных отёлов. */
  hardCalvingsPerEasePoint: 0.08,
  /** Процент фертильности → изменение длины сервис-периода, дней. */
  openDaysPerFertilityPercent: 4,
} as const

/* ------------------------------------------------------------------ *
 *                        Веса в рублях                                *
 * ------------------------------------------------------------------ */

const perLactation: Partial<Record<TraitKey, number>> = {
  milk: MILK_VOLUME_PRICE,
  fatKg: FAT_PRICE,
  proteinKg: PROTEIN_PRICE,
  udderHealth: COSTS.mastitisCase * CONVERSIONS.mastitisCasesPerUdderPoint,
  calvingEase: COSTS.hardCalving * CONVERSIONS.hardCalvingsPerEasePoint,
  fertility: COSTS.openDay * CONVERSIONS.openDaysPerFertilityPercent,
  calfMortality: COSTS.calfValue / 100,
  bodyComposite: -COSTS.bodySizeUpkeep,
}

const round10 = (v: number) => Math.round(v / 10) * 10

/**
 * Экономические веса, ₽ на единицу признака за продуктивную жизнь.
 *
 * Признаки лактации умножаются на среднее число лактаций: индекс отвечает
 * на вопрос «сколько животное принесёт за жизнь», а оценки даны на лактацию.
 * Продуктивное долголетие уже пожизненное — оно и есть цена лишнего месяца
 * до замены, поэтому множитель к нему не применяется.
 *
 * Композиты вымени и ног намеренно оставлены без цены. Их экономика уже учтена
 * через здоровье вымени и долголетие: корова с хорошим выменем реже болеет
 * и дольше живёт. Дать им ещё и собственную цену значило бы посчитать одно
 * и то же дважды — ошибка, которой в экономических индексах избегают
 * в первую очередь.
 */
export const ECONOMIC_WEIGHTS: Partial<Record<TraitKey, number>> = {
  ...(Object.fromEntries(
    Object.entries(perLactation).map(([k, v]) => [k, round10(v * LIFETIME_LACTATIONS)]),
  ) as Partial<Record<TraitKey, number>>),
  productiveLongevity: round10(
    (COSTS.heifer - COSTS.cullRevenue) / COSTS.productiveLifeMonths,
  ),
}

/* ------------------------------------------------------------------ *
 *                     Допущения в том виде, как их показывают          *
 * ------------------------------------------------------------------ */

/** Ключ допущения: по нему набор строк страницы находит подпись и пояснение. */
export type AssumptionKey =
  | 'milkBase'
  | 'fat'
  | 'protein'
  | 'milkVolume'
  | 'heifer'
  | 'cull'
  | 'mastitis'
  | 'hardCalving'
  | 'calf'
  | 'openDay'
  | 'horizon'

/** В чём измерено допущение. Слово при числе — уже перевод, оно приходит извне. */
export type AssumptionUnit = 'rubPerKg' | 'rub' | 'lactations'

export type Assumption = {
  key: AssumptionKey
  amount: number
  /** Знаков после запятой: цена молока дробная, цена нетели — нет. */
  digits: number
  unit: AssumptionUnit
}

/**
 * Числа допущений для показа.
 *
 * Раньше здесь лежали готовые строки вместе с русскими подписями,
 * и витрина по-английски показывала бы «Нетель на замену, 200 000 ₽».
 * Подписи, пояснения и слово при числе ушли в набор строк страницы
 * (`lib/economics-page-text.ts`), а число и его вид остались здесь —
 * там, где считаются сами цены. Переводится слово, а не рубль:
 * цены российские и рублёвыми остаются.
 */
export const ECONOMIC_ASSUMPTIONS: Assumption[] = [
  { key: 'milkBase', amount: MILK_BASE_PRICE, digits: 1, unit: 'rubPerKg' },
  { key: 'fat', amount: FAT_PRICE, digits: 0, unit: 'rubPerKg' },
  { key: 'protein', amount: PROTEIN_PRICE, digits: 0, unit: 'rubPerKg' },
  { key: 'milkVolume', amount: MILK_VOLUME_PRICE, digits: 1, unit: 'rubPerKg' },
  { key: 'heifer', amount: COSTS.heifer, digits: 0, unit: 'rub' },
  { key: 'cull', amount: COSTS.cullRevenue, digits: 0, unit: 'rub' },
  { key: 'mastitis', amount: COSTS.mastitisCase, digits: 0, unit: 'rub' },
  { key: 'hardCalving', amount: COSTS.hardCalving, digits: 0, unit: 'rub' },
  { key: 'calf', amount: COSTS.calfValue, digits: 0, unit: 'rub' },
  { key: 'openDay', amount: COSTS.openDay, digits: 0, unit: 'rub' },
  { key: 'horizon', amount: LIFETIME_LACTATIONS, digits: 1, unit: 'lactations' },
]
