import type { Translated } from '@/lib/i18n/translated'
import { MILK_VALUE_SHARES, type AssumptionKey, type AssumptionUnit } from '@/lib/economics'

/**
 * Слова страницы экономического индекса и блока допущений.
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) требуют все шесть языков
 * разом, и для подписей навигации это правильно. Здесь же три абзаца
 * про то, чем экономический индекс отличается от обычного, и одиннадцать
 * пояснений к ценам: это тот же длинный текст, что и разбор раздела книги,
 * и переводится он целиком, а не по строке. Поэтому `Translated` с явным
 * откатом на русский — как у `book-page-text.ts`.
 *
 * ## Почему цены остаются рублёвыми
 *
 * Допущения посчитаны по российскому рынку лета 2026 года, и подменять
 * «₽» на «$» значило бы выдать чужие цены за свои. Английский текст
 * называет это прямо: цены российские, год и сезон указаны. Читатель
 * из другой страны берёт не число, а способ счёта — под свои цены
 * в книге заводится свой профиль.
 *
 * ## Почему формат чисел — часть набора строк
 *
 * «1 320» и «1,320» — одно и то же число, но русский разделитель разрядов
 * на английской странице читается как опечатка или как два числа подряд.
 * Тег формата стоит рядом с текстом, потому что меняется вместе с ним.
 */

export type EconomicsPageText = {
  /** Тег для `toLocaleString`: разделители разрядов и дробной части. */
  numberLocale: string

  compareTitle: string
  /** Абзацы о разнице с обычным индексом. */
  comparePara: string[]

  weightsTitle: string
  weightsLead: string
  table: { trait: string; perUnit: string; perStep: string; step: string }
  stepNote: string
  /** Подводка к ссылке на разбор базы; заканчивается тире перед ссылкой. */
  sourceLead: string
  sourceLink: string

  pricesTitle: string
  pricesLead: string

  whereTitle: string
  whereBody: string
  whereLink: string

  /** Строки блока цен (`components/EconomicAssumptions.tsx`). */
  assumptions: {
    title: string
    lead: string
    footnote: string
    /** Слово при числе: «₽/кг», «лактации». */
    units: Record<AssumptionUnit, string>
    /*
     * `Record` по ключу допущения, а не список: новое допущение в
     * `economics.ts` не соберётся без подписи, и молчаливой пустой строки
     * на странице не появится.
     */
    rows: Record<AssumptionKey, { label: string; note: string }>
  }
}

/** Доли цены молока показаны процентами: считаются там же, где и цены. */
const fatShare = Math.round(MILK_VALUE_SHARES.fat * 100)
const proteinShare = Math.round(MILK_VALUE_SHARES.protein * 100)

const RU: EconomicsPageText = {
  numberLocale: 'ru-RU',

  compareTitle: 'Чем он отличается от обычного индекса',
  comparePara: [
    'Обычный индекс складывает признаки с весами в долях и отвечает на вопрос «насколько это животное лучше среднего». Ответ верный и непереводимый в решение: зоотехник, выбирая между двумя нетелями, считает не доли, а деньги.',
    'Экономический индекс складывает те же признаки, но веса у него — рубли на единицу признака. Сумма получается в рублях за жизнь животного, и её можно сравнить с ценой нетели, стоимостью лечения и выручкой от выбраковки. Это и есть перевод селекции на язык, на котором принимаются решения.',
    'Профиль Ассоциации при этом не заменяется: он отвечает за породу, а не за деньги одного хозяйства. Оба лежат рядом, и переключение между ними показывает то, что иначе обсуждают на словах, — что «лучшая корова» у породы и у бухгалтерии это разные коровы.',
  ],

  weightsTitle: 'Сколько стоит единица признака',
  weightsLead:
    'Рубли за продуктивную жизнь животного. Знак минус означает не «плохой признак», а расход: за крупную корову платят кормом, а за смертность приплода — телятами.',
  table: {
    trait: 'Признак',
    perUnit: '₽ за единицу',
    perStep: '₽ за обычный шаг',
    step: 'Шаг',
  },
  stepNote:
    '«Обычный шаг» — генетическое стандартное отклонение признака: настолько животные расходятся между собой в обычной популяции. Сравнивать веса имеет смысл по второму столбцу, а не по первому: килограммы жира расходятся на десятки, баллы вымени — на единицы, и цена за единицу об этом молчит.',
  sourceLead:
    'Откуда взяты сами отклонения, что означает версия базы и где у источника не нашлось нужного признака —',
  sourceLink: 'разбор базы сравнения',

  pricesTitle: 'Из каких цен это собрано',
  pricesLead:
    'Ни одно из чисел выше не взято из воздуха: каждое считается из цен ниже. Это допущения по рынку 2026 года, а не истина — у хозяйства цифры свои, и под них заводится свой профиль.',

  whereTitle: 'Где это в книге',
  whereBody:
    'Профиль стоит рядом с остальными в разделе индекса племенной ценности: его берут за основу и правят цены под своё хозяйство. Веса пересчитываются сразу, и видно, как от цены молока меняется место животного в списке.',
  whereLink: 'Раздел про индекс племенной ценности →',

  assumptions: {
    title: 'Из каких цен считается',
    lead: 'Индекс верен ровно настолько, насколько верны цены под ним. Это допущения по рынку 2026 года, а не истина: у хозяйства цифры свои, и под них заводят свой профиль.',
    footnote:
      'Композитам вымени и ног цена намеренно не назначена: их экономика уже учтена через здоровье вымени и долголетие. Вторая цена была бы двойным счётом.',
    units: { rubPerKg: '₽/кг', rub: '₽', lactations: 'лактации' },
    rows: {
      milkBase: {
        label: 'Молоко, базисное',
        note: 'апрель 2026, без НДС, при 3,4 % жира и 3,0 % белка',
      },
      fat: {
        label: 'Жир',
        note: `${fatShare} % цены молока, делённые на массу жира`,
      },
      protein: {
        label: 'Белок',
        note: `${proteinShare} % цены молока, делённые на массу белка`,
      },
      milkVolume: { label: 'Объём молока', note: 'остаток цены сверх жира и белка' },
      heifer: {
        label: 'Нетель на замену',
        note: 'по объявлениям племпродажи 150–260 тыс.',
      },
      cull: { label: 'Выбракованная корова', note: '600 кг живого веса по 175 ₽/кг' },
      mastitis: {
        label: 'Случай мастита',
        note: 'лечение, выброшенное молоко, потеря удоя',
      },
      hardCalving: {
        label: 'Трудный отёл',
        note: 'ветпомощь, дни в родильном отделении, потеря продуктивности',
      },
      calf: { label: 'Телёнок при рождении', note: 'усреднённо по полу' },
      openDay: {
        label: 'День сервис-периода',
        note: 'недополученное молоко, корма, доза семени',
      },
      horizon: {
        label: 'Горизонт',
        note: 'на столько умножаются признаки лактации, чтобы получить «за жизнь»',
      },
    },
  },
}

const EN: EconomicsPageText = {
  numberLocale: 'en-US',

  compareTitle: 'How it differs from an ordinary index',
  comparePara: [
    'An ordinary index adds traits up with weights expressed as shares and answers the question of how much better than average an animal is. The answer is correct and cannot be turned into a decision: choosing between two heifers, a herd manager counts money, not shares.',
    'The economic index adds up the same traits, but its weights are roubles per unit of trait. The sum comes out in roubles over the productive life of the animal, and it can be compared with the price of a heifer, the cost of treatment and the revenue from culling. That is what it means to put selection into the language decisions are made in.',
    'The Association profile is not replaced by it: that profile answers for the breed, not for the money of one farm. The two sit side by side, and switching between them shows what is otherwise only argued about in words — that the best cow for the breed and the best cow for the accounts are different cows.',
  ],

  weightsTitle: 'What one unit of a trait is worth',
  weightsLead:
    'Roubles over the productive life of the animal. A minus sign does not mean a bad trait but an expense: a larger cow is paid for in feed, and calf mortality is paid for in calves.',
  table: {
    trait: 'Trait',
    perUnit: '₽ per unit',
    perStep: '₽ per typical step',
    step: 'Step',
  },
  stepNote:
    'The typical step is the genetic standard deviation of the trait: that is how far animals differ from one another in an ordinary population. Weights are worth comparing by the second column rather than the first: kilograms of fat differ by tens, udder points by ones, and the price per unit says nothing about that.',
  sourceLead:
    'Where the deviations themselves come from, what the base version means and where the source had no figure for a trait —',
  /*
   * Разбор базы написан по-русски, и ссылка ведёт на русскую страницу.
   * Сказать об этом в подписи дешевле, чем оставить читателя щёлкать
   * и обнаруживать это самому.
   */
  sourceLink: 'the comparison base explained (in Russian)',

  pricesTitle: 'Which prices it is built from',
  pricesLead:
    'None of the figures above is invented: each one is computed from the prices below. These are assumptions about the Russian market of summer 2026, not the truth — a farm has figures of its own, and a profile is set up for them.',

  whereTitle: 'Where this sits in the book',
  whereBody:
    'The profile stands beside the others in the breeding value index section: it is taken as a starting point and its prices are edited to fit the farm. The weights are recomputed at once, and it becomes visible how the price of milk moves an animal up or down the list.',
  whereLink: 'The breeding value index section →',

  assumptions: {
    title: 'Which prices it is computed from',
    lead: 'The index is exactly as sound as the prices beneath it. These are assumptions about the Russian market of summer 2026, not the truth: a farm has figures of its own, and a profile is set up for them.',
    footnote:
      'The udder and feet-and-legs composites are deliberately left without a price: their economics is already counted through udder health and longevity. A second price would be double counting.',
    units: { rubPerKg: '₽/kg', rub: '₽', lactations: 'lactations' },
    rows: {
      milkBase: {
        label: 'Milk, base price',
        note: 'April 2026, excluding VAT, at 3.4% fat and 3.0% protein',
      },
      fat: { label: 'Fat', note: `${fatShare}% of the milk price, divided by the mass of fat` },
      protein: {
        label: 'Protein',
        note: `${proteinShare}% of the milk price, divided by the mass of protein`,
      },
      milkVolume: {
        label: 'Milk volume',
        note: 'what is left of the price above fat and protein',
      },
      heifer: {
        label: 'Replacement heifer',
        note: 'from breeding stock listings, 150–260 thousand',
      },
      cull: { label: 'Culled cow', note: '600 kg live weight at 175 ₽ per kg' },
      mastitis: {
        label: 'Clinical mastitis case',
        note: 'treatment, discarded milk, lost yield',
      },
      hardCalving: {
        label: 'Difficult calving',
        note: 'veterinary help, extra days in the calving pen, lost production',
      },
      calf: { label: 'Calf at birth', note: 'averaged over sex' },
      openDay: {
        label: 'One day open',
        note: 'milk not produced, feed, one semen dose',
      },
      horizon: {
        label: 'Horizon',
        note: 'lactation traits are multiplied by this to get the lifetime figure',
      },
    },
  },
}

export const ECONOMICS_PAGE_TEXT: Translated<EconomicsPageText> = { ru: RU, en: EN }
