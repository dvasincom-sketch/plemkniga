import type { Translated } from '@/lib/i18n/translated'
import { ICAR_NOTE, STATE_HINT, STATE_LABEL, type BreedState } from '@/lib/breeds-catalog'
import { plural } from '@/lib/format'

/**
 * Слова страницы «какие породы книга умеет вести».
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) требуют все шесть
 * языков разом, и для подписей навигации это правильно. Здесь же
 * три абзаца про то, кто в стране ведёт племенные книги, разбор трёх
 * состояний породы и подписи таблицы на пятьдесят пять строк: это
 * тот же длинный текст, что и разбор раздела книги, и переводится он
 * целиком, а не по строке. Поэтому `Translated` с явным откатом
 * на русский — как у `economics-page-text.ts`.
 *
 * ## Почему часть строк — функции
 *
 * «У 21 породы из 55 нет даже международного кода» считается из выписки
 * реестра на каждом показе: числа в тексте обязаны сойтись с числами
 * в таблице под ним. Переписать их словами значило бы завести вторую
 * правду, которая разойдётся с первой при первом же обновлении выписки.
 *
 * Русское склонение при этом непереводимо: `plural(n, 'порода',
 * 'породы', 'пород')` на английском даёт три формы там, где их две,
 * и «55 порода» на витрине. Поэтому слово при числе собирает сам язык.
 *
 * ## Почему подписи состояний берутся отсюда, а не только из каталога
 *
 * `STATE_LABEL` и `STATE_HINT` в `breeds-catalog.ts` остаются: их
 * показывают страница породы и прогон проверки, и обе русские. Русские
 * значения здесь ссылаются на них, а не переписывают, — иначе плашка
 * «Книга ведётся» на двух соседних страницах разошлась бы словами.
 */

export type BreedsPageText = {
  /** Подводка: число пород приходит из самой выписки реестра. */
  lead: (total: number) => string

  /** Подписи под числами. Сами числа считаются на странице. */
  stats: { total: string; book: string; icar: string; own: string }

  keepers: { title: string; para: string[] }

  meansTitle: string
  states: Record<BreedState, { label: string; hint: string }>
  /** «1 порода» / «55 пород» / «1 breed» / «55 breeds». */
  breedCount: (n: number) => string

  why: {
    eyebrow: string
    title: string
    /** Сколько пород без международного кода — из скольких. */
    noCode: (own: number, total: number) => string
    work: string
  }

  list: {
    title: string
    lead: string
    columns: {
      name: string
      icar: string
      registry: string
      state: string
      missing: string
      where: string
    }
    /** Есть ли у породы ключ реестра. */
    registryYes: string
    /*
     * Чего породе не хватает до следующего состояния. `Record`, а не
     * сборка из кусков: русское «нет ключа реестра и кода ICAR» — одно
     * управление на два дополнения, и по-английски так не строится.
     */
    missing: Record<'none' | 'registryKey' | 'icar' | 'both' | 'association', string>
    bookLink: string
    demoLink: string
    talkLink: string
    /**
     * Подпись ссылки на разбор породы.
     *
     * `null` означает «ссылкой служит само имя»: по-русски разбор
     * написан на том же языке, что и страница, и второй подписи
     * не нужно. По-английски имя ведёт на русский текст, и об этом
     * говорится в подписи, а не выясняется щелчком.
     */
    breedPage: string | null
  }

  sources: {
    title: string
    registry: (total: number) => string
    codes: (rows: number, fetchedAt: string) => string
    sourceLead: string
  }

  cta: { title: string; body: string; mail: string; demo: string }
}

const RU: BreedsPageText = {
  lead: (total) =>
    'Книга не привязана к одной породе. Порода берётся из справочника государственного ' +
    'реестра, кровность считается по улучшающей, а профиль индекса настраивается под то, ' +
    'за что платит объединение. Ниже — все ' +
    `${total} ${plural(total, 'порода', 'породы', 'пород')} молочного направления ` +
    'из реестра и состояние каждой у нас.',

  stats: {
    total: 'пород молочного направления в реестре',
    book: 'книга ведётся сегодня',
    icar: 'сопоставлено с кодом ICAR',
    own: 'без международного кода — отечественные и редкие',
  },

  keepers: {
    title: 'Кто в России ведёт племенные книги',
    para: [
      'Государство. Государственные племенные книги ведёт ВНИИплем — институт Министерства сельского хозяйства, — и там же публикуются сводные данные по породам. Это отличает нас от Европы, где книгу ведёт породное общество: объединение заводчиков само записывает животных, само выпускает документы и само отвечает за качество записей.',
      'Породные объединения при этом существуют и здесь: Ассоциация производителей КРС голштинской породы — объединение хозяйств, и её книга открыта по ссылке в таблице выше. Просто законом такая книга не предусмотрена как основная, и объединение ведёт её по собственному решению.',
      'Отсюда и состояние списка. У породы может быть государственный учёт и не быть книги, которую кто-то ведёт как живой инструмент: с проверками, документами и оценкой. Наше дело — сделать так, чтобы завести такую книгу можно было за неделю, а не за пять лет; чьей она будет, решает не платформа.',
    ],
  },

  meansTitle: 'Что значит «поддерживаем»',
  states: {
    book: { label: STATE_LABEL.book, hint: STATE_HINT.book },
    ready: { label: STATE_LABEL.ready, hint: STATE_HINT.ready },
    listed: { label: STATE_LABEL.listed, hint: STATE_HINT.listed },
  },
  breedCount: (n) => `${n} ${plural(n, 'порода', 'породы', 'пород')}`,

  why: {
    eyebrow: 'Зачем это делается',
    title: 'Породу нельзя сохранить, пока о ней нет записей',
    noCode: (own, total) =>
      `У ${own} пород из ${total} нет даже международного кода. Ярославская, ` +
      'холмогорская, истобенская, красная горбатовская есть в реестре, но не в списке ' +
      'Interbull: в мировой торговле семенем они не участвуют. Своей племенной книги ' +
      'у них тоже нет — а без неё не видно ни численности, ни родства, ни того, ' +
      'кто от кого получен, и слова о сохранении генофонда остаются словами.',
    work:
      'Наша часть работы — сделать так, чтобы книгу можно было завести за неделю, ' +
      'а не за пять лет: справочники сшиты, поля готовы, кровность и родство считаются, ' +
      'выгрузки в реестр работают. Дальше нужны данные хозяйств и объединение, которое ' +
      'возьмётся вести книгу. Это же верно и за пределами России: в Казахстане книги ' +
      'ведутся по цветовым группам, а не по породам, в Армении девять из десяти ' +
      'животных — местная кавказская бурая, у которой книги нет вовсе.',
  },

  list: {
    title: 'Список',
    lead:
      'Порядок алфавитный. «Код ICAR» — трёхбуквенный код Interbull, тот же, что уезжает ' +
      'в обмен и входит в международный номер животного; прочерк означает, что в списке ' +
      'Interbull породы нет.',
    columns: {
      name: 'Порода',
      icar: 'Код ICAR',
      /*
         Колонки «В реестре» на странице больше нет: список и есть
         выписка из справочника реестра, поэтому ключ был у всех
         пятидесяти пяти строк, и столбец сообщал одно и то же слово
         пятьдесят пять раз. Строка оставлена: если однажды в каталог
         попадёт порода без ключа, столбец вернётся вместе с ней.
      */
      registry: 'В реестре',
      state: 'Состояние',
      missing: 'Чего не хватает',
      where: 'Где посмотреть',
    },
    registryYes: 'есть',
    missing: {
      none: '—',
      registryKey: 'нет ключа реестра',
      icar: 'нет кода ICAR',
      both: 'нет ключа реестра и кода ICAR',
      association: 'объединения, которое возьмётся вести',
    },
    bookLink: 'действующая книга',
    demoLink: 'показательная книга',
    talkLink: 'обсудить книгу',
    breedPage: null,
  },

  sources: {
    title: 'Откуда список',
    registry: (total) =>
      'Строки — выписка из справочника пород государственного реестра ФГИАС ПР: ' +
      `${total} пород молочного направления, у каждой свой идентификатор, по которому ` +
      'принимаются выгрузки.',
    codes: (rows, fetchedAt) =>
      `Коды — список Interbull из ${rows} строк, копия снята ${fetchedAt}. ${ICAR_NOTE}`,
    sourceLead: 'Источник кодов:',
  },

  cta: {
    title: 'Завести книгу под свою породу',
    body:
      'Напишите, какая порода, сколько голов и чем ведёте учёт сейчас. Книга открывается ' +
      'по своему адресу, с проверками, правами доступа и выгрузками в реестр.',
    mail: 'Написать нам',
    demo: 'Показательная книга',
  },
}

/**
 * Английская редакция.
 *
 * Термины взяты те же, что в остальном английском тексте витрины:
 * herdbook, registered breeding stock, improver breed, ICAR breed code,
 * the Russian state livestock register. «Ведётся книга» — не «is
 * supported», а «a book is being kept»: держит книгу человек,
 * а не платформа, и глагол об этом говорит.
 */
const EN: BreedsPageText = {
  lead: (total) =>
    'The book is not tied to a single breed. The breed is taken from the reference list of ' +
    'the Russian state livestock register, blood share is computed against the improver ' +
    'breed, and the index profile is tuned to what the breeders’ association pays for. ' +
    `Below are all ${total} dairy breeds in the register and the state of each one here.`,

  stats: {
    total: 'dairy breeds in the state register',
    book: 'a book is being kept today',
    icar: 'matched to an ICAR breed code',
    own: 'without an international code — native and rare breeds',
  },

  keepers: {
    title: 'Who keeps herdbooks in Russia',
    para: [
      'The state does. State herdbooks are kept by VNIIplem, an institute of the Ministry of Agriculture, and the summary figures by breed are published there as well. This sets the country apart from Europe, where the herdbook is kept by a breed society: a breeders’ association records the animals itself, issues the documents itself and answers for the quality of the records itself.',
      'Breeders’ associations do exist here too: the Holstein Cattle Breeders’ Association is an association of farms, and its herdbook is open at the link in the table above. It is simply that the law does not provide for such a book as the principal one, and the association keeps it by its own decision.',
      'Hence the state of the list. A breed may be under state recording and still have no book that anyone keeps as a working instrument: with validation, documents and evaluation. Our part is to make opening such a book a matter of a week rather than five years; whose book it will be is not for the platform to decide.',
    ],
  },

  meansTitle: 'What “supported” means here',
  states: {
    book: {
      label: 'A book is being kept',
      hint: 'There is an association, there are animals, the book is open at its own address.',
    },
    ready: {
      label: 'Ready to be opened',
      hint:
        'The breed is stitched to both reference lists, the fields and the computations are ' +
        'ready. There is no data yet — a book is opened when an association or a farm comes.',
    },
    listed: {
      label: 'In the reference list',
      hint:
        'The breed is known to the system: it can be assigned to an animal and it will go to ' +
        'the state register. No separate book has been prepared for it.',
    },
  },
  breedCount: (n) => `${n} ${n === 1 ? 'breed' : 'breeds'}`,

  why: {
    eyebrow: 'Why this is done',
    title: 'A breed cannot be preserved while there are no records of it',
    noCode: (own, total) =>
      `${own} breeds out of ${total} have no international code at all. Yaroslavl, ` +
      'Kholmogory, Istoben and Red Gorbatov are in the register but not in the Interbull ' +
      'list: they take no part in the world semen trade. They have no herdbook of their own ' +
      'either — and without one there is no seeing the numbers, the kinship or who was got ' +
      'from whom, and words about preserving the gene pool remain words.',
    work:
      'Our part of the work is to make opening a book a matter of a week rather than five ' +
      'years: the reference lists are stitched together, the fields are ready, blood share ' +
      'and kinship are computed, exports to the state register work. Beyond that, farm data ' +
      'is needed and a breeders’ association that will take on keeping the book. The same ' +
      'holds outside Russia: in Kazakhstan books are kept by colour group rather than by ' +
      'breed, and in Armenia nine animals out of ten are the local Caucasian Brown, which ' +
      'has no book at all.',
  },

  list: {
    title: 'The list',
    lead:
      'Alphabetical order. The ICAR breed code is the three-letter Interbull code, the same ' +
      'one that goes out in exchange and forms part of the international animal number; ' +
      'a dash means the breed is not in the Interbull list.',
    columns: {
      name: 'Breed',
      icar: 'ICAR code',
      registry: 'In the register',
      state: 'State',
      missing: 'What is missing',
      where: 'Where to look',
    },
    registryYes: 'yes',
    missing: {
      none: '—',
      registryKey: 'no registry key',
      icar: 'no ICAR breed code',
      both: 'neither a registry key nor an ICAR breed code',
      association: 'an association willing to keep the book',
    },
    bookLink: 'the running book',
    demoLink: 'the sample book',
    talkLink: 'discuss a book',
    breedPage: 'breed profile (in Russian)',
  },

  sources: {
    title: 'Where the list comes from',
    registry: (total) =>
      'The rows are an extract from the breed reference list of the Russian state livestock ' +
      `register (FGIAS PR): ${total} dairy breeds, each with its own identifier — the one ` +
      'exports are accepted by.',
    codes: (rows, fetchedAt) =>
      `The codes are the Interbull list of ${rows} rows, copied on ${fetchedAt}. ` +
      'Three-letter codes are assigned by the Interbull Centre; the list is part of the ICAR ' +
      'International Agreement of Recording Practices. The source itself states that the ' +
      'codes are meant for labelling semen straws in international trade and are NOT used to ' +
      'identify breeds in Interbull international genetic evaluations.',
    sourceLead: 'Source of the codes:',
  },

  cta: {
    title: 'Open a herdbook for your breed',
    body:
      'Write to us: which breed, how many head, and what you keep records with today. ' +
      'The book opens at its own address, with validation, access rights and exports to the ' +
      'state register.',
    mail: 'Write to us',
    demo: 'The sample book',
  },
}

export const BREEDS_PAGE_TEXT: Translated<BreedsPageText> = { ru: RU, en: EN }
