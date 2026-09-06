import type { Payload } from 'payload'
import { AFC_PLAUSIBLE } from '@/lib/afc'
import {
  BLOOD_TOLERANCE,
  GESTATION_MIN_DAYS,
  HERD_THRESHOLDS,
  INBREEDING_TOLERANCE,
  PARENT_AGE,
  PLAUSIBLE,
  VOLUNTARY_WAIT_DAYS,
  type CheckCode,
} from '@/lib/checks-registry'

/**
 * Пороги проверок: числа, которые Ассоциация вправе менять.
 *
 * ## Что изменилось и почему этого не хватало
 *
 * Ассоциация могла выключить проверку и поменять её существенность,
 * но не могла тронуть число. «Удой вне 500…25 000 кг» было зашито в код,
 * и хозяйству, где рекордистки дают двадцать восемь тысяч, оставалось
 * либо получать находку на каждой лучшей корове, либо выключить проверку
 * целиком — то есть перестать ловить и ошибку в единицах измерения.
 *
 * Выключатель вместо ручки настройки — плохой обмен. Он превращает
 * «мера не та» в «меры нет».
 *
 * ## Почему пороги перечислены отдельно от проверок
 *
 * Одно число обслуживает несколько правил. Длительность стельности входит
 * и в межотельный интервал, и в проверку «двое потомков подряд», и в дату
 * выбытия отца. Привяжи её к проверке — и правка в одном месте разойдётся
 * с двумя другими молча.
 *
 * Поэтому порог здесь — самостоятельная запись со своим именем, а проверки
 * на него ссылаются. В каталоге видно, какие правила изменятся, **до** того,
 * как число поменяли.
 *
 * ## Чего в этом списке нет
 *
 * Потолков. `INBREEDING_CHECK_LIMIT`, глубина обхода родословной, потолки
 * выборок — это не пороги предметной области, а цена расчёта: они говорят,
 * сколько система готова считать, а не что она считает нарушением. Отдать
 * их в настройку значило бы предложить Ассоциации управлять
 * производительностью, ничего о ней не зная.
 *
 * ## Границы у самих порогов
 *
 * У каждого есть `min` и `max`, и это не перестраховка. Порог удоя,
 * выставленный в ноль, выключает проверку, не выключая её: она останется
 * в списке действующих и не найдёт ничего. Выключить проверку можно
 * отдельно и явно — так это по крайней мере видно.
 */

export type ThresholdSpec = {
  key: string
  label: string
  /** В чём измеряется — то, что стоит рядом с полем ввода. */
  unit: string
  default: number
  min: number
  max: number
  /** Сколько знаков после запятой имеет смысл вводить. */
  step: number
  /** Откуда взялось значение по умолчанию. Читается при правке. */
  why: string
  /** Правила, которые изменятся вместе с этим числом. */
  used: readonly CheckCode[]
}

export const THRESHOLDS = [
  /* --------------------------- Продуктивность --------------------------- */
  {
    key: 'milkMin',
    label: 'Удой за лактацию, нижняя граница',
    unit: 'кг',
    default: PLAUSIBLE.milkYield.min,
    min: 0,
    max: 5_000,
    step: 100,
    why: 'Ниже — почти всегда неполная лактация или ошибка в единицах, а не плохая корова.',
    used: ['milk-implausible'],
  },
  {
    key: 'milkMax',
    label: 'Удой за лактацию, верхняя граница',
    unit: 'кг',
    default: PLAUSIBLE.milkYield.max,
    min: 10_000,
    max: 60_000,
    step: 500,
    why: 'Двадцать пять тысяч встречается у мировых рекордисток, сорок — ни у кого.',
    used: ['milk-implausible'],
  },
  {
    key: 'fatMin',
    label: 'Жир, нижняя граница',
    unit: '%',
    default: PLAUSIBLE.fatPercent.min,
    min: 0,
    max: 4,
    step: 0.1,
    why: 'Ниже двух процентов у голштина не бывает даже на пике лактации.',
    used: ['fat-implausible'],
  },
  {
    key: 'fatMax',
    label: 'Жир, верхняя граница',
    unit: '%',
    default: PLAUSIBLE.fatPercent.max,
    min: 4,
    max: 12,
    step: 0.1,
    why: 'Выше — обычно проба с конца дойки, а не показатель за лактацию.',
    used: ['fat-implausible'],
  },
  {
    key: 'proteinMin',
    label: 'Белок, нижняя граница',
    unit: '%',
    default: PLAUSIBLE.proteinPercent.min,
    min: 0,
    max: 3,
    step: 0.1,
    why: 'Рамка правдоподобия, а не норматив.',
    used: ['protein-implausible'],
  },
  {
    key: 'proteinMax',
    label: 'Белок, верхняя граница',
    unit: '%',
    default: PLAUSIBLE.proteinPercent.max,
    min: 3,
    max: 10,
    step: 0.1,
    why: 'Рамка правдоподобия, а не норматив.',
    used: ['protein-implausible'],
  },

  /* ------------------------------ Паспорт ------------------------------- */
  {
    key: 'ageMaxYears',
    label: 'Возраст, выше которого «в стаде» сомнительно',
    unit: 'лет',
    default: PLAUSIBLE.ageYears,
    min: 15,
    max: 40,
    step: 1,
    why: 'Почти всегда означает, что выбытие не отмечено, а не что корова дожила до рекорда.',
    used: ['too-old-alive'],
  },

  /* --------------------------- Происхождение ---------------------------- */
  {
    key: 'bloodNote',
    label: 'Расхождение по кровности — замечание',
    unit: 'п. п.',
    default: BLOOD_TOLERANCE.note,
    min: 1,
    max: 50,
    step: 0.5,
    why: 'Кровность записывают долями восьмой части, отсюда 12,5: расхождение в одну долю бывает от округления.',
    used: ['blood-vs-parents'],
  },
  {
    key: 'bloodFix',
    label: 'Расхождение по кровности — требует исправления',
    unit: 'п. п.',
    default: BLOOD_TOLERANCE.fix,
    min: 5,
    max: 100,
    step: 0.5,
    why: 'Расхождение в четверть округлением быть не может: ошибка в кровности либо в самом родителе.',
    used: ['blood-vs-parents'],
  },
  {
    key: 'inbreedingTolerance',
    label: 'Допуск по инбридингу: заявленный против посчитанного',
    unit: 'п. п.',
    default: INBREEDING_TOLERANCE,
    min: 0.1,
    max: 20,
    step: 0.1,
    why: 'Наш расчёт идёт по известной нам родословной; хозяйство могло считать по более полной. Десятая доля — округление, целый процент — уже разные родословные.',
    used: ['inbreeding-mismatch'],
  },
  {
    key: 'inbreedingHigh',
    label: 'Инбридинг, выше которого требуется подтверждение',
    unit: '%',
    default: 25,
    min: 5,
    max: 100,
    step: 0.5,
    why: 'Двадцать пять процентов — спаривание отца с дочерью. Выше начинается то, что в племенном учёте подтверждают отдельно.',
    used: ['high-inbreeding'],
  },
  {
    key: 'parentAgeMinMonths',
    label: 'Возраст родителя на момент рождения потомка, минимум',
    unit: 'мес.',
    default: PARENT_AGE.minMonths,
    min: 10,
    max: 36,
    step: 1,
    why: 'Та же граница, что у возраста первого отёла: стельность около 279 дней.',
    used: ['parent-age-implausible'],
  },
  {
    key: 'parentAgeMaxYears',
    label: 'Возраст родителя на момент рождения потомка, максимум',
    unit: 'лет',
    default: PARENT_AGE.maxYears,
    min: 10,
    max: 40,
    step: 1,
    why: 'Не биология, а здравый смысл: потомок от коровы старше двадцати — почти всегда связь не с тем животным.',
    used: ['parent-age-implausible'],
  },

  /* -------------------------- Воспроизводство --------------------------- */
  {
    key: 'gestationMinDays',
    label: 'Стельность, минимальная длительность',
    unit: 'дн.',
    default: GESTATION_MIN_DAYS,
    min: 200,
    max: 300,
    step: 1,
    why: 'У голштинов около 279 дней; 270 взято с запасом, чтобы ранний отёл не попадал в находки.',
    used: ['calving-interval-short', 'siblings-too-close', 'father-disposed-before'],
  },
  {
    key: 'voluntaryWaitDays',
    label: 'Ожидание после отёла до первого осеменения',
    unit: 'дн.',
    default: VOLUNTARY_WAIT_DAYS,
    min: 5,
    max: 90,
    step: 1,
    why: 'Не норматив (в хозяйствах ждут 45–60), а граница физиологической возможности: раньше матка не восстановилась.',
    used: ['insemination-too-soon'],
  },
  {
    key: 'afcMin',
    label: 'Возраст первого отёла, нижняя граница правдоподобия',
    unit: 'мес.',
    default: AFC_PLAUSIBLE.min,
    min: 12,
    max: 30,
    step: 1,
    why: 'Ниже — ошибка в дате рождения или в дате отёла, а не ранний отёл.',
    used: ['afc-too-young'],
  },
  {
    key: 'afcMax',
    label: 'Возраст первого отёла, верхняя граница правдоподобия',
    unit: 'мес.',
    default: AFC_PLAUSIBLE.max,
    min: 30,
    max: 96,
    step: 1,
    why: 'Выше — почти наверняка неполные данные: первый отёл в книгу не попал.',
    used: ['afc-too-old'],
  },

  /* ---------------------------- По стаду -------------------------------- */
  {
    key: 'herdMin',
    label: 'Минимум записей, при котором считаются доли по стаду',
    unit: 'записей',
    default: HERD_THRESHOLDS.minHerd,
    min: 5,
    max: 500,
    step: 5,
    why: 'В стаде из шести любая доля — случайность, и находка по ней была бы шумом, а не наблюдением.',
    used: ['values-rounded', 'outlier-vs-herd', 'birth-date-clustered', 'event-year-gap'],
  },
  {
    key: 'herdUnitsFactor',
    label: 'Во сколько раз должны отличаться удои, чтобы это была другая единица',
    unit: 'раз',
    default: HERD_THRESHOLDS.unitsFactor,
    min: 10,
    max: 10_000,
    step: 10,
    why: 'Сто — это центнеры против килограммов; тысяча — тонны. Меньше — обычный разброс.',
    used: ['units-mixed'],
  },
  {
    key: 'herdJan1Share',
    label: 'Доля рождённых первого января, выше которой это не совпадение',
    unit: '%',
    default: HERD_THRESHOLDS.jan1Share * 100,
    min: 1,
    max: 50,
    step: 1,
    why: 'При настоящем учёте отёлов первого января около одного процента.',
    used: ['birth-date-clustered'],
  },
  {
    key: 'herdFirstOfMonthShare',
    label: 'Доля рождённых первого числа месяца',
    unit: '%',
    default: HERD_THRESHOLDS.firstOfMonthShare * 100,
    min: 5,
    max: 90,
    step: 1,
    why: 'При равномерном учёте — около трёх процентов.',
    used: ['birth-date-clustered'],
  },
  {
    key: 'herdRoundedShare',
    label: 'Доля удоев, кратных пятистам',
    unit: '%',
    default: HERD_THRESHOLDS.roundedShare * 100,
    min: 5,
    max: 90,
    step: 1,
    why: 'Измеренный удой круглым бывает редко; массовая кратность означает оценку на глаз.',
    used: ['values-rounded'],
  },
  {
    key: 'herdOutlierFactor',
    label: 'Во сколько раз удой должен отличаться от медианы стада',
    unit: 'раз',
    default: HERD_THRESHOLDS.outlierFactor,
    min: 1.5,
    max: 20,
    step: 0.5,
    why: 'Рамка правдоподобия одна на всю книгу и широкая; стадо — куда более точная мерка.',
    used: ['outlier-vs-herd'],
  },
] as const satisfies readonly ThresholdSpec[]

export type ThresholdKey = (typeof THRESHOLDS)[number]['key']

/** Действующие значения — плоская запись «имя → число». */
export type Thresholds = Record<ThresholdKey, number>

export const defaultThresholds = (): Thresholds =>
  Object.fromEntries(THRESHOLDS.map((t) => [t.key, t.default])) as Thresholds

export const thresholdSpec = (key: string): ThresholdSpec | undefined =>
  (THRESHOLDS as readonly ThresholdSpec[]).find((t) => t.key === key)

/**
 * Значения с учётом правок Ассоциации.
 *
 * Отсутствие таблицы — не ошибка, а состояние базы, на которой миграция
 * ещё не применена: проверки в этом случае работают по умолчаниям, то есть
 * ровно так, как работали до появления настройки. Уронить разбор из-за
 * ненайденной таблицы настроек значило бы, что необязательная возможность
 * выключает обязательную (то же решение, что в `check-settings.ts`).
 */
/**
 * Наложить сохранённые значения на умолчания.
 *
 * Отдельно от чтения потому, что читают их двумя разными способами:
 * приложение — через Payload, ревизия родословной — прямым запросом
 * своим пулом, у неё Payload не поднят вовсе. Правило применения при этом
 * обязано быть одним: разойдись оно, и прогон нашёл бы то, чего разбор
 * не находит, — при одинаковых настройках на экране.
 */
export const applyThresholdRows = (
  rows: readonly { key?: unknown; value?: unknown }[],
): Thresholds => {
  const values = defaultThresholds()

  for (const row of rows) {
    const spec = thresholdSpec(String(row.key))
    // Настройка порога, которого больше нет в реестре: правило убрали,
    // строка осталась. Применять её не к чему, и это не ошибка.
    if (!spec) continue

    const raw = Number(row.value)
    if (!Number.isFinite(raw)) continue

    /*
     * Значение зажимается в границы даже при чтении, а не только при записи.
     * Строку могли завести через админку в обход формы, а порог за границей
     * тише всего ломает именно проверку: она остаётся включённой и перестаёт
     * находить.
     */
    values[spec.key as ThresholdKey] = Math.min(Math.max(raw, spec.min), spec.max)
  }

  return values
}

export async function resolveThresholds(payload: Payload): Promise<Thresholds> {
  const rows = await payload
    .find({
      collection: 'check-thresholds',
      limit: THRESHOLDS.length,
      depth: 0,
      overrideAccess: true,
    })
    .then((r) => r.docs)
    .catch((e: unknown) => {
      /*
       * Отказ виден в логе, а не проглатывается.
       *
       * Умолчания при сбое — верное поведение: без порогов проверки
       * не выполнить вовсе, а умолчания равны тому, что стоит у Ассоциации
       * до первой правки. Неверным было молчание: в этот момент заслон
       * подтверждения работает по чужим числам, и узнать об этом после
       * было неоткуда.
       */
      console.error('[plemkniga] пороги проверок не прочитались, взяты умолчания:', e)
      return null
    })

  return rows ? applyThresholdRows(rows) : defaultThresholds()
}


/** Пороги, которые использует правило. */
export const thresholdsOfCheck = (code: string): ThresholdSpec[] =>
  (THRESHOLDS as readonly ThresholdSpec[]).filter((s) =>
    (s.used as readonly string[]).includes(code),
  )

/** Число в том виде, в каком его читает человек. */
export const thresholdValue = (spec: ThresholdSpec, value: number): string =>
  `${value.toLocaleString('ru-RU', {
    maximumFractionDigits: spec.step < 1 ? 2 : 0,
  })} ${spec.unit}`
