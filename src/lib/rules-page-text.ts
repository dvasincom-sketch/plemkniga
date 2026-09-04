import type { Translated } from '@/lib/i18n/translated'
import type { CheckSeverity } from '@/lib/checks-registry'
import { plural } from '@/lib/format'

/**
 * Слова страницы каталога правил.
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) требуют все шесть языков
 * разом, и для подписей навигации это правильно. Здесь же два абзаца
 * про разницу между «остановить» и «предупредить» плюс подводка к списку:
 * тот же длинный текст, что и разбор раздела книги, и переводится он
 * целиком, а не по строке. Поэтому `Translated` с явным откатом
 * на русский — как у `economics-page-text.ts`.
 *
 * ## Почему счётчик правил — функция, а не пара слов
 *
 * По-русски «правило / правила / правил» выбирается из трёх форм
 * (`plural`), по-английски — из двух, и вторая получается прибавлением
 * буквы. Общего устройства у этих двух правил нет, и попытка описать их
 * одной таблицей форм кончилась бы «1 rules» либо «56 правило».
 * Поэтому каждый язык считает своё слово сам.
 *
 * ## Почему подписи веса лежат рядом с текстом страницы
 *
 * «исправить» и «предупреждение» набирались прямо в разметке и потому
 * оставались русскими на всех языках — ровно та беда, ради которой
 * заведён этот файл. Существенность приходит из реестра значением
 * (`fix` / `note`), а как это назвать словом, решает страница.
 */

export type RulesPageText = {
  /** Подписи под числами первого экрана. */
  numbers: {
    total: string
    fix: string
    note: string
    threshold: string
  }

  weightTitle: string
  /** Абзацы о разнице между «остановить» и «предупредить». */
  weightPara: string[]

  listTitle: string
  listLead: string

  /** «56 правил» целиком: число и слово при нём считаются вместе. */
  ruleCount: (n: number) => string

  /*
   * `Record` по существенности, а не две строки: новое значение
   * в `CheckSeverity` не соберётся без подписи, и на плашке
   * не появится пустоты.
   */
  severity: Record<CheckSeverity, string>

  /** Подпись перед числовой границей правила; двоеточие входит в строку. */
  thresholdLabel: string

  /** Пояснение к правилу, данных под которое база и так не примет. */
  dbGuardNote: string
}

const RU: RulesPageText = {
  numbers: {
    total: 'правил в реестре',
    fix: 'останавливают подачу до исправления',
    note: 'предупреждают, но не мешают работать',
    threshold: 'имеют числовую границу, названную вслух',
  },

  weightTitle: 'Почему не все находки одинаковы',
  weightPara: [
    'Правило либо останавливает подачу, либо предупреждает. Разница не в строгости, а в том, может ли правило ошибаться. «Отец моложе потомка» ошибаться не может — это противоречие, и запись с ним не должна уходить в реестр. «Удой выше двадцати пяти тысяч» ошибаться может: такая корова редка, но возможна, и запретить её значило бы поручиться за то, чего мы не знаем.',
    'Поэтому предупреждение остаётся предупреждением, и решение — за человеком. Правило, которое всегда право, и правило, которое обычно право, различаются в книге по существу, а не оттенком плашки.',
  ],

  listTitle: 'Список',
  listLead:
    'У каждого правила есть номер — на него можно сослаться в письме или в разговоре с поддержкой: «правило 45». Номер отражает место в реестре и меняется, если в середину списка добавят новое; неизменный ключ правила — его код, он уезжает в выгрузки и остаётся прежним навсегда.',

  ruleCount: (n) => `${n} ${plural(n, 'правило', 'правила', 'правил')}`,

  severity: { fix: 'исправить', note: 'предупреждение' },

  thresholdLabel: 'Граница:',

  dbGuardNote:
    'Такие данные не пропускает и сама база — правило остаётся для записей, пришедших со стороны.',
}

const EN: RulesPageText = {
  numbers: {
    total: 'rules in the registry',
    fix: 'stop a submission until they are fixed',
    note: 'warn without blocking the work',
    threshold: 'carry a numeric limit stated aloud',
  },

  weightTitle: 'Why not all findings are equal',
  weightPara: [
    'A rule either stops a submission or warns. The difference is not one of strictness but of whether the rule itself can be wrong. “Parent younger than offspring” cannot be wrong — it is a contradiction, and a record carrying it has no business reaching the registry. “Yield above twenty-five thousand” can be wrong: such a cow is rare but possible, and forbidding her would mean vouching for what we do not know.',
    'So a warning stays a warning, and the decision rests with the person. A rule that is always right and a rule that is usually right differ in this book in substance, not in the shade of a badge.',
  ],

  listTitle: 'The list',
  listLead:
    'Every rule has a number, and the number is what to quote in a letter or in a conversation with support: rule 45. It reflects the place of the rule in the registry and shifts if a new rule is inserted in the middle; the permanent key is the code of the rule, which goes into exports and never changes.',

  ruleCount: (n) => `${n} ${n === 1 ? 'rule' : 'rules'}`,

  severity: { fix: 'fix', note: 'warning' },

  thresholdLabel: 'Limit:',

  dbGuardNote:
    'The database does not admit such data either — the rule stays for records that arrive from outside.',
}

export const RULES_PAGE_TEXT: Translated<RulesPageText> = { ru: RU, en: EN }
