import type { Translated } from '@/lib/i18n/translated'

/**
 * Слова страниц отказа на витрине: «не найдено» и «не загрузилось».
 *
 * ## Почему они здесь, а не в общем наборе строк
 *
 * Общие наборы (`page-messages`, `site-messages`) требуют все шесть
 * языков разом, и для подписей навигации это правильно. Здесь другое:
 * четыре фразы, у каждой из которых ценность в интонации, а не
 * в значении. Требование «шесть языков сразу» дало бы машинный перевод
 * шутки — а машинный перевод шутки не смешон и не понятен, он просто
 * странен, и читатель отнесёт эту странность к системе, а не
 * к переводчику. Поэтому `Translated` с явным откатом на русский, как
 * у соседних страниц витрины (`org-page-text.ts`).
 *
 * ## Почему об откате здесь не объявляют
 *
 * Соседние страницы обязаны сказать читателю, что текст показан
 * не на его языке (`FALLBACK_NOTICE`). Здесь этого нет намеренно:
 * страница отказа состоит из одного объяснения и четырёх дорог дальше,
 * и объявление о непереведённом тексте отодвинуло бы дороги — то есть
 * единственное, зачем человек сюда попал. Он и так видит, на каком
 * языке написано.
 *
 * ## Про шутку по-английски
 *
 * Она держится на нашем же обещании: книга находит животное по номеру
 * среди сотен тысяч, а собственную страницу не нашла. По-английски
 * она обязана остаться такой же короткой — растянутая на две строки
 * с извинением, она перестаёт быть самоиронией и становится
 * заискиванием.
 */

/**
 * Дороги с несуществующего адреса.
 *
 * `Record` по ключу, а не список пар: адреса лежат в самом компоненте,
 * и новая дорога без подписи на обоих языках не соберётся. Список пар
 * позволил бы завести пятую дорогу с русской подписью и показать её
 * на английской странице.
 */
export type ProductWayKey = 'about' | 'breeds' | 'rules' | 'compliance'

export type ProductErrorText = {
  notFound: {
    eyebrow: string
    title: string
    body: string
    waysTitle: string
    ways: Record<ProductWayKey, { label: string; hint: string }>
    /** Подводка к почте; заканчивается перед самим адресом. */
    mailLead: string
    /** Продолжение после адреса; начинается с тире. */
    mailTail: string
  }
  failed: {
    eyebrow: string
    title: string
    body: string
    help: string
    /** Подпись кнопки повтора: она стоит рядом с этим текстом, а не в общей навигации. */
    retry: string
  }
}

const RU: ProductErrorText = {
  notFound: {
    eyebrow: 'Страница не найдена',
    title: 'Животное по номеру мы находим, а эту страницу — нет',
    body:
      'Адрес не совпал ни с одним разделом. Обычно это опечатка или ссылка из старого ' +
      'письма: страницы витрины за это время переезжали. Ничего не пропало — не найден ' +
      'именно адрес.',
    waysTitle: 'Куда отсюда',
    ways: {
      about: { label: 'О продукте', hint: 'что это за система и кому она' },
      breeds: { label: 'Породы', hint: 'какие книга умеет вести и в каком состоянии' },
      rules: { label: 'Проверки данных', hint: 'по каким правилам книга спорит с записью' },
      compliance: { label: 'Соответствие', hint: 'чему следует и чего ей не хватает' },
    },
    mailLead: 'Если сюда привела ссылка из письма или презентации, напишите на',
    mailTail: '— поправим адрес, а не читателя.',
  },
  failed: {
    eyebrow: 'Ошибка',
    title: 'Страница не загрузилась',
    body:
      'Отказала наша сторона, а не ваш браузер. Записи книги при этом целы: ломается показ, ' +
      'а не данные — они лежат в базе и не меняются от того, что страница не собралась.',
    help:
      'Чаще всего помогает обновить страницу через минуту. Если не помогло — напишите нам, ' +
      'и приложите отпечаток ниже: по нему ошибка находится в журнале сразу, без поисков.',
    retry: 'Попробовать снова',
  },
}

const EN: ProductErrorText = {
  notFound: {
    eyebrow: 'Page not found',
    /*
     * Шутка переведена, а не пересказана: то же противопоставление
     * в том же числе слов. Английский вариант короче русского на слово,
     * и это к лучшему — заголовок в сорок четыре пункта переносится
     * на телефоне и без того.
     */
    title: 'We find an animal by its number. This page we did not',
    body:
      'The address matched no section. Usually that means a typo or a link from an old ' +
      'letter: these pages have moved since. Nothing is lost — it is the address that was ' +
      'not found.',
    waysTitle: 'Where to go from here',
    ways: {
      about: { label: 'About', hint: 'what the system is and who it is for' },
      breeds: { label: 'Breeds', hint: 'which ones the book can keep, and in what state' },
      rules: { label: 'Data checks', hint: 'the rules the book argues with a record by' },
      compliance: { label: 'Compliance', hint: 'what it follows and what it lacks' },
    },
    mailLead: 'If a link from a letter or a presentation brought you here, write to',
    mailTail: '— we will fix the address, not the reader.',
  },
  failed: {
    eyebrow: 'Error',
    title: 'The page did not load',
    body:
      'Our side failed, not your browser. The records of the book are intact: what breaks ' +
      'is the display, not the data — it sits in the database and does not change because ' +
      'a page failed to assemble.',
    help:
      'Reloading in a minute usually helps. If it does not, write to us and attach the ' +
      'fingerprint below: with it the error is found in the log at once, without searching.',
    retry: 'Try again',
  },
}

export const PRODUCT_ERROR_TEXT: Translated<ProductErrorText> = { ru: RU, en: EN }
