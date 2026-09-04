import type { Translated } from '@/lib/i18n/translated'

/**
 * Слова самой страницы раздела книги — те, что не приходят из данных.
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) устроены как
 * `Record<Locale, …>` и требуют все шесть языков разом. Для подписей
 * навигации это правильно. Здесь же среди строк — двенадцать подписей
 * под рисунками, и каждая объясняет, что именно на рисунке видно; это
 * такой же длинный текст, как сам разбор раздела, и переводится он вместе
 * с ним, а не отдельно.
 *
 * ## Почему подписи под рисунками — текст, а не часть рисунка
 *
 * Подпись говорит, **что** на рисунке важно. Внутри рисунка её пришлось бы
 * рисовать, то есть переводить перерисовкой. Снаружи она обычный абзац:
 * язык меняется, картинка остаётся.
 *
 * ## Чего здесь пока нет
 *
 * Слов внутри самих нарисованных экранов. Они изображают рабочее место
 * на русском языке, и на английской странице остаются русскими —
 * это видно и названо в `docs/lokalizatsiya.md`. Подпись при этом
 * английская и объясняет, что на рисунке происходит, так что читатель
 * не остаётся с непонятной картинкой; но работа не закончена, и делать
 * вид, что закончена, нельзя.
 */

export type BookPageText = {
  /** Хлебная крошка наверху. */
  crumb: string
  limits: string
  others: string
  ctaTitle: string
  ctaLead: string
  ctaOpen: string
  ctaMail: string
  /** Заголовок вкладки браузера: имя раздела плюс это. */
  titleSuffix: string
  /** Подпись под рисунком, по слугу раздела. */
  note: Record<string, string>
  /** Заголовок и приписка оконной рамки, по слугу раздела. */
  frame: Record<string, { title: string; subtitle: string }>
}

const RU: BookPageText = {
  crumb: 'Что внутри книги',
  limits: 'Пределы',
  others: 'Другие разделы',
  ctaTitle: 'Посмотреть, как это работает',
  ctaLead: 'Голштинская книга открыта: разделы можно открыть и прочитать на живых данных.',
  ctaOpen: 'Открыть племенную книгу',
  ctaMail: 'Написать нам',
  titleSuffix: 'что внутри племенной книги',
  note: {
    animal:
      'Одна карточка, три прочтения. Разница не в оформлении, а в правах: посторонний видит то, что хозяйство открыло, владелец — работу, а у быка другой предмет разговора. Нарисовано вёрсткой; значения показаны для примера.',
    pedigree:
      'Подтверждённое ДНК помечено, неизвестный предок показан пунктиром. Скрывать пропуск нельзя: он меняет смысл коэффициента родства.',
    quality:
      'Находка называет животное и поле — иначе её нельзя исправить. Отказ реестра приходит через неделю и говорит про файл.',
    milk:
      'Метод контроля записан рядом с рядом замеров, а пропуск в ряду назван пропуском. Без метода два одинаковых «9 640 кг» из разных хозяйств несравнимы, а выглядят одинаково.',
    index:
      'Показано не число, а из чего оно сложилось — включая вклад со знаком минус. Индекс без разбора нечем проверить и не с чем спорить.',
    conformation:
      'Линейная шкала описывает, а не хвалит: девятка означает «очень», а не «лучше». У роста желаемое ближе к краю, у постановки ног — посередине, и абзацем это не объясняется так же быстро, как одной полосой.',
    mating:
      'Список отсортирован по индексу, а предупреждение стоит у первой строки: лучший по числу бык здесь и есть худший выбор. В каталоге поставщика этого не видно вовсе — там у быка одно число, — а видно только там, где обе родословные лежат рядом и инбридинг считается для потомка, которого ещё нет.',
    reports:
      'Строка раскрыта, и под средним возрастом первого отёла стоят те животные, из которых оно сложилось, — включая тех, кто среднее и портит. Число без списка нечем проверить и нечего с ним делать: ради этих животных отчёт и открывают.',
    access:
      'Показан не перечень ролей, а точечная выдача: одно животное, срок, два списка — что откроется и что нет. Первый вопрос при разговоре о доступах звучит именно так («а надои покупатель увидит?»), и отвечать на него надо обеими половинами сразу.',
    submissions:
      'Пакет разложен на три исхода, у каждого сомнения названа причина, а на кнопке стоят оба числа. «Принять» без чисел означало бы обратное — залить файл как есть и разбираться потом.',
    exchange:
      'Одно и то же доение в двух формах: слева колонки государственного реестра, справа ответ по международному стандарту. Запись при этом одна — вводится она единожды, а форм у неё столько, сколько адресатов.',
    documents:
      'Разделы, подписи и единицы — из настоящего бланка; значения показаны для примера. Рисунок, а не снимок: в выпущенном документе стоят настоящие животные и настоящие хозяйства, и на витрине им не место.',
  },
  frame: {
    pedigree: { title: 'Ромашка · RU 4512 087', subtitle: 'происхождение' },
    index: { title: 'Ромашка · RU 4512 087', subtitle: 'профиль Ассоциации' },
    conformation: { title: 'Ромашка · RU 4512 087', subtitle: 'линейная оценка' },
    mating: { title: 'Ромашка · RU 4512 087', subtitle: 'подбор быка' },
    reports: { title: 'Стадо ООО «Рассвет» · 231 корова', subtitle: 'отчёт' },
    access: { title: 'Ромашка · RU 4512 087', subtitle: 'доступ' },
    submissions: { title: 'Заявка № 3184 · ООО «Заря»', subtitle: 'разбор пакета' },
  },
}

const EN: BookPageText = {
  crumb: 'What the book holds',
  limits: 'Limits',
  others: 'Other sections',
  ctaTitle: 'See how it works',
  ctaLead: 'The Holstein book is open: every section can be opened and read on live data.',
  ctaOpen: 'Open the herdbook',
  ctaMail: 'Write to us',
  titleSuffix: 'inside the herdbook',
  note: {
    animal:
      'One record, three readings. The difference is not in styling but in rights: an outsider sees what the farm has opened, the owner sees the work, and a bull is a different subject altogether. Drawn in markup; the values are illustrative.',
    pedigree:
      'DNA-confirmed parentage is marked, an unknown ancestor is dashed. The gap must not be hidden: it changes what the relationship coefficient means.',
    quality:
      'A finding names the animal and the field — otherwise it cannot be fixed. A rejection from the register arrives a week later and talks about the file.',
    milk:
      'The recording method sits next to the series of test days, and a gap in the series is called a gap. Without the method two identical figures of "9,640 kg" from different farms are not comparable, yet they look the same.',
    index:
      'What is shown is not the number but what it is made of — including a contribution with a minus sign. An index without its breakdown cannot be checked and cannot be argued with.',
    conformation:
      'A linear scale describes, it does not praise: nine means "very", not "best". For stature the desirable band sits near the end of the scale, for rear leg set it sits in the middle — and no paragraph explains that as quickly as one band does.',
    mating:
      'The list is sorted by index, and the warning stands on the first row: the best bull by the number is the worst choice here. A supplier catalogue cannot show this at all — there a bull has a single figure — it is visible only where both pedigrees lie side by side and inbreeding is computed for a calf that does not exist yet.',
    reports:
      'One row is expanded, and under the average age at first calving stand the very animals it is made of — including the ones dragging it. A figure without its list cannot be checked and cannot be acted on: those animals are the reason the report is opened.',
    access:
      'This is not a table of roles but a single grant: one animal, an expiry date, and two lists — what opens and what does not. The first question in any conversation about access is exactly that ("will the buyer see my yields?"), and it has to be answered with both halves at once.',
    submissions:
      'The package is split into three outcomes, every doubt is given a reason, and the button carries both numbers. "Accept" without numbers would mean the opposite — dump the file and sort it out later.',
    exchange:
      'The same test day in two forms: the state register columns on the left, the international standard response on the right. The record itself is one — entered once, with as many forms as there are recipients.',
    documents:
      'Sections, captions and units come from the real form; the values are illustrative. A drawing rather than a screenshot: an issued document carries real animals and real farms, and they have no place on a public page.',
  },
  /*
   * Внутри рамки — русское рабочее место, и подделывать английское имя
   * животного поверх русского экрана нельзя: получилось бы окно, где
   * заголовок на одном языке, а содержимое на другом. Заголовок остаётся
   * тем же, переведена только приписка о том, что открыто.
   */
  frame: {
    pedigree: { title: 'Ромашка · RU 4512 087', subtitle: 'pedigree' },
    index: { title: 'Ромашка · RU 4512 087', subtitle: 'association profile' },
    conformation: { title: 'Ромашка · RU 4512 087', subtitle: 'linear scoring' },
    mating: { title: 'Ромашка · RU 4512 087', subtitle: 'sire selection' },
    reports: { title: 'Стадо ООО «Рассвет» · 231 корова', subtitle: 'report' },
    access: { title: 'Ромашка · RU 4512 087', subtitle: 'access' },
    submissions: { title: 'Заявка № 3184 · ООО «Заря»', subtitle: 'package review' },
  },
}

export const BOOK_PAGE_TEXT: Translated<BookPageText> = { ru: RU, en: EN }
