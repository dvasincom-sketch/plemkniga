import type { Translated } from '@/lib/i18n/translated'
import { ADE_MAP, ADE_OURS, ADE_SCHEMAS } from '@/lib/ade-schema-map'
import { ADE_COLLECTIONS } from '@/lib/ade/core'
import { ADE_WRITABLE } from '@/lib/ade/parse'
import { plural } from '@/lib/format'

/**
 * Слова страницы обмена — те, что не приходят из данных.
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) устроены как
 * `Record<Locale, …>` и требуют все шесть языков разом. Для подписей
 * навигации это правильно, а здесь текста на две страницы: разбор того,
 * чем именно сверяется наш обмен, с оговорками, ради точности которых
 * страница и заведена. Это тот же длинный текст, что и разбор раздела
 * книги, и переводится он целиком, а не по строке. Поэтому `Translated`
 * с явным откатом на русский — как у `book-page-text.ts`
 * и `economics-page-text.ts`.
 *
 * ## Почему числа подставлены здесь, а не в разметке
 *
 * Абзац «разница между 303 и 77» без самих чисел — не абзац. Числа
 * считаются из выписки схем там же, где и текст: разойтись со страницей
 * они не могут, потому что страница берёт готовую строку.
 *
 * ## Почему в английском тексте нет `plural`
 *
 * `plural` считает по русским правилам: «1 коллекция, 2 коллекции,
 * 5 коллекций». Подставить её в английский текст значило бы получить
 * «2 collection» или «5 collections» через раз. Английскому нужна одна
 * развилка, и она стоит рядом с текстом, который её требует.
 */

export type AdePageText = {
  /** Тег для `toLocaleDateString`: порядок дня и месяца. */
  dateLocale: string

  /** Абзац под подводкой: почему страница вообще есть. */
  intro: string

  /** Полоса версий под заголовком. */
  version: { standard: string; branch: string; copied: string; commit: string }

  /** Абзац под полосой версий. */
  copyNote: string

  /** Подписи к трём числам. */
  stats: { total: string; used: string; ours: string }
  /** Абзац под числами: чем 303 отличается от 77. */
  gap: string

  /** Раздел «что книга отдаёт и принимает». */
  ours: {
    title: string
    lead: string
    table: { what: string; schema: string; content: string; write: string }
    accepted: string
    readOnly: string
  }

  /** Раздел со списком схем сверки. */
  used: { title: string; lead: string }

  /** Раздел «что в стандарте есть, а в книге нет». */
  outside: {
    title: string
    lead: string
    table: { theme: string; count: string; why: string }
    note: string
  }

  /** Раздел «что сверка уже нашла». */
  found: {
    title: string
    ourTitle: string
    our: string
    theirTitle: string
    /** Продолжение после имени схемы: оно стоит в разметке как код. */
    their: string
  }

  /** Раздел «источник и обновление». */
  source: {
    title: string
    /** До ссылки на репозиторий. */
    lead: string
    link: string
    /** После ссылки, до имени ветки. */
    license: string
    /** После имени ветки, до коммита; начинается с запятой. */
    commit: string
    /** После коммита. */
    tail: string
    copyPara: string
    links: { compliance: string; icar: string; api: string }
  }
}

/** Схем в дереве, схем в сверке и схем за её пределами. */
const total = ADE_SCHEMAS.length
const used = ADE_MAP.used
const outside = total - used

const collections = ADE_COLLECTIONS.length
const writable = ADE_WRITABLE.length

/** Английское число: одна развилка вместо трёх русских. */
const en = (n: number, one: string, many: string): string => (n === 1 ? one : many)

const RU: AdePageText = {
  dateLocale: 'ru-RU',

  intro:
    '«Соответствует ICAR» говорят все, и проверить это со стороны нельзя: ни сертификации, ни реестра внедрений у стандарта нет. Единственное, что отличает утверждение от слов, — показать, чем именно оно проверяется.',

  version: {
    standard: 'Версия стандарта',
    branch: 'Ветка у ICAR',
    copied: 'Копия снята',
    commit: 'Коммит у ICAR',
  },

  copyNote:
    'Схемы стандарта лежат копией в дереве проекта, и каждый прогон сверяет с ними то, что книга отдаёт наружу. Ниже — что участвует в этой сверке, что не участвует и почему.',

  stats: {
    total: 'файлов схем стандарта в дереве проекта',
    used: 'из них участвуют в сверке наших ресурсов',
    ours: 'ресурсов книги проверяется на каждом прогоне',
  },
  gap: `Разница между ${total} и ${used} — не оговорка. Сверяются одиннадцать наших ресурсов; участвуют в сверке те схемы, без которых она не состоится: общие предки, типы, перечисления. Остальные ${outside} лежат в дереве, чтобы ссылки разрешались целиком и чтобы обновление стандарта было видно построчным сравнением — включая то, чего книга не делает.`,

  ours: {
    title: 'Что книга отдаёт и принимает',
    lead: `${collections} ${plural(collections, 'коллекция', 'коллекции', 'коллекций')} по адресам стандарта; ${writable} из них принимают данные. Остальные закрыты на запись намеренно: постановка животного на учёт и переход прав — утверждения, за которые отвечает Ассоциация, и они идут заявкой с проверкой.`,
    table: {
      what: 'Что это в книге',
      schema: 'Схема ICAR',
      content: 'Содержание',
      write: 'Приём',
    },
    accepted: 'принимается',
    readOnly: 'только отдача',
  },

  used: {
    title: 'Схемы, участвующие в сверке',
    lead: 'Наши ресурсы ссылаются на общие предки, те — на типы, типы — на перечисления. Замкнутый круг этих ссылок и есть то, чем ответ книги проверяется на самом деле. Имена приведены как в репозитории: по ним схему находят за один поиск.',
  },

  outside: {
    title: 'Что в стандарте есть, а в книге нет',
    lead: `${outside} ${plural(outside, 'схема', 'схемы', 'схем')} в сверке не участвуют, и это не пробел. Стандарт описывает всю ферму — от кормового стола до убойного цеха, — а племенная книга отвечает за происхождение и продуктивность. Границу видно здесь.`,
    table: { theme: 'Тема стандарта', count: 'Схем', why: 'Почему не у нас' },
    note: 'Разбор по темам — по ключевому слову в имени схемы. Правило грубое и годится ровно для того, ради чего заведено: показать размер стандарта и границы книги.',
  },

  found: {
    title: 'Что сверка уже нашла',
    ourTitle: 'Нашу ошибку',
    our: 'Перечень приплода у отёла уезжал без обязательных полей, которых требует общий предок ресурса. Собственная проверка книги пройти мимо была обязана — она про предка не знала. Любой партнёр, сверяющий по схеме, отверг бы каждый наш отёл с приплодом.',
    theirTitle: 'Ошибку в самом стандарте',
    their:
      'объявляет обязательными два поля, которых не определяет ни сам, ни его предки: список обязательных скопирован из соседнего типа при разделении ресурса надвое. Выполнить такую схему нельзя ничем. У нас это снято исключением под конкретную поломку и печатается отдельной строкой, чтобы не растворилось в зелёном.',
  },

  source: {
    title: 'Источник и обновление',
    lead: 'Схемы взяты из репозитория',
    link: 'adewg/ICAR',
    license: 'под лицензией Apache 2.0, ветка',
    commit: ', коммит',
    tail: '. Файлы не изменялись.',
    copyPara:
      'Копия лежит в дереве намеренно. Проверка, ходящая в сеть, падает, когда чужой сервер недоступен, и — хуже — проходит, когда он недоступен незаметно. Обновление копии видно построчным сравнением: расхождение со стандартом становится событием, которое кто-то прочитал и принял.',
    links: {
      compliance: 'Реестр соответствия',
      icar: 'Разбор по разделам ICAR',
      api: 'Описание интерфейса',
    },
  },
}

const EN: AdePageText = {
  dateLocale: 'en-GB',

  intro:
    'Everyone says they comply with ICAR, and there is no way to check it from outside: the standard has neither certification nor a register of implementations. The only thing that tells a claim apart from words is showing what exactly it is checked against.',

  version: {
    standard: 'Standard version',
    branch: 'Branch at ICAR',
    copied: 'Copy taken',
    commit: 'Commit at ICAR',
  },

  copyNote:
    'The schemas of the standard sit as a copy in the project tree, and every run validates against them what the book gives out. Below is what takes part in that check, what does not, and why.',

  stats: {
    total: 'schema files of the standard in the project tree',
    used: 'of them take part in checking our resources',
    ours: 'resources of the book are checked on every run',
  },
  gap: `The difference between ${total} and ${used} is not a slip. ${ADE_OURS.length} of our resources are checked, and the schemas taking part are the ones without which the check would not happen: common ancestors, types, enumerations. The other ${outside} sit in the tree so that references resolve in full and so that an update of the standard is visible in a line-by-line comparison — including the parts the book does not do.`,

  ours: {
    title: 'What the book gives out and takes in',
    lead: `${collections} ${en(collections, 'collection', 'collections')} at the paths of the standard; ${writable} of them ${en(writable, 'accepts', 'accept')} data. The rest are closed to writing on purpose: registering an animal and transferring ownership are statements the Association answers for, and they go through an application with verification.`,
    table: {
      what: 'What it is in the book',
      schema: 'ICAR schema',
      content: 'Contents',
      write: 'Intake',
    },
    accepted: 'accepted',
    readOnly: 'export only',
  },

  used: {
    title: 'Schemas that take part in the check',
    lead: 'Our resources refer to common ancestors, those to types, and types to enumerations. The closed circle of these references is what the response of the book is actually checked against. Names are given as they are in the repository: one search finds the schema by them.',
  },

  outside: {
    title: 'What the standard has and the book does not',
    lead: `${outside} ${en(outside, 'schema takes', 'schemas take')} no part in the check, and that is not a gap. The standard describes the whole farm — from the feed table to the slaughter plant — while a herd book answers for descent and productivity. The boundary is visible here.`,
    table: {
      theme: 'Topic of the standard',
      count: 'Schemas',
      why: 'Why not here',
    },
    note: 'The split into topics is made by a keyword in the schema name. The rule is crude and is good for exactly what it was set up for: showing the size of the standard and the boundaries of the book.',
  },

  found: {
    title: 'What the check has already found',
    ourTitle: 'A mistake of ours',
    our: 'The list of calves on a calving went out without the mandatory fields the common ancestor of the resource requires. The book’s own validation was bound to miss it — it knew nothing about the ancestor. Any partner validating against the schema would have rejected every calving with calves we sent.',
    theirTitle: 'A mistake in the standard itself',
    their:
      'declares two fields mandatory that neither it nor its ancestors define: the list of required fields was copied from a neighbouring type when the resource was split in two. Nothing can satisfy such a schema. Here it is lifted by an exception written for that specific breakage and is printed as a separate line so that it does not dissolve into the green.',
  },

  source: {
    title: 'Source and updates',
    lead: 'The schemas are taken from the',
    link: 'adewg/ICAR',
    license: 'repository under the Apache 2.0 licence, branch',
    commit: ', commit',
    tail: '. The files are not modified.',
    copyPara:
      'The copy sits in the tree on purpose. A check that goes out to the network fails when someone else’s server is unavailable and — worse — passes when it is unavailable unnoticed. An update of the copy is visible in a line-by-line comparison: a divergence from the standard becomes an event that someone has read and accepted.',
    links: {
      compliance: 'Compliance register',
      icar: 'ICAR section by section',
      api: 'Interface reference',
    },
  },
}

export const ADE_PAGE_TEXT: Translated<AdePageText> = { ru: RU, en: EN }
