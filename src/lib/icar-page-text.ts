import type { Translated } from '@/lib/i18n/translated'
import { ICAR_GAP_COUNT, ICAR_WITH_GAPS } from '@/lib/icar-map'
import { ADE_COLLECTIONS } from '@/lib/ade/core'
import { ADE_WRITABLE } from '@/lib/ade/parse'
import { plural } from '@/lib/format'

/**
 * Слова двух страниц про ICAR — карты соответствия и разбора пробелов.
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) устроены как
 * `Record<Locale, …>` и требуют все шесть языков разом. Для подписей
 * навигации это правильно: их полсотни, и перевести их можно за раз.
 * Здесь же плотная проза про чужой нормативный документ — оговорка
 * про авторские права, разбор пятнадцати пробелов, объяснение, что
 * из них зависит не от кода. Это тот же длинный текст, что и разбор
 * раздела книги, и переводится он целиком, а не по строке. Поэтому
 * `Translated` с явным откатом на русский — как у `ade-page-text.ts`
 * и `economics-page-text.ts`.
 *
 * ## Почему сами разделы руководств лежат не здесь
 *
 * Их две страницы показывают одинаково, и список у них общий
 * (`lib/icar-map.ts`). Русское и английское описание раздела стоят там
 * полями рядом: словарь переводов в другом файле разъезжается молча —
 * раздел добавили, перевести забыли, и на английской странице
 * появляется русский абзац.
 *
 * ## Почему в английском тексте нет `plural`
 *
 * `plural` считает по русским правилам: «1 пробел, 2 пробела,
 * 5 пробелов». В английском тексте она дала бы «2 gap» или «5 gaps»
 * через раз. Английскому нужна одна развилка, и она стоит рядом
 * с текстом, который её требует.
 */

export type IcarPageText = {
  /** Карта соответствия — `/[locale]/icar`. */
  map: {
    /** Абзацы под подводкой: кто такие ICAR и что показывает таблица. */
    intro: string[]
    /** Оговорка про авторские права и про знак ICAR — до таблицы. */
    disclaimer: string
    table: { section: string; about: string; ours: string; state: string }
    /** Подпись ссылки на разбор: за ней в разметке идёт число пробелов. */
    gapsLink: string
    /** Строка под таблицей; ссылка на разбор стоит между `lead` и `tail`. */
    outNote: { lead: string; link: string; tail: string }
    /** Раздел про открытые источники; ссылки стоят между кусками текста. */
    open: {
      title: string
      lead: string
      wiki: string
      afterWiki: string
      github: string
      afterGithub: string
      series: string
      afterSeries: string
    }
  }

  /** Разбор пробелов — `/[locale]/icar/gaps`. */
  gaps: {
    /** Заголовок и описание для поисковой выдачи. */
    meta: { title: string; description: string }
    breadcrumbs: { map: string; here: string }
    title: string
    /** Первый абзац; ссылка на карту стоит между `before` и `after`. */
    intro: { before: string; link: string; after: string }
    /** Второй абзац: почему список написан невыгодно. */
    lead: string
    /** Подпись оглавления для читалки экрана. */
    navLabel: string
    /** Подписи трёх частей разбора. */
    labels: { ours: string; why: string; need: string }
    /** Итоговый блок; ссылка на карту стоит между `body` и `tail`. */
    outro: { title: string; body: string; link: string; tail: string }
  }
}

const sections = ICAR_WITH_GAPS.length
const collections = ADE_COLLECTIONS.length
const writable = ADE_WRITABLE.length

/** Английское число: одна развилка вместо трёх русских. */
const en = (n: number, one: string, many: string): string => (n === 1 ? one : many)

const RU: IcarPageText = {
  map: {
    intro: [
      'Международный комитет по учёту животных (International Committee for Animal Recording, ICAR) пишет руководства, по которым в мире ведут учёт продуктивности, подтверждают происхождение и оценивают племенную ценность. Около ста тридцати организаций из шестидесяти стран работают по ним; племенные книги Чехии, Нидерландов, Ирландии, Великобритании построены на этих правилах.',
      'Племенная книга строится по тем же руководствам. Ниже — карта: что требует каждый раздел и как это сделано у нас. Полностью учтённых разделов пока нет ни одного, и это состояние на сегодня, а не осторожность формулировок.',
    ],
    disclaimer:
      'Руководства принадлежат ICAR. Ниже — краткий пересказ своими словами и ссылка на английский оригинал, а не перевод: публиковать перевод целиком мы не вправе. Разрешение на русский перевод отдельных разделов у ICAR запрошено. Знак ICAR на этой странице не используется — он выдаётся Советом организации по статусу члена, а не за соответствие руководствам.',
    table: {
      section: 'Раздел',
      about: 'О чём',
      ours: 'Как в книге',
      state: 'Состояние',
    },
    gapsLink: 'чего не хватает',
    outNote: {
      lead: '«Вне области» — раздел не о нас: сертификация приборов и аккредитация лабораторий не задача учётной системы.',
      link: `Разбор всех ${ICAR_GAP_COUNT} пробелов`,
      tail: `по ${plural(sections, 'разделу', 'разделам', 'разделам')} — отдельной страницей.`,
    },
    open: {
      title: 'Что ещё открыто всем',
      lead: 'Руководства целиком лежат на',
      wiki: 'wiki.icar.org',
      afterWiki: 'и читаются без регистрации. Стандарт обмена данными ADE выложен',
      github: 'на GitHub',
      afterGithub: `под лицензией Apache 2.0 — его можно внедрять и дорабатывать свободно; книга отдаёт по нему ${collections} ${plural(collections, 'коллекцию', 'коллекции', 'коллекций')} и принимает ${writable} из них на запись. Двадцать девять выпусков`,
      series: 'ICAR Technical Series',
      afterSeries: '— тоже открыты.',
    },
  },

  gaps: {
    meta: {
      title: 'Чего не хватает до руководств ICAR',
      description:
        'Разбор пробелов по разделам руководств ICAR: чего в книге нет, чем это грозит ' +
        'и что нужно, чтобы закрыть. Названо нами, а не найдено проверяющим.',
    },
    breadcrumbs: { map: 'Руководства ICAR', here: 'Чего не хватает' },
    title: 'Чего не хватает',
    intro: {
      before: 'На',
      link: 'карте соответствия',
      after: `против каждого раздела стоит «частично». Здесь сказано, что именно за этим словом: ${ICAR_GAP_COUNT} ${plural(ICAR_GAP_COUNT, 'пробел', 'пробела', 'пробелов')} по ${sections} ${plural(sections, 'разделу', 'разделам', 'разделам')}.`,
    },
    lead: 'Список написан без оглядки на то, как он выглядит. Специалист, открывший систему, всё равно найдёт то, о чём здесь умолчали, — и дальше не поверит ничему. Знать границы за десять минут выгоднее обеим сторонам, чем узнавать их на третьем месяце внедрения.',
    navLabel: 'Разделы',
    labels: {
      ours: 'Как сейчас.',
      why: 'Чем это грозит.',
      need: 'Что для этого нужно.',
    },
    outro: {
      title: 'Что из этого зависит не от кода',
      body: 'Часть пробелов закрывается работой, часть — решением, и путать их не стоит. Разделы племенной книги, состав признаков экстерьера и структура методов контроля — это решения Ассоциации: система умеет и так, и иначе, а выбирать должен тот, кто отвечает за породу. Расчёт генетических параметров по российской популяции — работа научного учреждения. Международное сравнение оценок и сертификация качества ведения книги упираются в членство в ICAR, и это',
      link: 'отдельный разговор',
      tail: ', в котором от нас зависит немногое.',
    },
  },
}

const EN: IcarPageText = {
  map: {
    intro: [
      'The International Committee for Animal Recording (ICAR) writes the guidelines by which performance is recorded, descent is verified and breeding value is evaluated around the world. About one hundred and thirty organisations from sixty countries work to them; the herd books of the Czech Republic, the Netherlands, Ireland and the United Kingdom are built on these rules.',
      'This herd book is built to the same guidelines. Below is the map: what each section requires and how it is done here. Not one section is covered in full yet, and that is the state of things today rather than caution in the wording.',
    ],
    disclaimer:
      'The guidelines belong to ICAR. What follows is a short restatement in our own words with a link to the English original, not a translation: we are not entitled to publish a translation in full. Permission for a Russian translation of individual sections has been requested from ICAR. The ICAR mark is not used on this page — it is granted by the Board of the organisation on the basis of membership, not for conformance to the guidelines.',
    table: {
      section: 'Section',
      about: 'What it requires',
      ours: 'How the book does it',
      state: 'State',
    },
    gapsLink: 'gaps',
    outNote: {
      lead: '“Out of scope” means the section is not about us: certifying devices and accrediting laboratories is not the task of a recording system.',
      link: `All ${ICAR_GAP_COUNT} gaps explained`,
      tail: `across ${sections} ${en(sections, 'section', 'sections')} — on a page of its own.`,
    },
    open: {
      title: 'What else is open to everyone',
      lead: 'The guidelines in full sit at',
      wiki: 'wiki.icar.org',
      afterWiki: 'and are read without registration. The ADE data exchange standard is published',
      github: 'on GitHub',
      afterGithub: `under the Apache 2.0 licence — it can be implemented and extended freely; the book serves ${collections} ${en(collections, 'collection', 'collections')} over it and accepts ${writable} of them for writing. Twenty-nine issues of the`,
      series: 'ICAR Technical Series',
      afterSeries: 'are open as well.',
    },
  },

  gaps: {
    meta: {
      title: 'What is missing for the ICAR guidelines',
      description:
        'The gaps explained section by section of the ICAR guidelines: what the book does not ' +
        'have, what it costs and what it would take to close. Named by us, not found by an auditor.',
    },
    breadcrumbs: { map: 'ICAR Guidelines', here: 'What is missing' },
    title: 'What is missing',
    intro: {
      before: 'On the',
      link: 'conformance map',
      after: `every section is marked “partial”. Here is what stands behind that word: ${ICAR_GAP_COUNT} ${en(ICAR_GAP_COUNT, 'gap', 'gaps')} across ${sections} ${en(sections, 'section', 'sections')}.`,
    },
    lead: 'The list is written without regard for how it looks. A specialist who opens the system will find what was passed over here anyway — and after that will believe nothing else either. Knowing the boundaries in ten minutes is a better deal for both sides than learning them in the third month of a rollout.',
    navLabel: 'Sections',
    labels: {
      ours: 'How it stands now.',
      why: 'What it costs.',
      need: 'What it would take.',
    },
    outro: {
      title: 'What here does not depend on code',
      body: 'Some gaps are closed by work and some by a decision, and the two are worth keeping apart. The sections of the herd book, the set of conformation traits and the structure of performance recording methods are decisions for the Association: the system can do it either way, and the choice belongs to whoever answers for the breed. Computing genetic parameters on the Russian population is work for a research institute. International comparison of evaluations and certification of the quality of book keeping run into ICAR membership, and that is',
      link: 'a separate conversation',
      tail: ', in which little depends on us.',
    },
  },
}

export const ICAR_PAGE_TEXT: Translated<IcarPageText> = { ru: RU, en: EN }
