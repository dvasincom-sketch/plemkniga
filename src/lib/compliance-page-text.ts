import type { Translated } from '@/lib/i18n/translated'
import {
  AREA_ORDER,
  COMPLIANCE,
  EXTERNAL,
  OURS,
  OURS_DONE,
  type EvidenceKind,
} from '@/lib/compliance'
import { plural } from '@/lib/format'

/**
 * Слова страницы соответствия.
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) устроены как
 * `Record<Locale, …>` и требуют все шесть языков разом. Для подписей
 * навигации это правильно. Здесь же плотная проза про то, почему список
 * написан невыгодно и почему закрыть его целиком нельзя, — тот же
 * длинный текст, что и разбор раздела книги, и переводится он целиком,
 * а не по строке. Поэтому `Translated` с явным откатом на русский —
 * как у `economics-page-text.ts` и `icar-page-text.ts`.
 *
 * ## Почему сами позиции реестра лежат не здесь
 *
 * Русское и английское описание каждой позиции стоят полями рядом
 * в `lib/compliance.ts`. Словарь переводов в другом файле разъезжается
 * молча — позицию добавили, перевести забыли, — и на английской
 * странице появляется русский абзац ровно там, где читатель ищет ответ
 * на вопрос, разговаривает ли система на его языке.
 *
 * ## Почему числа подставляются, а не пишутся словом
 *
 * «Всего двадцать три позиции» расходится с реестром на первой же
 * добавленной строке, и расходится молча. Это ровно тот вид неправды,
 * от которого страница и заводилась: сама она перечисляет всё честно,
 * а подпись занижает счёт, и читатель верит подписи, потому что она
 * короче.
 *
 * ## Почему в английском тексте нет `plural`
 *
 * `plural` считает по русским правилам: «1 позиция, 2 позиции,
 * 5 позиций». В английском она дала бы «2 entry» или «5 entries»
 * через раз. Английскому нужна одна развилка, и она стоит рядом
 * с текстом, который её требует.
 */

export type CompliancePageText = {
  /** Абзацы под подводкой: что это за список и почему написан невыгодно. */
  intro: string[]

  /** Объём списка; ссылка на карту ICAR стоит между `link` и `tail`. */
  scale: { lead: string; link: string; tail: string }

  /**
   * Ответ на вопрос «а можно закрыть всё?».
   *
   * `strong` идёт полужирным, `after` продолжает то же предложение —
   * поэтому начинается с запятой, а не с заглавной буквы.
   */
  closed: { strong: string; after: string; ours: string }

  /** Подписи частей позиции. */
  item: { what: string; ours: string; next: string; external: string }

  /**
   * Подпись вида доказательства.
   *
   * `Record` по виду, а не список: новый вид доказательства не соберётся
   * без подписи, и на странице не появится пустого двоеточия перед путём.
   */
  evidence: Record<EvidenceKind, string>

  /** Итоговый блок: откуда взяты оценки и почему нет чужих знаков. */
  sources: { title: string; body: string; marks: string }
}

/* Числа берутся из реестра — там же, где живёт само состояние. */
const items = COMPLIANCE.length
const areas = AREA_ORDER.length
const external = EXTERNAL.length
const ours = OURS.length
const done = OURS_DONE.length

/** Английское число: одна развилка вместо трёх русских. */
const en = (n: number, one: string, many: string): string => (n === 1 ? one : many)

const RU: CompliancePageText = {
  intro: [
    'Стандарты, методологии и своды правил, которым следует племенная книга, — с честным состоянием по каждому. У всего, что заявлено сделанным, стоит ссылка на то, чем это подтверждается: прогон, страница, файл или документ.',
    'Список написан без оглядки на то, как он выглядит. Специалист, открывший систему, всё равно найдёт то, о чём здесь умолчали, — и дальше не поверит ничему. Знать границы за десять минут выгоднее обеим сторонам, чем узнавать их на третьем месяце внедрения.',
  ],

  scale: {
    lead:
      `Всего ${items} ${plural(items, 'позиция', 'позиции', 'позиций')} в ${areas} разделах. ` +
      '«Закрыто извне» — не «руки не дошли»: членство в ICAR требует санкционной ' +
      'декларации, а членство в европейской конфедерации приостановлено решением ' +
      'от июля 2022 года.',
    link: 'Разбор по разделам руководств ICAR',
    tail: '— отдельной страницей.',
  },

  closed: {
    strong: 'Закрыть весь список нельзя',
    after:
      `, и это свойство самого списка, а не состояние работы. ${external} из ${items} ` +
      `${plural(external, 'позиции', 'позиций', 'позиций')} зависят не от кода: ` +
      'их закрывают членство в международной организации, аккредитованный аудитор, ' +
      'ведомство или решение самой Ассоциации. Разработкой их можно только подготовить.',
    ours:
      `Нашей работой закрываются ${ours} ${plural(ours, 'позиция', 'позиции', 'позиций')}; ` +
      `закрыто ${done}. У каждой оставшейся сказано, чего именно не хватает, — и это ` +
      'честнее круглого числа готовности, которое ничего не обещает.',
  },

  item: {
    what: 'Что требует.',
    ours: 'Что у нас.',
    next: 'Что дальше.',
    external: 'Зависит не от нас.',
  },

  evidence: {
    check: 'прогон',
    page: 'страница',
    code: 'код',
    doc: 'документ',
  },

  sources: {
    title: 'Откуда взяты оценки',
    body: 'Состояния расставлены по разбору открытых источников: уставы и анкеты организаций, тексты стандартов там, где они открыты, списки членов, регламенты использования знаков. Там, где факт не удалось подтвердить первоисточником, это сказано прямо в самом разборе. Порядок работ и обоснование очерёдности — в отдельном плане.',
    marks: 'Знаки и марки организаций на этой странице не используются: они выдаются по статусу члена или по пройденной проверке, а не за соответствие правилам. Утверждение о собственной работе разрешено всем и без всякого членства — им и ограничиваемся.',
  },
}

const EN: CompliancePageText = {
  intro: [
    'The standards, methodologies and codes of rules the herd book follows, with an honest state for each of them. Everything claimed as done carries a link to what proves it: a run, a page, a file or a document.',
    'The list is written with no regard for how it looks. A specialist who opens the system will find whatever was passed over here anyway — and will then believe nothing at all. Knowing the limits in ten minutes is better for both sides than finding them out in the third month of a rollout.',
  ],

  scale: {
    lead:
      `${items} ${en(items, 'entry', 'entries')} in ${areas} ` +
      `${en(areas, 'area', 'areas')} in all. “Blocked externally” does not mean ` +
      '“we have not got round to it”: ICAR membership requires a sanctions declaration, ' +
      'and membership of the European confederation was suspended by a decision of July 2022.',
    /*
     * Разбор по разделам переведён, и ссылка ведёт на английскую
     * страницу: оговорки «(in Russian)» здесь не нужно.
     */
    link: 'The ICAR Guidelines section by section',
    tail: '— on a separate page.',
  },

  closed: {
    strong: 'The whole list cannot be closed',
    after:
      `, and that is a property of the list itself, not the state of the work. ${external} ` +
      `of the ${items} ${en(items, 'entry', 'entries')} do not depend on code: they are ` +
      'closed by membership of an international organisation, by an accredited auditor, ' +
      'by a government body or by a decision of the Association itself. Development can ' +
      'only prepare them.',
    ours:
      `Our own work can close ${ours} ${en(ours, 'entry', 'entries')}; ${done} of them ` +
      `${en(done, 'is', 'are')} closed. For every one of the rest it says what exactly is ` +
      'missing — which is more honest than a round readiness figure that promises nothing.',
  },

  item: {
    what: 'What it requires.',
    ours: 'What we have.',
    next: 'What comes next.',
    external: 'Not up to us.',
  },

  evidence: {
    check: 'run',
    page: 'page',
    code: 'code',
    doc: 'document',
  },

  sources: {
    title: 'Where these assessments come from',
    body: 'The states are assigned from a review of open sources: the statutes and application forms of the organisations, the texts of standards where those are open, member lists, rules for the use of marks. Where a fact could not be confirmed from a primary source, the review says so directly. The order of the work and the reasoning behind that order are in a separate plan.',
    marks: 'The marks and logos of the organisations are not used on this page: they are granted for member status or for a passed audit, not for following the rules. A statement about one’s own work is allowed to anyone, with no membership at all — and that is all we make.',
  },
}

export const COMPLIANCE_PAGE_TEXT: Translated<CompliancePageText> = { ru: RU, en: EN }
